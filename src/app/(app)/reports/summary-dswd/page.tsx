import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'
import { SummaryDswdClient } from './SummaryDswdClient'
import { resolveReportYearFilter } from '@/lib/report-year'
import { loadDswdMonitoringSummaryRows } from '@/lib/dswd-monitoring-report'

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

  const month =
    sp.month && sp.month !== '__ALL_MONTHS__' ? parseInt(sp.month, 10) : undefined
  const monthNum = month != null && Number.isFinite(month) ? month : undefined

  const mappedRows = await loadDswdMonitoringSummaryRows(supabase, {
    year: allYears ? undefined : yearNum ?? undefined,
    month: monthNum,
    center: centerFilter,
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: '#15803d' }}>🤝 Summary — DSWD</h1>
          <p className="page-subtitle">
            DSWD Supplementary Feeding Program — data from DSWD program monitoring (municipal drop-offs), not the MFP masterlist.
          </p>
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
