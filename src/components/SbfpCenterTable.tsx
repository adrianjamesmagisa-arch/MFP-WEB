'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Edit2, Trash2 } from 'lucide-react'

// ─────────────────────────────────────────────
// Status badge colours (matches SBFP Excel)
// ─────────────────────────────────────────────
const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  'FOR PREPARATION':            { bg: '#fef3c7', color: '#92400e' },
  'ONGOING':                    { bg: '#dbeafe', color: '#1e40af' },
  'ONGOING (FOR AWARD)':        { bg: '#dbeafe', color: '#1e40af' },
  'AWARDED (FOR DELIVERY)':     { bg: '#ede9fe', color: '#5b21b6' },
  'AWARDED (ONGOING DELIVERY)': { bg: '#e0e7ff', color: '#3730a3' },
  'DONE':                       { bg: '#d1fae5', color: '#065f46' },
  'COMPLETED':                  { bg: '#d1fae5', color: '#065f46' },
  'FAILED':                     { bg: '#fee2e2', color: '#991b1b' },
  'NOT STARTED':                { bg: '#f1f5f9', color: '#475569' },
}

function statusBadge(status: string) {
  const s = (status || '').toUpperCase()
  const cfg = STATUS_BADGE[s] || { bg: '#f1f5f9', color: '#475569' }
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
      fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap',
      background: cfg.bg, color: cfg.color
    }}>
      {status || '—'}
    </span>
  )
}

// ─────────────────────────────────────────────
// Editable cell — same pattern as DataTable.tsx
// ─────────────────────────────────────────────
const STATUSES = ['FOR PREPARATION', 'ONGOING', 'ONGOING (FOR AWARD)', 'AWARDED (FOR DELIVERY)', 'AWARDED (ONGOING DELIVERY)', 'DONE', 'COMPLETED', 'FAILED', 'NOT STARTED']
const MODES    = ['Sagip Saka', 'Small Value Procurement', 'Negotiated Procurement', 'Direct Contracting', 'Emergency']
const MILK_TYPES = ['Pasteurized', 'Sterilized', 'Commercial']

