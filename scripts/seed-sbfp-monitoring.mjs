/**
 * seed-sbfp-monitoring.mjs
 *
 * Seeds `sbfp_monitoring` from the per-center tabs in:
 *   Data processing/SBFP FY 2026_Monitoring.xlsx
 *
 * Does NOT touch `sbfp_data` (the existing SBFP module).
 *
 * Usage (from mfp-web):
 *   node scripts/seed-sbfp-monitoring.mjs
 *   DRY_RUN=1 node scripts/seed-sbfp-monitoring.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import xlsx from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))

const envPath = resolve(__dirname, '../.env.local')
if (existsSync(envPath)) {
  readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) return
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (!process.env[key]) process.env[key] = val
  })
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.env.DRY_RUN === '1'
const EXCEL_PATH = process.env.EXCEL_PATH || resolve(
  __dirname,
  '../../Data processing/SBFP FY 2026_Monitoring.xlsx'
)

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}
if (!existsSync(EXCEL_PATH)) {
  console.error('❌ Excel not found at:', EXCEL_PATH)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
// NHQ is the SBFP Excel sheet name for the NIZ / NHQGP (NIZ) center — same operational unit.
const CENTER_SHEETS = ['UPLB', 'CSU', 'DMMMSU', 'MMSU', 'CLSU', 'WVSU', 'LCSF', 'USF', 'VSU', 'MLPC', 'CMU', 'USM', 'NHQ']

function safeNum(v) {
  if (v === null || v === undefined || v === '') return 0
  if (v instanceof Date) return 0
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0
  const n = parseFloat(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? Math.round(n) : 0
}

function safeStr(v) {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function classifyDeliveryCol(header) {
  const hs = header.toLowerCase()
  if (!hs.includes('packs delivered')) return null
  if (hs.includes('aug') && (hs.includes('18') || hs.includes('18,'))) return 'del_aug18'
  if (hs.includes('aug') && hs.includes('31')) return 'del_aug31'
  if (hs.includes('sep')) return 'del_sep30'
  if (hs.includes('oct')) return 'del_oct31'
  return null
}

console.log(`📂 Excel: ${EXCEL_PATH}`)
console.log(`🧪 Dry run: ${DRY_RUN}`)
console.log()

const wb = xlsx.readFile(EXCEL_PATH, { cellDates: true, raw: false })
const allRecords = []
const warnings = []

for (const center of CENTER_SHEETS) {
  if (!wb.SheetNames.includes(center)) {
    console.log(`⚠️  Sheet "${center}" not found — skipping`)
    continue
  }

  const aoa = xlsx.utils.sheet_to_json(wb.Sheets[center], {
    header: 1, defval: null, raw: false, cellDates: true,
  })

  let headerRowIdx = -1
  const cols = { delivery: {} }
  for (let ri = 0; ri < Math.min(aoa.length, 30); ri++) {
    const row = aoa[ri]
    const rowStr = row.map(v => String(v ?? '')).join('|').toUpperCase()
    if (!rowStr.includes('STATUS') || !rowStr.includes('SDO')) continue
    headerRowIdx = ri
    row.forEach((h, ci) => {
      const hs = String(h ?? '').trim().toLowerCase()
      if (!hs) return
      if (hs.includes('status') && !hs.includes('payment')) cols.status = ci
      else if (hs === 'sdo') cols.sdo = ci
      else if (hs.includes('amount') && !hs.includes('contract')) cols.amount = ci
      else if (hs.includes('mode of procurement')) cols.mode = ci
      else if (hs.includes('remarks')) cols.remarks = ci
      else if (hs.includes('packs to be delivered')) cols.targetPacks = ci
      else {
        const snap = classifyDeliveryCol(hs)
        if (snap) cols.delivery[snap] = ci
      }
    })
    break
  }

  if (headerRowIdx === -1 || cols.targetPacks === undefined || cols.sdo === undefined) {
    console.log(`⚠️  ${center}: header/target/SDO column not found — skipping`)
    continue
  }

  const snapKeys = Object.keys(cols.delivery)
  console.log(`📋 ${center}: header=row${headerRowIdx + 1}, target=col${cols.targetPacks + 1}, snaps=[${snapKeys.join(', ')}]`)

  let rowCount = 0
  for (let ri = headerRowIdx + 1; ri < aoa.length; ri++) {
    const row = aoa[ri]
    const sdo = safeStr(row[cols.sdo] ?? '')
    if (!sdo) continue
    if (sdo.toUpperCase().includes('TOTAL')) break

    const statusRaw = safeStr(row[cols.status] ?? '')
    const status = statusRaw.toUpperCase() || 'NOT STARTED'
    const target = safeNum(row[cols.targetPacks])
    const amount = safeNum(row[cols.amount] ?? 0)
    const del_aug18 = safeNum(row[cols.delivery.del_aug18])
    const del_aug31 = safeNum(row[cols.delivery.del_aug31])
    const del_sep30 = safeNum(row[cols.delivery.del_sep30])
    const del_oct31 = safeNum(row[cols.delivery.del_oct31])

    let latestDelivered = 0
    for (const packs of [del_aug18, del_aug31, del_sep30, del_oct31]) {
      if (packs > 0) latestDelivered = packs
    }
    // Client rule: DONE = target fully met
    if (status === 'DONE' && latestDelivered === 0 && target > 0) {
      latestDelivered = target
    }

    const accomplishment_pct = target > 0
      ? Math.min(Math.round((latestDelivered / target) * 1000) / 10, 100)
      : 0

    if (target > 5_000_000) {
      warnings.push(`${center} / ${sdo}: target_packs=${target.toLocaleString()} looks unusually large`)
    }
    if (target > 0 && amount > 0 && target === amount) {
      warnings.push(`${center} / ${sdo}: target_packs equals AMOUNT (${amount.toLocaleString()}) — possible column mix-up in Excel`)
    }

    allRecords.push({
      year: 2026,
      center,
      sdo,
      status,
      target_packs: target,
      del_aug18,
      del_aug31,
      del_sep30,
      del_oct31,
      latest_delivered: latestDelivered,
      accomplishment_pct,
      amount,
      mode_of_procurement: safeStr(row[cols.mode] ?? ''),
      remarks: safeStr(row[cols.remarks] ?? ''),
    })
    rowCount++
  }
  console.log(`   ✅ ${rowCount} SDO rows`)
}

const byCenter = {}
for (const r of allRecords) {
  if (!byCenter[r.center]) byCenter[r.center] = { n: 0, target: 0, delivered: 0 }
  if (r.status === 'FAILED') continue
  byCenter[r.center].n += 1
  byCenter[r.center].target += r.target_packs
  byCenter[r.center].delivered += r.latest_delivered
}

console.log(`\n📊 Total records prepared: ${allRecords.length}`)
console.log('\nCenter summary (FAILED excluded from %):')
for (const [center, s] of Object.entries(byCenter).sort()) {
  const pct = s.target > 0 ? ((s.delivered / s.target) * 100).toFixed(1) : '0.0'
  console.log(`  ${center.padEnd(8)} SDOs=${String(s.n).padStart(2)}  target=${s.target.toLocaleString().padStart(14)}  delivered=${s.delivered.toLocaleString().padStart(10)}  ${pct}%`)
}

if (warnings.length) {
  console.log(`\n⚠️  ${warnings.length} data-quality warning(s):`)
  warnings.slice(0, 20).forEach(w => console.log(`   - ${w}`))
  if (warnings.length > 20) console.log(`   …and ${warnings.length - 20} more`)
}

if (DRY_RUN) {
  console.log('\n🧪 DRY RUN — skipping database operations.')
  process.exit(0)
}

const { error: probeErr } = await supabase.from('sbfp_monitoring').select('id').limit(1)
if (probeErr) {
  console.error('\n❌ Table sbfp_monitoring is missing or not readable.')
  console.error('   Run this SQL in Supabase Dashboard → SQL Editor, then re-run the seed:\n')
  console.error(readFileSync(resolve(__dirname, '../supabase/migrations/20260903000002_create_sbfp_monitoring.sql'), 'utf-8'))
  process.exit(1)
}

console.log('\n🗑️  Clearing existing 2026 sbfp_monitoring rows...')
const { error: delErr } = await supabase.from('sbfp_monitoring').delete().eq('year', 2026)
if (delErr) {
  console.error('❌ Delete error:', delErr.message)
  process.exit(1)
}

const CHUNK = 100
let inserted = 0
let errors = 0
for (let i = 0; i < allRecords.length; i += CHUNK) {
  const chunk = allRecords.slice(i, i + CHUNK)
  const { error } = await supabase.from('sbfp_monitoring').insert(chunk)
  if (error) {
    console.error(`❌ Chunk ${i}–${i + CHUNK} error:`, error.message)
    errors++
  } else {
    inserted += chunk.length
    process.stdout.write(`\r  ✅ Inserted ${inserted}/${allRecords.length}...`)
  }
}

console.log(`\n\n🎉 Done! Inserted ${inserted} records. Errors: ${errors}`)
