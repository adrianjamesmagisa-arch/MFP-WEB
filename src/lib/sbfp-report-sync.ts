/**
 * Map live SBFP center rows (sbfp_data) into SBFP Report / export fields.
 * Keeps delivered packs, targets, and filters aligned with SbfpCenterTable + PIMD.
 */

import { centerDisplayLabel, sbfpCenterAliases } from '@/lib/center-aliases'
import { packsFromAmount, milkTypeLabel } from '@/lib/sbfp-pack-price'
import {
  parseSnapshotDate,
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
}

export function sbfpRowIncludedInReport(r: SbfpReportSourceRow): boolean {
  return r.include_in_report !== false
}

export function isFailedSbfpStatus(procurement_status?: string | null): boolean {
  return String(procurement_status || '').toUpperCase() === 'FAILED'
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
 * Cumulative packs delivered as of reportDate (ISO yyyy-mm-dd).
 * Uses delivery_snapshots dates (e.g. "Aug. 18, 2026") via parseSnapshotDate.
 */
export function deliveredPacksAsOfReportDate(
  row: SbfpReportSourceRow,
  reportDateIso: string,
): number {
  const cutoff = parseSnapshotDate(reportDateIso)
  const snaps = Array.isArray(row.delivery_snapshots) ? row.delivery_snapshots : []
  if (snaps.length > 0 && cutoff) {
    let best = 0
    for (const s of snaps) {
      const d = parseSnapshotDate(s.date)
      if (!d || d.getTime() > cutoff.getTime()) continue
      best = Math.max(best, Number(s.packs) || 0)
    }
    if (best > 0) return best
  }
  if (snaps.length > 0 && !cutoff) {
    const latest = snaps.reduce(
      (m, s) => Math.max(m, Number(s.packs) || 0),
      0,
    )
    if (latest > 0) return latest
  }
  return totalPacksDelivered(row)
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
  reportDateIso: string,
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
    delivered_packs: deliveredPacksAsOfReportDate(row, reportDateIso),
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
