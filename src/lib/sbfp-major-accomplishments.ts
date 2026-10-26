/**
 * Tab 8 — Major Accomplishments (SBFP Milk Proponent).
 * Historical SYs (2023-2024 .. 2025-2026) are fixed constants; 2026-2027 onward are
 * computed live from sbfp_data. Target values for every SY are editable & persisted.
 */
import {
  deliveredPacksInDateRange,
  isFailedSbfpStatus,
  sbfpRowVisibleInReportDefault,
  type SbfpReportSourceRow,
} from '@/lib/sbfp-report-sync'
import { uniqueSdoCountKey } from '@/lib/sbfp-dropoff-sync'
import { finishedMilkLiters } from '@/lib/sbfp-pack-price'
import { isSbfpAuxRow } from '@/lib/sbfp-aux'

export type MajorIndicatorKey =
  | 'milk_packs'
  | 'beneficiaries'
  | 'assisted_coops'
  | 'gross_income'
  | 'contracted_volume_liters'
  | 'sdo_count'

export type MajorAccomplishmentMetrics = Record<MajorIndicatorKey, number>
export type MajorTargetsBySchoolYear = Record<string, Partial<MajorAccomplishmentMetrics>>

export const MAJOR_INDICATORS: { key: MajorIndicatorKey; label: string; decimals: boolean }[] = [
  { key: 'milk_packs', label: 'No. of Milk Packs', decimals: false },
  { key: 'beneficiaries', label: 'No. of Beneficiaries', decimals: false },
  { key: 'assisted_coops', label: 'No. of Assisted Cooperatives/ Partners', decimals: false },
  { key: 'gross_income', label: 'Gross Income', decimals: true },
  { key: 'contracted_volume_liters', label: 'Total Contracted Milk Volume (Liters)', decimals: true },
  { key: 'sdo_count', label: 'No. of School Division Office', decimals: false },
]

export const HISTORICAL_SCHOOL_YEARS = ['2023-2024', '2024-2025', '2025-2026'] as const

export const HISTORICAL_ACCOMPLISHMENTS: Record<string, MajorAccomplishmentMetrics> = {
  '2023-2024': {
    milk_packs: 26804804,
    beneficiaries: 740637,
    assisted_coops: 45,
    gross_income: 531134343.88,
    contracted_volume_liters: 5360961,
    sdo_count: 106,
  },
  '2024-2025': {
    milk_packs: 27815137,
    beneficiaries: 731479,
    assisted_coops: 46,
    gross_income: 637489242.17,
    contracted_volume_liters: 5563027.4,
    sdo_count: 100,
  },
  '2025-2026': {
    milk_packs: 12760885,
    beneficiaries: 881893,
    assisted_coops: 41,
    gross_income: 243952850.67,
    contracted_volume_liters: 2552177.0,
    sdo_count: 90,
  },
}

export const DEFAULT_MAJOR_TARGETS: MajorTargetsBySchoolYear = {
  '2026-2027': {
    milk_packs: 34728600,
    beneficiaries: 1698698,
    assisted_coops: 50,
    gross_income: 1005479489,
    contracted_volume_liters: 7552889.6,
    sdo_count: 93,
  },
}

export const FIRST_LIVE_DB_YEAR = 2026

export function schoolYearLabel(dbYear: number): string {
  return `${dbYear}-${dbYear + 1}`
}

export function formatMajorValue(key: MajorIndicatorKey, n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return ''
  const meta = MAJOR_INDICATORS.find(i => i.key === key)
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: meta?.decimals ? 2 : 0,
  })
}

/** Merge persisted targets over defaults. */
export function resolveTarget(
  targets: MajorTargetsBySchoolYear,
  sy: string,
  key: MajorIndicatorKey,
): number | undefined {
  const v = targets[sy]?.[key]
  if (v != null && Number.isFinite(v)) return v
  return DEFAULT_MAJOR_TARGETS[sy]?.[key]
}

export function emptyMajorMetrics(): MajorAccomplishmentMetrics {
  return { milk_packs: 0, beneficiaries: 0, assisted_coops: 0, gross_income: 0, contracted_volume_liters: 0, sdo_count: 0 }
}

/**
 * Live accomplishment for one SY (dbYear = start year), cumulative from Aug 1 of dbYear
 * through asOfIso (inclusive). Early calendar-year snapshots are captured by starting at Jan 1.
 */
export function computeLiveMajorAccomplishments(
  rows: SbfpReportSourceRow[],
  dbYear: number,
  asOfIso: string,
): MajorAccomplishmentMetrics {
  const out = emptyMajorMetrics()
  const coops = new Set<string>()
  const sdos = new Set<string>()
  const fromIso = `${dbYear}-01-01`
  for (const r of rows as any[]) {
    if (isSbfpAuxRow(r)) continue
    if (Number(r.year) !== dbYear) continue
    if (!sbfpRowVisibleInReportDefault(r)) continue
    if (isFailedSbfpStatus(r.procurement_status)) continue
    const packs = deliveredPacksInDateRange(r, fromIso, asOfIso, dbYear)
    if (!(packs > 0)) continue
    out.milk_packs += packs
    out.beneficiaries +=
      (Number(r.beneficiaries_pm) || 0) + (Number(r.beneficiaries_sm) || 0) + (Number(r.beneficiaries_cm) || 0)
    const coopKey = r.supplier_id
      ? String(r.supplier_id)
      : String(r.cooperatives?.name || r.cooperative || '').trim().toLowerCase()
    if (coopKey) coops.add(coopKey)
    const contract = Number(r.contract_amount) || 0
    out.gross_income += contract > 0 ? contract : Number(r.amount) || 0
    out.contracted_volume_liters += finishedMilkLiters({
      milkType: r.milk_type,
      packs,
      packUnitPrice: r.pack_unit_price,
    })
    const sdoKey = uniqueSdoCountKey(r.sdo, r.center)
    if (sdoKey) sdos.add(sdoKey)
  }
  out.assisted_coops = coops.size
  out.sdo_count = sdos.size
  out.contracted_volume_liters = Math.round(out.contracted_volume_liters * 100) / 100
  out.gross_income = Math.round(out.gross_income * 100) / 100
  return out
}
