'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils'
import { Edit2, Trash2 } from 'lucide-react'

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
      style={{ ...style, cursor: 'text', opacity: isSaving ? 0.5 : 1 }} 
      onClick={() => setIsEditing(true)}
    >
      {render ? render(val) : format ? format(val) : (val ?? 'N/A')}
    </td>
  )
}

export function DataTable({ records }: { records: any[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [localRecords, setLocalRecords] = useState(records)
  const [undoStack, setUndoStack] = useState<any[]>([])
  const [redoStack, setRedoStack] = useState<any[]>([])

  useEffect(() => {
    setLocalRecords(records)
  }, [records])

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
              {localRecords?.map(r => (
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
