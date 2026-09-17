/**
 * Dashboard totals.
 * DepEd beneficiaries come from SBFP SDO procurement (sbfp_data.beneficiaries_pm —
 * same as SBFP Report column K). Target / delivered packs come from SDO procurement
 * (packs_to_deliver + delivery tracking), with masterlist fallback.
 * DSWD uses program monitoring (drop-offs + procurement).
 * Other funders use the masterlist for all figures.
 */

import { loadDswdDashboardSlice, loadDswdMonitoringSummaryRows } from '@/lib/dswd-monitoring-report'
import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import {
  packsForMonth,
  sumGrossIncomeRawMilk,
  totalPacksDelivered,
  type SbfpRawMilkRow,
} from '@/lib/sbfp-raw-milk'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { centerDisplayLabel, mfpCenterAliases, sbfpCenterAliases } from '@/lib/center-aliases'

export type DashFunderStat = {
  funded_by: string
  records: number
  beneficiaries: number
  /** Legacy alias — prefer delivered_milk_packs */
  milk_packs: number
  target_milk_packs: number
  delivered_milk_packs: number
  milk_cost: number
  total_funds: number
}

export type DashYearStat = {
  year: number
  records: number
  beneficiaries: number
  milk_packs: number
  target_milk_packs: number
  delivered_milk_packs: number
  deped_target_milk_packs: number
  dswd_target_milk_packs: number
  deped_delivered_milk_packs: number
  dswd_delivered_milk_packs: number
}
export type DashCenterStat = {
  center: string
  beneficiaries: number
  deped_target_milk_packs: number
  deped_delivered_milk_packs: number
  dswd_target_milk_packs: number
  dswd_delivered_milk_packs: number
  /** Center share of filtered DepEd target packs (0–100) */
  deped_share_pct: number
  /** Center share of filtered DSWD target packs (0–100) */
  dswd_share_pct: number
  /** DepEd delivery progress for this center (0–100) */
  deped_delivered_pct: number
  /** DSWD delivery progress for this center (0–100) */
  dswd_delivered_pct: number
}

