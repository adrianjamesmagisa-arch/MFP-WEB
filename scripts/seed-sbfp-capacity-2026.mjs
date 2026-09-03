/**
 * Seed SY 2026 (2026-2027) capacity into sbfp_summary from Excel CBED columns,
 * ensure sbfp_school_years rows, and recompute packs-based Summary fields.
 *
 * Usage (from mfp-web):
 *   node scripts/seed-sbfp-capacity-2026.mjs
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
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) return
    const i = trimmed.indexOf('=')
    const key = trimmed.slice(0, i).trim()
    const val = trimmed.slice(i + 1).trim()
    if (!process.env[key]) process.env[key] = val
  })
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)
const EXCEL = process.env.EXCEL_PATH || resolve(__dirname, '../../Data processing/SBFP FY 2026_Monitoring.xlsx')
const YEAR = 2026

function safeNum(v) {
  if (v == null || v === '') return 0
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function compute(janDec, julDec, packs) {
  const j = safeNum(janDec)
  let e = safeNum(julDec)
  if (!e && j) e = Math.round(j / 2)
  const b = safeNum(packs)
  const c = b / 25
  return {
    jan_dec_target_milk_volume: j,
    jul_dec_projected_volume: e,
    target_milk_packs: b,
    equivalent_volume: c,
    shortage_surplus: j - c,
    pct_covered: j > 0 ? c / j : 0,
    milk_packs_can_produce: e * 25,
    shortage_surplus_packs: e * 25 - b,
  }
}

console.log('📂', EXCEL)
const wb = xlsx.readFile(EXCEL, { cellDates: true, raw: true })

// Prefer SUMMARY sheet for CBED + Jul-Dec projected
const sum = xlsx.utils.sheet_to_json(wb.Sheets['SUMMARY TARGET MILK PROD'], { header: 1, raw: true })
const capacityByCenter = {}
for (let i = 1; i < sum.length; i++) {
  const r = sum[i]
  const center = String(r?.[0] ?? '').trim()
  if (!center || /^total$/i.test(center)) continue
  capacityByCenter[center] = {
    jan: safeNum(r[1]),
    jul: safeNum(r[6]),
  }
}

// Overlay Target Milk Packs sheet CBED if SUMMARY missing a center
const tmp = xlsx.utils.sheet_to_json(wb.Sheets['Target Milk Packs vs Milk Prod'], { header: 1, raw: true })
for (let i = 2; i < tmp.length; i++) {
  const center = String(tmp[i]?.[0] ?? '').trim()
  const cbed = tmp[i]?.[8]
  if (!center || /^total$/i.test(center) || cbed == null) continue
  if (!capacityByCenter[center]) capacityByCenter[center] = { jan: safeNum(cbed), jul: Math.round(safeNum(cbed) / 2) }
  else if (!capacityByCenter[center].jan) capacityByCenter[center].jan = safeNum(cbed)
}

// Try school years table
const { error: syErr } = await supabase.from('sbfp_school_years').upsert([
  { year: 2025, label: '2025-2026', is_active: true },
  { year: 2026, label: '2026-2027', is_active: true },
], { onConflict: 'year' })
if (syErr) {
  console.warn('⚠️  sbfp_school_years upsert failed (run migration SQL):', syErr.message)
} else {
  console.log('✅ sbfp_school_years seeded')
}

const centers = Object.keys(capacityByCenter).sort()
console.log(`Centers with capacity: ${centers.length}`)

for (const center of centers) {
  const { data: sdoRows } = await supabase
    .from('sbfp_data')
    .select('packs_to_deliver')
    .eq('center', center)
    .eq('year', YEAR)
  const packs = (sdoRows || []).reduce((s, r) => s + (r.packs_to_deliver || 0), 0)
  const { jan, jul } = capacityByCenter[center]
  const row = { year: YEAR, center, ...compute(jan, jul, packs) }
  const { error } = await supabase.from('sbfp_summary').upsert(row, { onConflict: 'year,center' })
  if (error) console.error('❌', center, error.message)
  else console.log(`  ${center}: jan=${jan} packs=${packs}`)
}

// Also recompute any center with SDO data but no Excel capacity
const { data: dataCenters } = await supabase.from('sbfp_data').select('center').eq('year', YEAR)
const unique = Array.from(new Set((dataCenters || []).map(r => r.center)))
for (const center of unique) {
  if (capacityByCenter[center]) continue
  const { data: sdoRows } = await supabase
    .from('sbfp_data')
    .select('packs_to_deliver')
    .eq('center', center)
    .eq('year', YEAR)
  const packs = (sdoRows || []).reduce((s, r) => s + (r.packs_to_deliver || 0), 0)
  const { data: existing } = await supabase
    .from('sbfp_summary')
    .select('jan_dec_target_milk_volume, jul_dec_projected_volume')
    .eq('center', center)
    .eq('year', YEAR)
    .maybeSingle()
  const row = {
    year: YEAR,
    center,
    ...compute(existing?.jan_dec_target_milk_volume, existing?.jul_dec_projected_volume, packs),
  }
  await supabase.from('sbfp_summary').upsert(row, { onConflict: 'year,center' })
  console.log(`  ${center}: packs-only recompute packs=${packs}`)
}

console.log('\n🎉 Capacity seed + recompute done for year', YEAR)
