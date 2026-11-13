export type MfpListFilters = Partial<Record<
  'year' | 'school_year' | 'funded_by' | 'region' | 'center' | 'search' | 'province' | 'division' |
  'municipality' | 'milk_type' | 'supplier' | 'date_started_year' | 'date_started_month' |
  'date_completed_year' | 'date_completed_month' | 'input_month' | 'input_year', string>>

export function filterValues(value?: string): string[] {
  return value ? value.split(',').map(item => item.trim()).filter(Boolean) : []
}

export function filterYears(value?: string): number[] {
  return filterValues(value).map(Number).filter(year => Number.isFinite(year) && year > 0)
}

/** School-year membership uses Date Started, inclusive June 1 through April 30. */
export function mfpSchoolYearIntervals(value?: string) {
  if (!value) return []
  if (typeof value !== 'string') throw new Error('Invalid school year filter. Use YYYY-YYYY, with consecutive years.')
  const values = value.split(',').map(item => item.trim())
  if (values.length > 20) throw new Error('Choose at most 20 school years.')
  return [...new Set(values)].map(label => {
    const match = /^(\d{4})-(\d{4})$/.exec(label)
    if (!match || Number(match[1]) < 1000 || Number(match[2]) !== Number(match[1]) + 1) {
      throw new Error('Invalid school year filter. Use YYYY-YYYY, with consecutive years.')
    }
    return { start: `${match[1]}-06-01`, end: `${match[2]}-05-01` }
  })
}

/** Shared intervals for persisted MFP queries and source-backed school filtering. */
export function mfpDateIntervals(yearParam: string | undefined, monthParam: string | undefined, fallbackYears: number[]) {
  const years = filterYears(yearParam)
  const months = filterValues(monthParam).map(value => Number(value.substring(0, 2)))
    .filter(month => Number.isFinite(month) && month >= 1 && month <= 12)
  if (!years.length && !months.length) return []
  const activeYears = years.length ? years : fallbackYears
  const sorted = [...new Set(months)].sort((a, b) => a - b)
  const ranges: Array<{ start: number; end: number }> = []
  for (const month of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && last.end + 1 === month) last.end = month
    else ranges.push({ start: month, end: month })
  }
  if (!ranges.length) ranges.push({ start: 1, end: 12 })
  return activeYears.flatMap(year => ranges.map(range => ({
    start: `${year}-${String(range.start).padStart(2, '0')}-01`,
    end: range.end === 12 ? `${year + 1}-01-01` : `${year}-${String(range.end + 1).padStart(2, '0')}-01`,
  })))
}
