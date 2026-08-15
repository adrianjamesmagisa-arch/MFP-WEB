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
          <table className="data-table" style={{ minWidth: 2000, fontSize: '0.78rem' }}>
            <thead>
              <tr>
                <th style={{ position: 'sticky', left: 0, zIndex: 10 }}>YEAR</th>
                <th style={{ position: 'sticky', left: 60, zIndex: 10 }}>FUNDED BY</th>
                <th style={{ position: 'sticky', left: 160, zIndex: 10 }}>REGION</th>
                <th style={{ position: 'sticky', left: 240, zIndex: 10 }}>PROVINCE</th>
                <th>DIVISION / SDO</th>
                <th>MUNICIPALITY</th>
                <th>SCHOOL</th>
                <th style={{ textAlign: 'right' }}>BENEFICIARIES</th>
                <th style={{ textAlign: 'center' }}>MILK TYPE</th>
                <th style={{ textAlign: 'right' }}>PRICE</th>
                <th style={{ textAlign: 'right' }}>MILK PACKS</th>
                <th style={{ textAlign: 'right' }}>TOTAL VOLUME (L)</th>
                <th>SUPPLIER</th>
                <th style={{ textAlign: 'right' }}>TOTAL FUNDS</th>
                <th>INPUT DATE</th>
                <th style={{ whiteSpace: 'nowrap' }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {!records || records.length === 0 ? (
                <tr>
                  <td colSpan={15} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    No records found for this masterlist.
                  </td>
                </tr>
              ) : (
                records.map(r => (
                  <tr key={r.id}>
                    <td style={{ position: 'sticky', left: 0, background: 'white', zIndex: 5, borderRight: '1px solid #e2e8f0' }}>{r.year}</td>
                    <td style={{ position: 'sticky', left: 60, background: 'white', zIndex: 5, borderRight: '1px solid #e2e8f0' }}>{r.funded_by}</td>
                    <td style={{ position: 'sticky', left: 160, background: 'white', zIndex: 5, borderRight: '1px solid #e2e8f0' }}>{r.region}</td>
                    <td style={{ position: 'sticky', left: 240, background: 'white', zIndex: 5, borderRight: '2px solid #cbd5e1' }}>{r.province}</td>
                    <td>{r.division}</td>
                    <td>{r.municipality}</td>
                    <td>{r.elementary_school}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatNumber(r.beneficiaries)}</td>
                    <td style={{ textAlign: 'center' }}>{r.milk_type}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(r.price)}</td>
                    <td style={{ textAlign: 'right', background: '#f8fafc' }}>{formatNumber(r.milk_packs)}</td>
                    <td style={{ textAlign: 'right', background: '#f8fafc' }}>{formatNumber(r.total_volume_requirements, 2)}</td>
                    <td style={{ maxWidth: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.cooperatives?.name || ''}>
                      {r.cooperatives?.name || '-'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#047857' }}>{formatCurrency(r.total_funds_transferred)}</td>
                    <td style={{ color: '#64748b' }}>{formatDate(r.created_at)}</td>
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
