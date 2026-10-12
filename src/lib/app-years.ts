/** Earliest year stored in mfp_data (historical archive). Used by the MFP Data page only. */
export const MIN_DATA_YEAR = 2019

/**
 * Earliest year used by reports / dashboards / summary pages.
 * Historical 2019-2025 records are archived in MFP Data only and must NOT appear in report aggregations.
 */
export const REPORT_MIN_YEAR = 2026

/** Year options for MFP Data page (includes historical archive: 2019..now+1). */
export const APP_YEARS: number[] = (() => {
  const max = Math.max(new Date().getFullYear() + 1, REPORT_MIN_YEAR)
  const out: number[] = []
  for (let y = MIN_DATA_YEAR; y <= max; y++) out.push(y)
  return out
})()

export const APP_YEAR_STRINGS = APP_YEARS.map(String)

/** Year options for Reports & Monitoring dashboards (operational only: 2026..now+1). */
export const REPORT_YEARS: number[] = APP_YEARS.filter(y => y >= REPORT_MIN_YEAR)
export const REPORT_YEAR_STRINGS = REPORT_YEARS.map(String)

/** Default calendar year for report filters when URL has no year (always 2026+). */
export function defaultReportYearString(): string {
  const y = new Date().getFullYear()
  if (REPORT_YEAR_STRINGS.includes(String(y))) return String(y)
  return String(REPORT_MIN_YEAR)
}
