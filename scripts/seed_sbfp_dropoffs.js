/**
 * Seed SBFP drop-off schools from MILK FEEDING DROP OFFS.xlsx
 * and sync identity rows into mfp_data.
 *
 * Usage: node scripts/seed_sbfp_dropoffs.js
 */
const fs = require('fs')
const path = require('path')
const XLSX = require('xlsx')
const { createClient } = require('@supabase/supabase-js')

const envPath = path.join(__dirname, '../.env.local')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\n/).forEach(line => {
    const t = line.trim()
    if (!t || t.startsWith('#') || !t.includes('=')) return
    const i = t.indexOf('=')
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim()
    if (!process.env[k]) process.env[k] = v
  })
}

const YEAR = 2026
const XLSX_PATH = path.resolve(__dirname, '../../Data processing/MILK FEEDING DROP OFFS.xlsx')
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

function normalizeSdoName(value) {
  return String(value || '')
    .replace(/^\d+\.\s*/g, '')
    .replace(/\s*\((PM|SM|SMP|CM)[^)]*\)\s*/gi, ' ')
    .replace(/\s*[-–—]?\s*\d+\s*Feeding\s*Days?/gi, ' ')
    .replace(/[-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function sheetToCenter(name) {
  if (name === 'NIZ' || name === 'Copy of LCSF') return name === 'NIZ' ? 'NHQ' : null
  return name
}

function parseBeneficiaries(v) {
  if (v == null || v === '') return 0
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? Math.round(n) : 0
}

function parseSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
  let sdo = ''
  const out = []
  for (let i = 1; i < rows.length; i++) {
    const a = String(rows[i][0] || '').trim()
    const b = String(rows[i][1] || '').trim()
    const c = rows[i][2]
    const d = String(rows[i][3] || '').trim()
    if (!a && !b && !c) continue
    if (/^total$/i.test(a) || /^total$/i.test(b)) continue
    if (a) sdo = a.replace(/^\d+\.\s*/, '').trim()
    if (!b) continue
    if (/^pasteurized\s+milk$/i.test(b)) continue
    if (/^sterilized\s+milk$/i.test(b)) continue
    if (/^total$/i.test(b)) continue
    out.push({
      sdo,
      dropoff_name: b.replace(/\s+/g, ' ').trim(),
      beneficiaries: parseBeneficiaries(c),
      district: d || null,
    })
  }
  return out
}

function matchSdo(sdoName, sdoRows) {
  const target = normalizeSdoName(sdoName)
  if (!target) return null
  let best = sdoRows.find(r => normalizeSdoName(r.sdo) === target)
  if (best) return best
  best = sdoRows.find(r => {
    const n = normalizeSdoName(r.sdo)
    return n.includes(target) || target.includes(n)
  })
  return best || null
}

async function ensureTable() {
  const { error } = await supabase.from('sbfp_dropoff_points').select('id').limit(1)
  if (error) {
    console.error('❌ sbfp_dropoff_points missing. Run migration SQL first:')
    console.error(error.message)
    const sql = fs.readFileSync(
      path.join(__dirname, '../supabase/migrations/20260904000003_sbfp_dropoff_points.sql'),
      'utf8',
    )
    console.log('\nPaste into Supabase SQL Editor:\n')
    console.log(sql)
    process.exit(1)
  }
  const { error: mfpErr } = await supabase.from('mfp_data').select('source_dropoff_id').limit(1)
  if (mfpErr) {
    console.error('❌ mfp_data.source_dropoff_id missing. Run the same migration SQL.')
    console.error(mfpErr.message)
    process.exit(1)
  }
}

async function syncOne(dropoff, parent) {
  const name = String(dropoff.dropoff_name || '').trim()
  if (!name) return { error: 'empty name' }

  const { data: byLink } = await supabase
    .from('mfp_data')
    .select('id,milk_type,feeding_days,batch')
    .eq('source_dropoff_id', dropoff.id)
    .maybeSingle()

  let existing = byLink
  if (!existing) {
    const { data: byName } = await supabase
      .from('mfp_data')
      .select('id,milk_type,feeding_days,batch')
      .eq('year', dropoff.year)
      .eq('center', dropoff.center)
      .eq('elementary_school', name)
      .is('source_dropoff_id', null)
      .limit(1)
      .maybeSingle()
    existing = byName
  }

  const payload = {
    year: dropoff.year,
    center: dropoff.center,
    funded_by: 'DepEd',
    division: (parent?.sdo || dropoff.sdo || '').trim(),
    elementary_school: name,
    beneficiaries: Number(dropoff.beneficiaries) || 0,
    source_dropoff_id: dropoff.id,
    region: (dropoff.region || parent?.region || '').trim(),
    province: (dropoff.province || '').trim(),
    municipality: (dropoff.municipality || dropoff.district || '').trim(),
  }
  if (!existing?.milk_type && parent?.milk_type && !String(parent.milk_type).startsWith('__')) {
    payload.milk_type = parent.milk_type
  }
  if ((!existing?.feeding_days || existing.feeding_days === 0) && parent?.feeding_days) {
    payload.feeding_days = parent.feeding_days
  }
  if (!existing?.batch && parent?.batch) payload.batch = parent.batch

  if (existing?.id) {
    const { error } = await supabase.from('mfp_data').update(payload).eq('id', existing.id)
    return { error: error?.message || null }
  }

  const { error } = await supabase.from('mfp_data').insert({
    milk_packs: 0,
    total_volume_requirements: 0,
    raw_milk_liters: 0,
    whole_milk_kg: 0,
    skimmed_milk_kg: 0,
    sugar: 0,
    feeding_days: payload.feeding_days || 0,
    batch: payload.batch || '',
    milk_type: payload.milk_type || 'PM',
    price: 0,
    milk_cost: 0,
    service_fee: 0,
    total_funds_transferred: 0,
    mode_of_procurement: '',
    target_milk_packs_to_deliver: 0,
    total_milk_packs_delivered: 0,
    ...payload,
  })
  return { error: error?.message || null }
}

async function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error('Excel not found:', XLSX_PATH)
    process.exit(1)
  }
  await ensureTable()

  const wb = XLSX.readFile(XLSX_PATH, { raw: false })
  const { data: allSdoPages } = { data: null }
  const allSdo = []
  {
    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await supabase
        .from('sbfp_data')
        .select('id,center,sdo,region,milk_type,batch,feeding_days,remarks')
        .eq('year', YEAR)
        .range(from, from + pageSize - 1)
      if (error) throw new Error(error.message)
      const page = (data || []).filter(r => !String(r.milk_type || '').startsWith('__'))
      allSdo.push(...page)
      if (!data || data.length < pageSize) break
      from += pageSize
    }
  }
  void allSdoPages

  const byCenter = {}
  for (const r of allSdo) {
    if (!byCenter[r.center]) byCenter[r.center] = []
    byCenter[r.center].push(r)
  }
  console.log('Loaded SDOs', allSdo.length, 'centers', Object.keys(byCenter).length)

  let inserted = 0
  let updated = 0
  let synced = 0
  let unmatched = 0
  const unmatchedSamples = []

  for (const sheetName of wb.SheetNames) {
    const center = sheetToCenter(sheetName)
    if (!center) continue
    const parsed = parseSheet(wb.Sheets[sheetName])
    console.log(`\n${sheetName} → ${center}: ${parsed.length} schools`)
    const sdoRows = byCenter[center] || []

    // clear existing seed for this center/year then reinsert (idempotent re-run)
    // Prefer upsert by unique key instead of wipe when possible.
    for (const row of parsed) {
      const parent = matchSdo(row.sdo, sdoRows)
      if (!parent) {
        unmatched++
        if (unmatchedSamples.length < 20) unmatchedSamples.push(`${center}: ${row.sdo}`)
      }
      const payload = {
        year: YEAR,
        center,
        sbfp_data_id: parent?.id || null,
        sdo: parent?.sdo || row.sdo,
        dropoff_name: row.dropoff_name,
        beneficiaries: row.beneficiaries,
        district: row.district,
        municipality: null,
        province: null,
        region: parent?.region || null,
        include_in_masterlist: true,
        updated_at: new Date().toISOString(),
      }

      const { data: existing } = await supabase
        .from('sbfp_dropoff_points')
        .select('id')
        .eq('center', center)
        .eq('year', YEAR)
        .eq('sdo', payload.sdo)
        .eq('dropoff_name', payload.dropoff_name)
        .maybeSingle()

      let dropoffId = existing?.id
      if (dropoffId) {
        const { error } = await supabase.from('sbfp_dropoff_points').update(payload).eq('id', dropoffId)
        if (error) {
          console.error('update fail', payload.dropoff_name, error.message)
          continue
        }
        updated++
      } else {
        const { data, error } = await supabase.from('sbfp_dropoff_points').insert(payload).select('id').maybeSingle()
        if (error) {
          console.error('insert fail', payload.dropoff_name, error.message)
          continue
        }
        dropoffId = data.id
        inserted++
      }

      const syncRes = await syncOne(
        { id: dropoffId, ...payload },
        parent,
      )
      if (syncRes.error) console.error('sync fail', payload.dropoff_name, syncRes.error)
      else synced++
    }
  }

  console.log('\nDone.')
  console.log({ inserted, updated, synced, unmatched })
  if (unmatchedSamples.length) {
    console.log('Unmatched SDO samples:', unmatchedSamples)
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
