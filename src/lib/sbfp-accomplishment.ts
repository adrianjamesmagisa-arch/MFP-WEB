/**
 * SBFP delivery accomplishment — same rules as SbfpCenterWorkspace “Delivery Progress”.
 * Source of truth: live sbfp_data (encoder procurement + snapshots / monthly columns).
 *
 * - No month: YTD via packsForDeliveryProgress (full school year on the row).
 * - With month: packs completed in that month only ÷ full-year target (all reportable SDOs).
 */

import {
  deliveryAccomplishmentPct,
  packsForDeliveryProgress,
  packsForMonth,
  type SbfpRawMilkRow,
} from '@/lib/sbfp-raw-milk'

export type SbfpAccomplishmentRow = SbfpRawMilkRow & {
  procurement_status?: string | null
  include_in_report?: boolean | null
  packs_to_deliver?: number | null
}

export function isFailedSbfpProcurement(status?: string | null): boolean {
  return String(status || '').toUpperCase() === 'FAILED'
}

export function sbfpRowCountsInReport(include_in_report?: boolean | null): boolean {
  return include_in_report !== false
}

export function filterReportableSbfpRows<T extends SbfpAccomplishmentRow>(rows: T[]): T[] {
  return rows.filter(
    r =>
      !isFailedSbfpProcurement(r.procurement_status) &&
      sbfpRowCountsInReport(r.include_in_report),
  )
}

export function deliveredPacksForSbfpAccomplishment(
  row: SbfpAccomplishmentRow,
  opts?: { month?: number | null; year?: number },
): number {
  const month = opts?.month
  const year = opts?.year
  if (month != null && Number.isFinite(month)) {
    return packsForMonth(row, month, { year })
  }
  return packsForDeliveryProgress(row)
}

export function computeSbfpAccomplishment(
  rows: SbfpAccomplishmentRow[],
  opts?: { month?: number | null; year?: number },
): { delivered: number; target: number; pct: number } {
  const reportable = filterReportableSbfpRows(rows)
  const target = reportable.reduce((s, r) => s + (Number(r.packs_to_deliver) || 0), 0)
  const delivered = reportable.reduce(
    (s, r) => s + deliveredPacksForSbfpAccomplishment(r, opts),
    0,
  )
  return {
    delivered,
    target,
    pct: deliveryAccomplishmentPct(delivered, target),
  }
}
