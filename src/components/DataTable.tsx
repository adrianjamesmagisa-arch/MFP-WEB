'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { Edit2, Trash2 } from 'lucide-react'
import { Spinner } from '@/components/loading/Spinner'
import { useAsyncTask } from '@/components/loading/AsyncFeedback'

function EditableCell({ id, field, value, type = 'text', className, style, format, render, onSave }: { id: string, field: string, value: any, type?: string, className?: string, style?: any, format?: (v: any) => any, render?: (v: any) => any, onSave?: (id: string, field: string, oldVal: any, newVal: any) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [val, setVal] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const supabase = createClient();

  useEffect(() => {
    setVal(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const save = async () => {
    if (val === value) {
      setIsEditing(false);
      return;
    }
    setIsSaving(true);
    let saveVal = val;
    if (type === 'number') {
      saveVal = val === '' ? null : Number(val);
    }
    try {
      const { error } = await supabase.from('mfp_data').update({ [field]: saveVal }).eq('id', id);
      if (error) throw error;
      setIsEditing(false);
      if (onSave) onSave(id, field, value, saveVal);
    } catch (e) {
      console.error('Error saving:', e);
      setVal(value); // revert
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      save();
    }
    if (e.key === 'Escape') {
      setVal(value);
      setIsEditing(false);
    }
  }

  if (isEditing) {
    return (
      <td className={className} style={{ ...style, padding: '2px', background: '#fff' }}>
        <input
          ref={inputRef as any}
          type={type}
          value={val ?? ''}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={handleKeyDown}
          disabled={isSaving}
          style={{ width: '100%', height: '100%', border: '1px solid #3b82f6', outline: 'none', padding: '2px 4px', fontSize: 'inherit', boxSizing: 'border-box' }}
        />
      </td>
    )
  }

  return (
    <td 
      className={className} 
      style={{ ...style, cursor: 'text', position: 'relative', opacity: isSaving ? 0.85 : 1 }} 
      onClick={() => !isSaving && setIsEditing(true)}
    >
      {(val === null || val === undefined || val === '') ? 'N/A' : render ? render(val) : format ? format(val) : val}
      {isSaving && (
        <div className="cell-saving-overlay">
          <Spinner size={12} />
        </div>
      )}
    </td>
  )
}

export function DataTable({
  records,
  resyncDelivery,
}: {
  records: any[]
  resyncDelivery?: { center: string; year: number } | null
}) {
  const router = useRouter()
  const supabase = createClient()
  const runTask = useAsyncTask('Syncing delivery totals…')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [localRecords, setLocalRecords] = useState(records)
  const [undoStack, setUndoStack] = useState<any[]>([])
  const [redoStack, setRedoStack] = useState<any[]>([])

  useEffect(() => {
    setLocalRecords(records)
  }, [records])

  const displayRecords = useMemo(() => {
    return [...localRecords].sort((a, b) => {
      const y = (Number(b.year) || 0) - (Number(a.year) || 0)
      if (y !== 0) return y
      const c = String(a.center || '').localeCompare(String(b.center || ''))
      if (c !== 0) return c
      const d = String(a.division || '').localeCompare(String(b.division || ''))
      if (d !== 0) return d
      return String(a.elementary_school || '').localeCompare(String(b.elementary_school || ''))
    })
  }, [localRecords])

  // SDO-level AD/AE (one target + delivered total per year+center+division)
  const divisionDelivery = useMemo(() => {
    const keyData: Record<string, { target: number; delivered: number }> = {}
    displayRecords.forEach(r => {
      const key = `${r.year}|${r.center}|${r.division}`
      if (!keyData[key]) keyData[key] = { target: 0, delivered: 0 }
      const t = Number(r.target_milk_packs_to_deliver) || 0
      const d = Number(r.total_milk_packs_delivered) || 0
      if (t > keyData[key].target) keyData[key].target = t
      if (d > keyData[key].delivered) keyData[key].delivered = d
    })
    return keyData
  }, [displayRecords])

  // One merged AD/AE block per consecutive SDO group (Excel-style), using division totals.
  const divisionRowSpan = useMemo(() => {
    const result: { firstInGroup: boolean; rowspan: number; target: number; delivered: number }[] = []
    let i = 0
    while (i < displayRecords.length) {
      const r = displayRecords[i]
      const key = `${r.year}|${r.center}|${r.division}`
      let span = 1
      while (i + span < displayRecords.length) {
        const nr = displayRecords[i + span]
        if (`${nr.year}|${nr.center}|${nr.division}` === key) span++
        else break
      }
      const data = divisionDelivery[key] ?? { target: 0, delivered: 0 }
      result.push({ firstInGroup: true, rowspan: span, ...data })
      for (let j = 1; j < span; j++) {
        result.push({ firstInGroup: false, rowspan: 0, ...data })
      }
      i += span
    }
    return result
  }, [displayRecords, divisionDelivery])

  useEffect(() => {
    if (!resyncDelivery?.center || !resyncDelivery?.year) return
    const storageKey = `mfp-delivery-resync:${resyncDelivery.center}:${resyncDelivery.year}`
    if (typeof window !== 'undefined' && sessionStorage.getItem(storageKey)) return
    let cancelled = false
    ;(async () => {
      try {
        await runTask(
          async () => {
            const res = await fetch('/api/sbfp/sync-dropoff', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'resync-center-delivery',
                center: resyncDelivery.center,
                year: resyncDelivery.year,
              }),
            })
            if (!res.ok || cancelled) return
            sessionStorage.setItem(storageKey, '1')
            router.refresh()
          },
          'Syncing delivery totals…',
          { blocking: true },
        )
      } catch {
        // ignore — table still shows best available DB values
      }
    })()
    return () => { cancelled = true }
  }, [resyncDelivery?.center, resyncDelivery?.year, router])

  const handleCellSave = (id: string, field: string, oldVal: any, newVal: any) => {
    setLocalRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: newVal } : r))
    setUndoStack(prev => [...prev, { id, field, oldVal, newVal }])
    setRedoStack([])
  }

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          // Redo
          if (redoStack.length === 0) return;
          const action = redoStack[redoStack.length - 1];
          setRedoStack(prev => prev.slice(0, -1));
          await supabase.from('mfp_data').update({ [action.field]: action.newVal }).eq('id', action.id);
          setLocalRecords(prev => prev.map(r => r.id === action.id ? { ...r, [action.field]: action.newVal } : r));
          setUndoStack(prev => [...prev, action]);
        } else {
          // Undo
          if (undoStack.length === 0) return;
          const action = undoStack[undoStack.length - 1];
          setUndoStack(prev => prev.slice(0, -1));
          await supabase.from('mfp_data').update({ [action.field]: action.oldVal }).eq('id', action.id);
          setLocalRecords(prev => prev.map(r => r.id === action.id ? { ...r, [action.field]: action.oldVal } : r));
          setRedoStack(prev => [...prev, action]);
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        if (redoStack.length === 0) return;
        const action = redoStack[redoStack.length - 1];
        setRedoStack(prev => prev.slice(0, -1));
        await supabase.from('mfp_data').update({ [action.field]: action.newVal }).eq('id', action.id);
        setLocalRecords(prev => prev.map(r => r.id === action.id ? { ...r, [action.field]: action.newVal } : r));
        setUndoStack(prev => [...prev, action]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack]);


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
          <table className="data-table" style={{ minWidth: 2700, fontSize: '0.78rem' }}>
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
                {/* AD-AE Delivery tracking */}
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 110 }}>AD — Target Milk Packs to Deliver</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 110 }}>AE — Total Milk Packs Delivered</th>
                <th style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 80 }}>Actions</th>
              </tr>
            </thead>
                        <tbody>
              {displayRecords?.map((r, rIdx) => (
                <tr key={r.id} style={{ background: selectedIds.has(r.id) ? '#e0e7ff' : undefined }}>
                  <td className="col-check" style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleRow(r.id)} style={{ cursor: 'pointer' }} />
                  </td>
                  <EditableCell onSave={handleCellSave} id={r.id} field="year" value={r.year} type="number" className="col-year" style={{ fontWeight: 700 }} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="funded_by" value={r.funded_by} className="col-funded" render={v => <span className={'badge badge-' + (v?.toLowerCase() || '')}>{v}</span>} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="region" value={r.region} className="col-region" />
                  <EditableCell onSave={handleCellSave} id={r.id} field="center" value={r.center} className="col-center" style={{ fontWeight: 600, color: 'var(--navy)' }} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="province" value={r.province} className="col-prov" />
                  <EditableCell onSave={handleCellSave} id={r.id} field="division" value={r.division} className="col-div" />
                  <EditableCell onSave={handleCellSave} id={r.id} field="municipality" value={r.municipality} className="col-muni" />
                  <EditableCell onSave={handleCellSave} id={r.id} field="elementary_school" value={r.elementary_school} className="col-school" />
                  
                  <EditableCell onSave={handleCellSave} id={r.id} field="milk_packs" value={r.milk_packs} type="number" format={formatNumber} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="total_volume_requirements" value={r.total_volume_requirements} type="number" format={formatNumber} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="raw_milk_liters" value={r.raw_milk_liters} type="number" format={formatNumber} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="whole_milk_kg" value={r.whole_milk_kg} type="number" format={v => v?.toFixed(2) ?? 'N/A'} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="skimmed_milk_kg" value={r.skimmed_milk_kg} type="number" format={v => v?.toFixed(2) ?? 'N/A'} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="sugar" value={r.sugar} type="number" format={v => v?.toFixed(2) ?? 'N/A'} />
                  
                  <EditableCell onSave={handleCellSave} id={r.id} field="feeding_days" value={r.feeding_days} type="number" />
                  <EditableCell onSave={handleCellSave} id={r.id} field="batch" value={r.batch} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="beneficiaries" value={r.beneficiaries} type="number" format={formatNumber} style={{ fontWeight: 600 }} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="milk_type" value={r.milk_type} render={v => <span className={'badge badge-' + (v?.toLowerCase() || '')}>{v || 'N/A'}</span>} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="price" value={r.price} type="number" format={v => v ? '₱' + v.toFixed(2) : 'N/A'} />
                  
                  <td>{(r as any).cooperatives?.name ?? 'N/A'}</td>
                  
                  <EditableCell onSave={handleCellSave} id={r.id} field="milk_cost" value={r.milk_cost} type="number" format={v => v ? '₱' + formatNumber(v) : 'N/A'} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="service_fee" value={r.service_fee} type="number" format={v => v ? '₱' + formatNumber(v) : 'N/A'} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="total_funds_transferred" value={r.total_funds_transferred} type="number" format={v => v ? '₱' + formatNumber(v) : 'N/A'} style={{ fontWeight: 600 }} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="mode_of_procurement" value={r.mode_of_procurement} />
                  
                  <EditableCell onSave={handleCellSave} id={r.id} field="moa_signing" value={r.moa_signing} type="date" format={formatDate} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="fund_transfer" value={r.fund_transfer} type="date" format={formatDate} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="date_started" value={r.date_started} type="date" format={formatDate} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="date_completed" value={r.date_completed} type="date" format={formatDate} />
                  <EditableCell onSave={handleCellSave} id={r.id} field="liquidation" value={r.liquidation} type="date" format={formatDate} />

                  {/* AD/AE — one merged cell per SDO (division), like Excel */}
                  {(() => {
                    const info = divisionRowSpan[rIdx]
                    if (!info?.firstInGroup) return null
                    const { rowspan, target, delivered } = info
                    const pct = target > 0 ? Math.round((delivered / target) * 100) : null
                    const pctColor =
                      pct === null ? '#6b7280' : pct >= 100 ? '#16a34a' : pct >= 75 ? '#d97706' : '#dc2626'
                    const cellStyle: React.CSSProperties = {
                      textAlign: 'right',
                      fontSize: '0.78rem',
                      verticalAlign: 'middle',
                      borderLeft: '2px solid #e2e8f0',
                      background: rowspan > 1 ? '#f8faff' : undefined,
                    }
                    return (
                      <>
                        <td
                          rowSpan={rowspan}
                          title="Target milk packs for this division (from SBFP Packs to Deliver)"
                          style={{ ...cellStyle, fontWeight: 600, color: target > 0 ? 'var(--navy)' : '#9ca3af' }}
                        >
                          {target > 0 ? formatNumber(target) : 'N/A'}
                        </td>
                        <td
                          rowSpan={rowspan}
                          title="Total milk packs delivered for this division (from SBFP delivery)"
                          style={{ ...cellStyle, borderLeft: '1px solid #e2e8f0' }}
                        >
                          {delivered > 0 ? (
                            <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                              <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{formatNumber(delivered)}</span>
                              {pct !== null && (
                                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: pctColor }}>
                                  {pct}%
                                </span>
                              )}
                            </span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>N/A</span>
                          )}
                        </td>
                      </>
                    )
                  })()}
                  
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
