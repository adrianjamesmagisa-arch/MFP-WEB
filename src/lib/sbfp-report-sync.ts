/**
 * Map live SBFP center rows (sbfp_data) into SBFP Report / export fields.
 * Keeps delivered packs, targets, and filters aligned with SbfpCenterTable + PIMD.
 */

import { centerDisplayLabel, sbfpCenterAliases } from '@/lib/center-aliases'
import { packsFromAmount, milkTypeLabel } from '@/lib/sbfp-pack-price'
import {
  packsForMonth,
  parseSnapshotDate,
  rowHasDeliverySnapshotPacks,
  totalPacksDelivered,
  type SbfpRawMilkRow,
} from '@/lib/sbfp-raw-milk'
import { PCC_CENTERS } from '@/lib/types'

export type SbfpReportSourceRow = SbfpRawMilkRow & {
  id?: string
  year?: number
  center?: string | null
  region?: string | null
  sdo?: string | null
  procurement_status?: string | null
  include_in_report?: boolean | null
  amount?: number | null
  milk_type?: string | null
  pack_unit_price?: number | null
  mode_of_procurement?: string | null
  pr_date_received?: string | null
  pr_number?: string | null
  ors_date?: string | null
  po_number?: string | null
  batch?: string | null
  beneficiaries_pm?: number | null
  contract_amount?: number | null
  delivery_start?: string | null
  delivery_end?: string | null
  packs_to_deliver?: number | null
  packs_delivered?: number | null
  status_of_payment?: string | null
  remarks?: string | null
  supplier_id?: string | null
}

export function sbfpRowIncludedInReport(r: SbfpReportSourceRow): boolean {
  return r.include_in_report !== false
}

export function isFailedSbfpStatus(procurement_status?: string | null): boolean {
  return String(procurement_status || '').toUpperCase() === 'FAILED'
}

/** Canonical filter / matrix buckets — DB often stores short labels like "Ongoing". */
export type SbfpStatusBucket =
  | 'prep'
  | 'ongoing'
  | 'awarded_delivery'
  | 'awarded_ongoing'
  | 'completed'
  | 'failed'
  | 'other'

