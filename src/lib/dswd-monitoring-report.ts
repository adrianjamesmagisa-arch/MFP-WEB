/**
 * DSWD Summary / Dashboard rows from program monitoring tables — not mfp_data.
 */

import { calcMilkFormulations } from '@/lib/mfp-formulas'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { mfpCenterAliases, sbfpCenterAliases } from '@/lib/center-aliases'
import {
  PROGRAM_DROPOFF_ENCODER_COLUMNS,
  PROGRAM_PROCUREMENT_ENCODER_COLUMNS,
} from '@/lib/encoder-selects'
import type { ProgramDropoffRow, ProgramProcurementRow } from '@/lib/program-dropoff-sync'
import { sumRowIncome, totalPacksDelivered, type SbfpRawMilkRow } from '@/lib/sbfp-raw-milk'

export type DswdSummaryRow = {
  year: number
  center: string
  beneficiaries: number
  milk_packs: number
  milk_cost: number
  total_funds_transferred: number
  raw_milk_liters: number
  feeding_days: number
  mode_of_procurement: string
  region: string
  province: string
  municipality: string
  supplier_id: string
  supplier_name: string
  milk_type: string
  component: 'milk' | 'hot_meals'
}

type SupabaseLike = { from: (table: string) => any }

function matchesCenterFilter(rowCenter: string | null | undefined, filter: string | undefined) {
  if (!filter || filter === '__ALL_CENTERS__') return true
  const allowed = new Set(
    [...sbfpCenterAliases(filter), ...mfpCenterAliases(filter)].map(c => c.toUpperCase()),
  )
  return allowed.has(String(rowCenter || '').trim().toUpperCase())
}

function procFunds(r: ProgramProcurementRow) {
  const contract = Number(r.contract_amount) || 0
  const amount = Number(r.amount) || 0
  return contract > 0 ? contract : amount
}

function mapDropoffToSummaryRow(
  drop: ProgramDropoffRow,
  parent: ProgramProcurementRow | null,
  coopName: string,
  munisInProc: number,
): DswdSummaryRow {
  const milkType = parent?.milk_type || 'PM'
  const calc = calcMilkFormulations(
    Number(drop.beneficiaries) || 0,
    Number(drop.feeding_days) || 0,
    milkType,
  )
  const packs = calc?.milkPacks || 0
  const funds = parent ? procFunds(parent) / Math.max(1, munisInProc) : 0
  const income = parent
    ? sumRowIncome(parent as SbfpRawMilkRow, { year: drop.year }) / Math.max(1, munisInProc)
    : 0

  return {
    year: drop.year,
    center: String(drop.center || parent?.center || '').trim(),
    beneficiaries: Number(drop.beneficiaries) || 0,
    milk_packs: packs,
    milk_cost: income > 0 ? income : funds,
    total_funds_transferred: funds,
    raw_milk_liters: packs > 0 ? (packs / 5) * 0.2 : 0,
    feeding_days: Number(drop.feeding_days) || 0,
    mode_of_procurement: parent?.mode_of_procurement || '',
    region: String(drop.region || parent?.region || '').trim(),
    province: String(drop.province || parent?.province || '').trim(),
    municipality: String(drop.municipality || drop.dropoff_name || '').trim(),
    supplier_id: parent?.supplier_id || '',
    supplier_name: coopName,
    milk_type: milkType,
    component: 'milk',
  }
}

export type DswdMonitoringFilters = {
  year?: number | null
  month?: number | null
  center?: string | null
}

export async function loadDswdMonitoringSummaryRows(
  supabase: SupabaseLike,
  filters: DswdMonitoringFilters,
): Promise<DswdSummaryRow[]> {
  const center = filters.center?.trim() || undefined

  const [dropoffs, procs] = await Promise.all([
    fetchAllRows<ProgramDropoffRow>(() => {
      let q = supabase
        .from('mfp_program_dropoffs')
        .select(PROGRAM_DROPOFF_ENCODER_COLUMNS)
        .eq('program', 'dswd')
      if (filters.year) q = q.eq('year', filters.year)
      return q
    }),
    fetchAllRows<ProgramProcurementRow>(() => {
      let q = supabase
        .from('mfp_program_procurement')
        .select(`${PROGRAM_PROCUREMENT_ENCODER_COLUMNS}, cooperatives:supplier_id(name)`)
        .eq('program', 'dswd')
      if (filters.year) q = q.eq('year', filters.year)
      return q
    }),
  ])

  const procById = new Map(procs.map(p => [p.id, p]))
  const munisPerProc = new Map<string, number>()
  for (const d of dropoffs) {
    if (!d.procurement_id) continue
    munisPerProc.set(d.procurement_id, (munisPerProc.get(d.procurement_id) || 0) + 1)
  }

  let scoped = dropoffs.filter(d => matchesCenterFilter(d.center, center))
  if (filters.month != null && Number.isFinite(filters.month)) {
    scoped = scoped.filter(d => Number(d.month) === filters.month)
  }

  return scoped.map(d => {
    const parent = d.procurement_id ? procById.get(d.procurement_id) || null : null
    const coopName = (parent as any)?.cooperatives?.name || parent?.supplier_id || ''
    const n = d.procurement_id ? munisPerProc.get(d.procurement_id) || 1 : 1
    return mapDropoffToSummaryRow(d, parent, coopName, n)
  })
}

