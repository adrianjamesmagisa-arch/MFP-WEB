/**
 * Relink sbfp_dropoff_points.sbfp_data_id after seed (pagination-safe).
 * Usage: node scripts/relink_sbfp_dropoffs.js
 */
const fs = require('fs')
const path = require('path')
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
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

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

function matchSdo(sdoName, sdoRows) {
  const target = normalizeSdoName(sdoName)
  if (!target) return null
  let best = sdoRows.find(r => normalizeSdoName(r.sdo) === target)
  if (best) return best
  // Prefer exact-ish includes, avoid tiny false positives
  best = sdoRows.find(r => {
    const n = normalizeSdoName(r.sdo)
    if (!n) return false
    if (n === target) return true
    if (target.length >= 4 && (n.includes(target) || target.includes(n))) return true
    return false
  })
  return best || null
}

async function fetchAll(table, select, filterFn) {
  const pageSize = 1000
  let from = 0
  const out = []
  while (true) {
    let q = sb.from(table).select(select).range(from, from + pageSize - 1)
    if (filterFn) q = filterFn(q)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return out
}

async function main() {
  const sdos = (await fetchAll(
    'sbfp_data',
    'id,center,sdo,region,milk_type,batch,feeding_days,remarks',
    q => q.eq('year', YEAR),
  )).filter(r => !String(r.milk_type || '').startsWith('__'))

  const byCenter = {}
  for (const r of sdos) {
    if (!byCenter[r.center]) byCenter[r.center] = []
    byCenter[r.center].push(r)
  }
  console.log('SDO rows loaded', sdos.length, 'centers', Object.keys(byCenter).sort().join(','))

  const dropoffs = await fetchAll(
    'sbfp_dropoff_points',
    'id,center,sdo,dropoff_name,beneficiaries,district,municipality,province,region,include_in_masterlist,year',
    q => q.eq('year', YEAR),
  )
  console.log('Dropoffs', dropoffs.length)

  let linked = 0
  let unmatched = 0
  const samples = []

  for (const d of dropoffs) {
    const parent = matchSdo(d.sdo, byCenter[d.center] || [])
    if (!parent) {
      unmatched++
      if (samples.length < 25) samples.push(`${d.center}: ${d.sdo}`)
      continue
    }
    const { error } = await sb.from('sbfp_dropoff_points').update({
      sbfp_data_id: parent.id,
      sdo: parent.sdo,
      region: parent.region || d.region,
      updated_at: new Date().toISOString(),
    }).eq('id', d.id)
    if (error) {
      console.error('update fail', d.dropoff_name, error.message)
      continue
    }
    // Refresh masterlist division from parent SDO
    await sb.from('mfp_data').update({
      division: parent.sdo,
      region: parent.region || d.region || '',
      center: d.center,
      year: YEAR,
      funded_by: 'DepEd',
      elementary_school: d.dropoff_name,
      beneficiaries: Number(d.beneficiaries) || 0,
      municipality: d.municipality || d.district || '',
      source_dropoff_id: d.id,
    }).eq('source_dropoff_id', d.id)
    linked++
  }

  console.log({ linked, unmatched })
  if (samples.length) console.log('Unmatched samples:', [...new Set(samples)])
}

main().catch(e => { console.error(e); process.exit(1) })
