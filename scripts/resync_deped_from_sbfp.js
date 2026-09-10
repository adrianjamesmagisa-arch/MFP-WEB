/**
 * Push every SBFP drop-off (encoder beneficiaries) into mfp_data as DepEd.
 * Uses the Next API via service-role logic inlined here so it can run from CLI.
 */
const fs = require('fs')
const path = require('path')
const { createClient } = require('@supabase/supabase-js')

function loadEnv() {
  const p = path.join(__dirname, '../.env.local')
  return Object.fromEntries(
    fs.readFileSync(p, 'utf8').split(/\n/).map(l => {
      const t = l.trim()
      if (!t || t.startsWith('#') || !t.includes('=')) return null
      const i = t.indexOf('=')
      return [t.slice(0, i), t.slice(i + 1)]
    }).filter(Boolean),
  )
}

async function fetchAll(sb, table, select, apply) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(select)
    if (apply) q = apply(q)
    const { data, error } = await q.range(from, from + 999)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  return out
}

async function main() {
  const env = loadEnv()
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const year = Number(process.argv[2] || 2026)

  const dropoffs = await fetchAll(sb, 'sbfp_dropoff_points', '*', q => q.eq('year', year).neq('include_in_masterlist', false))
  console.log(`Drop-offs to sync: ${dropoffs.length}`)

  const parentIds = [...new Set(dropoffs.map(d => d.sbfp_data_id).filter(Boolean))]
  const parents = new Map()
  for (const id of parentIds) {
    const { data } = await sb.from('sbfp_data').select('*').eq('id', id).maybeSingle()
    parents.set(id, data)
  }

  let synced = 0
  let failed = 0
  for (const d of dropoffs) {
    const parent = d.sbfp_data_id ? parents.get(d.sbfp_data_id) : null
    const payload = {
      year: d.year,
      center: d.center,
      funded_by: 'DepEd',
      division: String(parent?.sdo || d.sdo || '').replace(/\s*\((PM|SM|CM)[^)]*\)\s*/gi, ' ').trim(),
      elementary_school: String(d.dropoff_name || '').trim(),
      beneficiaries: Number(d.beneficiaries) || 0,
      feeding_days: Number(d.feeding_days) || Number(parent?.feeding_days) || 0,
      source_dropoff_id: d.id,
      region: d.region || parent?.region || '',
      province: d.province || '',
      municipality: d.municipality || d.district || '',
    }
    const days = payload.feeding_days
    const bene = payload.beneficiaries
    if (bene > 0 && days > 0) payload.milk_packs = bene * days

    const { data: existing } = await sb.from('mfp_data').select('id').eq('source_dropoff_id', d.id).maybeSingle()
    if (existing?.id) {
      const { error } = await sb.from('mfp_data').update(payload).eq('id', existing.id)
      if (error) { failed++; console.error('update', d.id, error.message) }
      else synced++
    } else {
      const { error } = await sb.from('mfp_data').insert({
        milk_packs: payload.milk_packs || 0,
        total_volume_requirements: 0,
        raw_milk_liters: 0,
        whole_milk_kg: 0,
        skimmed_milk_kg: 0,
        sugar: 0,
        batch: parent?.batch || '',
        milk_type: parent?.milk_type || 'PM',
        price: 0,
        milk_cost: 0,
        service_fee: 0,
        total_funds_transferred: 0,
        mode_of_procurement: '',
        target_milk_packs_to_deliver: Number(parent?.packs_to_deliver) || 0,
        total_milk_packs_delivered: Number(parent?.packs_delivered) || 0,
        ...payload,
      })
      if (error) { failed++; console.error('insert', d.dropoff_name, error.message) }
      else synced++
    }
    if (synced % 100 === 0) console.log(`  synced ${synced}/${dropoffs.length}`)
  }

  const linked = new Set(dropoffs.map(d => d.id))
  const deped = await fetchAll(sb, 'mfp_data', 'id,source_dropoff_id', q => q.eq('year', year).eq('funded_by', 'DepEd'))
  const orphans = deped.filter(r => !r.source_dropoff_id || !linked.has(r.source_dropoff_id))
  for (let i = 0; i < orphans.length; i += 100) {
    const ids = orphans.slice(i, i + 100).map(r => r.id)
    const { error } = await sb.from('mfp_data').delete().in('id', ids)
    if (error) console.error('orphan delete', error.message)
  }

  console.log(`Done. synced=${synced} failed=${failed} orphansRemoved=${orphans.length}`)
}

main().catch(e => { console.error(e); process.exit(1) })
