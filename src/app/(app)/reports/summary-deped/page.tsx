import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'
import { SummaryDepEdClient } from './SummaryDepEdClient'
import { fetchAllRows } from '@/lib/supabase-paginate'
import { mfpCenterAliases, sbfpCenterAliases } from '@/lib/center-aliases'

export default async function SummaryDepEdPage(props: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>
}) {
  const sp = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isEncoder = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : sp.center

  const centerAliases =
    centerFilter && centerFilter !== '__ALL_CENTERS__'
      ? [...new Set([...sbfpCenterAliases(centerFilter), ...mfpCenterAliases(centerFilter)])]
      : null

  let years = [2026, 2027]
  const yearNum = sp.year && sp.year !== 'All Years' ? parseInt(sp.year, 10) : NaN
  if (Number.isFinite(yearNum)) years = [yearNum]

  let rawData = await fetchAllRows<any>(() => {
    let query = supabase
      .from('mfp_data')
      .select(`
      beneficiaries, milk_packs, milk_cost, total_funds_transferred, 
      funded_by, year, center, region, province, division, 
      municipality, elementary_school, feeding_days, batch, date_started,
      service_fee, mode_of_procurement, raw_milk_liters, milk_type,
      supplier_id,
      cooperatives ( id, name )
    `)
      .eq('funded_by', 'DepEd')
    if (Number.isFinite(yearNum)) query = query.eq('year', yearNum)
    if (centerAliases?.length === 1) query = query.eq('center', centerAliases[0])
    else if (centerAliases && centerAliases.length > 1) query = query.in('center', centerAliases)
    return query
  })

  if (sp.month && sp.month !== 'All' && rawData) {
    const m = parseInt(sp.month)
    rawData = rawData.filter(r => r.date_started && (new Date(r.date_started).getMonth() + 1) === m)
  }

  const rows = (rawData || []).map((r: any) => ({
    ...r,
    supplier_name: r.cooperatives?.name || r.supplier_id || ''
  }))

  return (
    <div>
      <div className="page-header" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h1 className="page-title" style={{ color: '#1d4ed8' }}>📘 Summary — DepEd</h1>
          <p className="page-subtitle">School-Based Feeding Program · {centerFilter === '__ALL_CENTERS__' ? 'ALL CENTERS' : (centerFilter || 'ALL CENTERS')}</p>
        </div>
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} />
      </div>

      <SummaryDepEdClient 
        rows={rows} 
        years={years}
        centerFilter={centerFilter === '__ALL_CENTERS__' ? 'All Centers' : centerFilter}
        yearFilter={sp.year}
        monthFilter={sp.month}
      />
    </div>
  )
}
