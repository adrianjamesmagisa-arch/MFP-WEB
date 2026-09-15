/**
 * Enable masterlist sync for all DSWD monitoring drop-offs and push into mfp_data.
 *
 * Usage (from mfp-web):
 *   node scripts/resync-dswd-to-masterlist.mjs
 *   node scripts/resync-dswd-to-masterlist.mjs 2026
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)

const yearArg = process.argv[2] ? Number(process.argv[2]) : undefined
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  let enableQ = supabase
    .from('mfp_program_dropoffs')
    .update({ include_in_masterlist: true })
    .eq('program', 'dswd')
    .eq('include_in_masterlist', false)
  if (yearArg) enableQ = enableQ.eq('year', yearArg)
  const { data: enabled, error: enableErr } = await enableQ.select('id')
  if (enableErr) throw new Error(enableErr.message)
  console.log(`Enabled include_in_masterlist: ${(enabled || []).length} drop-off(s)`)

  // Inline resync via Supabase (mirrors resyncAllProgramDropoffsToMasterlist).
  const dropoffs = []
  for (let from = 0; ; from += 1000) {
    let q = supabase
      .from('mfp_program_dropoffs')
      .select('*')
      .eq('program', 'dswd')
      .neq('include_in_masterlist', false)
    if (yearArg) q = q.eq('year', yearArg)
    const { data, error } = await q.range(from, from + 999)
    if (error) throw new Error(error.message)
    dropoffs.push(...(data || []))
    if ((data || []).length < 1000) break
  }
  console.log(`Drop-offs to sync: ${dropoffs.length}`)

  const procIds = [...new Set(dropoffs.map(d => d.procurement_id).filter(Boolean))]
  const procs = new Map()
  for (const id of procIds) {
    const { data } = await supabase.from('mfp_program_procurement').select('*').eq('id', id).maybeSingle()
    procs.set(id, data)
  }

  let synced = 0
  let failed = 0
  for (const d of dropoffs) {
    const parent = d.procurement_id ? procs.get(d.procurement_id) : null
    const municipality = String(d.dropoff_name || d.municipality || '').trim()
    const province = String(d.province || parent?.province || parent?.label || '').trim()
    const bene = Number(d.beneficiaries) || 0
    const days = Number(d.feeding_days) || 0
    const milkType = parent?.milk_type || 'PM'
    const milkPacks = bene > 0 && days > 0 ? bene * days : 0
    const contract = Number(parent?.contract_amount) || Number(parent?.amount) || 0

    const payload = {
      year: d.year,
      center: d.center,
      funded_by: 'DSWD',
      division: 'N/A',
      elementary_school: 'N/A',
      province,
      municipality,
      beneficiaries: bene,
      feeding_days: days,
      milk_packs: milkPacks,
      milk_type: milkType,
      region: d.region || parent?.region || '',
      source_program_dropoff_id: d.id,
      mode_of_procurement: parent?.mode_of_procurement || '',
      supplier_id: parent?.supplier_id || null,
      target_milk_packs_to_deliver: Number(parent?.packs_to_deliver) || 0,
      total_milk_packs_delivered: Number(parent?.packs_delivered) || 0,
    }
    if (contract > 0) {
      payload.total_funds_transferred = contract
      payload.milk_cost = contract
    }
    if (parent?.delivery_start) payload.date_started = parent.delivery_start
    if (parent?.delivery_end) payload.date_completed = parent.delivery_end

    const { data: existing } = await supabase
      .from('mfp_data')
      .select('id')
      .eq('source_program_dropoff_id', d.id)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await supabase.from('mfp_data').update(payload).eq('id', existing.id)
      if (error) {
        failed++
        console.error('update', d.id, error.message)
      } else synced++
    } else {
      const { error } = await supabase.from('mfp_data').insert({
        batch: '',
        price: 0,
        service_fee: 0,
        ...payload,
      })
      if (error) {
        failed++
        console.error('insert', d.id, error.message)
      } else synced++
    }
  }

  console.log(`Synced: ${synced}, failed: ${failed}`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
