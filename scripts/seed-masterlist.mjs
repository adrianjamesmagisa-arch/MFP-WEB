/**
 * seed-masterlist.mjs
 *
 * Seeds the `mfp_data` table in Supabase from Sheet 1 of the Excel masterlist:
 *   "DA-PCC National Milk Feeding Program.xlsx"
 *
 * Usage (from mfp-web directory):
 *   node scripts/seed-masterlist.mjs
 *
 * Options (env vars):
 *   DRY_RUN=1               — Parse and log without inserting into Supabase
 *   SKIP_DELETE=1           — Don't delete existing rows before inserting
 *   CHUNK_SIZE=200          — Number of rows per Supabase insert batch (default: 200)
 *   EXCEL_PATH=<path>       — Override default Excel file path
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import xlsx from 'xlsx'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Manually load .env.local (dotenv is not installed)
const envPath = resolve(__dirname, '../.env.local')
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  }
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.env.DRY_RUN === '1'
const SKIP_DELETE = process.env.SKIP_DELETE === '1'
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '200', 10)

// Default path to the Excel file
const DEFAULT_EXCEL_PATH = resolve(
  __dirname,
  '../../Data processing/DA-PCC National Milk Feeding Program.xlsx'
)
const EXCEL_PATH = process.env.EXCEL_PATH || DEFAULT_EXCEL_PATH

// Sheet 1 name (first sheet = masterlist)
const SHEET_INDEX = 0

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------
function parseNumber(val, asInt = false) {
  if (val === null || val === undefined || val === '') return 0
  if (typeof val === 'number') return asInt ? Math.round(val) : val
  const cleaned = val.toString().replace(/,/g, '').trim()
  const parsed = parseFloat(cleaned)
  if (isNaN(parsed)) return 0
  return asInt ? Math.round(parsed) : parsed
}

function parseDate(val) {
  if (!val) return null
  // xlsx with cellDates:true returns JS Date objects in LOCAL time.
  // Using .toISOString() converts to UTC which causes a -1 day error
  // for PH timezone (UTC+8). Read local date components instead.
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null
    const year  = val.getFullYear()
    const month = String(val.getMonth() + 1).padStart(2, '0')
    const day   = String(val.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  // Excel serial number fallback
  if (typeof val === 'number') {
    const jsDate = new Date((val - 25569) * 86400 * 1000)
    if (isNaN(jsDate.getTime())) return null
    return jsDate.toISOString().split('T')[0]
  }
  const d = new Date(val)
  if (isNaN(d.getTime())) return null
  return d.toISOString().split('T')[0]
}

function normalizeFundedBy(raw) {
  if (!raw) return null
  const v = raw.toString().trim()
  if (v === 'DepEd' || v === 'DepEd-SBFP') return 'DepEd'
  if (v === 'DSWD' || v === 'DSWD-SFP') return 'DSWD'
  if (v === 'LDS' || v === 'LGU' || v === 'Local') return 'LDS'
  return v
}

function normalizeMilkType(raw) {
  if (!raw) return null
  const v = raw.toString().trim()
  if (v === 'P. Milk' || v === 'Pasteurized Milk') return 'PM'
  if (v === 'KARABUN' || v === 'Carabao' || v === 'Carabao Milk') return 'Karabao'
  if (v === 'Skim' || v === 'Skimmed') return 'SMP'
  if (v === 'SM' || v === 'Soy Milk') return 'SM'
  return v
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log('📂 Excel path:', EXCEL_PATH)
  console.log('🧪 Dry run:', DRY_RUN)
  console.log('🔢 Chunk size:', CHUNK_SIZE)
  console.log()

  // 1. Load workbook
  console.log('📖 Loading workbook...')
  const workbook = xlsx.readFile(EXCEL_PATH, { cellDates: true })
  const sheetName = workbook.SheetNames[SHEET_INDEX]
  console.log(`📋 Sheet name: "${sheetName}"`)

  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName])
  console.log(`📊 Total rows parsed: ${data.length}`)

  if (data.length === 0) {
    console.error('❌ No data rows found in Sheet 1. Aborting.')
    process.exit(1)
  }

  // Log first row keys for debugging
  console.log('\n🔑 Detected columns:')
  Object.keys(data[0]).forEach((k, i) => console.log(`  [${i + 1}] ${k}`))
  console.log()

  // 2. Extract unique suppliers → upsert into cooperatives
  console.log('🤝 Extracting unique suppliers/cooperatives...')
  const supplierNames = [...new Set(data.map((r) => r['Supplier']).filter(Boolean))]
  const supplierMap = {}

  for (const name of supplierNames) {
    const { data: existing } = await supabase
      .from('cooperatives')
      .select('id, name')
      .eq('name', name)
      .maybeSingle()

    if (existing) {
      supplierMap[name] = existing.id
    } else if (!DRY_RUN) {
      const { data: created, error } = await supabase
        .from('cooperatives')
        .insert({ name, short_name: name.substring(0, 50), is_active: true })
        .select('id, name')
        .single()

      if (error) {
        console.warn(`  ⚠️  Could not insert cooperative "${name}": ${error.message}`)
      } else {
        supplierMap[name] = created.id
        console.log(`  ✅ Created cooperative: ${name}`)
      }
    } else {
      supplierMap[name] = `dry-run-${name}`
    }
  }

  console.log(`✅ Mapped ${Object.keys(supplierMap).length} cooperatives.\n`)

  // 3. Map Excel rows → mfp_data records
  console.log('🔄 Mapping Excel rows to database records...')
  const records = data.map((row) => {
    return {
      year: parseNumber(row['Year'], true),
      funded_by: normalizeFundedBy(row['Funded By']),
      region: row['Region']?.toString().trim() || null,
      center: row['Center']?.toString().trim() || null,
      province: row['Province']?.toString().trim() || null,
      division: row['Division']?.toString().trim() || null,
      municipality: row['Municipality']?.toString().trim() || null,
      elementary_school: row['Elementary School']?.toString().trim() || null,

      milk_packs: parseNumber(row['Milk Packs'], true),
      total_volume_requirements: parseNumber(row['Total Volume Requirements ']),
      raw_milk_liters: parseNumber(row['Raw Milk Used in Liters']),
      whole_milk_kg: parseNumber(row['Whole Milk (kg)']),
      skimmed_milk_kg: parseNumber(row['Skimmed Milk (kg)']),
      sugar: parseNumber(row['Sugar']),

      feeding_days: parseNumber(row['Feeding Days'], true),
      batch: row['Batch']?.toString().trim() || null,
      beneficiaries: parseNumber(row['Beneficiaries'], true),
      milk_type: normalizeMilkType(row['Milk Type']),
      price: parseNumber(row['Price']),

      supplier_id: row['Supplier'] ? (supplierMap[row['Supplier']] ?? null) : null,

      milk_cost: parseNumber(row['Milk Cost']),
      service_fee: parseNumber(row['Service Fee/ Admin Cost']),
      total_funds_transferred: parseNumber(row['Total Funds Transferred']),

      mode_of_procurement: row['Mode of Procurement']?.toString().trim() || null,

      moa_signing: parseDate(row['MOA Signing']),
      fund_transfer: parseDate(row['Fund Transfer']),
      date_started: parseDate(row['Date Started']),
      date_completed: parseDate(row['Date Completed']),
      liquidation: parseDate(row['Liquidation']),

      target_milk_packs_to_deliver: parseNumber(row['Target milk packs to be delivered'], true),
      total_milk_packs_delivered: parseNumber(row['Totalnumber of milk packs delivered'], true),
    }
  })

  console.log(`✅ Prepared ${records.length} records.\n`)

  // Preview first 3 records
  console.log('👁️  Sample records (first 3):')
  records.slice(0, 3).forEach((r, i) => console.log(`  [${i + 1}]`, JSON.stringify(r)))
  console.log()

  if (DRY_RUN) {
    console.log('🧪 DRY RUN mode — skipping database operations.')
    console.log(`Would insert ${records.length} records into mfp_data.`)
    return
  }

  // 4. Optionally clear existing data
  if (!SKIP_DELETE) {
    console.log('🗑️  Clearing existing mfp_data rows...')
    const { error: delError } = await supabase
      .from('mfp_data')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (delError) {
      console.error('❌ Failed to clear mfp_data:', delError.message)
      process.exit(1)
    }
    console.log('✅ Existing data cleared.\n')
  }

  // 5. Insert in chunks
  console.log(`⬆️  Inserting ${records.length} records in chunks of ${CHUNK_SIZE}...`)
  let inserted = 0
  let errors = 0

  for (let i = 0; i < records.length; i += CHUNK_SIZE) {
    const chunk = records.slice(i, i + CHUNK_SIZE)
    const { error } = await supabase.from('mfp_data').insert(chunk)

    if (error) {
      console.error(`\n  ❌ Error on chunk ${i}–${i + chunk.length - 1}: ${error.message}`)
      errors++
    } else {
      inserted += chunk.length
      process.stdout.write(`\r  ✅ Inserted ${inserted}/${records.length}...`)
    }
  }

  console.log(`\n\n🎉 Done! Inserted ${inserted} records. Errors: ${errors}`)
  if (errors > 0) {
    console.warn(`⚠️  ${errors} chunk(s) failed. Check the logs above.`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('💥 Fatal error:', err)
  process.exit(1)
})
