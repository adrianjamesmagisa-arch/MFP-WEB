/**
 * Backfill delivery_start / delivery_end / ors_date / pr_date_received
 * from SBFP FY 2026 Monitoring.xlsx using correct column indices.
 *
 * Excel center sheets (no Batch column):
 *   4 PR date, 6 ORS date, 9 Beneficiaries, 10 Contract Amount,
 *   11 Start of Delivery, 12 End of Delivery, 13 Packs to deliver, 14+ snapshots
 */
const fs = require('fs')
const path = require('path')
const xlsx = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.join(__dirname, '..', '.env.local')
fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
  if (!line || line.startsWith('#') || !line.includes('=')) return
  const i = line.indexOf('=')
  const k = line.slice(0, i).trim()
  const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  if (!process.env[k]) process.env[k] = v
})

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const EXCEL = 'C:/pcc folder/PCC/Data processing/SBFP FY 2026_Monitoring.xlsx'

const CENTERS = {
  UPLB: 'UPLB', DMMMSU: 'DMMMSU', CSU: 'CSU', MMSU: 'MMSU', CLSU: 'CLSU',
  LCSF: 'LCSF', WVSU: 'WVSU', USF: 'USF', VSU: 'VSU', MLPC: 'MLPC',
  CMU: 'CMU', USM: 'USM',
}

/** Accept only plausible 2024–2030 Excel serial dates (not pack counts). */
function excelDateToISO(serial) {
  if (serial == null || typeof serial !== 'number' || !Number.isFinite(serial)) return null
  if (serial < 45300 || serial > 47500) return null
  const d = xlsx.SSF.parse_date_code(serial)
  if (!d || d.y < 2024 || d.y > 2030) return null
  return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
}

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    if (String(rows[i]?.[0] || '').trim().toUpperCase() === 'STATUS') return i
  }
  return -1
}

function colMap(headerRow) {
  const labels = (headerRow || []).map(h => String(h || '').toLowerCase().trim())
  const find = (...parts) => labels.findIndex(h => parts.every(p => h.includes(p)))
  const start = find('start', 'delivery')
  const end = find('end', 'delivery')
  const ors = find('ors')
  const prDate = find('date received') >= 0 ? find('date received') : find('pr')
  // Fallback to known layout without Batch column
  return {
    start: start >= 0 ? start : 11,
    end: end >= 0 ? end : 12,
    ors: ors >= 0 ? ors : 6,
    prDate: prDate >= 0 ? prDate : 4,
    sdo: 1,
  }
}

async function main() {
  const wb = xlsx.readFile(EXCEL)
  let updated = 0
  let skipped = 0

  for (const [sheetName, center] of Object.entries(CENTERS)) {
    const sh = wb.Sheets[sheetName]
    if (!sh) continue
    const rows = xlsx.utils.sheet_to_json(sh, { header: 1, raw: true })
    const hr = findHeaderRow(rows)
    if (hr < 0) continue
    const map = colMap(rows[hr])
    console.log(`\n${center}: startCol=${map.start} endCol=${map.end} ors=${map.ors}`)

    for (let i = hr + 1; i < rows.length; i++) {
      const row = rows[i]
      const sdo = String(row[map.sdo] || '').trim()
      if (!sdo) continue

      const patch = {
        delivery_start: excelDateToISO(row[map.start]),
        delivery_end: excelDateToISO(row[map.end]),
        ors_date: excelDateToISO(row[map.ors]),
        pr_date_received: excelDateToISO(row[map.prDate]),
      }

      // Skip rows with nothing to write
      if (!patch.delivery_start && !patch.delivery_end && !patch.ors_date && !patch.pr_date_received) {
        skipped++
        continue
      }

      const { data, error } = await supabase
        .from('sbfp_data')
        .update(patch)
        .eq('center', center)
        .eq('year', 2026)
        .ilike('sdo', sdo)
        .select('id,sdo')

      if (error) {
        console.log(`  ERROR ${sdo}:`, error.message)
      } else if (!data?.length) {
        console.log(`  NO MATCH ${sdo}`, patch)
      } else {
        updated++
        console.log(`  OK ${sdo}`, patch)
      }
    }
  }

  console.log(`\nDone. Updated ${updated} rows, skipped (no dates) ${skipped}.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
