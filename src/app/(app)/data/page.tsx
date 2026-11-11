import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DataFilters } from '@/components/DataFilters'
import { DataTable } from '@/components/DataTable'
import { ExportMfpCsvButton } from '@/components/ExportMfpCsvButton'
import { MfpAiAgent } from '@/components/MfpAiAgent'
import { MfpAnalysisScope } from '@/components/MfpAnalysisScope'
import { loadMfpListRows, mfpListVersion } from '@/lib/mfp-list-data'
import { REGIONS, PCC_CENTERS } from '@/lib/types'
import { APP_YEAR_STRINGS, APP_YEARS, defaultReportYearString } from '@/lib/app-years'
import { getCurrentUser } from '@/lib/auth-session'
import { isNizFamily } from '@/lib/center-aliases'
import type { MfpListFilters } from '@/lib/mfp-list-filters'
import { includesSbfpSource, type MfpListRow } from '@/lib/mfp-sbfp-source'

export default async function DataPage({
  searchParams,
}: {
  searchParams: Promise<MfpListFilters>
}) {
  const { user, profile } = await getCurrentUser()
  if (!user) redirect('/login')
  if (!profile || (profile.role === 'encoder' && !profile.center?.trim())) {
    return <p role="alert" className="p-6 text-red-700">Could not determine your data access. Ask an administrator to check your profile and assigned center.</p>
  }

  const supabase = await createClient()

  const params = await searchParams

  // Encoders default to current operational year so /data is not a multi-year dump.
  if (
    profile?.role === 'encoder' &&
    !params.year &&
    !params.date_started_year &&
    !params.date_completed_year
  ) {
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

  const sourceBacked = includesSbfpSource(params)
  let records: MfpListRow[] = []
  try {
    records = await loadMfpListRows(supabase, profile, params)
  } catch (err) {
    console.error('MFP list query failed:', err instanceof Error ? err.message : err)
    return <div className="p-6"><h1 className="page-title">MFP Data</h1><p role="alert" className="mt-3 text-red-700">Could not load MFP Data. Refresh to try again. No complete record count is available.</p></div>
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

  const analysisVersion = mfpListVersion(records)
  return (
    <MfpAnalysisScope key={JSON.stringify(params) + analysisVersion} filters={params} version={analysisVersion} rowIds={records.map(row => row.id)}>
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
              date_started_year: params.date_started_year,
              date_started_month: params.date_started_month,
              date_completed_year: params.date_completed_year,
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

      {sourceBacked && (
        <p role="status" className="mb-3 rounded-md border bg-blue-50 px-3 py-2 text-xs text-blue-900">
          2026 DepEd schools come from SBFP Monitoring with “In Masterlist?” checked.
          {' '}Edit school details through the SBFP action.
          {' '}Matching original and Add contracts combine by school and milk type. Beneficiaries use the original contract only; unavailable when no original is in this filtered result.
          {' '}{records.reduce((count, row) => count + (row.missing_source_links ?? (row.mfp_link_status === 'missing' ? 1 : 0)), 0)} source school entry/entries in this result are not yet linked to MFP Data; their available SBFP details are shown.
        </p>
      )}

      <DataTable
        key={`${params.year ?? 'all'}:${params.search ?? ''}:${params.funded_by ?? ''}:${params.center ?? ''}:${params.region ?? ''}:${params.province ?? ''}:${params.division ?? ''}:${params.municipality ?? ''}:${params.milk_type ?? ''}:${params.supplier ?? ''}:${params.date_started_year ?? ''}:${params.date_started_month ?? ''}:${params.date_completed_year ?? ''}:${params.date_completed_month ?? ''}`}
        records={records ?? []}
        readOnly={profile?.role === 'viewer'}
        userRole={profile?.role ?? 'viewer'}
        resyncDelivery={
          syncCenter && !sourceBacked
            ? {
              center: syncCenter,
              year: syncYear,
            }
            : null
        }
        resyncProgram={
          syncCenter && !sourceBacked
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
    </MfpAnalysisScope>
  )
}
