/**
 * Pure aggregation and formatting helpers for the Milk Component Dashboard infographic
 * (/reports/sbfp-dashboard). Reuses SBFP Report formulas with an "As of" cumulative date cutoff.
 */

import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import { uniqueSdoCountKey } from '@/lib/sbfp-dropoff-sync'
import { parseSnapshotDate } from '@/lib/sbfp-raw-milk'
import {
  addSbfpSenateMetrics,
  buildSdoHierarchyStatusMap,
  cumulativeDeliveredPacksOnOrBefore,
  effectivePacksToDeliver,
  emptySbfpSenateMetrics,
  rowMatchesReportCenterFilter,
  sbfpRowVisibleInReportDefault,
  senateMetricsForRow,
  sumPaymentEntriesAsOf,
  type SbfpReportSourceRow,
  type SbfpSenateMetrics,
} from '@/lib/sbfp-report-sync'

export { sumPaymentEntriesAsOf }

const REGION_ORDER: Record<string, number> = {
  CAR: 1,
  I: 2,
  II: 3,
  III: 4,
  'IV-A': 5,
  IVA: 5,
  CALABARZON: 5,
  'IV-B': 6,
  IVB: 6,
  MIMAROPA: 6,
  V: 7,
  NCR: 8,
  VI: 9,
  VII: 10,
  NIR: 11,
  VIII: 12,
  IX: 13,
  X: 14,
  XI: 15,
  XII: 16,
  CARAGA: 17,
  BARMM: 18,
}

export function regionSortKey(region: string): number {
  return REGION_ORDER[region?.trim().toUpperCase()] ?? 99
}

export function formatAsOfDateLabel(isoDate: string): string {
  const parsed = parseSnapshotDate(isoDate)
  if (!parsed) return `AS OF ${String(isoDate || '').toUpperCase()}`
  const label = parsed.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  return `AS OF ${label.toUpperCase()}`
}

function truncateDecimals(value: number, decimals: number): string {
  const d = Math.max(0, Math.floor(decimals))
  const fixed = Math.abs(value).toFixed(d + 6)
  const [intPart, fracPart = ''] = fixed.split('.')
  const sign = value < 0 ? '-' : ''
  if (d === 0) return `${sign}${intPart}`
  return `${sign}${intPart}.${fracPart.slice(0, d).padEnd(d, '0')}`
}

export function formatCompactLiters(liters: number, decimals = 2): string {
  const n = Number(liters) || 0
  if (n >= 1_000_000_000) return `${truncateDecimals(n / 1_000_000_000, decimals)}B`
  if (n >= 1_000_000) return `${truncateDecimals(n / 1_000_000, decimals)}M`
  if (n >= 1_000) return `${truncateDecimals(n / 1_000, 1)}K`
  return Math.round(n).toLocaleString('en-US')
}

