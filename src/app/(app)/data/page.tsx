import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DataFilters } from '@/components/DataFilters'
import { DataTable } from '@/components/DataTable'
import { ExportMfpCsvButton } from '@/components/ExportMfpCsvButton'
import { MfpAiAgent } from '@/components/MfpAiAgent'
import { REGIONS, PCC_CENTERS } from '@/lib/types'
import { APP_YEAR_STRINGS, APP_YEARS, defaultReportYearString } from '@/lib/app-years'
import { MFP_DATA_LIST_COLUMNS } from '@/lib/encoder-selects'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { getCurrentUser } from '@/lib/auth-session'
import { isNizFamily, mfpCenterAliases } from '@/lib/center-aliases'

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string        // single year OR comma-separated years e.g. "2025,2026"
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
  const { user, profile } = await getCurrentUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

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

  // Parse year param — may be a single value or comma-separated multi-select
  const rawYearParam = params.year && params.year !== '__ALL_YEARS__' ? params.year : null
  const listYears: number[] = rawYearParam
    ? rawYearParam
      .split(',')
      .map(v => Number(v.trim()))
      .filter(n => Number.isFinite(n) && n > 0)
    : []
  // For display / date-range helpers, use the first selected year (or null)
  const listYear = listYears.length === 1 ? listYears[0] : null

  function buildListQuery() {
    let query = supabase
      .from('mfp_data')
      .select(MFP_DATA_LIST_COLUMNS)
      .gte('year', APP_YEARS[0] ?? 2026)
      .order('year', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })

    if (profile?.role === 'encoder' && profile?.center) {
      const aliases = mfpCenterAliases(profile.center)
      if (aliases.length === 1) query = query.eq('center', aliases[0])
      else if (aliases.length > 1) query = query.in('center', aliases)
    }

    if (params.search) {
      query = query.or(
        `center.ilike.%${params.search}%,province.ilike.%${params.search}%,municipality.ilike.%${params.search}%,elementary_school.ilike.%${params.search}%,division.ilike.%${params.search}%`,
      )
    }

    if (listYears.length === 1) {
      query = query.eq('year', listYears[0])
    } else if (listYears.length > 1) {
      query = query.in('year', listYears)
    }
    const targetYears = listYears.length > 0 ? listYears : APP_YEARS

    if (params.date_started_month) {
      const startedMonths = params.date_started_month
        .split(',')
        .map(v => v.trim().substring(0, 2))
        .filter(m => /^\d{2}$/.test(m))

      if (startedMonths.length === 1 && targetYears.length === 1) {
        const y = targetYears[0]
        const m = Number(startedMonths[0])
        const start = `${y}-${String(m).padStart(2, '0')}-01`
        const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
        query = query.gte('date_started', start).lt('date_started', end)
      } else if (startedMonths.length > 0) {
        const orConditions = targetYears
          .flatMap(y =>
            startedMonths.map(mStr => {
              const m = Number(mStr)
              const start = `${y}-${String(m).padStart(2, '0')}-01`
              const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
              return `and(date_started.gte.${start},date_started.lt.${end})`
            }),
          )
          .join(',')
        if (orConditions) {
          query = query.or(orConditions)
        }
      }
    }

    if (params.date_completed_month) {
      const completedMonths = params.date_completed_month
        .split(',')
        .map(v => v.trim().substring(0, 2))
        .filter(m => /^\d{2}$/.test(m))

      if (completedMonths.length === 1 && targetYears.length === 1) {
        const y = targetYears[0]
        const m = Number(completedMonths[0])
        const start = `${y}-${String(m).padStart(2, '0')}-01`
        const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
        query = query.gte('date_completed', start).lt('date_completed', end)
      } else if (completedMonths.length > 0) {
        const orConditions = targetYears
          .flatMap(y =>
            completedMonths.map(mStr => {
              const m = Number(mStr)
              const start = `${y}-${String(m).padStart(2, '0')}-01`
              const end = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
              return `and(date_completed.gte.${start},date_completed.lt.${end})`
            }),
          )
          .join(',')
        if (orConditions) {
          query = query.or(orConditions)
        }
      }
    }

    const applyMulti = (col: string, val: string | undefined) => {
      if (!val) return
      const arr = val.split(',').map(s => s.trim()).filter(Boolean)
      if (col === 'center') {
        const expanded = Array.from(new Set(arr.flatMap(c => mfpCenterAliases(c))))
        if (expanded.length === 1) {
          query = query.eq(col, expanded[0])
        } else if (expanded.length > 1) {
          query = query.in(col, expanded)
        }
        return
      }
      if (arr.length === 1) {
        query = query.eq(col, arr[0])
      } else if (arr.length > 1) {
        query = query.in(col, arr)
      }
    }

    applyMulti('funded_by', params.funded_by)
    applyMulti('region', params.region)
    applyMulti('province', params.province)
    applyMulti('division', params.division)
    applyMulti('municipality', params.municipality)
    applyMulti('milk_type', params.milk_type)
    applyMulti('supplier_id', params.supplier)
    if (profile?.role !== 'encoder') {
      applyMulti('center', params.center)
    }

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
  const getUnique = (key: string, currentVal?: string) => {
    const selected = currentVal ? currentVal.split(',').map(s => s.trim()).filter(Boolean) : []
    const fromRecords = records
      .map(d => d[key])
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    return Array.from(new Set([...fromRecords, ...selected])).sort()
  }

  const filterOptions = {
    year: [...APP_YEAR_STRINGS, '__ALL_YEARS__'],
    funded_by: ['DepEd', 'DSWD', 'LDS'],
    center: PCC_CENTERS,
    region: REGIONS,
    milk_type: ['PM', 'SMP', 'SM', 'Karabao'],
    province: getUnique('province', params.province),
    division: getUnique('division', params.division),
    municipality: getUnique('municipality', params.municipality),
    supplier: [],
  }

  const syncYear = listYear ?? APP_YEARS[0] ?? 2026
  const syncCenter =
    profile?.role === 'encoder' && profile?.center
      ? (isNizFamily(profile.center) ? 'NHQ' : profile.center)
      : params.center && !params.center.includes(',')
        ? (isNizFamily(params.center) ? 'NHQ' : params.center)
        : null

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">MFP Data</h1>
          <p className="page-subtitle">
            {records?.length ?? 0} record(s) found
            {profile?.role === 'encoder' && profile?.center && ` · ${profile.center} only`}
            {listYears.length > 0 ? ` · year${listYears.length > 1 ? 's' : ''} ${listYears.join(', ')}` : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <MfpAiAgent
            records={records ?? []}
            centerLabel={
              profile?.role === 'encoder' && profile?.center
                ? profile.center
                : params.center || null
            }
            yearLabel={listYear}
            activeFilters={{
              year: params.year,
              funded_by: params.funded_by,
              region: params.region,
              center: params.center,
              province: params.province,
              division: params.division,
              municipality: params.municipality,
              milk_type: params.milk_type,
              date_started_month: params.date_started_month,
              date_completed_month: params.date_completed_month,
              search: params.search,
            }}
          />
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
        key={`${params.year ?? 'all'}:${params.search ?? ''}:${params.funded_by ?? ''}:${params.center ?? ''}:${params.region ?? ''}:${params.province ?? ''}:${params.division ?? ''}:${params.municipality ?? ''}:${params.milk_type ?? ''}:${params.supplier ?? ''}:${params.date_started_month ?? ''}:${params.date_completed_month ?? ''}`}
        records={records ?? []}
        readOnly={profile?.role === 'viewer'}
        userRole={profile?.role ?? 'viewer'}
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
