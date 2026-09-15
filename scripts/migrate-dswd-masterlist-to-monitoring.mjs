/**
 * Migrate DSWD rows from mfp_data → DSWD monitoring (mfp_program_*),
 * then delete those rows from the masterlist.
 *
 * Usage (from mfp-web):
 *   node scripts/migrate-dswd-masterlist-to-monitoring.mjs
 *   DRY_RUN=1 node scripts/migrate-dswd-masterlist-to-monitoring.mjs
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

const DRY = process.env.DRY_RUN === '1'
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

async function fetchAllDswd() {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from('mfp_data')
      .select('*')
      .eq('funded_by', 'DSWD')
      .order('center')
      .order('province')
      .order('municipality')
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

function groupKey(r) {
  const milk = String(r.milk_type || 'PM').trim() || 'PM'
  const batch = String(r.batch || '').trim()
  const province = String(r.province || '').trim() || 'Unknown Province'
  return [r.year, r.center, province, milk, batch].join('|')
}

function procurementLabel(province, milk, batch) {
  const parts = [province || 'Unknown Province']
  if (milk && milk !== 'PM') parts.push(milk)
  if (batch) parts.push(`Batch ${batch}`)
  return parts.join(' · ')
}

function fundsOf(r) {
  const funds = Number(r.total_funds_transferred) || 0
  const cost = Number(r.milk_cost) || 0
  return funds > 0 ? funds : cost
}

async function main() {
  console.log(DRY ? '=== DRY RUN ===' : '=== LIVE MIGRATE ===')
  const rows = await fetchAllDswd()
  console.log('DSWD masterlist rows:', rows.length)
  if (!rows.length) {
    console.log('Nothing to migrate.')
    return
  }

  const groups = new Map()
  for (const r of rows) {
    const k = groupKey(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  console.log('Procurement groups:', groups.size)

  const centers = new Set()
  let procCreated = 0
  let dropCreated = 0
  const idsToDelete = rows.map(r => r.id)

  for (const [key, members] of groups) {
    const sample = members[0]
    const year = Number(sample.year) || 2026
    const center = String(sample.center || '').trim()
    const province = String(sample.province || '').trim() || 'Unknown Province'
    const milk = String(sample.milk_type || 'PM').trim() || 'PM'
    const batch = String(sample.batch || '').trim()
    const region = String(sample.region || '').trim()
    const month = 1 // year workspace (same as ensureProgramYear)
    const label = procurementLabel(province, milk, batch)

    centers.add(center)

    const beneficiaries = members.reduce((s, r) => s + (Number(r.beneficiaries) || 0), 0)
    const packs = members.reduce((s, r) => s + (Number(r.milk_packs) || 0), 0)
    const amount = members.reduce((s, r) => s + fundsOf(r), 0)
    const supplier_id = members.find(r => r.supplier_id)?.supplier_id || null
    const mode = members.find(r => r.mode_of_procurement)?.mode_of_procurement || ''
    const delivery_end = members.find(r => r.date_completed)?.date_completed || null
    const delivery_start = members.find(r => r.date_started)?.date_started || null

    console.log(`  PROC ${center} / ${label} ← ${members.length} municipalities, bene=${beneficiaries}, packs=${packs}`)

    if (DRY) {
      procCreated++
      dropCreated += members.length
      continue
    }

    const { error: monthErr } = await supabase.from('mfp_program_months').upsert(
      { year, month, center, program: 'dswd' },
      { onConflict: 'center,program,year,month' },
    )
    if (monthErr) throw new Error(`months: ${monthErr.message}`)

    // Prefer insert; if unique conflict on label, fetch existing and reuse.
    let procurementId = null
    const { data: inserted, error: insErr } = await supabase
      .from('mfp_program_procurement')
      .insert({
        year,
        month,
        center,
        program: 'dswd',
        region,
        province,
        label,
        procurement_status: 'Completed',
        amount,
        contract_amount: amount,
        packs_to_deliver: packs,
        packs_delivered: packs,
        milk_type: milk,
        mode_of_procurement: mode,
        delivery_start,
        delivery_end,
        include_in_report: true,
        beneficiaries,
        batch: batch || null,
        supplier_id,
        remarks: 'Migrated from mfp_data DSWD masterlist',
      })
      .select('id')
      .maybeSingle()

    if (insErr) {
      const { data: existing, error: exErr } = await supabase
        .from('mfp_program_procurement')
        .select('id')
        .eq('center', center)
        .eq('year', year)
        .eq('program', 'dswd')
        .eq('label', label)
        .limit(1)
      if (exErr || !existing?.[0]) throw new Error(`proc insert: ${insErr.message}`)
      procurementId = existing[0].id
      await supabase
        .from('mfp_program_procurement')
        .update({
          month,
          region,
          province,
          amount,
          contract_amount: amount,
          packs_to_deliver: packs,
          packs_delivered: packs,
          milk_type: milk,
          mode_of_procurement: mode,
          delivery_start,
          delivery_end,
          beneficiaries,
          batch: batch || null,
          supplier_id,
          remarks: 'Migrated from mfp_data DSWD masterlist (updated)',
        })
        .eq('id', procurementId)
    } else {
      procurementId = inserted.id
      procCreated++
    }

    for (const r of members) {
      const muni = String(r.municipality || '').trim() || 'Unknown'
      const drop = {
        procurement_id: procurementId,
        year,
        month,
        center,
        program: 'dswd',
        province,
        municipality: muni,
        dropoff_name: muni,
        beneficiaries: Number(r.beneficiaries) || 0,
        feeding_days: Number(r.feeding_days) || 0,
        region,
        remarks: 'Migrated from mfp_data',
        include_in_masterlist: true,
      }

      const { data: existingDrop } = await supabase
        .from('mfp_program_dropoffs')
        .select('id')
        .eq('center', center)
        .eq('year', year)
        .eq('program', 'dswd')
        .eq('province', province)
        .eq('dropoff_name', muni)
        .maybeSingle()

      if (existingDrop?.id) {
        const { error: uErr } = await supabase
          .from('mfp_program_dropoffs')
          .update(drop)
          .eq('id', existingDrop.id)
        if (uErr) throw new Error(`dropoff update ${muni}: ${uErr.message}`)
      } else {
        const { error: iErr } = await supabase.from('mfp_program_dropoffs').insert(drop)
        if (iErr) {
          // Unique index may omit month — fall back to update by natural key.
          const { data: again } = await supabase
            .from('mfp_program_dropoffs')
            .select('id')
            .eq('center', center)
            .eq('year', year)
            .eq('program', 'dswd')
            .eq('province', province)
            .eq('dropoff_name', muni)
            .limit(1)
          if (again?.[0]?.id) {
            const { error: u2 } = await supabase
              .from('mfp_program_dropoffs')
              .update(drop)
              .eq('id', again[0].id)
            if (u2) throw new Error(`dropoff retry ${muni}: ${u2.message}`)
          } else {
            throw new Error(`dropoff insert ${muni}: ${iErr.message}`)
          }
        }
      }
      dropCreated++
    }
  }

  console.log('Procurement created/updated groups:', procCreated, '(plus reused)')
  console.log('Dropoffs upserted:', dropCreated)

  if (DRY) {
    console.log('Would delete mfp_data DSWD ids:', idsToDelete.length)
    return
  }

  // Delete in chunks
  for (let i = 0; i < idsToDelete.length; i += 100) {
    const chunk = idsToDelete.slice(i, i + 100)
    const { error } = await supabase.from('mfp_data').delete().in('id', chunk)
    if (error) throw new Error(`delete mfp_data: ${error.message}`)
  }

  const { count } = await supabase
    .from('mfp_data')
    .select('id', { count: 'exact', head: true })
    .eq('funded_by', 'DSWD')
  const { count: dropCount } = await supabase
    .from('mfp_program_dropoffs')
    .select('id', { count: 'exact', head: true })
    .eq('program', 'dswd')
  const { count: procCount } = await supabase
    .from('mfp_program_procurement')
    .select('id', { count: 'exact', head: true })
    .eq('program', 'dswd')

  console.log('Done. Remaining mfp_data DSWD:', count)
  console.log('DSWD monitoring procurements:', procCount, 'dropoffs:', dropCount)
  console.log('Open /monitoring/dswd/center/<CENTER>?year=2026 — e.g. CSU, LCSF, USM, WVSU, MMSU, UPLB')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
