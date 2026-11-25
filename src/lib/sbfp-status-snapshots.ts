/**
 * Pure helpers for SBFP daily implementation status snapshots (auto-save + carry-forward + backfill).
 * Shared across the capture API, SBFP Milk Component Dashboard, and SBFP Report Tab 2.
 */

import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import type { MilkComponentStatusCounts } from '@/lib/sbfp-dashboard-infographic'
import {
  buildSdoHierarchyStatusMap,
  reportCenterLabel,
  SBFP_PROCUREMENT_STATUSES,
  sbfpRowVisibleInReportDefault,
  type SbfpProcurementStatus,
  type SbfpReportSourceRow,
} from '@/lib/sbfp-report-sync'

export const NATIONAL_SNAPSHOT_CENTER = '__ALL__'

export type SbfpSnapshotSource = 'auto' | 'backfill'

export type SbfpStatusBreakdown = {
  forPreparation: number
  ongoingProcurement: number
  ongoingForAward: number
  forDelivery: number
  ongoingDelivery: number
  completed: number
  failed: number
  sdoCount: number
}

export type SbfpStatusSnapshotRow = {
  snapshot_date: string
  year: number
  center: string
  for_preparation: number
  ongoing_procurement: number
  ongoing_for_award: number
  for_delivery: number
  ongoing_delivery: number
  completed: number
  failed: number
  sdo_count: number
  source: SbfpSnapshotSource
  captured_at?: string | null
}

export type ResolvedStatusSnapshot = {
  requestedDate: string
  snapshotDate: string
  isExactDate: boolean
  source: SbfpSnapshotSource
  breakdown: SbfpStatusBreakdown
  dashboardCounts: MilkComponentStatusCounts
  tab2Counts: Record<SbfpProcurementStatus, number>
}

export type SnapshotDateSummary = {
  snapshotDate: string
  year: number
  center: string
  source: SbfpSnapshotSource
  breakdown: SbfpStatusBreakdown
  capturedAt?: string | null
}

