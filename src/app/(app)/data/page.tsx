import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { Plus } from 'lucide-react'
import { DataFilters } from '@/components/DataFilters'
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

      {/* Table — horizontally scrollable, all columns */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <table className="data-table" style={{ minWidth: 2400, fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {/* A-G */}
                <th className="col-year" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 60 }}>A — Year</th>
                <th className="col-funded" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 80 }}>B — Funded By</th>
                <th className="col-region" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 70 }}>C — Region</th>
                <th className="col-center" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 70 }}>D — Center</th>
                <th className="col-prov" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>E — Province</th>
                <th className="col-div" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>F — Division</th>
                <th className="col-muni" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 120 }}>G — Municipality</th>
                <th className="col-school" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 160 }}>H — Elementary School</th>
                {/* I-N auto-calc */}
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>I — Milk Packs</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>J — Total Vol. Req (L)</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>K — Raw Milk (L)</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>L — Whole Milk (kg)</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>M — Skimmed Milk (kg)</th>
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>N — Sugar (kg)</th>
                {/* O-S user inputs */}
                <th style={{ width: 90, minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>O — Feeding Days</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 80 }}>P — Batch</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>Q — Beneficiaries</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>R — Milk Type</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>S — Price (₱)</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 160 }}>T — Supplier</th>
                {/* U-X financial & mode */}
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>U — Milk Cost (₱)</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}>V — Service Fee (₱)</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>W — Total Funds (₱)</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 120 }}>X — Mode of Procurement</th>
                {/* Y-AC Dates */}
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>Y — MOA Signing</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>Z — Fund Transfer</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>AA — Date Started</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>AB — Date Completed</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 100 }}>AC — Liquidation</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>

              {records?.map(r => (
                <tr key={r.id}>
                  {/* A-H */}
                  <td className="col-year" style={{ fontWeight: 700 }}>{r.year}</td>
                  <td className="col-funded">
                    <span className={`badge badge-${r.funded_by?.toLowerCase()}`}>{r.funded_by}</span>
                  </td>
                  <td className="col-region">{r.region}</td>
                  <td className="col-center" style={{ fontWeight: 600, color: 'var(--navy)' }}>{r.center}</td>
                  <td className="col-prov">{r.province}</td>
                  <td className="col-div">{r.division || 'N/A'}</td>
                  <td className="col-muni">{r.municipality || 'N/A'}</td>
                  <td className="col-school">
                    {r.elementary_school || 'N/A'}
                  </td>
                  {/* I-N auto-calc */}
                  <td>{formatNumber(r.milk_packs)}</td>
                  <td>{formatNumber(r.total_volume_requirements)}</td>
                  <td>{formatNumber(r.raw_milk_liters)}</td>
                  <td>{r.whole_milk_kg?.toFixed(2) ?? 'N/A'}</td>
                  <td>{r.skimmed_milk_kg?.toFixed(2) ?? 'N/A'}</td>
                  <td>{r.sugar?.toFixed(2) ?? 'N/A'}</td>
                  {/* O-T user inputs */}
                  <td>{r.feeding_days || 'N/A'}</td>
                  <td>{r.batch || 'N/A'}</td>
                  <td style={{ fontWeight: 600 }}>{formatNumber(r.beneficiaries)}</td>
                  <td>
                    <span className={`badge badge-${r.milk_type?.toLowerCase()}`}>{r.milk_type || 'N/A'}</span>
                  </td>
                  <td>
                    {r.price ? `₱${r.price.toFixed(2)}` : 'N/A'}
                  </td>
                  <td>
                    {(r as any).cooperatives?.name ?? 'N/A'}
                  </td>
                  {/* U-W financial */}
                  <td>
                    {r.milk_cost ? `₱${formatNumber(r.milk_cost)}` : 'N/A'}
                  </td>
                  <td>
                    {r.service_fee ? `₱${formatNumber(r.service_fee)}` : 'N/A'}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {r.total_funds_transferred ? `₱${formatNumber(r.total_funds_transferred)}` : 'N/A'}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.mode_of_procurement || 'N/A'}</td>
                  {/* Dates */}
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.moa_signing_date) || 'N/A'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.fund_transfer_date) || 'N/A'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date_started) || 'N/A'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.date_completed) || 'N/A'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.liquidation_date) || 'N/A'}</td>
                  <td>
                    <Link
                      href={`/data/${r.id}/edit`}
                      className="btn btn-outline"
                      style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem' }}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {records?.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)', background: 'white', borderRadius: 12, border: '1px solid var(--gray-200)', marginTop: '-1rem', borderTop: 'none', borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
          No records found matching your filters.
        </div>
      )}
    </div>
  )
}