export function formatCompactPeso(amount: number): string {
  const n = Number(amount) || 0
  const peso = '\u20B1'
  if (n >= 1_000_000_000) return `${peso}${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000) return `${peso}${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${peso}${(n / 1_000).toFixed(1)}K`
  return `${peso}${Math.round(n).toLocaleString('en-US')}`
}

export type MilkComponentStatusCounts = {
  completed: number
  ongoingDelivery: number
  forDelivery: number
  ongoingProcurement: number
  forPreparation: number
}

export type MilkComponentRegionRow = {
  region: string
  sdoCount: number
  beneficiaries: number
  deliveredPacks: number
  targetPacks: number
  contractAmt: number
  contractedL: number
  paidAmt: number
  deliveredL: number
  valueDelivered: number
  pctDelivered: number
  pctDisbursed: number
}

export type MilkComponentDashboardData = {
  asOfIso: string
  asOfLabel: string
  statusCounts: MilkComponentStatusCounts
  totals: {
    sdoCount: number
    beneficiaries: number
    deliveredPacks: number
    targetPacks: number
    contractAmt: number
    contractedL: number
    paidAmt: number
    deliveredL: number
    undeliveredL: number
    valueDelivered: number
    remainingContract: number
    pctDelivered: number
    pctDisbursed: number
  }
  regions: MilkComponentRegionRow[]
}

function localTodayIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function computeMilkComponentDashboard(
  rows: ReadonlyArray<SbfpReportSourceRow>,
  opts: {
    dbYear: number
    asOfIso: string
    lockedCenter?: string
    todayIso?: string
  },
): MilkComponentDashboardData {
  const { dbYear, asOfIso, lockedCenter, todayIso } = opts
  const effectiveTodayIso = todayIso || localTodayIso()
  const visibleRows = excludeAuxSbfp(rows as SbfpReportSourceRow[]).filter(r => {
    if (!sbfpRowVisibleInReportDefault(r)) return false
    if (lockedCenter && !rowMatchesReportCenterFilter(r, lockedCenter)) return false
    return true
  })

  const completionCutoffIso = asOfIso < effectiveTodayIso ? asOfIso : undefined
  const sdoStatusMap = buildSdoHierarchyStatusMap(visibleRows, {
    completionCutoffIso,
    dbYear,
  })

  const statusCounts: MilkComponentStatusCounts = {
    completed: 0,
    ongoingDelivery: 0,
    forDelivery: 0,
    ongoingProcurement: 0,
    forPreparation: 0,
  }
  for (const status of sdoStatusMap.values()) {
    if (status === 'Completed') statusCounts.completed++
    else if (status === 'Awarded (Ongoing Delivery)') statusCounts.ongoingDelivery++
    else if (status === 'Awarded (For Delivery)') statusCounts.forDelivery++
    else if (status === 'Ongoing Procurement' || status === 'Ongoing (For Award)') {
      statusCounts.ongoingProcurement++
    } else if (status === 'For Preparation') {
      statusCounts.forPreparation++
    }
  }

  type RegionAcc = SbfpSenateMetrics & {
    region: string
    sdoKeys: Set<string>
    beneficiaries: number
  }

  const regionMap = new Map<string, RegionAcc>()
  const totalSdoKeys = new Set<string>()
  let totalBeneficiaries = 0
  let totalsMetrics = emptySbfpSenateMetrics()

  for (const r of visibleRows) {
    const region = r.region?.trim() || 'UNASSIGNED'
    let acc = regionMap.get(region)
    if (!acc) {
      acc = {
        ...emptySbfpSenateMetrics(),
        region,
        sdoKeys: new Set<string>(),
        beneficiaries: 0,
      }
      regionMap.set(region, acc)
    }

    const sdoKey = uniqueSdoCountKey(r.sdo, r.center)
    if (sdoKey) {
      acc.sdoKeys.add(sdoKey)
      totalSdoKeys.add(sdoKey)
    }

    const beneficiaries =
      (Number(r.beneficiaries_pm) || 0) +
      (Number(r.beneficiaries_sm) || 0) +
      (Number(r.beneficiaries_cm) || 0)

    const targetPacks = Math.max(0, effectivePacksToDeliver(r))
    const deliveredPacks = Math.max(0, cumulativeDeliveredPacksOnOrBefore(r, asOfIso, dbYear))
    const contractAmt = Math.max(0, Number(r.contract_amount) || 0)

    // Payments are summed cumulatively on or before `asOfIso` (strict cutoff on all dates).
    const rowMetrics = senateMetricsForRow(r, {
      packs_to_deliver: targetPacks,
      delivered_packs: deliveredPacks,
      contract_amount: contractAmt,
      payment_as_of_iso: asOfIso,
    })

    acc.beneficiaries += beneficiaries
    Object.assign(acc, addSbfpSenateMetrics(acc, rowMetrics))

    totalBeneficiaries += beneficiaries
    totalsMetrics = addSbfpSenateMetrics(totalsMetrics, rowMetrics)
  }

  const regions: MilkComponentRegionRow[] = Array.from(regionMap.values())
    .sort((a, b) => regionSortKey(a.region) - regionSortKey(b.region) || a.region.localeCompare(b.region))
    .map(acc => ({
      region: acc.region,
      sdoCount: acc.sdoKeys.size,
      beneficiaries: acc.beneficiaries,
      deliveredPacks: acc.deliveredPacks,
      targetPacks: acc.targetPacks,
      contractAmt: acc.contractAmt,
      contractedL: acc.contractedL,
      paidAmt: acc.paidAmt,
      deliveredL: acc.deliveredL,
      valueDelivered: acc.valueDelivered,
      pctDelivered: acc.pctDelivered,
      pctDisbursed: acc.pctDisbursed,
    }))

  return {
    asOfIso,
    asOfLabel: formatAsOfDateLabel(asOfIso),
    statusCounts,
    totals: {
      sdoCount: totalSdoKeys.size,
      beneficiaries: totalBeneficiaries,
      deliveredPacks: totalsMetrics.deliveredPacks,
      targetPacks: totalsMetrics.targetPacks,
      contractAmt: totalsMetrics.contractAmt,
      contractedL: totalsMetrics.contractedL,
      paidAmt: totalsMetrics.paidAmt,
      deliveredL: totalsMetrics.deliveredL,
      undeliveredL: totalsMetrics.undeliveredL,
      valueDelivered: totalsMetrics.valueDelivered,
      remainingContract: totalsMetrics.remainingContract,
      pctDelivered: totalsMetrics.pctDelivered,
      pctDisbursed: totalsMetrics.pctDisbursed,
    },
    regions,
  }
}
