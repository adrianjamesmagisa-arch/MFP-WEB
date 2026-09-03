/** App keeps operational data from this calendar year onward only. */
export const MIN_DATA_YEAR = 2026

/** Year options for MFP / report filters (calendar years). */
export const APP_YEARS: number[] = (() => {
  const max = Math.max(new Date().getFullYear() + 1, MIN_DATA_YEAR)
  const out: number[] = []
  for (let y = MIN_DATA_YEAR; y <= max; y++) out.push(y)
  return out
})()

export const APP_YEAR_STRINGS = APP_YEARS.map(String)
