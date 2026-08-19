import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'
import { SummaryLdsClient } from './SummaryLdsClient'

export default async function SummaryLDSPage(props: {
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
      cooperatives!supplier_id (
        name
      )
    `)
    .eq('funded_by', 'LDS')
    .range(0, 49999)

  if (centerFilter && centerFilter !== '__ALL_CENTERS__') {
    query = query.eq('center', centerFilter === 'NHQGP (NIZ)' ? 'NIZ' : centerFilter)
  }
  
  // Notice we no longer filter year at the database level if we want ALL years for the matrix columns
  // But wait, if sp.year is present, we still want to show ALL years for the columns? The prompt says: "When All Years is selected: show all available LDS years... When a specific year is selected: Overview shows the matching school-year column... retain the first label column... hide unrelated year columns."
  // So we pass all data, but only pass the `years` array with the selected year if one is selected, or all years if not.
  // Actually, wait, it's better to fetch all years' data so we don't have to worry.
  // But if the query limit is hit, we might have issues. 50k should be enough.

  let { data: rows } = await query

  if (sp.month && rows && sp.month !== '__ALL_MONTHS__') {
    const m = parseInt(sp.month)
    rows = rows.filter(r => r.date_started && (new Date(r.date_started).getMonth() + 1) === m)
  }

  rows = rows ?? []

  // Extract distinct years from data if All Years, otherwise just the selected year
  let years = Array.from(new Set(rows.map(r => r.year))).sort((a,b) => a - b)
  if (sp.year && sp.year !== '__ALL_YEARS__') {
    const y = parseInt(sp.year)
    if (years.includes(y)) {
      years = [y]
    } else {
      years = [y] // User selected a year with no data, let's still show the column
    }
  }

  const mappedRows = rows.map(r => ({
    ...r,
    supplier_name: (r.cooperatives as any)?.name || r.supplier_id || ''
  }))

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: '#b45309' }}>⛪ Summary — LDS</h1>
          <p className="page-subtitle">Latter Day Saints Supplementary Feeding Program</p>
        </div>
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} />
      </div>

      <SummaryLdsClient 
        rows={mappedRows as any}
        years={years}
        centerFilter={centerFilter}
        yearFilter={sp.year}
        monthFilter={sp.month}
      />
    </div>
  )
}