/** Current YYYY-MM-DD in Asia/Manila timezone. */
export function todayManilaIso(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find(p => p.type === 'year')?.value ?? String(now.getFullYear())
  const m = parts.find(p => p.type === 'month')?.value ?? String(now.getMonth() + 1).padStart(2, '0')
  const d = parts.find(p => p.type === 'day')?.value ?? String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function emptyStatusBreakdown(): SbfpStatusBreakdown {
  return {
    forPreparation: 0,
    ongoingProcurement: 0,
    ongoingForAward: 0,
    forDelivery: 0,
    ongoingDelivery: 0,
    completed: 0,
    failed: 0,
    sdoCount: 0,
  }
}

export function sumBreakdownTotal(b: Omit<SbfpStatusBreakdown, 'sdoCount'>): number {
  return (
    Math.max(0, Math.trunc(Number(b.forPreparation) || 0)) +
    Math.max(0, Math.trunc(Number(b.ongoingProcurement) || 0)) +
    Math.max(0, Math.trunc(Number(b.ongoingForAward) || 0)) +
    Math.max(0, Math.trunc(Number(b.forDelivery) || 0)) +
    Math.max(0, Math.trunc(Number(b.ongoingDelivery) || 0)) +
    Math.max(0, Math.trunc(Number(b.completed) || 0)) +
    Math.max(0, Math.trunc(Number(b.failed) || 0))
  )
}

export function rowToBreakdown(row: SbfpStatusSnapshotRow): SbfpStatusBreakdown {
  const b: Omit<SbfpStatusBreakdown, 'sdoCount'> = {
    forPreparation: Math.max(0, Number(row.for_preparation) || 0),
    ongoingProcurement: Math.max(0, Number(row.ongoing_procurement) || 0),
    ongoingForAward: Math.max(0, Number(row.ongoing_for_award) || 0),
    forDelivery: Math.max(0, Number(row.for_delivery) || 0),
    ongoingDelivery: Math.max(0, Number(row.ongoing_delivery) || 0),
    completed: Math.max(0, Number(row.completed) || 0),
    failed: Math.max(0, Number(row.failed) || 0),
  }
  const storedTotal = Number(row.sdo_count)
  return {
    ...b,
    sdoCount: Number.isFinite(storedTotal) && storedTotal > 0 ? storedTotal : sumBreakdownTotal(b),
  }
}

export function addBreakdowns(a: SbfpStatusBreakdown, b: SbfpStatusBreakdown): SbfpStatusBreakdown {
  return {
    forPreparation: a.forPreparation + b.forPreparation,
    ongoingProcurement: a.ongoingProcurement + b.ongoingProcurement,
    ongoingForAward: a.ongoingForAward + b.ongoingForAward,
    forDelivery: a.forDelivery + b.forDelivery,
    ongoingDelivery: a.ongoingDelivery + b.ongoingDelivery,
    completed: a.completed + b.completed,
    failed: a.failed + b.failed,
    sdoCount: a.sdoCount + b.sdoCount,
  }
}

export function breakdownToDashboardCounts(b: SbfpStatusBreakdown): MilkComponentStatusCounts {
  return {
    completed: b.completed,
    ongoingDelivery: b.ongoingDelivery,
    forDelivery: b.forDelivery,
    ongoingProcurement: b.ongoingProcurement + b.ongoingForAward,
    forPreparation: b.forPreparation,
  }
}

export function breakdownToTab2Counts(b: SbfpStatusBreakdown): Record<SbfpProcurementStatus, number> {
  return {
    'For Preparation': b.forPreparation,
    'Ongoing Procurement': b.ongoingProcurement,
    'Ongoing (For Award)': b.ongoingForAward,
    'Awarded (For Delivery)': b.forDelivery,
    'Awarded (Ongoing Delivery)': b.ongoingDelivery,
    Completed: b.completed,
    Failed: b.failed,
  }
}

export function countHierarchyStatuses(
  statusMap: Map<string, SbfpProcurementStatus>,
): SbfpStatusBreakdown {
  const b = emptyStatusBreakdown()
  for (const status of statusMap.values()) {
    if (status === 'For Preparation') b.forPreparation++
    else if (status === 'Ongoing Procurement') b.ongoingProcurement++
    else if (status === 'Ongoing (For Award)') b.ongoingForAward++
    else if (status === 'Awarded (For Delivery)') b.forDelivery++
    else if (status === 'Awarded (Ongoing Delivery)') b.ongoingDelivery++
    else if (status === 'Completed') b.completed++
    else if (status === 'Failed') b.failed++
  }
  b.sdoCount = statusMap.size
  return b
}

export function computeLiveStatusBreakdown(
  rows: ReadonlyArray<SbfpReportSourceRow>,
): SbfpStatusBreakdown {
  const visibleRows = excludeAuxSbfp(rows as SbfpReportSourceRow[]).filter(sbfpRowVisibleInReportDefault)
  return countHierarchyStatuses(buildSdoHierarchyStatusMap(visibleRows))
}

/** Computes per-center live SDO status counts using exact hierarchy deduplication per center. */
export function computePerCenterStatusSnapshots(
  rows: ReadonlyArray<SbfpReportSourceRow>,
  year: number,
  snapshotDate: string,
): SbfpStatusSnapshotRow[] {
  const visibleRows = excludeAuxSbfp(rows as SbfpReportSourceRow[]).filter(sbfpRowVisibleInReportDefault)
  const byCenter = new Map<string, SbfpReportSourceRow[]>()

  for (const r of visibleRows) {
    const center = reportCenterLabel(r.center)
    let list = byCenter.get(center)
    if (!list) {
      list = []
      byCenter.set(center, list)
    }
    list.push(r)
  }

  return Array.from(byCenter.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([center, centerRows]) => {
      const b = countHierarchyStatuses(buildSdoHierarchyStatusMap(centerRows))
      return {
        snapshot_date: snapshotDate,
        year,
        center,
        for_preparation: b.forPreparation,
        ongoing_procurement: b.ongoingProcurement,
        ongoing_for_award: b.ongoingForAward,
        for_delivery: b.forDelivery,
        ongoing_delivery: b.ongoingDelivery,
        completed: b.completed,
        failed: b.failed,
        sdo_count: b.sdoCount,
        source: 'auto',
      }
    })
}

function buildResolved(
  requestedDate: string,
  snapshotDate: string,
  source: SbfpSnapshotSource,
  breakdown: SbfpStatusBreakdown,
): ResolvedStatusSnapshot {
  return {
    requestedDate,
    snapshotDate,
    isExactDate: snapshotDate === requestedDate,
    source,
    breakdown,
    dashboardCounts: breakdownToDashboardCounts(breakdown),
    tab2Counts: breakdownToTab2Counts(breakdown),
  }
}

/**
 * Resolves the active snapshot on or before `opts.asOfIso` (carry-forward on quiet days).
 * For national view (`center` unset or `'ALL'`), a `'__ALL__'` national backfill row on the
 * resolved date takes precedence over summing individual centers. For a specific center view,
 * `'__ALL__'` rows are never used so center totals remain strictly center-scoped.
 */
export function resolveStatusSnapshotForDate(
  rows: ReadonlyArray<SbfpStatusSnapshotRow>,
  opts: {
    year: number
    asOfIso: string
    center?: string | null
  },
): ResolvedStatusSnapshot | null {
  const { year, asOfIso, center } = opts
  const dateEligible = rows.filter(r => r.year === year && r.snapshot_date <= asOfIso)
  if (dateEligible.length === 0) return null

  const scopedCenter = center && center !== 'ALL' ? reportCenterLabel(center) : null
  if (scopedCenter) {
    const matching = dateEligible.filter(r => r.center === scopedCenter)
    if (matching.length === 0) return null
    matching.sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
    const latest = matching[0]
    return buildResolved(asOfIso, latest.snapshot_date, latest.source, rowToBreakdown(latest))
  }

  let latestDate = ''
  for (const r of dateEligible) {
    if (r.snapshot_date > latestDate) latestDate = r.snapshot_date
  }
  if (!latestDate) return null

  const onDate = dateEligible.filter(r => r.snapshot_date === latestDate)
  const nationalOverride = onDate.find(r => r.center === NATIONAL_SNAPSHOT_CENTER)
  if (nationalOverride) {
    return buildResolved(asOfIso, latestDate, nationalOverride.source, rowToBreakdown(nationalOverride))
  }

  const centerRows = onDate.filter(r => r.center !== NATIONAL_SNAPSHOT_CENTER)
  if (centerRows.length === 0) return null

  let combined = emptyStatusBreakdown()
  let combinedSource: SbfpSnapshotSource = 'auto'
  for (const r of centerRows) {
    combined = addBreakdowns(combined, rowToBreakdown(r))
    if (r.source === 'backfill') combinedSource = 'backfill'
  }
  return buildResolved(asOfIso, latestDate, combinedSource, combined)
}

/** Summarizes saved snapshots for display in the Super Admin Backfill modal. */
export function summarizeSnapshotsForModal(
  rows: ReadonlyArray<SbfpStatusSnapshotRow>,
  year: number,
): SnapshotDateSummary[] {
  const yearRows = rows.filter(r => r.year === year)
  const dates = Array.from(new Set(yearRows.map(r => r.snapshot_date))).sort((a, b) => b.localeCompare(a))
  const summaries: SnapshotDateSummary[] = []

  for (const date of dates) {
    const onDate = yearRows.filter(r => r.snapshot_date === date)
    const nationalRow = onDate.find(r => r.center === NATIONAL_SNAPSHOT_CENTER)
    if (nationalRow) {
      summaries.push({
        snapshotDate: date,
        year,
        center: NATIONAL_SNAPSHOT_CENTER,
        source: nationalRow.source,
        breakdown: rowToBreakdown(nationalRow),
        capturedAt: nationalRow.captured_at ?? null,
      })
    } else {
      const centerRows = onDate.filter(r => r.center !== NATIONAL_SNAPSHOT_CENTER)
      if (centerRows.length > 0) {
        let combined = emptyStatusBreakdown()
        let latestCaptured: string | null = null
        let anyBackfill = false
        for (const r of centerRows) {
          combined = addBreakdowns(combined, rowToBreakdown(r))
          if (r.source === 'backfill') anyBackfill = true
          if (r.captured_at && (!latestCaptured || r.captured_at > latestCaptured)) {
            latestCaptured = r.captured_at
          }
        }
        summaries.push({
          snapshotDate: date,
          year,
          center: 'ALL_CENTERS_SUM',
          source: anyBackfill ? 'backfill' : 'auto',
          breakdown: combined,
          capturedAt: latestCaptured,
        })
      }
    }

    const centerBackfills = onDate
      .filter(r => r.center !== NATIONAL_SNAPSHOT_CENTER && r.source === 'backfill')
      .sort((a, b) => a.center.localeCompare(b.center))
    for (const cb of centerBackfills) {
      summaries.push({
        snapshotDate: date,
        year,
        center: cb.center,
        source: cb.source,
        breakdown: rowToBreakdown(cb),
        capturedAt: cb.captured_at ?? null,
      })
    }
  }

  return summaries
}

/** Keeps compiler honest that all 7 canonical statuses remain explicitly handled. */
export const ALL_SBFP_STATUSES_COUNT = SBFP_PROCUREMENT_STATUSES.length
