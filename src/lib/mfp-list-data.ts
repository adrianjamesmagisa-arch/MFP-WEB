import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { APP_YEARS } from '@/lib/app-years'
import { mfpCenterAliases } from '@/lib/center-aliases'
import { MFP_DATA_LIST_COLUMNS } from '@/lib/encoder-selects'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { filterValues, filterYears, mfpDateIntervals, mfpSchoolYearIntervals, type MfpListFilters } from '@/lib/mfp-list-filters'
import { includesSbfpSource, is2026Deped, loadSbfpSourceRows, type MfpListRow } from '@/lib/mfp-sbfp-source'

/** The page and analytics use the same authorized, source-backed list. No privileged client. */
export async function loadMfpListRows(supabase: SupabaseClient,
  profile: { role: string; center?: string | null }, params: MfpListFilters): Promise<MfpListRow[]> {
  if (profile.role === 'encoder' && !profile.center?.trim()) throw new Error('An encoder center is required.')
  const years = filterYears(params.year)
  const schoolYears = mfpSchoolYearIntervals(params.school_year)
  const buildQuery = () => {
    let query = supabase.from('mfp_data').select(MFP_DATA_LIST_COLUMNS)
      .gte('year', APP_YEARS[0] ?? 2026).order('year', { ascending: false })
      .order('created_at', { ascending: false }).order('id', { ascending: false })
    if (profile.role === 'encoder' && profile.center) query = query.in('center', mfpCenterAliases(profile.center))
    if (params.search) {
      // Quoted PostgREST values keep punctuation in a search from becoming filter syntax.
      const term = params.search.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
      query = query.or(['center', 'province', 'municipality', 'elementary_school', 'division']
        .map(field => `${field}.ilike."%${term}%"`).join(','))
    }
    if (years.length) query = query.in('year', years)
    if (schoolYears.length === 1) query = query.gte('date_started', schoolYears[0].start).lt('date_started', schoolYears[0].end)
    else if (schoolYears.length) query = query.or(schoolYears.map(iv => `and(date_started.gte.${iv.start},date_started.lt.${iv.end})`).join(','))
    const dateFilter = (field: 'date_started' | 'date_completed', year?: string, month?: string) => {
      const intervals = mfpDateIntervals(year, month, years.length ? years : APP_YEARS)
      if (intervals.length === 1) query = query.gte(field, intervals[0].start).lt(field, intervals[0].end)
      else if (intervals.length) query = query.or(intervals.map(iv => `and(${field}.gte.${iv.start},${field}.lt.${iv.end})`).join(','))
    }
    dateFilter('date_started', params.date_started_year, params.date_started_month)
    dateFilter('date_completed', params.date_completed_year, params.date_completed_month)
    for (const field of ['funded_by', 'region', 'province', 'division', 'municipality', 'milk_type', 'supplier', 'center'] as const) {
      if (field === 'center' && profile.role === 'encoder') continue
      let values = filterValues(params[field])
      if (field === 'center') values = [...new Set(values.flatMap(mfpCenterAliases))]
      if (values.length) query = query.in(field === 'supplier' ? 'supplier_id' : field, values)
    }
    if (params.input_month && params.input_year) {
      const start = new Date(Number(params.input_year), Number(params.input_month) - 1, 1)
      const end = new Date(Number(params.input_year), Number(params.input_month), 1)
      query = query.gte('created_at', start.toISOString()).lt('created_at', end.toISOString())
    }
    return query
  }
  const sourceBacked = includesSbfpSource(params)
  const funders = filterValues(params.funded_by)
  const onlySource = years.length === 1 && years[0] === 2026 && funders.length === 1 && funders[0] === 'DepEd'
  const [persisted, schools] = await Promise.all([
    onlySource ? Promise.resolve([]) : fetchAllRows<MfpListRow>(buildQuery),
    sourceBacked ? loadSbfpSourceRows(supabase, profile, params, years.length ? years : APP_YEARS) : Promise.resolve([]),
  ])
  return sourceBacked ? [...persisted.filter(row => !is2026Deped(row)), ...schools] : persisted
}

export function mfpListVersion(records: MfpListRow[]): string {
  return createHash('sha256').update(JSON.stringify(records)).digest('hex')
}
