import { MIN_DATA_YEAR, APP_YEARS, defaultReportYearString } from '@/lib/app-years'
import {
  dbYearToSchoolYear,
  parseSchoolYear,
  schoolYearToDbYear,
  type SchoolYear,
} from '@/lib/sbfp-year'

/** Resolve report year filter: default calendar year; `__ALL_YEARS__` = all from MIN_DATA_YEAR. */
export function resolveReportYearFilter(raw?: string | null): {
  allYears: boolean
  yearNum: number | null
  yearsForUi: number[]
} {
  if (raw === '__ALL_YEARS__' || raw === 'All Years') {
    return { allYears: true, yearNum: null, yearsForUi: [...APP_YEARS] }
  }
  if (raw && /^\d{4}$/.test(raw)) {
    const y = parseInt(raw, 10)
    if (y >= MIN_DATA_YEAR) return { allYears: false, yearNum: y, yearsForUi: [y] }
  }
  const def = parseInt(defaultReportYearString(), 10)
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
        : [...APP_YEARS]
    return { allYears: true, yearNum: null, yearsForUi, schoolYear: null }
  }

  if (raw && /^\d{4}-\d{4}$/.test(raw)) {
    const y = schoolYearToDbYear(raw)
    if (y >= MIN_DATA_YEAR && (allowed.length === 0 || allowed.includes(raw))) {
      return { allYears: false, yearNum: y, yearsForUi: [y], schoolYear: raw }
    }
  }

  if (raw && /^\d{4}$/.test(raw)) {
    const y = parseInt(raw, 10)
    if (y >= MIN_DATA_YEAR) {
      const sy = dbYearToSchoolYear(y)
      return { allYears: false, yearNum: y, yearsForUi: [y], schoolYear: sy }
    }
  }

  const defSy = parseSchoolYear(null, allowed)
  const defY = schoolYearToDbYear(defSy)
  return { allYears: false, yearNum: defY, yearsForUi: [defY], schoolYear: defSy }
}
