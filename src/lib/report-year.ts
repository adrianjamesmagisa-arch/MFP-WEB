import { MIN_DATA_YEAR, APP_YEARS, defaultReportYearString } from '@/lib/app-years'

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
