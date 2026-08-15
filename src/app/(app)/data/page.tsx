import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { Plus } from 'lucide-react'
import { DataFilters } from '@/components/DataFilters'
import { DataTable } from '@/components/DataTable'
import { REGIONS, PCC_CENTERS } from '@/lib/types'

export default async function DataPage({
  searchParams
}: {
  searchParams: Promise<{
    year?: string; funded_by?: string; region?: string; center?: string
    search?: string; province?: string; division?: string; municipality?: string
    milk_type?: string; supplier?: string; date_started_month?: string; date_completed_month?: string
    input_month?: string; input_year?: string;
  }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  const params = await searchParams
  let query = supabase
    .from('mfp_data')
    .select('*, cooperatives(name)')
    .order('year', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(300)

  if (profile?.role === 'encoder' && profile?.center) {
    query = query.eq('center', profile.center)
  }

  // Handle Search parameter (multi-column text search)
  if (params.search) {
    query = query.or(`center.ilike.%${params.search}%,province.ilike.%${params.search}%,municipality.ilike.%${params.search}%,elementary_school.ilike.%${params.search}%,division.ilike.%${params.search}%`)
  }

  // Handle specific filter categories
  if (params.year)      query = query.eq('year', Number(params.year))
  if (params.date_started_month) {
    const m = params.date_started_month.substring(0, 2)
    if (params.year) {
      const end = new Date(Number(params.year), Number(m), 1).toISOString().split('T')[0]
      query = query.gte('date_started', `${params.year}-${m}-01`).lt('date_started', end)
    } else {
      const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]
      const orConditions = years.map(y => `and(date_started.gte.${y}-${m}-01,date_started.lt.${new Date(y, Number(m), 1).toISOString().split('T')[0]})`).join(',')
      query = query.or(orConditions)
    }
  }
  if (params.date_completed_month) {
    const m = params.date_completed_month.substring(0, 2)
    if (params.year) {
      const end = new Date(Number(params.year), Number(m), 1).toISOString().split('T')[0]
      query = query.gte('date_completed', `${params.year}-${m}-01`).lt('date_completed', end)
    } else {
      const years = [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027]
      const orConditions = years.map(y => `and(date_completed.gte.${y}-${m}-01,date_completed.lt.${new Date(y, Number(m), 1).toISOString().split('T')[0]})`).join(',')
      query = query.or(orConditions)
    }
  }
  if (params.funded_by) query = query.eq('funded_by', params.funded_by)
  if (params.region)    query = query.eq('region', params.region)
  if (params.province)  query = query.eq('province', params.province)
  if (params.division)  query = query.eq('division', params.division)
  if (params.municipality) query = query.eq('municipality', params.municipality)
  if (params.milk_type) query = query.eq('milk_type', params.milk_type)
  if (params.supplier)  query = query.eq('supplier', params.supplier) // Assumes supplier is mapped correctly or handled in DataFilters
  if (params.center && profile?.role !== 'encoder') query = query.eq('center', params.center)

  if (params.input_month && params.input_year) {
    const startDate = new Date(parseInt(params.input_year), parseInt(params.input_month) - 1, 1)
    const endDate = new Date(parseInt(params.input_year), parseInt(params.input_month), 1)
    query = query
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString())
  }

  const { data: records } = await query

  // Fetch unique filter options for dynamic fields, using a limit to prevent massive payload delays
  let filterQuery = supabase.from('mfp_data').select('province, division, municipality').limit(5000)
  if (profile?.role === 'encoder' && profile?.center) {
    filterQuery = filterQuery.eq('center', profile.center)
  }
  const { data: allData } = await filterQuery

  const getUnique = (key: string) => 
    Array.from(new Set(allData?.map(d => d[key as keyof typeof d]).filter(Boolean) as string[])).sort()

  const filterOptions = {
    year: ['2019', '2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027'],
    funded_by: ['DepEd', 'DSWD', 'LDS'],
    center: PCC_CENTERS,
    region: REGIONS,
    milk_type: ['PM', 'SMP', 'SM', 'Karabao'],
    province: getUnique('province'),
    division: getUnique('division'),
    municipality: getUnique('municipality'),
    supplier: [], // Will require joining cooperatives if supplier is needed
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">MFP Data</h1>
          <p className="page-subtitle">
            {records?.length ?? 0} record(s) found
            {profile?.role === 'encoder' && profile?.center && ` · ${profile.center} only`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link href="/data/new" className="btn btn-gold">
            <Plus size={16} /> Add Record
          </Link>
        </div>
      </div>

      {/* Filters */}
      <DataFilters filterOptions={filterOptions} />

            {/* Table */}
      <DataTable records={records ?? []} />

      {records?.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)', background: 'white', borderRadius: 12, border: '1px solid var(--gray-200)', marginTop: '-1rem', borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
          No records found matching your filters.
        </div>
      )}
    </div>
  )
}