export const SBFP_STATUS_FILTER_OPTIONS: { value: SbfpStatusBucket | 'ALL'; label: string }[] = [
  { value: 'ALL', label: 'All Statuses' },
  { value: 'prep', label: 'For Preparation' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'awarded_delivery', label: 'Awarded (For Delivery)' },
  { value: 'awarded_ongoing', label: 'Awarded (Ongoing Delivery)' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
]

export function sbfpStatusBucket(procurement_status?: string | null): SbfpStatusBucket {
  const st = String(procurement_status || '').trim().toLowerCase()
  if (!st || st === 'for preparation') return 'prep'
  if (st === 'failed') return 'failed'
  if (st === 'completed' || st === 'done') return 'completed'
  if (st.includes('awarded') && st.includes('ongoing')) return 'awarded_ongoing'
  if (st.includes('awarded')) return 'awarded_delivery'
  if (st.includes('ongoing')) return 'ongoing'
  return 'other'
}

/** True when row matches the report Procurement Status filter (bucket or exact label). */
export function rowMatchesSbfpStatusFilter(
  procurement_status: string | null | undefined,
  filterStatus: string,
): boolean {
  if (!filterStatus || filterStatus === 'ALL') return true
  const bucket = sbfpStatusBucket(procurement_status)
  if (filterStatus === bucket) return true
  // Legacy exact / label match (older bookmarks or hardcoded option values)
  const want = filterStatus.trim().toLowerCase()
  const got = String(procurement_status || '').trim().toLowerCase()
  if (got === want) return true
  if (want === 'for preparation' && bucket === 'prep') return true
  if ((want === 'ongoing' || want.includes('ongoing procurement') || want.includes('ongoing (for award)')) && bucket === 'ongoing') {
    return true
  }
  if (want.includes('awarded') && want.includes('ongoing') && bucket === 'awarded_ongoing') return true
  if (want.includes('awarded') && bucket === 'awarded_delivery') return true
  if ((want === 'completed' || want === 'done') && bucket === 'completed') return true
  if (want === 'failed' && bucket === 'failed') return true
  return false
}

/**
 * Default report visibility: In Report rows, plus Failed (even if unchecked),
 * so the Procurement Status filter and SDO counts stay useful.
 */
export function sbfpRowVisibleInReportDefault(r: SbfpReportSourceRow): boolean {
  if (sbfpRowIncludedInReport(r)) return true
  return isFailedSbfpStatus(r.procurement_status)
}

/** Display center label (NHQ → NHQGP (NIZ), etc.). */
export function reportCenterLabel(rawCenter: string | null | undefined): string {
  if (!rawCenter) return '—'
  return centerDisplayLabel(rawCenter.trim())
}

export function rowMatchesReportCenterFilter(
  row: SbfpReportSourceRow,
  filterCenter: string,
): boolean {
  if (!filterCenter || filterCenter === 'ALL') return true
  const allowed = new Set(
    sbfpCenterAliases(filterCenter).map(c => c.trim().toUpperCase()),
  )
  const raw = (row.center || '').trim().toUpperCase()
  return allowed.has(raw)
}

/** Same target packs logic as center table (stored value, else Amount ÷ pack price). */
export function effectivePacksToDeliver(row: SbfpReportSourceRow): number {
  const stored = Number(row.packs_to_deliver)
  if (Number.isFinite(stored) && stored > 0) return stored
  const computed = packsFromAmount(row.amount, row.milk_type, row.pack_unit_price)
  return computed ?? 0
}

/**
 * Cumulative packs delivered through reportDate (ISO yyyy-mm-dd): sum of each
 * calendar month’s completed packs (Aug + Sep + …), aligned with center monthly columns.
 */
export function deliveredPacksAsOfReportDate(
  row: SbfpReportSourceRow,
  reportDateIso: string,
  dbYear?: number,
): number {
  const cutoff = parseSnapshotDate(reportDateIso)
  if (!cutoff) return totalPacksDelivered(row)

  const syYear =
    dbYear != null && Number.isFinite(dbYear) ? Math.floor(dbYear) : cutoff.getFullYear()

  let endMonth = 12
  if (cutoff.getFullYear() === syYear) {
    endMonth = cutoff.getMonth() + 1
  } else if (cutoff.getFullYear() < syYear) {
    return 0
  }

  const monthOpts = reportPacksMonthOpts(row, syYear)
  let sum = 0
  for (let m = 1; m <= endMonth; m++) {
    sum += packsForMonth(row, m, monthOpts)
  }
  if (sum > 0) return sum

  // Fallback: single latest cumulative snapshot on or before cutoff (legacy rows).
  const snaps = Array.isArray(row.delivery_snapshots) ? row.delivery_snapshots : []
  if (snaps.length > 0) {
    let best = 0
    for (const s of snaps) {
      const d = parseSnapshotDate(s.date)
      if (!d || d.getTime() > cutoff.getTime()) continue
      best = Math.max(best, Number(s.packs) || 0)
    }
    if (best > 0) return best
  }
  return totalPacksDelivered(row)
}

function reportPacksMonthOpts(row: SbfpReportSourceRow, dbYear: number) {
  return {
    year: dbYear,
    preferSnapshotsOverMonthly: rowHasDeliverySnapshotPacks(row),
  }
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Inclusive calendar days between two same-local dates. */
function inclusiveDaySpan(start: Date, end: Date): number {
  const ms = startOfDay(end).getTime() - startOfDay(start).getTime()
  return ms < 0 ? 0 : Math.floor(ms / 86400000) + 1
}

/**
 * Share of calendar month `month` (1–12) that falls inside [rangeStart, rangeEnd] (inclusive).
 * Used to prorate monthly delivered packs for partial ranges (e.g. Aug 19–30).
 */
export function monthFractionInDeliveredRange(
  dbYear: number,
  month: number,
  rangeStart: Date,
  rangeEnd: Date,
): number {
  if (!Number.isFinite(dbYear) || month < 1 || month > 12) return 0
  const lastDay = new Date(dbYear, month, 0).getDate()
  const monthStart = new Date(dbYear, month - 1, 1)
  const monthEnd = new Date(dbYear, month - 1, lastDay)
  if (monthEnd < rangeStart || monthStart > rangeEnd) return 0
  const overlapStart = rangeStart > monthStart ? rangeStart : monthStart
  const overlapEnd = rangeEnd < monthEnd ? rangeEnd : monthEnd
  const overlapDays = inclusiveDaySpan(overlapStart, overlapEnd)
  return overlapDays / lastDay
}

/**
 * Delivered packs between two dates (inclusive).
 *
 * When “Delivered as of” snapshots exist: attribute each snapshot’s packs to its
 * actual date (cumulative increment, or the column total when non-monotonic) and
 * count the full amount if that date falls inside the range — no day-of-month proration.
 *
 * Without snapshots: sum full calendar-month packs for every month that overlaps
 * the range (monthly map / delivery-start fallback via packsForMonth).
 */
export function deliveredPacksInDateRange(
  row: SbfpReportSourceRow,
  fromIso: string,
  toIso: string,
  dbYear: number,
): number {
  const rangeStart = parseSnapshotDate(fromIso)
  const rangeEnd = parseSnapshotDate(toIso)
  if (!rangeStart || !rangeEnd || !Number.isFinite(dbYear)) return 0
  const fromMs = startOfDay(rangeStart).getTime()
  const toMs = startOfDay(rangeEnd).getTime()
  if (fromMs > toMs) return 0

  const snaps = Array.isArray(row.delivery_snapshots) ? row.delivery_snapshots : []
  const dated = snaps
    .map(s => ({ date: parseSnapshotDate(s.date), packs: Number(s.packs) || 0 }))
    .filter((s): s is { date: Date; packs: number } => s.date != null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  if (dated.length > 0) {
    return dated
      .filter(s => {
        const dayMs = startOfDay(s.date).getTime()
        return dayMs >= fromMs && dayMs <= toMs
      })
      .reduce((sum, s) => sum + Math.max(0, s.packs), 0)
  }

  const monthOpts = reportPacksMonthOpts(row, dbYear)
  let sum = 0
  for (let m = 1; m <= 12; m++) {
    const frac = monthFractionInDeliveredRange(dbYear, m, rangeStart, rangeEnd)
    if (frac <= 0) continue
    const monthPacks = packsForMonth(row, m, monthOpts)
    if (monthPacks <= 0) continue
    // No dated snapshots: include the whole month whenever it overlaps the range.
    sum += monthPacks
  }
  return sum
}

export function defaultDeliveredPackRange(dbYear: number): { from: string; to: string } {
  const y = Number.isFinite(dbYear) ? Math.floor(dbYear) : new Date().getFullYear()
  const to = new Date().toISOString().split('T')[0]
  return { from: `${y}-08-01`, to }
}

/** SDO had packs completed in this calendar month (encoder snapshots / monthly map). */
export function rowHasDeliveryInMonth(
  row: SbfpReportSourceRow,
  month: number,
  dbYear: number,
): boolean {
  return packsForMonth(row, month, reportPacksMonthOpts(row, dbYear)) > 0
}

export function resolveDeliveredPacksForReport(
  row: SbfpReportSourceRow,
  opts: {
    deliveredFromIso: string
    deliveredToIso: string
    dbYear?: number
  },
): number {
  if (opts.dbYear == null || !Number.isFinite(opts.dbYear)) return 0
  return deliveredPacksInDateRange(row, opts.deliveredFromIso, opts.deliveredToIso, opts.dbYear)
}

export function formatReportDate(value: unknown): string {
  if (value == null || value === '') return '—'
  const d = parseSnapshotDate(value)
  if (!d) return String(value)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatReportMilkType(milkType: unknown): string {
  const label = milkTypeLabel(milkType)
  if (label === '—') return 'PM'
  if (label === 'PM') return 'PM (Pasteurized)'
  if (label === 'SM') return 'SM (Sterilized)'
  if (label === 'CM') return 'CM (Commercial)'
  return label
}

/** Normalized row for table / CSV (all fields from center SBFP procurement grid). */
export type SbfpReportViewRow = {
  source: SbfpReportSourceRow
  region: string
  sdo: string
  center: string
  procurement_status: string
  milk_type: string
  amount: number
  mode_of_procurement: string
  pr_date_received: string
  pr_number: string
  ors_date: string
  po_number: string
  batch: string
  beneficiaries_pm: number
  contract_amount: number
  delivery_start: string
  delivery_end: string
  packs_to_deliver: number
  delivered_packs: number
  status_of_payment: string
  remarks: string
}

export function mapSbfpRowToReportView(
  row: SbfpReportSourceRow,
  deliveredOpts: {
    deliveredFromIso: string
    deliveredToIso: string
    dbYear?: number
  },
): SbfpReportViewRow {
  return {
    source: row,
    region: row.region?.trim() || '—',
    sdo: row.sdo?.trim() || '—',
    center: reportCenterLabel(row.center),
    procurement_status: row.procurement_status?.trim() || 'For Preparation',
    milk_type: formatReportMilkType(row.milk_type),
    amount: Number(row.amount) || 0,
    mode_of_procurement: row.mode_of_procurement?.trim() || '—',
    pr_date_received: formatReportDate(row.pr_date_received),
    pr_number: row.pr_number?.trim() || '—',
    ors_date: formatReportDate(row.ors_date),
    po_number: row.po_number?.trim() || '—',
    batch: row.batch?.trim() || '—',
    beneficiaries_pm: Number(row.beneficiaries_pm) || 0,
    contract_amount: Number(row.contract_amount) || 0,
    delivery_start: formatReportDate(row.delivery_start),
    delivery_end: formatReportDate(row.delivery_end),
    packs_to_deliver: effectivePacksToDeliver(row),
    delivered_packs: resolveDeliveredPacksForReport(row, {
      deliveredFromIso: deliveredOpts.deliveredFromIso,
      deliveredToIso: deliveredOpts.deliveredToIso,
      dbYear: deliveredOpts.dbYear,
    }),
    status_of_payment: row.status_of_payment?.trim() || '—',
    remarks: row.remarks?.trim() || '—',
  }
}

/** Center filter options: canonical PCC list + any extra centers present in data. */
export function reportCenterFilterOptions(records: SbfpReportSourceRow[]): string[] {
  const fromData = new Set<string>()
  for (const r of records) {
    if (r.center) fromData.add(reportCenterLabel(r.center))
  }
  const ordered = PCC_CENTERS.filter(c => fromData.has(c))
  const extras = [...fromData].filter(c => !ordered.includes(c)).sort()
  return [...ordered, ...extras]
}