export type DashStats = {
  total_records: number
  total_beneficiaries: number
  /** Legacy: delivered packs when available, else target */
  total_milk_packs: number
  total_target_milk_packs: number
  total_delivered_milk_packs: number
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

function deliveredForSdo(
  row: SbfpRawMilkRow & { packs_delivered?: number | null },
  month?: number,
  year?: number,
) {
  if (month != null) return packsForMonth(row, month, { year })
  return totalPacksDelivered(row) || Number(row.packs_delivered) || 0
}

export async function loadDashboardStats(
  supabase: SupabaseLike,
  filters: { year?: number; month?: number; center?: string },
): Promise<DashStats> {
  const year = filters.year
  const month = filters.month
  const center = filters.center?.trim() || undefined

  const [sbfpRaw, master, dswdSlice, dswdRows] = await Promise.all([
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
        .select(
          'beneficiaries,milk_packs,milk_cost,total_funds_transferred,funded_by,year,center,date_started,target_milk_packs_to_deliver,total_milk_packs_delivered',
        )
      if (year) q = q.eq('year', year)
      return q
    }),
    loadDswdDashboardSlice(supabase, { year, month, center }),
    loadDswdMonitoringSummaryRows(supabase, { year, month, center }),
  ])

  const sdos = excludeAuxSbfp(sbfpRaw).filter(r => matchesCenter(r.center, center))
  const scopedSdos = month != null
    ? sdos.filter(s => sdoInMonth(s as SbfpRawMilkRow, month, year || s.year))
    : sdos

  const scopedMaster = master.filter(r => matchesCenter(r.center, center) && masterInMonth(r, month))
  const depedMaster = scopedMaster.filter(r => String(r.funded_by || '').trim() === 'DepEd')
  const otherMaster = scopedMaster.filter(r => String(r.funded_by || '').trim() !== 'DepEd')

  const depedBene = scopedSdos.reduce((s, r) => s + (Number(r.beneficiaries_pm) || 0), 0)
  const depedTarget = scopedSdos.reduce((s, r) => s + (Number(r.packs_to_deliver) || 0), 0)
  const depedDelivered = scopedSdos.reduce(
    (s, r) => s + deliveredForSdo(r as SbfpRawMilkRow, month, year || Number(r.year) || undefined),
    0,
  )
  const depedTargetFallback = depedMaster.reduce(
    (s, r) => s + (Number(r.target_milk_packs_to_deliver || r.milk_packs) || 0),
    0,
  )
  const depedDeliveredFallback = depedMaster.reduce(
    (s, r) => s + (Number(r.total_milk_packs_delivered) || 0),
    0,
  )
  const depedTargetPacks = depedTarget > 0 ? depedTarget : depedTargetFallback
  const depedDeliveredPacks = depedDelivered > 0 ? depedDelivered : depedDeliveredFallback

  const depedFunds = scopedSdos.reduce((s, r) => {
    const contract = Number(r.contract_amount) || 0
    const amount = Number(r.amount) || 0
    return s + (contract > 0 ? contract : amount)
  }, 0)
  const depedIncome = Number(sumGrossIncomeRawMilk(scopedSdos, month, { year })) || 0

  const emptyFunder = (funded_by: string): DashFunderStat => ({
    funded_by,
    records: 0,
    beneficiaries: 0,
    milk_packs: 0,
    target_milk_packs: 0,
    delivered_milk_packs: 0,
    milk_cost: 0,
    total_funds: 0,
  })

  const funderMap: Record<string, DashFunderStat> = {
    DepEd: {
      funded_by: 'DepEd',
      records: depedMaster.length,
      beneficiaries: depedBene,
      milk_packs: depedDeliveredPacks,
      target_milk_packs: depedTargetPacks,
      delivered_milk_packs: depedDeliveredPacks,
      milk_cost: depedIncome,
      total_funds: depedFunds,
    },
    DSWD: {
      funded_by: 'DSWD',
      records: dswdSlice.records,
      beneficiaries: dswdSlice.beneficiaries,
      milk_packs: dswdSlice.delivered_milk_packs || dswdSlice.milk_packs,
      target_milk_packs: dswdSlice.target_milk_packs,
      delivered_milk_packs: dswdSlice.delivered_milk_packs,
      milk_cost: dswdSlice.milk_cost,
      total_funds: dswdSlice.total_funds,
    },
    LDS: emptyFunder('LDS'),
  }

  for (const r of otherMaster) {
    const fb = String(r.funded_by || '').trim()
    if (fb === 'DSWD') continue
    const key = fb || 'Others'
    if (!funderMap[key]) funderMap[key] = emptyFunder(key)
    const target = Number(r.target_milk_packs_to_deliver || r.milk_packs) || 0
    const delivered = Number(r.total_milk_packs_delivered) || 0
    funderMap[key].records += 1
    funderMap[key].beneficiaries += Number(r.beneficiaries) || 0
    funderMap[key].milk_packs += delivered || target
    funderMap[key].target_milk_packs += target
    funderMap[key].delivered_milk_packs += delivered
    funderMap[key].milk_cost += Number(r.milk_cost) || 0
    funderMap[key].total_funds += Number(r.total_funds_transferred) || 0
  }

  const yearMap: Record<number, DashYearStat> = {}
  const ensureYear = (y: number): DashYearStat => {
    if (!yearMap[y]) {
      yearMap[y] = {
        year: y,
        records: 0,
        beneficiaries: 0,
        milk_packs: 0,
        target_milk_packs: 0,
        delivered_milk_packs: 0,
        deped_target_milk_packs: 0,
        dswd_target_milk_packs: 0,
        deped_delivered_milk_packs: 0,
        dswd_delivered_milk_packs: 0,
      }
    }
    return yearMap[y]
  }
  const addYear = (
    y: number,
    rec: number,
    bene: number,
    packs: number,
    target = packs,
    delivered = 0,
  ) => {
    if (!y) return
    const row = ensureYear(y)
    row.records += rec
    row.beneficiaries += bene
    row.milk_packs += packs
    row.target_milk_packs += target
    row.delivered_milk_packs += delivered
  }

  const depedBeneByYear = new Map<number, number>()
  const depedPacksByYear = new Map<number, { target: number; delivered: number }>()
  for (const r of scopedSdos) {
    const y = Number(r.year) || year || 0
    depedBeneByYear.set(y, (depedBeneByYear.get(y) || 0) + (Number(r.beneficiaries_pm) || 0))
    const cur = depedPacksByYear.get(y) || { target: 0, delivered: 0 }
    cur.target += Number(r.packs_to_deliver) || 0
    cur.delivered += deliveredForSdo(r as SbfpRawMilkRow, month, year || y || undefined)
    depedPacksByYear.set(y, cur)
  }
  const depedMasterByYear = new Map<number, { rec: number; target: number; delivered: number }>()
  for (const r of depedMaster) {
    const y = Number(r.year) || year || 0
    const cur = depedMasterByYear.get(y) || { rec: 0, target: 0, delivered: 0 }
    cur.rec += 1
    cur.target += Number(r.target_milk_packs_to_deliver || r.milk_packs) || 0
    cur.delivered += Number(r.total_milk_packs_delivered) || 0
    depedMasterByYear.set(y, cur)
  }
  const depedYears = new Set([
    ...depedBeneByYear.keys(),
    ...depedPacksByYear.keys(),
    ...depedMasterByYear.keys(),
  ])
  for (const y of depedYears) {
    const m = depedMasterByYear.get(y) || { rec: 0, target: 0, delivered: 0 }
    const p = depedPacksByYear.get(y) || { target: 0, delivered: 0 }
    const target = p.target > 0 ? p.target : m.target
    const delivered = p.delivered > 0 ? p.delivered : m.delivered
    addYear(y, m.rec, depedBeneByYear.get(y) || 0, delivered || target, target, delivered)
    const row = ensureYear(y)
    row.deped_target_milk_packs += target
    row.deped_delivered_milk_packs += delivered
  }

  const dswdYearAgg = new Map<number, { rec: number; bene: number; packs: number }>()
  for (const r of dswdRows) {
    const y = Number(r.year) || year || 0
    const cur = dswdYearAgg.get(y) || { rec: 0, bene: 0, packs: 0 }
    cur.rec += 1
    cur.bene += r.beneficiaries
    cur.packs += r.milk_packs
    dswdYearAgg.set(y, cur)
  }
  for (const [y, m] of dswdYearAgg) {
    addYear(y, m.rec, m.bene, 0, 0, 0)
  }
  for (const yRow of dswdSlice.by_year) {
    const y = Number(yRow.year) || 0
    if (!y) continue
    const row = ensureYear(y)
    // Replace drop-off proxy with procurement target/delivered for this year
    row.dswd_target_milk_packs = yRow.target_milk_packs
    row.dswd_delivered_milk_packs = yRow.delivered_milk_packs
    row.target_milk_packs += yRow.target_milk_packs
    row.delivered_milk_packs += yRow.delivered_milk_packs
    row.milk_packs += yRow.delivered_milk_packs || yRow.target_milk_packs
  }

  for (const r of otherMaster) {
    if (String(r.funded_by || '').trim() === 'DSWD') continue
    const target = Number(r.target_milk_packs_to_deliver || r.milk_packs) || 0
    const delivered = Number(r.total_milk_packs_delivered) || 0
    addYear(Number(r.year) || 0, 1, Number(r.beneficiaries) || 0, delivered || target, target, delivered)
  }

  const centerMap: Record<
    string,
    {
      beneficiaries: number
      deped_target: number
      deped_delivered: number
      dswd_target: number
      dswd_delivered: number
    }
  > = {}
  const bumpCenter = (label: string) => {
    if (!centerMap[label]) {
      centerMap[label] = {
        beneficiaries: 0,
        deped_target: 0,
        deped_delivered: 0,
        dswd_target: 0,
        dswd_delivered: 0,
      }
    }
    return centerMap[label]
  }

  for (const r of scopedSdos) {
    const label = centerDisplayLabel(r.center)
    if (!label) continue
    const cur = bumpCenter(label)
    cur.beneficiaries += Number(r.beneficiaries_pm) || 0
    cur.deped_target += Number(r.packs_to_deliver) || 0
    cur.deped_delivered += deliveredForSdo(r as SbfpRawMilkRow, month, year || Number(r.year) || undefined)
  }
  for (const c of dswdSlice.by_center) {
    const label = centerDisplayLabel(c.center) || String(c.center || '').trim()
    if (!label) continue
    const cur = bumpCenter(label)
    cur.beneficiaries += c.beneficiaries
    cur.dswd_target += c.target_milk_packs
    cur.dswd_delivered += c.delivered_milk_packs
  }

  const totalDepedTarget = Object.values(centerMap).reduce((s, c) => s + c.deped_target, 0)
  const totalDswdTarget = Object.values(centerMap).reduce((s, c) => s + c.dswd_target, 0)

  const by_funder = Object.values(funderMap)
  const total_beneficiaries = by_funder.reduce((s, f) => s + f.beneficiaries, 0)
  const total_target_milk_packs = by_funder.reduce((s, f) => s + f.target_milk_packs, 0)
  const total_delivered_milk_packs = by_funder.reduce((s, f) => s + f.delivered_milk_packs, 0)
  const total_milk_packs = total_delivered_milk_packs || total_target_milk_packs
  const total_funds = by_funder.reduce((s, f) => s + f.total_funds, 0)
  const total_milk_cost = by_funder.reduce((s, f) => s + f.milk_cost, 0)
  const total_records = scopedMaster.length

  const pct = (part: number, whole: number) =>
    whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0

  return {
    total_records,
    total_beneficiaries,
    total_milk_packs,
    total_target_milk_packs,
    total_delivered_milk_packs,
    total_funds,
    total_milk_cost,
    by_funder,
    by_year: Object.values(yearMap).sort((a, b) => a.year - b.year),
    top_centers: Object.entries(centerMap)
      .map(([c, v]) => ({
        center: c,
        beneficiaries: v.beneficiaries,
        deped_target_milk_packs: v.deped_target,
        deped_delivered_milk_packs: v.deped_delivered,
        dswd_target_milk_packs: v.dswd_target,
        dswd_delivered_milk_packs: v.dswd_delivered,
        deped_share_pct: pct(v.deped_target, totalDepedTarget),
        dswd_share_pct: pct(v.dswd_target, totalDswdTarget),
        deped_delivered_pct: pct(v.deped_delivered, v.deped_target),
        dswd_delivered_pct: pct(v.dswd_delivered, v.dswd_target),
      }))
      .sort(
        (a, b) =>
          b.deped_target_milk_packs + b.dswd_target_milk_packs -
          (a.deped_target_milk_packs + a.dswd_target_milk_packs),
      )
      .slice(0, 8),
  }
}
