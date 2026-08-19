import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'
import { SummaryDepEdClient } from './SummaryDepEdClient'

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
    .range(0, 49999)

  // Use dynamic center mapping for NIZ
  let actualCenterFilter = centerFilter
  if (centerFilter === '__ALL_CENTERS__') {
    actualCenterFilter = undefined
  } else if (centerFilter === 'NHQGP (NIZ)') {
    actualCenterFilter = 'NIZ'
  }

  if (actualCenterFilter) query = query.eq('center', actualCenterFilter)
  
  // Year filter: If a specific year is chosen, we ONLY fetch that year.
  // Otherwise, we fetch all years for DepEd.
  let years = [2019, 2020, 2021, 2022, 2023, 2024, 2025]
  if (sp.year && sp.year !== 'All Years') {
    const y = parseInt(sp.year)
    query = query.eq('year', y)
    years = [y]
  }

  let { data: rawData } = await query

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
