import { PCC_CENTERS } from '@/lib/types'
import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import { uniqueSdoCountKey } from '@/lib/sbfp-dropoff-sync'
import { computeSbfpAccomplishment, filterReportableSbfpRows } from '@/lib/sbfp-accomplishment'
import { packsForMonth, type SbfpRawMilkRow } from '@/lib/sbfp-raw-milk'
import {
  emptyStatus,
  tallyStatus,
  type ProgramDashCenterRow,
  type ProgramDashFilters,
  type ProgramDashMonthPoint,
  type ProgramDashboardStats,
  type ProgramDashStatus,
} from '@/lib/program-dashboard'

type SupabaseLike = { from: (table: string) => any }

type SbfpDashRow = SbfpRawMilkRow & {
  id?: string
  center?: string | null
  year?: number | null
  sdo?: string | null
  procurement_status?: string | null
  packs_to_deliver?: number | null
  packs_delivered?: number | null
  amount?: number | null
  contract_amount?: number | null
  beneficiaries_pm?: number | null
  delivery_start?: string | null
  include_in_report?: boolean | null
}

/** Re-export helpers used by loaders that share ProgramDashboardStats shape. */
export type { ProgramDashboardStats, ProgramDashFilters }

/**
 * SBFP national dashboard stats (same shape as DSWD ProgramOverallDashboard).
 * Uses sbfp_data + drop-offs, with DepEd masterlist as beneficiary fallback.
 */
