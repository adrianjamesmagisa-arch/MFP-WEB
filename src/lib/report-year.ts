import { REPORT_MIN_YEAR, APP_YEARS } from '@/lib/app-years'
import {
  dbYearToSchoolYear,
  parseSchoolYear,
  schoolYearToDbYear,
  type SchoolYear,
} from '@/lib/sbfp-year'

/** Default calendar year for report filters (always 2026+). */
function defaultReportYear(): number {
  const y = new Date().getFullYear()
  return y >= REPORT_MIN_YEAR ? y : REPORT_MIN_YEAR
}

/** Years available in report filters (2026 onward, not historical archive). */
const REPORT_YEARS = APP_YEARS.filter(y => y >= REPORT_MIN_YEAR)

/** Resolve report year filter: default calendar year; `__ALL_YEARS__` = all from REPORT_MIN_YEAR (2026+). */
export function resolveReportYearFilter(raw?: string | null): {
  allYears: boolean
  yearNum: number | null
  yearsForUi: number[]
} {
  if (raw === '__ALL_YEARS__' || raw === 'All Years') {
    return { allYears: true, yearNum: null, yearsForUi: [...REPORT_YEARS] }
  }
  if (raw && /^\d{4}$/.test(raw)) {
    const y = parseInt(raw, 10)
    if (y >= REPORT_MIN_YEAR) return { allYears: false, yearNum: y, yearsForUi: [y] }
  }
  const def = defaultReportYear()
  return { allYears: false, yearNum: def, yearsForUi: [def] }
}

/** Map URL year param to an SY label when centers use school-year schedules (SBFP / DepEd summary). */
export function normalizeSchoolYearParam(
  raw: string | null | undefined,
  allowed: readonly SchoolYear[],
): string {
  if (raw === '__ALL_YEARS__' || raw === 'All Years') return '__ALL_YEARS__'
  if (raw && allowed.includes(raw)) return raw
  if (raw && /^\d{4}-\d{4}$/.test(raw)) return raw
  if (raw && /^\d{4}$/.test(raw)) {
    const sy = dbYearToSchoolYear(parseInt(raw, 10))
    if (allowed.includes(sy)) return sy
  }
  return parseSchoolYear(null, allowed)
}

/**
 * DepEd / SBFP summary: filter by school year (SY 2026-2027 → db `year` 2026).
 * Accepts legacy calendar-only URLs (`year=2026`).
 */
export function resolveReportSchoolYearFilter(
  raw: string | null | undefined,
  allowedSchoolYears: readonly SchoolYear[],
): {
  allYears: boolean
  yearNum: number | null
  yearsForUi: number[]
  schoolYear: SchoolYear | null
} {
  const allowed = allowedSchoolYears.length > 0 ? [...allowedSchoolYears] : []
  const dbYearsFromAllowed = allowed.map(sy => schoolYearToDbYear(sy))

  if (raw === '__ALL_YEARS__' || raw === 'All Years') {
    const yearsForUi =
      dbYearsFromAllowed.length > 0
        ? dbYearsFromAllowed
        : [...REPORT_YEARS]
    return { allYears: true, yearNum: null, yearsForUi, schoolYear: null }
  }

  if (raw && /^\d{4}-\d{4}$/.test(raw)) {
    const y = schoolYearToDbYear(raw)
    if (y >= REPORT_MIN_YEAR && (allowed.length === 0 || allowed.includes(raw))) {
      return { allYears: false, yearNum: y, yearsForUi: [y], schoolYear: raw }
    }
  }

  if (raw && /^\d{4}$/.test(raw)) {
    const y = parseInt(raw, 10)
    if (y >= REPORT_MIN_YEAR) {
      const sy = dbYearToSchoolYear(y)
      return { allYears: false, yearNum: y, yearsForUi: [y], schoolYear: sy }
    }
  }

  const defSy = parseSchoolYear(null, allowed)
  const defY = schoolYearToDbYear(defSy)
  return { allYears: false, yearNum: defY, yearsForUi: [defY], schoolYear: defSy }
}
