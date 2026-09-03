export const FALLBACK_SCHOOL_YEARS = ['2026-2027'] as const
export type SchoolYear = string
export const DEFAULT_SCHOOL_YEAR: SchoolYear = '2026-2027'

export function labelFromDbYear(year: number): SchoolYear {
  return `${year}-${year + 1}`
}

export function parseSchoolYear(
  value?: string | null,
  allowed?: readonly string[] | null,
): SchoolYear {
  const list = allowed && allowed.length > 0 ? allowed : FALLBACK_SCHOOL_YEARS
  if (value && list.includes(value)) return value
  if (value && /^\d{4}-\d{4}$/.test(value)) return value
  if (list.includes(DEFAULT_SCHOOL_YEAR)) return DEFAULT_SCHOOL_YEAR
  return list[list.length - 1] || DEFAULT_SCHOOL_YEAR
}

/** Calendar year stored on SBFP tables. SY 2025-2026 → 2025, SY 2026-2027 → 2026. */
export function schoolYearToDbYear(sy: SchoolYear): number {
  return parseInt(sy.slice(0, 4), 10)
}

export function dbYearToSchoolYear(year: number): SchoolYear {
  return labelFromDbYear(year)
}

export function schoolYearLabel(sy: SchoolYear): string {
  return `SY ${sy}`
}

export type SchoolYearRow = {
  year: number
  label: string
  is_active: boolean
}

export function schoolYearsFromRows(rows: SchoolYearRow[] | null | undefined): SchoolYear[] {
  const active = (rows || [])
    .filter(r => r.is_active !== false)
    .sort((a, b) => a.year - b.year)
    .map(r => r.label || labelFromDbYear(r.year))
  return active.length > 0 ? active : [...FALLBACK_SCHOOL_YEARS]
}
