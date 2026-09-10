/**
 * Dashboard totals.
 * DepEd / SBFP is sourced from SBFP drop-off schools (encoder-entered beneficiaries)
 * plus SDO procurement for funds/income — not stale masterlist rows.
 */

import { calcMilkFormulations } from '@/lib/mfp-formulas'
import { inferSbfpMilkType, normalizeSbfpMilkType } from '@/lib/sbfp-pack-price'
import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import {
  packsForMonth,
  sumGrossIncomeRawMilk,
  type SbfpRawMilkRow,
} from '@/lib/sbfp-raw-milk'
import {
  resolveDropoffFeedingDays,
  type SbfpDropoffRow,
  type SbfpParentSdo,
} from '@/lib/sbfp-dropoff-sync'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { centerDisplayLabel, mfpCenterAliases, sbfpCenterAliases } from '@/lib/center-aliases'

export type DashFunderStat = {
  funded_by: string
  records: number
  beneficiaries: number
  milk_packs: number
  milk_cost: number
  total_funds: number
}

export type DashYearStat = { year: number; records: number; beneficiaries: number; milk_packs: number }
export type DashCenterStat = { center: string; beneficiaries: number }

export type DashStats = {
  total_records: number
  total_beneficiaries: number
  total_milk_packs: number
  total_funds: number
  total_milk_cost: number
  by_funder: DashFunderStat[]
  by_year: DashYearStat[]
  top_centers: DashCenterStat[]
}

type SupabaseLike = { from: (table: string) => any }

function matchesCenter(rowCenter: string | null | undefined, filter: string | undefined) {
  if (!filter) return true
  const allowed = new Set(
    [...sbfpCenterAliases(filter), ...mfpCenterAliases(filter)].map(c => c.toUpperCase()),
  )
  return allowed.has(String(rowCenter || '').trim().toUpperCase())
}

function sdoInMonth(parent: SbfpRawMilkRow, month: number | undefined, year?: number) {
  if (month == null || !Number.isFinite(month)) return true
  return packsForMonth(parent, month, { year }) > 0
}

function dropoffPacks(dropoff: SbfpDropoffRow, parent?: SbfpParentSdo | null) {
  const bene = Number(dropoff.beneficiaries) || 0
  const days = resolveDropoffFeedingDays(dropoff, parent)
  const milk =
    inferSbfpMilkType(parent?.sdo, parent?.remarks, dropoff.sdo) ||
    normalizeSbfpMilkType(parent?.milk_type) ||
    'PM'
  return calcMilkFormulations(bene, days, milk)?.milkPacks || 0
}