function EditableCell({
  id, field, value, type = 'text', options, align = 'left',
  format, render, onSave
}: {
  id: string; field: string; value: any; type?: string; options?: string[];
  align?: 'left' | 'right' | 'center';
  format?: (v: any) => any; render?: (v: any) => React.ReactNode;
  onSave: (id: string, f: string, oldV: any, newV: any) => void
}) {
  const [editing, setEditing]   = useState(false)
  const [val, setVal]           = useState(value)
  const [saving, setSaving]     = useState(false)
  const ref                     = useRef<any>(null)
  const supabase                = createClient()

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async () => {
    if (val === value) { setEditing(false); return }
    setSaving(true)
    let v: any = val
    if (type === 'number') v = val === '' || val == null ? null : Number(val)
    const { error } = await supabase.from('sbfp_data').update({ [field]: v }).eq('id', id)
    if (!error) onSave(id, field, value, v)
    else        setVal(value)
    setSaving(false)
    setEditing(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') { setVal(value); setEditing(false) }
  }

  if (editing) {
    if (type === 'select' && options) {
      return (
        <td style={{ padding: 2, background: '#fff' }}>
          <select ref={ref} value={val || ''} onBlur={save} onKeyDown={onKey}
            onChange={e => setVal(e.target.value)}
            style={{ width: '100%', border: '1px solid #3b82f6', outline: 'none', padding: '2px 4px', fontSize: 'inherit', boxSizing: 'border-box' as const }}>
            <option value="">—</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </td>
      )
    }
    return (
      <td style={{ padding: 2, background: '#fff' }}>
        <input ref={ref} type={type} value={val ?? ''} disabled={saving}
          onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={onKey}
          style={{
            width: '100%', border: '1px solid #3b82f6', outline: 'none',
            padding: '2px 4px', fontSize: 'inherit', boxSizing: 'border-box' as const,
            textAlign: type === 'number' ? 'right' : 'left'
          }}
        />
      </td>
    )
  }

  const display = (val === null || val === undefined || val === '')
    ? 'N/A'
    : render ? render(val) : format ? format(val) : val

  return (
    <td style={{ cursor: 'text', textAlign: align, opacity: saving ? 0.5 : 1 }}
      onClick={() => setEditing(true)}>
      {display}
    </td>
  )
}

// ─────────────────────────────────────────────
// Main table
// ─────────────────────────────────────────────
export function SbfpCenterTable({
  center, initialRecords, userRole
}: {
  center: string; initialRecords: any[]; userRole?: string
}) {
  const router                          = useRouter()
  const supabase                        = createClient()
  const [rows, setRows]                 = useState(initialRecords)
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [undoStack, setUndoStack]       = useState<any[]>([])
  const [redoStack, setRedoStack]       = useState<any[]>([])
  const editable                        = userRole !== 'viewer'

  useEffect(() => { setRows(initialRecords) }, [initialRecords])

  // ─── Undo / Redo (Ctrl+Z / Ctrl+Y) ───────────────────────────
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (!undoStack.length) return
        const action = undoStack[undoStack.length - 1]
        setUndoStack(p => p.slice(0, -1))
        await supabase.from('sbfp_data').update({ [action.field]: action.oldV }).eq('id', action.id)
        setRows(p => p.map(r => r.id === action.id ? { ...r, [action.field]: action.oldV } : r))
        setRedoStack(p => [...p, action])
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (!redoStack.length) return
        const action = redoStack[redoStack.length - 1]
        setRedoStack(p => p.slice(0, -1))
        await supabase.from('sbfp_data').update({ [action.field]: action.newV }).eq('id', action.id)
        setRows(p => p.map(r => r.id === action.id ? { ...r, [action.field]: action.newV } : r))
        setUndoStack(p => [...p, action])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undoStack, redoStack])

  const handleSave = (id: string, field: string, oldV: any, newV: any) => {
    setRows(p => p.map(r => r.id === id ? { ...r, [field]: newV } : r))
    setUndoStack(p => [...p, { id, field, oldV, newV }])
    setRedoStack([])
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this record?')) return
    await supabase.from('sbfp_data').delete().eq('id', id)
    setRows(p => p.filter(r => r.id !== id))
  }

  const toggleAll = () => setSelected(
    selected.size === rows.length ? new Set() : new Set(rows.map(r => r.id))
  )
  const toggleRow = (id: string) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  // Detect dynamic snapshot columns
  const snapDates: string[] = rows.length > 0
    ? (rows.find(r => (r.delivery_snapshots || []).length > 0)?.delivery_snapshots || []).map((s: any) => s.date)
    : []

  const fmtNum  = (v: any) => (v != null && v !== 0 && v !== '') ? Number(v).toLocaleString() : 'N/A'
  const fmtPeso = (v: any) => (v != null && v !== 0 && v !== '') ? '₱' + Number(v).toLocaleString() : 'N/A'
  const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'

  // Col letters — match the Excel column order
  const colLetters = [
    '', 'A','B','C','D','E','F','G','H','I','J','K',
    'L','M','N','O','P','Q','R','S','T'
  ]

  return (
    <>
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
          <table className="data-table" style={{ minWidth: 2000, fontSize: '0.78rem' }}>
            <thead>
              <tr>
                {/* Checkbox */}
                <th style={{ minWidth: 36, width: 36, textAlign: 'center' }}>
                  <input type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                <th style={{ minWidth: 155, whiteSpace: 'normal', lineHeight: 1.2 }}>A — Status</th>
                <th style={{ minWidth: 160, whiteSpace: 'normal', lineHeight: 1.2 }}>B — SDO</th>
                <th style={{ minWidth: 90, whiteSpace: 'normal', lineHeight: 1.2 }}>C — Region</th>
                <th style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>D — Amount (₱)</th>
                <th style={{ minWidth: 140, whiteSpace: 'normal', lineHeight: 1.2 }}>E — Mode of Procurement</th>
                <th style={{ minWidth: 100, whiteSpace: 'normal', lineHeight: 1.2 }}>F — Date Recd (Proc)</th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2 }}>G — PR Number</th>
                <th style={{ minWidth: 100, whiteSpace: 'normal', lineHeight: 1.2 }}>H — ORS Date</th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2 }}>I — PO Number</th>
                <th style={{ minWidth: 80,  whiteSpace: 'normal', lineHeight: 1.2 }}>J — Batch</th>
                <th style={{ minWidth: 90,  whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>K — Beneficiaries</th>
                <th style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>L — Contract Amt (₱)</th>
                <th style={{ minWidth: 100, whiteSpace: 'normal', lineHeight: 1.2 }}>M — Delivery Start</th>
                <th style={{ minWidth: 100, whiteSpace: 'normal', lineHeight: 1.2 }}>N — Delivery End</th>
                <th style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>O — Packs to Deliver</th>
                {snapDates.map((d, i) => (
                  <th key={d} style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                    {String.fromCharCode(80 + i)} — Delivered as of {d}
                  </th>
                ))}
                <th style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2 }}>— Payment Status</th>
                <th style={{ minWidth: 180, whiteSpace: 'normal', lineHeight: 1.2 }}>— Remarks</th>
                {editable && <th style={{ minWidth: 70, whiteSpace: 'normal', lineHeight: 1.2 }}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={20} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)' }}>
                    No records for {center}.
                  </td>
                </tr>
              )}
              {rows.map(r => {
                const isSelected = selected.has(r.id)
                return (
                  <tr key={r.id} style={{ background: isSelected ? '#e0e7ff' : undefined }}>
                    {/* Checkbox */}
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(r.id)} style={{ cursor: 'pointer' }} />
                    </td>

                    {/* A — Status */}
                    {editable
                      ? <EditableCell id={r.id} field="procurement_status" value={r.procurement_status}
                          type="select" options={STATUSES} onSave={handleSave}
                          render={v => statusBadge(v)} />
                      : <td>{statusBadge(r.procurement_status)}</td>
                    }

                    {/* B — SDO */}
                    {editable
                      ? <EditableCell id={r.id} field="sdo" value={r.sdo} onSave={handleSave} />
                      : <td>{r.sdo || 'N/A'}</td>
                    }

                    {/* C — Region */}
                    {editable
                      ? <EditableCell id={r.id} field="region" value={r.region} onSave={handleSave} />
                      : <td>{r.region || 'N/A'}</td>
                    }

                    {/* D — Amount */}
                    {editable
                      ? <EditableCell id={r.id} field="amount" value={r.amount} type="number" align="right"
                          format={fmtPeso} onSave={handleSave} />
                      : <td style={{ textAlign: 'right' }}>{fmtPeso(r.amount)}</td>
                    }

                    {/* E — Mode */}
                    {editable
                      ? <EditableCell id={r.id} field="mode_of_procurement" value={r.mode_of_procurement}
                          type="select" options={MODES} onSave={handleSave} />
                      : <td>{r.mode_of_procurement || 'N/A'}</td>
                    }

                    {/* F — PR Date Received */}
                    {editable
                      ? <EditableCell id={r.id} field="pr_date_received" value={r.pr_date_received}
                          type="date" format={fmtDate} onSave={handleSave} />
                      : <td>{fmtDate(r.pr_date_received)}</td>
                    }

                    {/* G — PR Number */}
                    {editable
                      ? <EditableCell id={r.id} field="pr_number" value={r.pr_number} onSave={handleSave} />
                      : <td>{r.pr_number || 'N/A'}</td>
                    }

                    {/* H — ORS Date */}
                    {editable
                      ? <EditableCell id={r.id} field="ors_date" value={r.ors_date}
                          type="date" format={fmtDate} onSave={handleSave} />
                      : <td>{fmtDate(r.ors_date)}</td>
                    }

                    {/* I — PO Number */}
                    {editable
                      ? <EditableCell id={r.id} field="po_number" value={r.po_number} onSave={handleSave} />
                      : <td>{r.po_number || 'N/A'}</td>
                    }

                    {/* J — Batch */}
                    {editable
                      ? <EditableCell id={r.id} field="batch" value={r.batch} onSave={handleSave} />
                      : <td>{r.batch || 'N/A'}</td>
                    }

                    {/* K — Beneficiaries */}
                    {editable
                      ? <EditableCell id={r.id} field="beneficiaries_pm" value={r.beneficiaries_pm}
                          type="number" align="right" format={fmtNum} onSave={handleSave} />
                      : <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.beneficiaries_pm)}</td>
                    }

                    {/* L — Contract Amount */}
                    {editable
                      ? <EditableCell id={r.id} field="contract_amount" value={r.contract_amount}
                          type="number" align="right" format={fmtPeso} onSave={handleSave} />
                      : <td style={{ textAlign: 'right' }}>{fmtPeso(r.contract_amount)}</td>
                    }

                    {/* M — Delivery Start */}
                    {editable
                      ? <EditableCell id={r.id} field="delivery_start" value={r.delivery_start}
                          type="date" format={fmtDate} onSave={handleSave} />
                      : <td>{fmtDate(r.delivery_start)}</td>
                    }

                    {/* N — Delivery End */}
                    {editable
                      ? <EditableCell id={r.id} field="delivery_end" value={r.delivery_end}
                          type="date" format={fmtDate} onSave={handleSave} />
                      : <td>{fmtDate(r.delivery_end)}</td>
                    }

                    {/* O — Packs to Deliver */}
                    {editable
                      ? <EditableCell id={r.id} field="packs_to_deliver" value={r.packs_to_deliver}
                          type="number" align="right" format={fmtNum} onSave={handleSave} />
                      : <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.packs_to_deliver)}</td>
                    }

                    {/* Dynamic snapshot columns */}
                    {(r.delivery_snapshots || []).map((snap: any) => (
                      <td key={snap.date} style={{ textAlign: 'right', fontWeight: 600, color: '#2563eb', background: 'rgba(59,130,246,0.04)' }}>
                        {snap.packs ? Number(snap.packs).toLocaleString() : 'N/A'}
                      </td>
                    ))}
                    {/* Fill empty snapshot cells if this row has fewer snapshots */}
                    {Array.from({ length: Math.max(0, snapDates.length - (r.delivery_snapshots?.length || 0)) }).map((_, i) => (
                      <td key={`empty-${i}`} style={{ textAlign: 'right', background: 'rgba(59,130,246,0.04)' }}>N/A</td>
                    ))}

                    {/* Payment Status */}
                    {editable
                      ? <EditableCell id={r.id} field="status_of_payment" value={r.status_of_payment} onSave={handleSave} />
                      : <td>{r.status_of_payment || 'N/A'}</td>
                    }

                    {/* Remarks */}
                    {editable
                      ? <EditableCell id={r.id} field="remarks" value={r.remarks} onSave={handleSave} />
                      : <td>{r.remarks || 'N/A'}</td>
                    }

                    {/* Delete */}
                    {editable && (
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={() => handleDelete(r.id)}
                          className="btn btn-outline"
                          style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', color: '#ef4444', borderColor: '#ef4444' }}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating selection bar */}
      {selected.size > 0 && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          background: 'var(--navy)', color: 'white', padding: '0.75rem 1.5rem',
          borderRadius: 50, boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', gap: '1rem', zIndex: 50
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
            {selected.size} row{selected.size > 1 ? 's' : ''} selected
          </span>
          <button onClick={() => {
            if (!confirm(`Delete ${selected.size} selected records?`)) return
            Promise.all(Array.from(selected).map(id => supabase.from('sbfp_data').delete().eq('id', id)))
              .then(() => { setRows(p => p.filter(r => !selected.has(r.id))); setSelected(new Set()) })
          }} className="btn btn-gold" style={{ padding: '0.5rem 1rem', borderRadius: 50, background: '#ef4444', border: 'none' }}>
            <Trash2 size={14} /> Delete Selected
          </button>
        </div>
      )}
    </>
  )
}