export async function loadSbfpDashboardStats(
  supabase: SupabaseLike,
  filters: ProgramDashFilters,
): Promise<ProgramDashboardStats> {
  let sdoQ = supabase
    .from('sbfp_data')
    .select(
      'id,year,center,sdo,milk_type,procurement_status,include_in_report,packs_to_deliver,packs_delivered,amount,contract_amount,beneficiaries_pm,delivery_start,delivery_end,monthly_packs_delivered,delivery_snapshots,raw_milk_prices',
    )
  let dropQ = supabase
    .from('sbfp_dropoff_points')
    .select('id,year,center,sdo,dropoff_name,beneficiaries,municipality,province')
  let mfpQ = supabase
    .from('mfp_data')
    .select(
      'center,year,beneficiaries,milk_packs,target_milk_packs_to_deliver,total_milk_packs_delivered,funded_by,date_started',
    )
    .eq('funded_by', 'DepEd')
    .range(0, 19999)

  if (filters.year) {
    sdoQ = sdoQ.eq('year', filters.year)
    dropQ = dropQ.eq('year', filters.year)
    mfpQ = mfpQ.eq('year', filters.year)
  }
  if (filters.center) {
    sdoQ = sdoQ.eq('center', filters.center)
    dropQ = dropQ.eq('center', filters.center)
    mfpQ = mfpQ.eq('center', filters.center)
  }

  const [{ data: sdoRaw }, { data: dropRaw }, { data: mfpRaw }] = await Promise.all([
    sdoQ,
    dropQ,
    mfpQ,
  ])

  const sdos = excludeAuxSbfp((sdoRaw || []) as SbfpDashRow[])
  const reportableSdos = filterReportableSbfpRows(sdos)
  const dropoffs = (dropRaw || []) as Array<{
    center?: string | null
    beneficiaries?: number | null
    municipality?: string | null
    province?: string | null
    year?: number | null
  }>
  const masterlist = ((mfpRaw || []) as Array<{
    center?: string | null
    beneficiaries?: number | null
    milk_packs?: number | null
    target_milk_packs_to_deliver?: number | null
    total_milk_packs_delivered?: number | null
    date_started?: string | null
  }>).filter(r => {
    if (!filters.month) return true
    if (!r.date_started) return false
    const d = new Date(r.date_started)
    return d.getMonth() + 1 === filters.month
  })

  const centers = filters.center ? [filters.center] : [...PCC_CENTERS]
  const byCenter = new Map<string, ProgramDashCenterRow>()
  for (const c of centers) {
    byCenter.set(c, {
      center: c,
      provinces: 0,
      municipalities: 0,
      beneficiaries: 0,
      targetPacks: 0,
      deliveredPacks: 0,
      amount: 0,
    })
  }

  const status: ProgramDashStatus = emptyStatus()
  /** Unique geographic SDOs per center — "Nueva Ecija (PM)" + "(SM)" count as one. */
  const sdoSeenByCenter = new Map<string, Set<string>>()
  for (const r of sdos) {
    const key = String(r.center || '').trim()
    if (!key) continue
    if (!byCenter.has(key)) {
      byCenter.set(key, {
        center: key,
        provinces: 0,
        municipalities: 0,
        beneficiaries: 0,
        targetPacks: 0,
        deliveredPacks: 0,
        amount: 0,
      })
    }
    const row = byCenter.get(key)!
    const sdoKey = uniqueSdoCountKey(r.sdo, r.center)
    if (sdoKey) {
      let seen = sdoSeenByCenter.get(key)
      if (!seen) {
        seen = new Set()
        sdoSeenByCenter.set(key, seen)
      }
      if (!seen.has(sdoKey)) {
        seen.add(sdoKey)
        row.provinces++
      }
    }
    row.amount += Number(r.amount || r.contract_amount) || 0
    row.beneficiaries += Number(r.beneficiaries_pm) || 0
    tallyStatus(r.procurement_status, status)
  }

  const dropBeneByCenter = new Map<string, number>()
  const muniSeen = new Set<string>()
  for (const r of dropoffs) {
    const key = String(r.center || '').trim()
    if (!byCenter.has(key)) continue
    const row = byCenter.get(key)!
    const muni = String(r.municipality || '').trim()
    if (muni) {
      const mk = `${key}|${muni}`
      if (!muniSeen.has(mk)) {
        muniSeen.add(mk)
        row.municipalities++
      }
    } else {
      row.municipalities++
    }
    dropBeneByCenter.set(key, (dropBeneByCenter.get(key) || 0) + (Number(r.beneficiaries) || 0))
  }

  for (const [key, bene] of dropBeneByCenter) {
    const row = byCenter.get(key)
    if (row && bene > 0) row.beneficiaries = bene
  }

  for (const [key, row] of byCenter) {
    const centerRows = reportableSdos.filter(r => String(r.center || '').trim() === key)
    const acc = computeSbfpAccomplishment(centerRows, {
      month: filters.month,
      year: filters.year,
    })
    row.targetPacks = acc.target
    row.deliveredPacks = acc.delivered
  }

  // Prefer drop-off beneficiary totals; if still zero, use masterlist.
  for (const r of masterlist) {
    const key = String(r.center || '').trim()
    if (!byCenter.has(key)) continue
    const row = byCenter.get(key)!
    if (row.beneficiaries === 0) row.beneficiaries += Number(r.beneficiaries) || 0
    if (row.targetPacks === 0) {
      row.targetPacks += Number(r.target_milk_packs_to_deliver || r.milk_packs) || 0
    }
    if (row.deliveredPacks === 0) {
      row.deliveredPacks += Number(r.total_milk_packs_delivered) || 0
    }
  }

  const rows = [...byCenter.values()].filter(r =>
    filters.center ? r.center === filters.center : true,
  )

  // Top KPI: unique program SDOs across centers (PM/SM/lots = one; same name at two centers = two).
  const uniqueSdos = new Set<string>()
  for (const r of rows) {
    const seen = sdoSeenByCenter.get(r.center)
    if (!seen) continue
    for (const k of seen) uniqueSdos.add(k)
  }

  const byMonth: ProgramDashMonthPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    deliveredPacks: 0,
  }))
  for (const r of sdos) {
    for (let m = 1; m <= 12; m++) {
      if (filters.month && filters.month !== m) continue
      byMonth[m - 1].deliveredPacks += packsForMonth(r, m, {
        year: filters.year || Number(r.year) || undefined,
      })
    }
  }

  return {
    provinces: uniqueSdos.size,
    municipalities: rows.reduce((s, r) => s + r.municipalities, 0),
    beneficiaries: rows.reduce((s, r) => s + r.beneficiaries, 0),
    targetPacks: rows.reduce((s, r) => s + r.targetPacks, 0),
    deliveredPacks: rows.reduce((s, r) => s + r.deliveredPacks, 0),
    amount: rows.reduce((s, r) => s + r.amount, 0),
    masterlistRecords: masterlist.length,
    status,
    byCenter: rows.sort(
      (a, b) =>
        b.beneficiaries - a.beneficiaries ||
        b.targetPacks - a.targetPacks ||
        a.center.localeCompare(b.center),
    ),
    byMonth,
  }
}
