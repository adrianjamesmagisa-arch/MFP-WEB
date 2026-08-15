'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { Edit2, Trash2 } from 'lucide-react'

export function DataTable({ records }: { records: any[] }) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const toggleSelectAll = () => {
    if (selectedIds.size === records.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(records.map(r => r.id)))
    }
  }

  const toggleRow = (id: string) => {
    const newSet = new Set(selectedIds)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedIds(newSet)
  }

  const handleBulkEdit = () => {
    sessionStorage.setItem('bulkEditIds', JSON.stringify(Array.from(selectedIds)))
    router.push('/data/bulk-edit')
  }

  return (
    <>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 260px)' }}>
          <table className="data-table" style={{ minWidth: 2400, fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {/* CHECKBOX */}
                <th className="col-check" style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 40, width: 40 }}>
                  <input type="checkbox" checked={records.length > 0 && selectedIds.size === records.length} onChange={toggleSelectAll} style={{ cursor: 'pointer' }} />
                </th>
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
                <tr key={r.id} style={{ background: selectedIds.has(r.id) ? '#e0e7ff' : undefined }}>
                  {/* CHECKBOX */}
                  <td className="col-check" style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleRow(r.id)} style={{ cursor: 'pointer' }} />
                  </td>
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
      
      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--navy)',
          color: 'white',
          padding: '0.75rem 1.5rem',
          borderRadius: '50px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          zIndex: 50
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {selectedIds.size} row{selectedIds.size > 1 ? 's' : ''} selected
          </span>
          <button onClick={handleBulkEdit} className="btn btn-gold" style={{ padding: '0.5rem 1rem', borderRadius: '50px' }}>
            <Edit2 size={16} /> Bulk Edit
          </button>
        </div>
      )}
    </>
  )
}
