import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DataFilters } from '@/components/DataFilters'
import { DataTable } from '@/components/DataTable'
import { ExportMfpCsvButton } from '@/components/ExportMfpCsvButton'
import { REGIONS, PCC_CENTERS } from '@/lib/types'
import { APP_YEAR_STRINGS, APP_YEARS, defaultReportYearString } from '@/lib/app-years'
import { MFP_DATA_LIST_COLUMNS } from '@/lib/encoder-selects'
import { fetchAllRows } from '@/lib/supabase-paginate'

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string
    funded_by?: string
    region?: string
    center?: string
    search?: string
    province?: string
    division?: string
    municipality?: string
    milk_type?: string
    supplier?: string
    date_started_month?: string
    date_completed_month?: string
    input_month?: string
    input_year?: string
  }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,center')
    .eq('id', user.id)
    .single()

  const params = await searchParams

  // Encoders default to current operational year so /data is not a multi-year dump.
  if (profile?.role === 'encoder' && !params.year) {
    const qs = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      if (value) qs.set(key, value)
    }
    qs.set('year', defaultReportYearString())
    redirect(`/data?${qs.toString()}`)
  }

  const listYear =
    params.year && params.year !== '__ALL_YEARS__'
      ? Number(params.year)
      : null

  function buildListQuery() {
    let query = supabase
      .from('mfp_data')
      .select(MFP_DATA_LIST_COLUMNS)
      .gte('year', APP_YEARS[0] ?? 2026)
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })

    if (profile?.role === 'encoder' && profile?.center) {
      query = query.eq('center', profile.center)
    }

    if (params.search) {
      query = query.or(
        `center.ilike.%${params.search}%,province.ilike.%${params.search}%,municipality.ilike.%${params.search}%,elementary_school.ilike.%${params.search}%,division.ilike.%${params.search}%`,
      )
    }

    if (listYear != null && Number.isFinite(listYear)) {
      query = query.eq('year', listYear)
    }
    if (params.date_started_month) {
      const m = params.date_started_month.substring(0, 2)
      if (listYear != null && Number.isFinite(listYear)) {
        const end = new Date(listYear, Number(m), 1).toISOString().split('T')[0]
        query = query.gte('date_started', `${listYear}-${m}-01`).lt('date_started', end)
      } else {
        const years = APP_YEARS
        const orConditions = years
          .map(
            y =>
              `and(date_started.gte.${y}-${m}-01,date_started.lt.${new Date(y, Number(m), 1).toISOString().split('T')[0]})`,
          )
          .join(',')
        query = query.or(orConditions)
      }
    }
    if (params.date_completed_month) {
      const m = params.date_completed_month.substring(0, 2)
      if (listYear != null && Number.isFinite(listYear)) {
        const end = new Date(listYear, Number(m), 1).toISOString().split('T')[0]
        query = query.gte('date_completed', `${listYear}-${m}-01`).lt('date_completed', end)
      } else {
        const years = APP_YEARS
        const orConditions = years
          .map(
            y =>
              `and(date_completed.gte.${y}-${m}-01,date_completed.lt.${new Date(y, Number(m), 1).toISOString().split('T')[0]})`,
          )
          .join(',')
        query = query.or(orConditions)
      }
    }
    if (params.funded_by) query = query.eq('funded_by', params.funded_by)
    if (params.region) query = query.eq('region', params.region)
    if (params.province) query = query.eq('province', params.province)
    if (params.division) query = query.eq('division', params.division)
    if (params.municipality) query = query.eq('municipality', params.municipality)
    if (params.milk_type) query = query.eq('milk_type', params.milk_type)
    if (params.supplier) query = query.eq('supplier_id', params.supplier)
    if (params.center && profile?.role !== 'encoder') query = query.eq('center', params.center)

    if (params.input_month && params.input_year) {
      const startDate = new Date(parseInt(params.input_year, 10), parseInt(params.input_month, 10) - 1, 1)
      const endDate = new Date(parseInt(params.input_year, 10), parseInt(params.input_month, 10), 1)
      query = query.gte('created_at', startDate.toISOString()).lt('created_at', endDate.toISOString())
    }

    return query
  }

  let records: any[] = []
  try {
    records = await fetchAllRows(() => buildListQuery())
  } catch (err) {
    console.error('mfp_data list query failed:', err instanceof Error ? err.message : err)
  }

  // Filter dropdowns from the already-loaded list (no second 5000-row scan).
  const getUnique = (key: string) =>
    Array.from(
      new Set(
        records
          .map(d => d[key])
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0),
      ),
    ).sort()

  const filterOptions = {
    year: [...APP_YEAR_STRINGS, '__ALL_YEARS__'],
    funded_by: ['DepEd', 'DSWD', 'LDS'],
    center: PCC_CENTERS,
    region: REGIONS,
    milk_type: ['PM', 'SMP', 'SM', 'Karabao'],
    province: getUnique('province'),
    division: getUnique('division'),
    municipality: getUnique('municipality'),
    supplier: [],
  }

  const syncYear = listYear ?? APP_YEARS[0] ?? 2026
  const syncCenter =
    profile?.role === 'encoder' && profile?.center
      ? profile.center
      : params.center || null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">MFP Data</h1>
          <p className="page-subtitle">
            {records?.length ?? 0} record(s) found
            {profile?.role === 'encoder' && profile?.center && ` · ${profile.center} only`}
            {listYear != null && Number.isFinite(listYear) ? ` · year ${listYear}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <ExportMfpCsvButton
            records={records ?? []}
            centerLabel={
              profile?.role === 'encoder' && profile?.center
                ? profile.center
                : params.center || null
            }
            yearLabel={listYear}
          />
        </div>
      </div>

      <DataFilters filterOptions={filterOptions} />

      <DataTable
        records={records ?? []}
        resyncDelivery={
          syncCenter
            ? {
                center: syncCenter,
                year: syncYear,
              }
            : null
        }
        resyncProgram={
          syncCenter
            ? {
                center: syncCenter,
                year: syncYear,
                program: 'dswd',
              }
            : null
        }
      />

      {records?.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            color: 'var(--gray-400)',
            background: 'white',
            borderRadius: 12,
            border: '1px solid var(--gray-200)',
            marginTop: '-1rem',
            borderTop: 'none',
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
          }}
        >
          No records found matching your filters.
        </div>
      )}
    </div>
  )
}
