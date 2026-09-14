import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'
import { SummaryDswdClient } from './SummaryDswdClient'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { resolveReportYearFilter } from '@/lib/report-year'
import { MIN_DATA_YEAR } from '@/lib/app-years'

const DSWD_SELECT = `
  year,
  beneficiaries,
  milk_packs,
  milk_cost,
  total_funds_transferred,
  funded_by,
  center,
  region,
  province,
  municipality,
  date_started,
  feeding_days,
  mode_of_procurement,
  supplier_id,
  milk_type,
  raw_milk_liters,
  cooperatives!supplier_id ( name )
`

export default async function SummaryDSWDPage(props: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>
}) {
  const sp = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()
  const isEncoder = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : sp.center

  const { allYears, yearNum } = resolveReportYearFilter(sp.year)

  let rows = await fetchAllRows<any>(() => {
    let query = supabase
      .from('mfp_data')
      .select(DSWD_SELECT)
      .eq('funded_by', 'DSWD')
      .gte('year', MIN_DATA_YEAR)
    if (!allYears && yearNum != null) query = query.eq('year', yearNum)
    if (centerFilter && centerFilter !== '__ALL_CENTERS__') {
      query = query.eq('center', centerFilter === 'NHQGP (NIZ)' ? 'NIZ' : centerFilter)
    }
    return query
  })

  if (sp.month && rows && sp.month !== '__ALL_MONTHS__') {
    const m = parseInt(sp.month, 10)
    if (Number.isFinite(m)) {
      rows = rows.filter(r => r.date_started && (new Date(r.date_started).getMonth() + 1) === m)
    }
  }

  const mappedRows = rows.map(r => ({
    ...r,
    supplier_name: (r.cooperatives as any)?.name || r.supplier_id || '',
    component: 'milk',
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: '#15803d' }}>🤝 Summary — DSWD</h1>
          <p className="page-subtitle">DSWD Supplementary Feeding Program</p>
        </div>
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} basePath="/reports/summary-dswd" />
      </div>

      <SummaryDswdClient
        rows={mappedRows as any}
        centerFilter={centerFilter}
        yearFilter={allYears ? '__ALL_YEARS__' : String(yearNum)}
        monthFilter={sp.month}
      />
    </div>
  )
}
