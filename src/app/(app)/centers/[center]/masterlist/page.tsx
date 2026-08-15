import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { format } from 'date-fns'

export default async function CenterMasterlistPage({ 
  params, 
  searchParams 
}: { 
  params: Promise<{ center: string }>,
  searchParams: Promise<{ month?: string, year?: string, data_year?: string }> 
}) {
  const { center } = await params
  const decodedCenter = decodeURIComponent(center)
  const sp = await searchParams
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user?.id).single()

  if (profile?.role === 'encoder' && profile?.center !== decodedCenter) {
    redirect('/dashboard')
  }

  let query = supabase.from('mfp_data').select('*, cooperatives(name)').eq('center', decodedCenter).order('created_at', { ascending: false })

  let listTitle = `${decodedCenter} Masterlist`

  if (sp.data_year) {
    query = query.eq('year', parseInt(sp.data_year))
    listTitle = `${decodedCenter} - FY ${sp.data_year} Masterlist`
  } else if (sp.month && sp.year) {
    // Filter by created_at month and year
    // Since Supabase doesn't easily let us extract month from timestamp in JS client without RPC,
    // we use a date range: greater than or equal to first of month, less than first of next month
    const startDate = new Date(parseInt(sp.year), parseInt(sp.month) - 1, 1)
    const endDate = new Date(parseInt(sp.year), parseInt(sp.month), 1) // 1st of next month
    
    query = query
      .gte('created_at', startDate.toISOString())
      .lt('created_at', endDate.toISOString())
      
    listTitle = `${decodedCenter} - ${format(startDate, 'MMMM yyyy')} Inputs`
  }

  const { data: records } = await query

  return (
    <div>
      <div className="page-header">
        <div>
          <Link href={`/centers/${encodeURIComponent(decodedCenter)}`} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', color: '#64748b', textDecoration: 'none', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
            <ChevronLeft size={14} /> Back to {decodedCenter}
          </Link>
          <h1 className="page-title">{listTitle}</h1>
          <p className="page-subtitle">{records?.length || 0} consolidated records found for this period</p>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 200px)' }}>
          <table className="data-table" style={{ minWidth: 2400, fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {/* A-G */}
                <th className="col-year" style={{ whiteSpace: 'nowrap' }}>A — Year</th>
                <th className="col-funded" style={{ whiteSpace: 'nowrap' }}>B — Funded By</th>
                <th className="col-region" style={{ whiteSpace: 'nowrap' }}>C — Region</th>
                <th className="col-center" style={{ whiteSpace: 'nowrap' }}>D — Center</th>
                <th className="col-prov" style={{ whiteSpace: 'nowrap' }}>E — Province</th>
                <th className="col-div" style={{ whiteSpace: 'nowrap' }}>F — Division</th>
                <th style={{ whiteSpace: 'nowrap' }}>G — Municipality</th>
                <th style={{ whiteSpace: 'nowrap' }}>H — Elementary School</th>
                {/* H-M auto-calc */}
                <th style={{ whiteSpace: 'nowrap' }}>I — Milk Packs</th>
                <th style={{ whiteSpace: 'nowrap' }}>J — Total Vol. Req (L)</th>
                <th style={{ whiteSpace: 'nowrap' }}>K — Raw Milk (L)</th>
                <th style={{ whiteSpace: 'nowrap' }}>L — Whole Milk (kg)</th>
                <th style={{ whiteSpace: 'nowrap' }}>M — Skimmed Milk (kg)</th>
                <th style={{ whiteSpace: 'nowrap' }}>N — Sugar (kg)</th>
                {/* N-S user inputs */}
                <th style={{ whiteSpace: 'nowrap' }}>O — Feeding Days</th>
                <th style={{ whiteSpace: 'nowrap' }}>P — Batch</th>
                <th style={{ whiteSpace: 'nowrap' }}>Q — Beneficiaries</th>
                <th style={{ whiteSpace: 'nowrap' }}>R — Milk Type</th>
                <th style={{ whiteSpace: 'nowrap' }}>S — Price (₱)</th>
                <th style={{ whiteSpace: 'nowrap' }}>T — Supplier</th>
                {/* T-V financial */}
                <th style={{ whiteSpace: 'nowrap' }}>U — Milk Cost (₱)</th>
                <th style={{ whiteSpace: 'nowrap' }}>V — Service Fee (₱)</th>
                <th style={{ whiteSpace: 'nowrap' }}>W — Total Funds (₱)</th>
                <th style={{ whiteSpace: 'nowrap' }}>X — Mode of Procurement</th>
                {/* Dates */}
                <th style={{ whiteSpace: 'nowrap' }}>Y — MOA Signing</th>
                <th style={{ whiteSpace: 'nowrap' }}>Z — Fund Transfer</th>
                <th style={{ whiteSpace: 'nowrap' }}>AA — Date Started</th>
                <th style={{ whiteSpace: 'nowrap' }}>AB — Date Completed</th>
                <th style={{ whiteSpace: 'nowrap' }}>AC — Liquidation</th>
                <th style={{ whiteSpace: 'nowrap' }}>Actions</th>
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
                  <td>{r.municipality || 'N/A'}</td>
                  <td>
                    {r.elementary_school || 'N/A'}
                  </td>
                  {/* I-N auto-calc */}
                  <td style={{ textAlign: 'right' }}>{formatNumber(r.milk_packs)}</td>
                  <td style={{ textAlign: 'right' }}>{formatNumber(r.total_volume_requirements)}</td>
                  <td style={{ textAlign: 'right' }}>{formatNumber(r.raw_milk_liters)}</td>
                  <td style={{ textAlign: 'right' }}>{r.whole_milk_kg?.toFixed(2) ?? 'N/A'}</td>
                  <td style={{ textAlign: 'right' }}>{r.skimmed_milk_kg?.toFixed(2) ?? 'N/A'}</td>
                  <td style={{ textAlign: 'right' }}>{r.sugar?.toFixed(2) ?? 'N/A'}</td>
                  {/* O-T user inputs */}
                  <td style={{ textAlign: 'center' }}>{r.feeding_days || 'N/A'}</td>
                  <td style={{ textAlign: 'center' }}>{r.batch || 'N/A'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNumber(r.beneficiaries)}</td>
                  <td>
                    <span className={`badge badge-${r.milk_type?.toLowerCase()}`}>{r.milk_type || 'N/A'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {r.price ? `₱${r.price.toFixed(2)}` : 'N/A'}
                  </td>
                  <td>
                    {(r as any).cooperatives?.name ?? 'N/A'}
                  </td>
                  {/* U-W financial */}
                  <td style={{ textAlign: 'right' }}>
                    {r.milk_cost ? `₱${formatNumber(r.milk_cost)}` : 'N/A'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {r.service_fee ? `₱${formatNumber(r.service_fee)}` : 'N/A'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
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
    </div>
  )
}