export async function loadDashboardStats(
  supabase: SupabaseLike,
  filters: { year?: number; month?: number; center?: string },
): Promise<DashStats> {
  const year = filters.year
  const month = filters.month
  const center = filters.center?.trim() || undefined

  const [dropoffs, sbfpRaw, master] = await Promise.all([
    fetchAllRows<SbfpDropoffRow>(() => {
      let q = supabase
        .from('sbfp_dropoff_points')
        .select('id,year,center,sbfp_data_id,sdo,dropoff_name,beneficiaries,feeding_days,remarks,include_in_masterlist,region,province,municipality')
        .neq('include_in_masterlist', false)
      if (year) q = q.eq('year', year)
      return q
    }),
    fetchAllRows<any>(() => {
      let q = supabase.from('sbfp_data').select(
        'id,year,center,sdo,region,milk_type,batch,feeding_days,remarks,delivery_start,delivery_end,packs_to_deliver,packs_delivered,monthly_packs_delivered,delivery_snapshots,amount,contract_amount,raw_milk_prices,raw_milk_month,beneficiaries_pm',
      )
      if (year) q = q.eq('year', year)
      return q
    }),
    fetchAllRows<any>(() => {
      let q = supabase
        .from('mfp_data')
        .select('beneficiaries,milk_packs,milk_cost,total_funds_transferred,funded_by,year,center,date_started')
      if (year) q = q.eq('year', year)
      return q
    }),
  ])

  const sdos = excludeAuxSbfp(sbfpRaw).filter(r => matchesCenter(r.center, center))
  const sdoById = new Map(sdos.map(r => [r.id, r]))

  const scopedDrops = dropoffs.filter(d => {
    if (!matchesCenter(d.center, center)) return false
    if (d.include_in_masterlist === false) return false
    const parent = d.sbfp_data_id ? sdoById.get(d.sbfp_data_id) : null
    if (month != null) {
      if (!parent) return false
      return sdoInMonth(parent as SbfpRawMilkRow, month, year || d.year)
    }
    return true
  })

  const depedSdoIds = new Set(scopedDrops.map(d => d.sbfp_data_id).filter(Boolean) as string[])
  const scopedSdos = month != null
    ? sdos.filter(s => depedSdoIds.has(s.id) || sdoInMonth(s as SbfpRawMilkRow, month, year || s.year))
    : sdos

  const depedBene = scopedDrops.reduce((s, d) => s + (Number(d.beneficiaries) || 0), 0)
  const depedPacks = scopedDrops.reduce((s, d) => {
    const parent = d.sbfp_data_id ? (sdoById.get(d.sbfp_data_id) as SbfpParentSdo | undefined) : undefined
    return s + dropoffPacks(d, parent)
  }, 0)
  const depedFunds = scopedSdos.reduce((s, r) => {
    const contract = Number(r.contract_amount) || 0
    const amount = Number(r.amount) || 0
    return s + (contract > 0 ? contract : amount)
  }, 0)
  const depedIncome = Number(sumGrossIncomeRawMilk(scopedSdos, month, { year })) || 0

  const otherMaster = master.filter(r => {
    if (!matchesCenter(r.center, center)) return false
    const f = String(r.funded_by || '').trim()
    if (f === 'DepEd') return false
    if (month != null) {
      if (!r.date_started) return false
      return new Date(r.date_started).getMonth() + 1 === month
    }
    return true
  })

  const emptyFunder = (funded_by: string): DashFunderStat => ({
    funded_by, records: 0, beneficiaries: 0, milk_packs: 0, milk_cost: 0, total_funds: 0,
  })

  const funderMap: Record<string, DashFunderStat> = {
    DepEd: {
      funded_by: 'DepEd',
      records: scopedDrops.length,
      beneficiaries: depedBene,
      milk_packs: depedPacks,
      milk_cost: depedIncome,
      total_funds: depedFunds,
    },
    DSWD: emptyFunder('DSWD'),
    LDS: emptyFunder('LDS'),
  }

  for (const r of otherMaster) {
    const key = String(r.funded_by || '').trim() || 'Others'
    if (!funderMap[key]) funderMap[key] = emptyFunder(key)
    funderMap[key].records += 1
    funderMap[key].beneficiaries += Number(r.beneficiaries) || 0
    funderMap[key].milk_packs += Number(r.milk_packs) || 0
    funderMap[key].milk_cost += Number(r.milk_cost) || 0
    funderMap[key].total_funds += Number(r.total_funds_transferred) || 0
  }

  const yearMap: Record<number, DashYearStat> = {}
  const addYear = (y: number, rec: number, bene: number, packs: number) => {
    if (!y) return
    if (!yearMap[y]) yearMap[y] = { year: y, records: 0, beneficiaries: 0, milk_packs: 0 }
    yearMap[y].records += rec
    yearMap[y].beneficiaries += bene
    yearMap[y].milk_packs += packs
  }

  const depedByYear = new Map<number, { rec: number; bene: number; packs: number }>()
  for (const d of scopedDrops) {
    const y = Number(d.year) || year || 0
    const cur = depedByYear.get(y) || { rec: 0, bene: 0, packs: 0 }
    const parent = d.sbfp_data_id ? (sdoById.get(d.sbfp_data_id) as SbfpParentSdo | undefined) : undefined
    cur.rec += 1
    cur.bene += Number(d.beneficiaries) || 0
    cur.packs += dropoffPacks(d, parent)
    depedByYear.set(y, cur)
  }
  for (const [y, v] of depedByYear) addYear(y, v.rec, v.bene, v.packs)
  for (const r of otherMaster) {
    addYear(Number(r.year) || 0, 1, Number(r.beneficiaries) || 0, Number(r.milk_packs) || 0)
  }

  // Rank centers by SBFP §1 SDO Procurement column K (beneficiaries_pm).
  const centerMap: Record<string, number> = {}
  for (const r of scopedSdos) {
    const label = centerDisplayLabel(r.center)
    if (!label) continue
    centerMap[label] = (centerMap[label] || 0) + (Number(r.beneficiaries_pm) || 0)
  }

  const by_funder = Object.values(funderMap)
  const total_beneficiaries = by_funder.reduce((s, f) => s + f.beneficiaries, 0)
  const total_milk_packs = by_funder.reduce((s, f) => s + f.milk_packs, 0)
  const total_funds = by_funder.reduce((s, f) => s + f.total_funds, 0)
  const total_milk_cost = by_funder.reduce((s, f) => s + f.milk_cost, 0)
  const total_records = by_funder.reduce((s, f) => s + f.records, 0)

  return {
    total_records,
    total_beneficiaries,
    total_milk_packs,
    total_funds,
    total_milk_cost,
    by_funder,
    by_year: Object.values(yearMap).sort((a, b) => a.year - b.year),
    top_centers: Object.entries(centerMap)
      .map(([c, beneficiaries]) => ({ center: c, beneficiaries }))
      .sort((a, b) => b.beneficiaries - a.beneficiaries)
      .slice(0, 8),
  }
}
