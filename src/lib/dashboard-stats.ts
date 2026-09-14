/**
 * Dashboard totals.
 * DepEd beneficiaries come from SBFP SDO procurement (sbfp_data.beneficiaries_pm —
 * same as SBFP Report column K). Record counts and DepEd milk packs come from the
 * MFP masterlist (mfp_data). Other funders use the masterlist for all figures.
 */

import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import {
  packsForMonth,
  sumGrossIncomeRawMilk,
  type SbfpRawMilkRow,
} from '@/lib/sbfp-raw-milk'
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

function masterInMonth(r: { date_started?: string | null }, month: number | undefined) {
  if (month == null || !Number.isFinite(month)) return true
  if (!r.date_started) return false
  return new Date(r.date_started).getMonth() + 1 === month
}

export async function loadDashboardStats(
  supabase: SupabaseLike,
  filters: { year?: number; month?: number; center?: string },
): Promise<DashStats> {
  const year = filters.year
  const month = filters.month
  const center = filters.center?.trim() || undefined

  const [sbfpRaw, master] = await Promise.all([
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
  const scopedSdos = month != null
    ? sdos.filter(s => sdoInMonth(s as SbfpRawMilkRow, month, year || s.year))
    : sdos

  const scopedMaster = master.filter(r => matchesCenter(r.center, center) && masterInMonth(r, month))
  const depedMaster = scopedMaster.filter(r => String(r.funded_by || '').trim() === 'DepEd')
  const otherMaster = scopedMaster.filter(r => String(r.funded_by || '').trim() !== 'DepEd')

  // Only beneficiaries use SDO column K; packs/records stay on masterlist.
  const depedBene = scopedSdos.reduce((s, r) => s + (Number(r.beneficiaries_pm) || 0), 0)
  const depedPacks = depedMaster.reduce((s, r) => s + (Number(r.milk_packs) || 0), 0)
  const depedFunds = scopedSdos.reduce((s, r) => {
    const contract = Number(r.contract_amount) || 0
    const amount = Number(r.amount) || 0
    return s + (contract > 0 ? contract : amount)
  }, 0)
  const depedIncome = Number(sumGrossIncomeRawMilk(scopedSdos, month, { year })) || 0

  const emptyFunder = (funded_by: string): DashFunderStat => ({
    funded_by, records: 0, beneficiaries: 0, milk_packs: 0, milk_cost: 0, total_funds: 0,
  })

  const funderMap: Record<string, DashFunderStat> = {
    DepEd: {
      funded_by: 'DepEd',
      records: depedMaster.length,
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

  // Masterlist drives year record/pack counts; DepEd beneficiaries still from SDO.
  const depedBeneByYear = new Map<number, number>()
  for (const r of scopedSdos) {
    const y = Number(r.year) || year || 0
    depedBeneByYear.set(y, (depedBeneByYear.get(y) || 0) + (Number(r.beneficiaries_pm) || 0))
  }
  const depedMasterByYear = new Map<number, { rec: number; packs: number }>()
  for (const r of depedMaster) {
    const y = Number(r.year) || year || 0
    const cur = depedMasterByYear.get(y) || { rec: 0, packs: 0 }
    cur.rec += 1
    cur.packs += Number(r.milk_packs) || 0
    depedMasterByYear.set(y, cur)
  }
  const depedYears = new Set([...depedBeneByYear.keys(), ...depedMasterByYear.keys()])
  for (const y of depedYears) {
    const m = depedMasterByYear.get(y) || { rec: 0, packs: 0 }
    addYear(y, m.rec, depedBeneByYear.get(y) || 0, m.packs)
  }
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
  // Total Records = full MFP masterlist rows (all funders), not SDO count.
  const total_records = scopedMaster.length

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
