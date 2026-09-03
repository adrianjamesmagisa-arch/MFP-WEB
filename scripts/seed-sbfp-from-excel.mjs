/**
 * Reload SBFP website tables from:
 *   Data processing/SBFP FY 2026_Monitoring.xlsx
 *
 * Seeds: sbfp_data (center tabs + NHQ), sbfp_summary, sbfp_budget, sbfp_activities
 * Does not touch sbfp_monitoring (PIMD accomplishment source).
 *
 * School year mapping (Excel workbook is mixed):
 *   Center / NHQ tabs → sbfp_data year 2026 (SY 2026-2027)
 *   Summary / Budget / Activities tabs → year 2025 (SY 2025-2026)
 *
 * Usage (from mfp-web):
 *   node scripts/seed-sbfp-from-excel.mjs
 *   DRY_RUN=1 node scripts/seed-sbfp-from-excel.mjs
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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DRY_RUN = process.env.DRY_RUN === '1'
const EXCEL_PATH = process.env.EXCEL_PATH || resolve(
  __dirname,
  '../../Data processing/SBFP FY 2026_Monitoring.xlsx'
)

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
if (!existsSync(EXCEL_PATH)) {
  console.error('❌ Excel not found:', EXCEL_PATH)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
const CENTER_SHEETS = ['UPLB', 'CSU', 'DMMMSU', 'MMSU', 'CLSU', 'WVSU', 'LCSF', 'USF', 'VSU', 'MLPC', 'CMU', 'USM']
const JUNK = ['TOTAL', 'SUB-TOTAL', 'LEGEND', 'STATUS']

const REGION_RULES = [
  [/abra/i, 'CAR'], [/apayao/i, 'CAR'], [/benguet|baguio/i, 'CAR'], [/ifugao/i, 'CAR'],
  [/kalinga|tabuk/i, 'CAR'], [/mt\.?\s*province|mountain\s*province/i, 'CAR'],
  [/ilocos\s*norte|laoag|batac/i, 'I'], [/ilocos\s*sur|vigan|candon/i, 'I'],
  [/la\s*union|san\s*fernando\s*city/i, 'I'], [/pangasinan|alaminos|dagupan|urdanet/i, 'I'],
  [/batanes/i, 'II'], [/cagayan|tuguegarao/i, 'II'], [/isabela|cauayan|ilagan|santiago/i, 'II'],
  [/nueva\s*vizcaya/i, 'II'], [/quirino/i, 'II'],
  [/aurora/i, 'III'], [/bataan|balanga/i, 'III'], [/bulacan|malolos|meycauayan|san\s*jose\s*del\s*monte/i, 'III'],
  [/nueva\s*ecija|cabanatuan|gapan|muñoz|munoz|palayan/i, 'III'], [/pampanga|angeles|mabalacat/i, 'III'],
  [/tarlac/i, 'III'], [/zambales|olongapo/i, 'III'],
  [/batangas|lipa|tanauan/i, 'IVA'], [/cavite|bacoor|dasma|imus|general\s*trias/i, 'IVA'],
  [/laguna|biñan|binan|cabuyao|calamba|san\s*pablo|santa\s*rosa/i, 'IVA'],
  [/quezon|lucena|tayabas/i, 'IVA'], [/rizal|antipolo/i, 'IVA'],
  [/marinduque/i, 'IVB'], [/mindoro|calapan|mamburao/i, 'IVB'], [/palawan|puerto\s*princesa/i, 'IVB'], [/romblon/i, 'IVB'],
  [/albay|legazpi|legaspi|ligao|tabaco/i, 'V'], [/camarines/i, 'V'], [/catanduanes/i, 'V'], [/masbate/i, 'V'], [/sorsogon/i, 'V'],
  [/las\s*piñas|las\s*pinas|makati|malabon|mandaluyong|manila|marikina|muntinlupa|navotas|parañaque|paranaque|pasay|pasig|quezon\s*city|san\s*juan|taguig|pateros|valenzuela/i, 'NCR'],
  [/aklan|antique|capiz|roxas|guimaras|iloilo|passi/i, 'VI'],
  [/bohol|tagbilaran/i, 'VII'], [/cebu|carcar|mandaue|lapu|toledo|talisay/i, 'VII'], [/siquijor/i, 'VII'],
  [/negros|bais|bayawan|dumaguete|sipalay|victorias/i, 'NIR'],
  [/biliran|leyte|baybay|ormoc|tacloban|samar|calbayog|maasin/i, 'VIII'],
  [/zamboanga|dapitan|dipolog|pagadian/i, 'IX'],
  [/bukidnon|malaybalay|valencia|camiguin|lanao\s*del\s*norte|iligan|misamis|oroquieta|ozamiz|ozamis|tangub|cagayan\s*de\s*oro|gingoog/i, 'X'],
  [/davao|mati|tagum|panabo|samal|digos/i, 'XI'],
  [/cotabato|kidapawan|sarangani|general\s*santos|koronadal|sultan\s*kudarat|tacurong/i, 'XII'],
  [/agusan|butuan|cabadbaran|dinagat|surigao|bislig|tandag/i, 'CARAGA'],
  [/basilan|lamitan|lanao\s*del\s*sur|marawi|maguindanao|sulu|tawi/i, 'BARMM'],
]

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

function parseDate(v) {
  if (!v) return null
  if (v instanceof Date && !isNaN(v.getTime())) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'number') {
    const parsed = xlsx.SSF.parse_date_code(v)
    if (!parsed) return null
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  return null
}

function normalizeSdo(s) {
  return String(s || '').toLowerCase()
    .replace(/\s*[-–]\s*(pm|sm|smp|cm)\b/gi, '')
    .replace(/\s*\((pm|sm|smp|cm|pasteurized|sterilized|sterilised)[^)]*\)/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function mapStatus(raw) {
  const s = safeStr(raw).toUpperCase()
  if (s === 'DONE' || s === 'COMPLETED') return 'Completed'
  if (s === 'FAILED') return 'Failed'
  if (s === 'FOR PREPARATION') return 'For Preparation'
  if (s === 'NOT STARTED') return 'For Preparation'
  if (s.includes('FOR AWARD')) return 'Ongoing (For Award)'
  if (s === 'ONGOING') return 'Ongoing'
  return safeStr(raw) || 'For Preparation'
}

function inferMilkType(sdo, remarks) {
  const blob = `${sdo} ${remarks}`.toUpperCase()
  if (/\bSMP\b/.test(blob)) return 'SMP'
  if (/\bCM\b/.test(blob) || /COMMERCIAL/.test(blob)) return 'CM'
  if (/\bSM\b/.test(blob) || /STERIL/.test(blob)) return 'SM'
  if (/\bPM\b/.test(blob) || /PASTEUR/.test(blob)) return 'PM'
  return 'SM'
}

function inferRegion(sdo, center, regionMap) {
  if (/san\s*carlos/i.test(sdo)) {
    if (['DMMMSU', 'MMSU', 'CLSU'].includes(center)) return 'I'
    if (['LCSF', 'WVSU'].includes(center)) return 'NIR'
  }
  if (/dswd\s*viii|region\s*viii/i.test(sdo)) return 'VIII'
  const key = normalizeSdo(sdo)
  if (regionMap[key]) return regionMap[key]
  if (regionMap[sdo.toLowerCase().trim()]) return regionMap[sdo.toLowerCase().trim()]
  for (const [re, region] of REGION_RULES) {
    if (re.test(sdo)) return region
  }
  return ''
}

function classifyDeliveryCol(header) {
  const hs = header.toLowerCase()
  if (!hs.includes('packs delivered')) return null
  if (hs.includes('aug') && hs.includes('18')) return 'Aug. 18, 2026'
  if (hs.includes('aug') && hs.includes('31')) return 'Aug. 31, 2026'
  if (hs.includes('sep')) return 'Sept. 30, 2026'
  if (hs.includes('oct')) return 'Oct. 31, 2026'
  return safeStr(header)
}

function findHeaderRow(aoa) {
  for (let ri = 0; ri < Math.min(aoa.length, 30); ri++) {
    const rowStr = aoa[ri].map(v => String(v ?? '')).join('|').toUpperCase()
    if (rowStr.includes('STATUS') && rowStr.includes('SDO')) return ri
  }
  return -1
}

function mapHeaderCols(row) {
  const cols = { snaps: [] }
  row.forEach((h, ci) => {
    const hs = String(h ?? '').trim().toLowerCase()
    if (!hs) return
    if (hs.includes('status') && !hs.includes('payment') && cols.status === undefined) cols.status = ci
    else if (hs === 'sdo') cols.sdo = ci
    else if (hs.includes('amount') && !hs.includes('contract')) cols.amount = ci
    else if (hs.includes('mode of procurement')) cols.mode = ci
    else if (hs.includes('date received')) cols.dateReceived = ci
    else if (hs.includes('pr number')) cols.prNumber = ci
    else if (hs.includes('ors date')) cols.orsDate = ci
    else if (hs.includes('po number')) cols.poNumber = ci
    else if (hs.includes('remarks')) cols.remarks = ci
    else if (hs === 'batch' || hs.includes('batch')) cols.batch = ci
    else if (hs.includes('beneficiar')) cols.beneficiaries = ci
    else if (hs.includes('contract amount')) cols.contractAmount = ci
    else if (hs.includes('raw milk utilized') || (hs.includes('raw milk') && hs.includes('liter'))) cols.rawMilkUtilized = ci
    else if (hs.includes('cost per liter')) cols.costPerLiter = ci
    else if (hs.includes('gross revenue from raw milk') || hs.includes('gross income from the raw milk')) cols.grossRevenueRawMilk = ci
    else if (hs.includes('start of delivery')) cols.deliveryStart = ci
    else if (hs.includes('end of delivery')) cols.deliveryEnd = ci
    else if (hs.includes('packs to be delivered')) cols.targetPacks = ci
    else if (hs.includes('status of payment')) cols.paymentStatus = ci
    else {
      const snap = classifyDeliveryCol(hs)
      if (snap) cols.snaps.push({ ci, date: snap })
    }
  })
  return cols
}

function isJunkRow(sdo, status) {
  const su = sdo.toUpperCase()
  const st = status.toUpperCase()
  if (st === 'STATUS' || st === 'STATUTS') return true
  if (JUNK.some(k => su === k || su.startsWith(k + ' '))) return true
  if (su.includes('TOTAL')) return true
  return false
}

function buildRegionMap(wb) {
  const map = {}
  const sh = wb.Sheets.OVERALL
  if (!sh) return map
  const aoa = xlsx.utils.sheet_to_json(sh, { header: 1, defval: null, raw: false })
  for (let i = 2; i < aoa.length; i++) {
    const region = safeStr(aoa[i][1])
    const sdo = safeStr(aoa[i][2])
    if (!sdo || !region) continue
    map[normalizeSdo(sdo)] = region
    map[sdo.toLowerCase()] = region
  }
  return map
}

function parseCenterSheet(wb, sheetName, center, regionMap) {
  if (!wb.SheetNames.includes(sheetName)) {
    console.log(`  ⚠️  ${sheetName} missing`)
    return []
  }
  const aoa = xlsx.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1, defval: null, raw: false, cellDates: true,
  })
  const hr = findHeaderRow(aoa)
  if (hr === -1) {
    console.log(`  ⚠️  ${sheetName}: no STATUS/SDO header`)
    return []
  }
  const cols = mapHeaderCols(aoa[hr])
  if (cols.sdo === undefined) {
    console.log(`  ⚠️  ${sheetName}: SDO column missing`)
    return []
  }

  const records = []
  for (let ri = hr + 1; ri < aoa.length; ri++) {
    const row = aoa[ri]
    const sdo = safeStr(row[cols.sdo])
    const rawStatus = safeStr(row[cols.status])
    if (!sdo) continue
    if (sdo.toUpperCase().includes('TOTAL')) break
    if (isJunkRow(sdo, rawStatus)) continue
    const remarks = safeStr(row[cols.remarks])
    const amountRaw = row[cols.amount]
    let target = safeNum(row[cols.targetPacks])
    const amount = safeNum(amountRaw)
    const bene = safeNum(row[cols.beneficiaries])
    const fundUnderNda = /NDA/i.test(String(amountRaw ?? '') + remarks)
    // NHQ and some SDOs leave packs blank in Excel; ₱25/pack matches filled rows.
    if (target === 0 && amount > 0) {
      target = Math.round(amount / 25)
    }
    if (!rawStatus && target === 0 && amount === 0 && bene === 0 && !fundUnderNda) continue

    const snapshots = cols.snaps.map(s => ({
      date: s.date,
      packs: safeNum(row[s.ci]),
    }))
    let latest = 0
    for (const s of snapshots) {
      if (s.packs > 0) latest = s.packs
    }
    const status = fundUnderNda && !rawStatus ? 'Failed' : mapStatus(rawStatus)
    if (status === 'Completed' && latest === 0 && target > 0) latest = target

    const contractAmount = safeNum(row[cols.contractAmount])
    const rawMilkUtilized = cols.rawMilkUtilized != null ? safeNum(row[cols.rawMilkUtilized]) : 0
    const costPerLiter = cols.costPerLiter != null ? safeNum(row[cols.costPerLiter]) : 0
    let grossRevenueRawMilk = cols.grossRevenueRawMilk != null ? safeNum(row[cols.grossRevenueRawMilk]) : 0
    if (!grossRevenueRawMilk && rawMilkUtilized > 0 && costPerLiter > 0) {
      grossRevenueRawMilk = rawMilkUtilized * costPerLiter
    }

    records.push({
      year: 2026, // Excel center tabs are SY 2026-2027
      center,
      region: inferRegion(sdo, center, regionMap),
      sdo,
      procurement_status: status,
      include_in_report: status !== 'Failed',
      packs_to_deliver: target,
      packs_delivered: latest,
      milk_type: inferMilkType(sdo, remarks),
      delivery_schedule: 'FY 2026',
      amount,
      mode_of_procurement: safeStr(row[cols.mode]) || 'Sagip Saka',
      pr_date_received: parseDate(row[cols.dateReceived]),
      pr_number: safeStr(row[cols.prNumber]) || null,
      ors_date: parseDate(row[cols.orsDate]),
      po_number: safeStr(row[cols.poNumber]) || null,
      remarks: remarks || null,
      batch: safeStr(row[cols.batch]) || null,
      beneficiaries_pm: bene,
      contract_amount: contractAmount,
      delivery_start: parseDate(row[cols.deliveryStart]),
      delivery_end: parseDate(row[cols.deliveryEnd]),
      status_of_payment: safeStr(row[cols.paymentStatus]) || null,
      delivery_snapshots: snapshots.filter(s => s.packs > 0),
    })
    // Optional raw-milk revenue columns (migration 20260903000004) — include when present in Excel
    if (rawMilkUtilized || costPerLiter || grossRevenueRawMilk) {
      Object.assign(records[records.length - 1], {
        raw_milk_utilized_liters: rawMilkUtilized,
        cost_per_liter_raw_milk: costPerLiter,
        gross_revenue_raw_milk: grossRevenueRawMilk,
      })
    }
  }
  console.log(`  ${center}: ${records.length} rows`)
  return records
}

async function seedSummary(wb) {
  console.log('\n=== sbfp_summary ===')
  const sh = wb.Sheets['SUMMARY TARGET MILK PROD']
  if (!sh) { console.log('  SKIPPED'); return [] }
  const rows = xlsx.utils.sheet_to_json(sh, { header: 1, raw: true })
  const recs = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const center = safeStr(r[0])
    if (!center || center.toLowerCase() === 'total') continue
    recs.push({
      year: 2025, // Excel Summary tab is still SY 2025-2026
      center,
      jan_dec_target_milk_volume: safeNum(r[1]),
      target_milk_packs: safeNum(r[2]),
      equivalent_volume: Number(r[3]) || 0,
      shortage_surplus: Number(r[4]) || 0,
      pct_covered: Number(r[5]) || 0,
      jul_dec_projected_volume: safeNum(r[6]),
      milk_packs_can_produce: safeNum(r[7]),
      shortage_surplus_packs: Number(r[9]) || 0,
    })
  }
  console.log(`  ${recs.length} centers`)
  return recs
}

async function seedBudget(wb) {
  console.log('\n=== sbfp_budget ===')
  const sh = wb.Sheets['BUDGET BREAKDOWN']
  if (!sh) { console.log('  SKIPPED'); return [] }
  const rows = xlsx.utils.sheet_to_json(sh, { header: 1, raw: true })
  const recs = []
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const center = safeStr(r[0])
    if (!center || center.toUpperCase() === 'TOTAL') continue
    recs.push({
      year: 2025, // Excel Budget Breakdown tab is still SY 2025-2026
      center,
      milk_supplies: safeNum(r[1]),
      office_professional: safeNum(r[2]),
      traveling_expenses: safeNum(r[3]),
      office_supplies: safeNum(r[4]),
      training_expenses: safeNum(r[5]),
      furniture_fixtures: safeNum(r[6]),
      total: safeNum(r[7]),
    })
  }
  console.log(`  ${recs.length} centers`)
  return recs
}

async function seedActivities(wb) {
  console.log('\n=== sbfp_activities ===')
  const sh = wb.Sheets['STATUS OF ACTIVITIES']
  if (!sh) { console.log('  SKIPPED'); return [] }
  const rows = xlsx.utils.sheet_to_json(sh, { header: 1, raw: false, cellDates: true })
  const recs = []
  let order = 0
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const a = safeStr(r[1])
    const st = safeStr(r[2])
    if (!a || a.toUpperCase() === 'ACTIVITIES') continue
    const remarksVal = r[3]
    recs.push({
      year: 2025, // Excel Status of Activities tab is still SY 2025-2026
      activity: a,
      status: st || 'Not Started',
      remarks: parseDate(remarksVal) || safeStr(remarksVal) || null,
      sort_order: order++,
    })
  }
  console.log(`  ${recs.length} activities`)
  return recs
}

async function insertChunks(table, rows, chunk = 50) {
  let inserted = 0
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + chunk))
    if (error) {
      console.error(`  ❌ ${table} chunk ${i}:`, error.message)
    } else {
      inserted += Math.min(chunk, rows.length - i)
    }
  }
  console.log(`  ✅ ${table}: ${inserted}/${rows.length}`)
}

console.log(`📂 Excel: ${EXCEL_PATH}`)
console.log(`🧪 Dry run: ${DRY_RUN}\n`)

const wb = xlsx.readFile(EXCEL_PATH, { cellDates: true, raw: false })
const regionMap = buildRegionMap(wb)
console.log(`🗺️  Region map: ${Object.keys(regionMap).length} keys`)

console.log('\n=== sbfp_data (center tabs) ===')
const centerRows = []
for (const center of CENTER_SHEETS) {
  centerRows.push(...parseCenterSheet(wb, center, center, regionMap))
}
centerRows.push(...parseCenterSheet(wb, 'NHQ PROCUREMENT ACTIVITIES', 'NHQ', regionMap))

const statusCounts = {}
for (const r of centerRows) statusCounts[r.procurement_status] = (statusCounts[r.procurement_status] || 0) + 1
console.log(`\n📊 ${centerRows.length} SDO rows`)
console.log('   Status:', statusCounts)
console.log('   Missing region:', centerRows.filter(r => !r.region).map(r => `${r.center}/${r.sdo}`).slice(0, 15))

const summaryRows = await seedSummary(wb)
const budgetRows = await seedBudget(wb)
const activityRows = await seedActivities(wb)

if (DRY_RUN) {
  console.log('\n🧪 DRY RUN — no database writes.')
  process.exit(0)
}

console.log('\n🗑️  Replacing SBFP website data by school year...')
await supabase.from('sbfp_data').delete().eq('year', 2026)        // SY 2026-2027 center tabs
await supabase.from('sbfp_summary').delete().eq('year', 2025)    // SY 2025-2026 summary tab
await supabase.from('sbfp_budget').delete().eq('year', 2025)
await supabase.from('sbfp_activities').delete().eq('year', 2025)

await insertChunks('sbfp_data', centerRows)
await insertChunks('sbfp_summary', summaryRows, 50)
await insertChunks('sbfp_budget', budgetRows, 50)
await insertChunks('sbfp_activities', activityRows, 50)

console.log('\n🎉 SBFP website data updated from the current Excel.')
