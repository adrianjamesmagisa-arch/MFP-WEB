/**
 * Pure aggregation and formatting helpers for the Milk Component Dashboard infographic
 * (/reports/sbfp-dashboard). Reuses SBFP Report formulas with an "As of" cumulative date cutoff.
 */

import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import { uniqueSdoCountKey } from '@/lib/sbfp-dropoff-sync'
import { finishedMilkLiters } from '@/lib/sbfp-pack-price'
import { parseSnapshotDate } from '@/lib/sbfp-raw-milk'
import {
  buildSdoHierarchyStatusMap,
  cumulativeDeliveredPacksOnOrBefore,
  effectivePacksToDeliver,
  rowMatchesReportCenterFilter,
  sbfpRowVisibleInReportDefault,
  type SbfpReportSourceRow,
} from '@/lib/sbfp-report-sync'

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

function startOfDayMs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Sum payment entries whose date is on or before `asOfIso` (undated entries always count). */
export function sumPaymentEntriesAsOf(entries: unknown, asOfIso: string): number {
  if (!Array.isArray(entries)) return 0
  const cutoff = parseSnapshotDate(asOfIso)
  const cutoffMs = cutoff ? startOfDayMs(cutoff) : null
  return entries.reduce((sum, entry) => {
    if (!entry || typeof entry !== 'object') return sum
    const rec = entry as { date?: unknown; amount?: unknown }
    const amt = Number(rec.amount)
    if (!Number.isFinite(amt)) return sum
    if (cutoffMs != null && rec.date) {
      const entryDate = parseSnapshotDate(rec.date)
      if (entryDate && startOfDayMs(entryDate) > cutoffMs) return sum
    }
    return sum + amt
  }, 0)
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

export function formatCompactLiters(liters: number, decimals = 1): string {
  const n = Number(liters) || 0
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(decimals)}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(decimals)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
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

export function computeMilkComponentDashboard(
  rows: ReadonlyArray<SbfpReportSourceRow>,
  opts: {
    dbYear: number
    asOfIso: string
    lockedCenter?: string
  },
): MilkComponentDashboardData {
  const { dbYear, asOfIso, lockedCenter } = opts
  const visibleRows = excludeAuxSbfp(rows as SbfpReportSourceRow[]).filter(r => {
    if (!sbfpRowVisibleInReportDefault(r)) return false
    if (lockedCenter && !rowMatchesReportCenterFilter(r, lockedCenter)) return false
    return true
  })

  const sdoStatusMap = buildSdoHierarchyStatusMap(visibleRows, {
    completionCutoffIso: asOfIso,
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

  type RegionAcc = {
    region: string
    sdoKeys: Set<string>
    beneficiaries: number
    deliveredPacks: number
    targetPacks: number
    contractAmt: number
    contractedL: number
    paidAmt: number
    deliveredL: number
    valueDelivered: number
  }

  const regionMap = new Map<string, RegionAcc>()
  const totalSdoKeys = new Set<string>()
  let totalBeneficiaries = 0
  let totalDeliveredPacks = 0
  let totalTargetPacks = 0
  let totalContractAmt = 0
  let totalContractedL = 0
  let totalPaidAmt = 0
  let totalDeliveredL = 0
  let totalValueDelivered = 0
  let totalRemainingContract = 0

  for (const r of visibleRows) {
    const region = r.region?.trim() || 'UNASSIGNED'
    let acc = regionMap.get(region)
    if (!acc) {
      acc = {
        region,
        sdoKeys: new Set<string>(),
        beneficiaries: 0,
        deliveredPacks: 0,
        targetPacks: 0,
        contractAmt: 0,
        contractedL: 0,
        paidAmt: 0,
        deliveredL: 0,
        valueDelivered: 0,
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
    const paidAmt = sumPaymentEntriesAsOf(r.payment_entries, asOfIso)

    const undeliveredPacks = Math.max(0, targetPacks - deliveredPacks)
    const valueDelivered = targetPacks > 0 ? contractAmt * (deliveredPacks / targetPacks) : 0
    const remainingContract =
      targetPacks > 0 ? contractAmt * (undeliveredPacks / targetPacks) : contractAmt
    const pesoFallback = contractAmt > 0 ? contractAmt : Number(r.amount) || 0
    const volumeOpts = { milkType: r.milk_type, packUnitPrice: r.pack_unit_price }

    const contractedL = finishedMilkLiters({
      ...volumeOpts,
      packs: targetPacks,
      peso: pesoFallback,
    })
    const deliveredL = finishedMilkLiters({
      ...volumeOpts,
      packs: deliveredPacks,
      peso:
        valueDelivered > 0
          ? valueDelivered
          : pesoFallback * (targetPacks > 0 ? deliveredPacks / targetPacks : 0),
    })

    acc.beneficiaries += beneficiaries
    acc.deliveredPacks += deliveredPacks
    acc.targetPacks += targetPacks
    acc.contractAmt += contractAmt
    acc.contractedL += contractedL
    acc.paidAmt += paidAmt
    acc.deliveredL += deliveredL
    acc.valueDelivered += valueDelivered

    totalBeneficiaries += beneficiaries
    totalDeliveredPacks += deliveredPacks
    totalTargetPacks += targetPacks
    totalContractAmt += contractAmt
    totalContractedL += contractedL
    totalPaidAmt += paidAmt
    totalDeliveredL += deliveredL
    totalValueDelivered += valueDelivered
    totalRemainingContract += remainingContract
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
      pctDelivered: acc.targetPacks > 0 ? (acc.deliveredPacks / acc.targetPacks) * 100 : 0,
      pctDisbursed: acc.contractAmt > 0 ? (acc.paidAmt / acc.contractAmt) * 100 : 0,
    }))

  return {
    asOfIso,
    asOfLabel: formatAsOfDateLabel(asOfIso),
    statusCounts,
    totals: {
      sdoCount: totalSdoKeys.size,
      beneficiaries: totalBeneficiaries,
      deliveredPacks: totalDeliveredPacks,
      targetPacks: totalTargetPacks,
      contractAmt: totalContractAmt,
      contractedL: totalContractedL,
      paidAmt: totalPaidAmt,
      deliveredL: totalDeliveredL,
      undeliveredL: Math.max(0, totalContractedL - totalDeliveredL),
      valueDelivered: totalValueDelivered,
      remainingContract: totalRemainingContract,
      pctDelivered: totalTargetPacks > 0 ? (totalDeliveredPacks / totalTargetPacks) * 100 : 0,
      pctDisbursed: totalContractAmt > 0 ? (totalPaidAmt / totalContractAmt) * 100 : 0,
    },
    regions,
  }
}
