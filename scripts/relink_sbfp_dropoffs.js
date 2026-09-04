/**
 * Relink sbfp_dropoff_points.sbfp_data_id after seed (pagination-safe).
 * Also creates missing CSU "Tuguegarao City" procurement row when needed.
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
    .replace(/^sdo\s+/i, '')
    .replace(/\s*\((PM|SM|SMP|CM|SPM|Sterilized|Pasteurized|Commercial)[^)]*\)\s*/gi, ' ')
    .replace(/\s*[-–—]\s*(PM|SM|SMP|CM|SPM)\b/gi, ' ')
    .replace(/\s*[-–—]?\s*\d+\s*Feeding\s*Days?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-–—]+$/g, '')
    .trim()
    .toLowerCase()
    .replace(/\bozamis\b/g, 'ozamiz')
    .replace(/\bciity\b/g, 'city')
}

function milkTag(value) {
  const s = String(value || '').toUpperCase()
  if (/\bCM\b|COMMERCIAL/.test(s)) return 'CM'
  if (/\bSM\b|STERIL/.test(s)) return 'SM'
  if (/\bPM\b|PASTEUR/.test(s)) return 'PM'
  if (/\bSMP\b|\bSPM\b/.test(s)) return 'SMP'
  return null
}

function matchSdo(sdoName, sdoRows) {
  const target = normalizeSdoName(sdoName)
  if (!target) return null
  const tag = milkTag(sdoName)

  const scored = sdoRows
    .map(r => {
      const n = normalizeSdoName(r.sdo)
      if (!n) return null
      let score = 0
      if (n === target) score = 100
      else if (target.length >= 4 && (n.includes(target) || target.includes(n))) score = 60
      else return null
      if (tag) {
        const rowTag = milkTag(r.sdo) || milkTag(r.milk_type)
        if (rowTag === tag) score += 20
        else if (rowTag && rowTag !== tag) score -= 10
      }
      return { r, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)

  return scored[0]?.r || null
}

async function fetchAll(table, cols, apply) {
  const out = []
  let from = 0
  const size = 1000
  for (;;) {
    let q = sb.from(table).select(cols).range(from, from + size - 1)
    if (apply) q = apply(q)
    const { data, error } = await q
    if (error) throw error
    out.push(...(data || []))
    if (!data || data.length < size) break
    from += size
  }
  return out
}

async function ensureMissingSdos(byCenter, dropoffs) {
  // Create real missing SDO rows when many drop-offs share a label not in procurement
  const needed = {}
  for (const d of dropoffs) {
    if (d.sbfp_data_id) continue
    const list = byCenter[d.center] || []
    if (matchSdo(d.sdo, list)) continue
    const key = `${d.center}||${d.sdo}`
    needed[key] = (needed[key] || 0) + 1
  }

  const created = []
  for (const [key, count] of Object.entries(needed)) {
    // Only auto-create when it looks like a real SDO (City/Province style), not a school name
    const [center, sdo] = key.split('||')
    const looksLikeSchool = /\bES\b|\bIS\b|\bHS\b|\bCS\b|elementary|school/i.test(sdo)
    if (looksLikeSchool || count < 3) continue
    if (!/city|province|sdo|\(pm\)|\(sm\)|\(cm\)/i.test(sdo) && !/^[A-Za-z .'-]+$/.test(sdo)) continue

    const milk = milkTag(sdo) || 'PM'
    const payload = {
      year: YEAR,
      center,
      region: '',
      sdo,
      procurement_status: 'For Preparation',
      include_in_report: true,
      packs_to_deliver: 0,
      packs_delivered: 0,
      milk_type: milk === 'SMP' ? 'PM' : milk,
      delivery_schedule: `FY ${YEAR}`,
      amount: 0,
      mode_of_procurement: 'Sagip Saka',
      beneficiaries_pm: 0,
      contract_amount: 0,
      delivery_snapshots: [],
      monthly_packs_delivered: {},
      raw_milk_prices: {},
    }
    const { data, error } = await sb.from('sbfp_data').insert(payload).select('id,center,sdo,region,milk_type,batch,feeding_days,remarks').maybeSingle()
    if (error) {
      console.log('create SDO fail', center, sdo, error.message)
      continue
    }
    if (!byCenter[center]) byCenter[center] = []
    byCenter[center].push(data)
    created.push(`${center}: ${sdo} (${count} drop-offs)`)
  }
  return created
}

;(async () => {
  const sdos = await fetchAll(
    'sbfp_data',
    'id,center,sdo,region,milk_type,batch,feeding_days,remarks',
    q => q.eq('year', YEAR),
  )
  const byCenter = {}
  for (const r of sdos) {
    if (r.milk_type === '__PPMP__' || r.milk_type === '__HIRING__') continue
    if (!byCenter[r.center]) byCenter[r.center] = []
    byCenter[r.center].push(r)
  }
  console.log('SDO rows loaded', Object.values(byCenter).flat().length)

  const dropoffs = await fetchAll(
    'sbfp_dropoff_points',
    'id,center,sdo,sbfp_data_id,dropoff_name,beneficiaries,district,municipality,province,region,include_in_masterlist,year',
    q => q.eq('year', YEAR),
  )
  console.log('Dropoffs', dropoffs.length)

  const created = await ensureMissingSdos(byCenter, dropoffs)
  if (created.length) console.log('Created missing SDOs:', created)

  let linked = 0
  let unmatched = 0
  const samples = []

  for (const d of dropoffs) {
    const parent = matchSdo(d.sdo, byCenter[d.center] || [])
    if (!parent) {
      unmatched++
      if (samples.length < 30) samples.push(`${d.center}: ${d.sdo}`)
      continue
    }
    if (d.sbfp_data_id === parent.id && d.sdo === parent.sdo) {
      linked++
      continue
    }
    const { error } = await sb.from('sbfp_dropoff_points').update({
      sbfp_data_id: parent.id,
      sdo: parent.sdo,
      region: parent.region || d.region,
      updated_at: new Date().toISOString(),
    }).eq('id', d.id)
    if (error) {
      // Unique (center,year,sdo,school) collision when renaming SDO — still link by id
      const { error: e2 } = await sb.from('sbfp_dropoff_points').update({
        sbfp_data_id: parent.id,
        region: parent.region || d.region,
        updated_at: new Date().toISOString(),
      }).eq('id', d.id)
      if (e2) {
        console.error('update fail', d.dropoff_name, error.message)
        continue
      }
    }
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

  console.log({ linked, unmatched, sampleUnmatched: samples })
})().catch(e => {
  console.error(e)
  process.exit(1)
})
