/**
 * Load BUDGET BREAKDOWN + SUMMARY TARGET MILK PROD from the FY 2026 Excel
 * into sbfp_budget / sbfp_summary. Excel "NIZ" is stored as NHQ for SBFP pages.
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

function mapCenter(name) {
  const c = String(name || '').trim()
  if (!c) return null
  if (c.toUpperCase() === 'NIZ' || c.toUpperCase() === 'NHQGP (NIZ)' || c.toUpperCase() === 'NHQGP') return 'NHQ'
  return c
}

function n(v) {
  const x = Number(v)
  return Number.isFinite(x) ? x : 0
}

async function seedBudget(wb) {
  const sh = wb.Sheets['BUDGET BREAKDOWN']
  if (!sh) { console.log('BUDGET SKIPPED'); return }
  const rows = xlsx.utils.sheet_to_json(sh, { header: 1, raw: true })
  let ok = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const center = mapCenter(r[0])
    if (!center || String(r[0]).toUpperCase().includes('TOTAL')) continue
    const rec = {
      year: 2026,
      center,
      milk_supplies: n(r[1]),
      office_professional: n(r[2]),
      traveling_expenses: n(r[3]),
      office_supplies: n(r[4]),
      training_expenses: n(r[5]),
      furniture_fixtures: n(r[6]),
      total: n(r[7]) || (n(r[1]) + n(r[2]) + n(r[3]) + n(r[4]) + n(r[5]) + n(r[6])),
    }
    const { error } = await supabase.from('sbfp_budget').upsert(rec, { onConflict: 'year,center' })
    if (error) console.log('BUDGET ERROR', center, error.message)
    else {
      ok++
      console.log('BUDGET', center, rec.total)
    }
  }
  console.log(`Budget upserted: ${ok}`)
}

async function seedSummaryVolumes(wb) {
  const sh = wb.Sheets['SUMMARY TARGET MILK PROD']
  if (!sh) { console.log('SUMMARY SKIPPED'); return }
  const rows = xlsx.utils.sheet_to_json(sh, { header: 1, raw: true })
  let ok = 0
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const center = mapCenter(r[0])
    if (!center || String(r[0]).toLowerCase().includes('total')) continue

    const { data: sdoRows } = await supabase
      .from('sbfp_data')
      .select('packs_to_deliver')
      .eq('center', center)
      .eq('year', 2026)
    const packsSum = (sdoRows || []).reduce((s, x) => s + (Number(x.packs_to_deliver) || 0), 0)

    const janDec = n(r[1])
    const julDec = n(r[6]) || Math.round(janDec / 2)
    const equivalentVolume = packsSum / 25
    const rec = {
      year: 2026,
      center,
      jan_dec_target_milk_volume: janDec,
      target_milk_packs: packsSum,
      equivalent_volume: equivalentVolume,
      shortage_surplus: janDec - equivalentVolume,
      pct_covered: janDec > 0 ? equivalentVolume / janDec : 0,
      jul_dec_projected_volume: julDec,
      milk_packs_can_produce: julDec * 25,
      shortage_surplus_packs: julDec * 25 - packsSum,
    }
    const { error } = await supabase.from('sbfp_summary').upsert(rec, { onConflict: 'year,center' })
    if (error) console.log('SUMMARY ERROR', center, error.message)
    else {
      ok++
      console.log('SUMMARY', center, 'A=', janDec, 'E=', julDec, 'packs=', packsSum)
    }
  }
  console.log(`Summary upserted: ${ok}`)
}

async function main() {
  const wb = xlsx.readFile(EXCEL)
  await seedBudget(wb)
  await seedSummaryVolumes(wb)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
