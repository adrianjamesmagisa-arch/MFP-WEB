import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'
import { SummaryDepEdClient } from './SummaryDepEdClient'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { mfpCenterAliases, sbfpCenterAliases } from '@/lib/center-aliases'
import { resolveReportYearFilter } from '@/lib/report-year'
import { MIN_DATA_YEAR } from '@/lib/app-years'

const DEPED_SELECT = `
  beneficiaries, milk_packs, milk_cost, total_funds_transferred,
  funded_by, year, center, region, province, division,
  municipality, elementary_school, feeding_days, batch, date_started,
  service_fee, mode_of_procurement, raw_milk_liters, milk_type,
  supplier_id,
  cooperatives ( id, name )
`

export default async function SummaryDepEdPage(props: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>
}) {
  const sp = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()
  const isEncoder = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : sp.center

  const centerAliases =
    centerFilter && centerFilter !== '__ALL_CENTERS__'
      ? [...new Set([...sbfpCenterAliases(centerFilter), ...mfpCenterAliases(centerFilter)])]
      : null

  const { allYears, yearNum, yearsForUi } = resolveReportYearFilter(sp.year)

  let rawData = await fetchAllRows<any>(() => {
    let query = supabase
      .from('mfp_data')
      .select(DEPED_SELECT)
      .eq('funded_by', 'DepEd')
      .gte('year', MIN_DATA_YEAR)
    if (!allYears && yearNum != null) query = query.eq('year', yearNum)
    if (centerAliases?.length === 1) query = query.eq('center', centerAliases[0])
    else if (centerAliases && centerAliases.length > 1) query = query.in('center', centerAliases)
    return query
  })

  if (sp.month && sp.month !== 'All' && sp.month !== '__ALL_MONTHS__' && rawData) {
    const m = parseInt(sp.month, 10)
    if (Number.isFinite(m)) {
      rawData = rawData.filter(r => r.date_started && (new Date(r.date_started).getMonth() + 1) === m)
    }
  }

  const rows = (rawData || []).map((r: any) => ({
    ...r,
    supplier_name: r.cooperatives?.name || r.supplier_id || '',
  }))

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ color: '#1d4ed8' }}>📘 Summary — DepEd</h1>
          <p className="page-subtitle">School-Based Feeding Program · {centerFilter === '__ALL_CENTERS__' ? 'ALL CENTERS' : (centerFilter || 'ALL CENTERS')}</p>
        </div>
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} basePath="/reports/summary-deped" />
      </div>

      <SummaryDepEdClient
        rows={rows}
        years={yearsForUi}
        centerFilter={centerFilter === '__ALL_CENTERS__' ? 'All Centers' : centerFilter}
        yearFilter={allYears ? '__ALL_YEARS__' : String(yearNum)}
        monthFilter={sp.month}
      />
    </div>
  )
}