export type DswdDashboardSlice = {
  records: number
  beneficiaries: number
  milk_packs: number
  target_milk_packs: number
  delivered_milk_packs: number
  milk_cost: number
  total_funds: number
  by_year: { year: number; target_milk_packs: number; delivered_milk_packs: number }[]
  by_center: {
    center: string
    target_milk_packs: number
    delivered_milk_packs: number
    beneficiaries: number
  }[]
}

/** Aggregate DSWD monitoring for dashboard cards (no masterlist). */
export async function loadDswdDashboardSlice(
  supabase: SupabaseLike,
  filters: DswdMonitoringFilters,
): Promise<DswdDashboardSlice> {
  const rows = await loadDswdMonitoringSummaryRows(supabase, filters)

  const procs = await fetchAllRows<ProgramProcurementRow>(() => {
    let q = supabase
      .from('mfp_program_procurement')
      .select(PROGRAM_PROCUREMENT_ENCODER_COLUMNS)
      .eq('program', 'dswd')
    if (filters.year) q = q.eq('year', filters.year)
    return q
  })

  let scopedProcs = procs.filter(p => matchesCenterFilter(p.center, filters.center || undefined))
  if (filters.month != null && Number.isFinite(filters.month)) {
    scopedProcs = scopedProcs.filter(p => Number(p.month) === filters.month)
  }

  const totalFunds = scopedProcs.reduce((s, p) => s + procFunds(p), 0)
  const milkCost = scopedProcs.reduce(
    (s, p) => s + sumRowIncome(p as SbfpRawMilkRow, { year: p.year }),
    0,
  )
  const targetPacks = scopedProcs.reduce((s, p) => s + (Number(p.packs_to_deliver) || 0), 0)
  const deliveredPacks = scopedProcs.reduce((s, p) => {
    const fromTracking = totalPacksDelivered(p as SbfpRawMilkRow)
    return s + (fromTracking || Number(p.packs_delivered) || 0)
  }, 0)
  const dropoffPacks = rows.reduce((s, r) => s + r.milk_packs, 0)

  const yearMap = new Map<number, { target: number; delivered: number }>()
  for (const p of scopedProcs) {
    const y = Number(p.year) || 0
    if (!y) continue
    const cur = yearMap.get(y) || { target: 0, delivered: 0 }
    cur.target += Number(p.packs_to_deliver) || 0
    cur.delivered += totalPacksDelivered(p as SbfpRawMilkRow) || Number(p.packs_delivered) || 0
    yearMap.set(y, cur)
  }
  if (yearMap.size === 0) {
    for (const r of rows) {
      const y = Number(r.year) || 0
      if (!y) continue
      const cur = yearMap.get(y) || { target: 0, delivered: 0 }
      cur.target += r.milk_packs
      yearMap.set(y, cur)
    }
  }

  const centerMap = new Map<string, { target: number; delivered: number; beneficiaries: number }>()
  for (const p of scopedProcs) {
    const label = String(p.center || '').trim()
    if (!label) continue
    const cur = centerMap.get(label) || { target: 0, delivered: 0, beneficiaries: 0 }
    cur.target += Number(p.packs_to_deliver) || 0
    cur.delivered += totalPacksDelivered(p as SbfpRawMilkRow) || Number(p.packs_delivered) || 0
    centerMap.set(label, cur)
  }
  for (const r of rows) {
    const label = String(r.center || '').trim()
    if (!label) continue
    const cur = centerMap.get(label) || { target: 0, delivered: 0, beneficiaries: 0 }
    cur.beneficiaries += r.beneficiaries
    if (cur.target === 0) cur.target += r.milk_packs
    centerMap.set(label, cur)
  }

  return {
    records: rows.length,
    beneficiaries: rows.reduce((s, r) => s + r.beneficiaries, 0),
    milk_packs: deliveredPacks || dropoffPacks,
    target_milk_packs: targetPacks > 0 ? targetPacks : dropoffPacks,
    delivered_milk_packs: deliveredPacks,
    milk_cost: milkCost > 0 ? milkCost : totalFunds,
    total_funds: totalFunds,
    by_year: [...yearMap.entries()]
      .map(([y, v]) => ({
        year: y,
        target_milk_packs: v.target,
        delivered_milk_packs: v.delivered,
      }))
      .sort((a, b) => a.year - b.year),
    by_center: [...centerMap.entries()]
      .map(([c, v]) => ({
        center: c,
        target_milk_packs: v.target,
        delivered_milk_packs: v.delivered,
        beneficiaries: v.beneficiaries,
      }))
      .sort((a, b) => b.target_milk_packs - a.target_milk_packs),
  }
}
