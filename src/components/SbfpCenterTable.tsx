'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Edit2, Trash2, Plus } from 'lucide-react'

const STATUS_COLORS: Record<string, string> = {
  'FOR PREPARATION':           'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'ONGOING':                   'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'ONGOING (FOR AWARD)':       'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  'AWARDED (FOR DELIVERY)':    'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300',
  'AWARDED (ONGOING DELIVERY)':'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
  'DONE':                      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'COMPLETED':                 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'FAILED':                    'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  'NOT STARTED':               'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
}

function statusClass(status: string) {
  return STATUS_COLORS[(status || '').toUpperCase()] || 'bg-slate-100 text-slate-600'
}

function EditableCell({ 
  id, field, value, type = 'text', options, textAlign = 'left', onSave
}: { 
  id: string; field: string; value: any; type?: string; options?: string[]; 
  textAlign?: 'left' | 'right' | 'center'; onSave: (id: string, f: string, v: any) => void 
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<any>(null)
  const supabase = createClient()

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const save = async () => {
    if (val === value) { setEditing(false); return }
    setSaving(true)
    let v = val
    if (type === 'number') v = val === '' ? null : Number(val)
    const { error } = await supabase.from('sbfp_data').update({ [field]: v }).eq('id', id)
    if (!error) { onSave(id, field, v) }
    setSaving(false)
    setEditing(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') { setVal(value); setEditing(false) }
  }

  const displayVal = (field === 'procurement_status') 
    ? <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusClass(val)}`}>{val || '—'}</span>
    : (val != null && val !== '' ? String(val) : <span className="text-slate-400 italic text-xs">—</span>)

  if (editing) {
    if (type === 'select' && options) return (
      <select ref={inputRef} value={val || ''} onChange={e => setVal(e.target.value)} onBlur={save} onKeyDown={onKey}
        className="w-full h-8 px-1 text-sm border-2 border-blue-500 rounded bg-background outline-none">
        <option value="">—</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
    return (
      <input ref={inputRef} type={type} value={val ?? ''} onChange={e => setVal(e.target.value)} 
        onBlur={save} onKeyDown={onKey} disabled={saving}
        className={`w-full h-8 px-1 text-sm border-2 border-blue-500 rounded bg-background outline-none ${type === 'number' ? 'text-right' : ''}`}
      />
    )
  }

  return (
    <div className={`group relative cursor-pointer min-h-[24px] px-1 py-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-${textAlign}`}
      onClick={() => setEditing(true)}>
      {displayVal}
      <Edit2 className="absolute right-0.5 top-1 h-3 w-3 opacity-0 group-hover:opacity-100 text-blue-400 shrink-0" />
      {saving && <div className="absolute inset-0 bg-white/60 flex items-center justify-center rounded"><div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" /></div>}
    </div>
  )
}

const STATUSES = ['FOR PREPARATION', 'ONGOING', 'ONGOING (FOR AWARD)', 'AWARDED (FOR DELIVERY)', 'AWARDED (ONGOING DELIVERY)', 'DONE', 'FAILED', 'NOT STARTED']
const MILK_TYPES = ['Pasteurized', 'Sterilized', 'Commercial', 'SM']
const MODES = ['Sagip Saka', 'Small Value Procurement', 'Negotiated Procurement', 'Direct Contracting']

export function SbfpCenterTable({ center, initialRecords, userRole }: { center: string; initialRecords: any[]; userRole?: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [records, setRecords] = useState(initialRecords)

  useEffect(() => { setRecords(initialRecords) }, [initialRecords])

  const handleSave = (id: string, field: string, val: any) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))
    router.refresh()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this record?')) return
    await supabase.from('sbfp_data').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  const isEditable = userRole !== 'viewer'

  // Detect snapshot columns from records
  const snapshotDates: string[] = records.length > 0
    ? (records[0].delivery_snapshots || []).map((s: any) => s.date)
    : []

  return (
    <div className="rounded-md border bg-card overflow-x-auto">
      <table className="text-xs whitespace-nowrap" style={{ minWidth: '1400px' }}>
        <thead>
          <tr className="border-b bg-muted/60">
            <th className="h-9 px-3 text-left font-semibold sticky left-0 bg-muted/60 z-10">STATUS</th>
            <th className="px-3 font-semibold text-left">SDO</th>
            <th className="px-3 font-semibold text-right">AMOUNT</th>
            <th className="px-3 font-semibold text-left">MODE</th>
            <th className="px-3 font-semibold text-center">DATE RECD (PROC)</th>
            <th className="px-3 font-semibold text-left">PR #</th>
            <th className="px-3 font-semibold text-center">ORS DATE</th>
            <th className="px-3 font-semibold text-left">PO #</th>
            <th className="px-3 font-semibold text-left">BATCH</th>
            <th className="px-3 font-semibold text-right">BENEFICIARIES</th>
            <th className="px-3 font-semibold text-right">CONTRACT AMT</th>
            <th className="px-3 font-semibold text-center">DELIVERY START</th>
            <th className="px-3 font-semibold text-center">DELIVERY END</th>
            <th className="px-3 font-semibold text-right">PACKS TO DELIVER</th>
            {snapshotDates.map(d => (
              <th key={d} className="px-3 font-semibold text-right bg-blue-50 dark:bg-blue-900/20">Delivered as of {d}</th>
            ))}
            <th className="px-3 font-semibold text-left">PAYMENT STATUS</th>
            <th className="px-3 font-semibold text-left">REMARKS</th>
            {isEditable && <th className="px-3 font-semibold text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          {records.length === 0 && (
            <tr><td colSpan={18} className="py-10 text-center text-muted-foreground">No records for {center}. Add one above.</td></tr>
          )}
          {records.map(r => (
            <tr key={r.id} className="border-b hover:bg-muted/30">
              <td className="px-2 py-1.5 sticky left-0 bg-card z-10">
                {isEditable ? <EditableCell id={r.id} field="procurement_status" value={r.procurement_status} type="select" options={STATUSES} onSave={handleSave} /> 
                  : <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${statusClass(r.procurement_status)}`}>{r.procurement_status}</span>}
              </td>
              <td className="px-2 py-1.5 min-w-[160px]">
                {isEditable ? <EditableCell id={r.id} field="sdo" value={r.sdo} onSave={handleSave} /> : r.sdo}
              </td>
              <td className="px-2 py-1.5">
                {isEditable ? <EditableCell id={r.id} field="amount" value={r.amount} type="number" textAlign="right" onSave={handleSave} />
                  : <span className="text-right block">{r.amount ? Number(r.amount).toLocaleString() : '—'}</span>}
              </td>
              <td className="px-2 py-1.5 min-w-[130px]">
                {isEditable ? <EditableCell id={r.id} field="mode_of_procurement" value={r.mode_of_procurement} type="select" options={MODES} onSave={handleSave} /> : r.mode_of_procurement}
              </td>
              <td className="px-2 py-1.5 text-center">
                {isEditable ? <EditableCell id={r.id} field="pr_date_received" value={r.pr_date_received} type="date" onSave={handleSave} /> : r.pr_date_received}
              </td>
              <td className="px-2 py-1.5">
                {isEditable ? <EditableCell id={r.id} field="pr_number" value={r.pr_number} onSave={handleSave} /> : r.pr_number}
              </td>
              <td className="px-2 py-1.5 text-center">
                {isEditable ? <EditableCell id={r.id} field="ors_date" value={r.ors_date} type="date" onSave={handleSave} /> : r.ors_date}
              </td>
              <td className="px-2 py-1.5">
                {isEditable ? <EditableCell id={r.id} field="po_number" value={r.po_number} onSave={handleSave} /> : r.po_number}
              </td>
              <td className="px-2 py-1.5">
                {isEditable ? <EditableCell id={r.id} field="batch" value={r.batch} onSave={handleSave} /> : r.batch}
              </td>
              <td className="px-2 py-1.5 text-right">
                {(r.beneficiaries_pm || 0) + (r.beneficiaries_sm || 0) + (r.beneficiaries_cm || 0) || '—'}
              </td>
              <td className="px-2 py-1.5 text-right">
                {isEditable ? <EditableCell id={r.id} field="contract_amount" value={r.contract_amount} type="number" textAlign="right" onSave={handleSave} />
                  : (r.contract_amount ? Number(r.contract_amount).toLocaleString() : '—')}
              </td>
              <td className="px-2 py-1.5 text-center">
                {isEditable ? <EditableCell id={r.id} field="delivery_start" value={r.delivery_start} type="date" onSave={handleSave} /> : r.delivery_start}
              </td>
              <td className="px-2 py-1.5 text-center">
                {isEditable ? <EditableCell id={r.id} field="delivery_end" value={r.delivery_end} type="date" onSave={handleSave} /> : r.delivery_end}
              </td>
              <td className="px-2 py-1.5 text-right font-medium">
                {r.packs_to_deliver ? Number(r.packs_to_deliver).toLocaleString() : '—'}
              </td>
              {(r.delivery_snapshots || []).map((snap: any) => (
                <td key={snap.date} className="px-2 py-1.5 text-right bg-blue-50/50 dark:bg-blue-900/10 font-medium text-blue-700 dark:text-blue-400">
                  {snap.packs ? Number(snap.packs).toLocaleString() : '—'}
                </td>
              ))}
              <td className="px-2 py-1.5">
                {isEditable ? <EditableCell id={r.id} field="status_of_payment" value={r.status_of_payment} onSave={handleSave} /> : r.status_of_payment}
              </td>
              <td className="px-2 py-1.5 max-w-[200px] truncate text-muted-foreground">
                {isEditable ? <EditableCell id={r.id} field="remarks" value={r.remarks} onSave={handleSave} /> : r.remarks}
              </td>
              {isEditable && (
                <td className="px-2 py-1.5 text-right">
                  <button onClick={() => handleDelete(r.id)} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 rounded transition-colors" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
