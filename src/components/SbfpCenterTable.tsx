'use client'

import { useState, useEffect, useRef, Fragment, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Trash2, Plus, CalendarPlus } from 'lucide-react'
import { recomputeCenterSummary } from '@/lib/sbfp-compute'
import {
  SBFP_RAW_MILK_MONTHS,
  readMonthlyMap,
  packsForMonth,
  incrementFromSnapshots,
  totalPacksDelivered,
  incomeForMonth,
  sumRowIncome,
  rawMilkUtilizedLiters,
  formatDeliveredAsOf,
  parseSnapshotDate,
  toDateInputValue,
} from '@/lib/sbfp-raw-milk'
import { cascadeSdoFieldSync, cascadeSdoRename, unlinkDropoffFromMasterlist } from '@/lib/sbfp-dropoff-sync'

// ─────────────────────────────────────────────
// Status badge — PDF-exact values
// ─────────────────────────────────────────────
const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
  'For Preparation':            { bg: '#fef3c7', color: '#92400e' },
  'Ongoing Procurement':        { bg: '#dbeafe', color: '#1e40af' },
  'Ongoing (For Award)':        { bg: '#bfdbfe', color: '#1e3a8a' },
  'Awarded (For Delivery)':     { bg: '#ede9fe', color: '#5b21b6' },
  'Awarded (Ongoing Delivery)': { bg: '#e0e7ff', color: '#3730a3' },
  'Completed':                  { bg: '#d1fae5', color: '#065f46' },
  'Failed':                     { bg: '#fee2e2', color: '#991b1b' },
  // Legacy uppercase fallbacks
  'FOR PREPARATION':            { bg: '#fef3c7', color: '#92400e' },
  'ONGOING PROCUREMENT':        { bg: '#dbeafe', color: '#1e40af' },
  'ONGOING':                    { bg: '#dbeafe', color: '#1e40af' },
  'ONGOING (FOR AWARD)':        { bg: '#bfdbfe', color: '#1e3a8a' },
  'AWARDED (FOR DELIVERY)':     { bg: '#ede9fe', color: '#5b21b6' },
  'AWARDED (ONGOING DELIVERY)': { bg: '#e0e7ff', color: '#3730a3' },
  'DONE':                       { bg: '#d1fae5', color: '#065f46' },
  'COMPLETED':                  { bg: '#d1fae5', color: '#065f46' },
  'NOT STARTED':                { bg: '#f1f5f9', color: '#475569' },
}

function statusBadge(status: string) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE[(status || '').toUpperCase()] || { bg: '#f1f5f9', color: '#475569' }
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
// Constants
// ─────────────────────────────────────────────
const STATUSES = [
  'For Preparation', 'Ongoing Procurement', 'Ongoing (For Award)',
  'Awarded (For Delivery)', 'Awarded (Ongoing Delivery)', 'Completed', 'Failed',
]
const MODES = ['Sagip Saka', 'Small Value Procurement', 'Negotiated Procurement', 'Direct Contracting', 'Emergency']

// ─────────────────────────────────────────────
// Editable cell
// ─────────────────────────────────────────────
function EditableCell({
  id, field, value, type = 'text', options, align = 'left',
  format, render, onSave, cellStyle,
}: {
  id: string; field: string; value: any; type?: string; options?: string[];
  align?: 'left' | 'right' | 'center';
  format?: (v: any) => any; render?: (v: any) => React.ReactNode;
  onSave: (id: string, f: string, oldV: any, newV: any) => void
  cellStyle?: CSSProperties
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value)
  const [saving, setSaving]   = useState(false)
  const ref                   = useRef<any>(null)
  const supabase              = createClient()

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async () => {
    if (val === value) { setEditing(false); return }
    setSaving(true)
    let v: any = val
    if (type === 'number') v = val === '' || val == null ? null : Number(val)
    if (type === 'checkbox') v = val
    const { error } = await supabase.from('sbfp_data').update({ [field]: v }).eq('id', id)
    if (!error) onSave(id, field, value, v)
    else setVal(value)
    setSaving(false)
    setEditing(false)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save()
    if (e.key === 'Escape') { setVal(value); setEditing(false) }
  }

  if (type === 'checkbox') {
    return (
      <td style={{ textAlign: 'center', opacity: saving ? 0.5 : 1, ...cellStyle }}>
        <input type="checkbox" checked={!!val}
          onChange={async (e) => {
            const newVal = e.target.checked
            setVal(newVal)
            setSaving(true)
            const { error } = await supabase.from('sbfp_data').update({ [field]: newVal }).eq('id', id)
            if (!error) onSave(id, field, value, newVal)
            else setVal(value)
            setSaving(false)
          }}
          style={{ cursor: 'pointer', width: 15, height: 15 }} />
      </td>
    )
  }

  if (editing) {
    if (type === 'select' && options) {
      return (
        <td style={{ padding: 2, background: '#fff', ...cellStyle }}>
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
      <td style={{ padding: 2, background: '#fff', ...cellStyle }}>
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
    <td style={{ cursor: 'text', textAlign: align, opacity: saving ? 0.5 : 1, ...cellStyle }}
      onClick={() => setEditing(true)}>
      {display}
    </td>
  )
}

/** Editable one month key inside a JSONB monthly map. */
function MonthlyMapCell({
  id, field, monthKey, map, align = 'right', format, onSave, derived, background,
}: {
  id: string
  field: 'raw_milk_prices' | 'monthly_packs_delivered'
  monthKey: string
  map: Record<string, number>
  align?: 'left' | 'right' | 'center'
  format?: (v: any) => any
  onSave: (id: string, f: string, oldV: any, newV: any) => void
  /** Shown when this month is not stored — e.g. increment from snapshots. */
  derived?: number | null
  background?: string
}) {
  const has = Object.prototype.hasOwnProperty.call(map || {}, monthKey)
  const current = has ? Number((map || {})[monthKey]) : undefined
  const display = has && current != null && Number.isFinite(current) ? current : ''
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState<string | number>(display)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const bg = background ?? (field === 'raw_milk_prices' ? 'rgba(16,185,129,0.06)' : 'rgba(59,130,246,0.06)')

  useEffect(() => { setVal(display) }, [display])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async () => {
    const nextNum = val === '' || val == null ? null : Number(val)
    const oldMap = { ...(map || {}) }
    const newMap = { ...oldMap }
    if (nextNum == null || !Number.isFinite(nextNum)) delete newMap[monthKey]
    else newMap[monthKey] = nextNum
    const same =
      !Object.prototype.hasOwnProperty.call(oldMap, monthKey) &&
      !Object.prototype.hasOwnProperty.call(newMap, monthKey)
      || Number(oldMap[monthKey]) === Number(newMap[monthKey])
    if (same) { setEditing(false); return }
    setSaving(true)
    const { error } = await supabase.from('sbfp_data').update({ [field]: newMap }).eq('id', id)
    if (!error) onSave(id, field, oldMap, newMap)
    else setVal(display)
    setSaving(false)
    setEditing(false)
  }

  if (editing) {
    return (
      <td style={{ padding: 2, background: '#fff', textAlign: align }}>
        <input
          ref={ref}
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setVal(display); setEditing(false) }
          }}
          style={{
            width: '100%', border: '1px solid #3b82f6', outline: 'none',
            padding: '2px 4px', fontSize: 'inherit', textAlign: align, boxSizing: 'border-box',
          }}
        />
      </td>
    )
  }

  const shown = has && current != null
    ? (format ? format(current) : Number(current).toLocaleString())
    : derived != null && derived > 0
      ? (format ? format(derived) : derived.toLocaleString())
      : '—'
  const isDerived = !has && derived != null && derived > 0

  return (
    <td
      onClick={() => setEditing(true)}
      title={isDerived
        ? 'From Delivered-as-of snapshots — click to save as this month’s packs'
        : 'Click to edit'}
      style={{
        textAlign: align, cursor: 'pointer', opacity: saving ? 0.5 : 1,
        background: bg,
        fontStyle: isDerived ? 'italic' : undefined,
        color: isDerived ? '#64748b' : undefined,
      }}
    >
      {shown}
    </td>
  )
}

function SnapshotDateHeader({
  letter, date, editable, onRename,
}: {
  letter: string
  date: string
  editable: boolean
  onRename: (oldDate: string, newDate: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    ref.current?.focus()
    ref.current?.showPicker?.()
  }, [editing])

  const commit = (iso: string) => {
    const parsed = parseSnapshotDate(iso)
    if (!parsed) { setEditing(false); return }
    const next = formatDeliveredAsOf(parsed)
    if (next !== date) onRename(date, next)
    setEditing(false)
  }

  return (
    <th
      rowSpan={2}
      style={{ minWidth: 150, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right', verticalAlign: 'middle' }}
      title={editable ? 'Click the date to rename this Delivered-as-of column' : undefined}
    >
      {letter} — Delivered as of
      <div>
        {editable && editing ? (
          <input
            ref={ref}
            type="date"
            defaultValue={toDateInputValue(date)}
            onBlur={e => commit(e.target.value)}
            onChange={e => { if (e.target.value) commit(e.target.value) }}
            style={{ width: '100%', marginTop: 4, color: '#0f172a', borderRadius: 4, border: 0, padding: '2px 4px' }}
          />
        ) : (
          <button
            type="button"
            disabled={!editable}
            onClick={() => editable && setEditing(true)}
            style={{
              background: 'none', border: 0, color: '#fff', fontWeight: 700,
              textDecoration: editable ? 'underline' : 'none', cursor: editable ? 'pointer' : 'default',
              padding: 0, marginTop: 2,
            }}
          >
            {date}
          </button>
        )}
      </div>
    </th>
  )
}

function SnapshotCell({
  id, date, snaps, editable, onSave,
}: {
  id: string
  date: string
  snaps: Array<{ date?: string; packs?: number | null }>
  editable: boolean
  onSave: (id: string, field: string, oldV: any, newV: any) => void
}) {
  const current = snaps.find(s => s.date === date)
  const packs = current?.packs
  const display = packs == null || packs === 0 ? '' : packs
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState<string | number>(display)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { setVal(display) }, [display])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async () => {
    const nextNum = val === '' || val == null ? null : Number(val)
    const oldSnaps = [...(snaps || [])]
    const newSnaps = oldSnaps.filter(s => s.date !== date)
    if (nextNum != null && Number.isFinite(nextNum) && nextNum !== 0) {
      newSnaps.push({ date, packs: nextNum })
    }
    const same = JSON.stringify(oldSnaps) === JSON.stringify(newSnaps)
    if (same) { setEditing(false); return }
    setSaving(true)
    const { error } = await supabase.from('sbfp_data').update({ delivery_snapshots: newSnaps }).eq('id', id)
    if (!error) onSave(id, 'delivery_snapshots', oldSnaps, newSnaps)
    else setVal(display)
    setSaving(false)
    setEditing(false)
  }

  if (!editable) {
    return (
      <td style={{ textAlign: 'right', fontWeight: 600, color: packs ? '#2563eb' : undefined, background: 'rgba(59,130,246,0.04)' }}>
        {packs ? Number(packs).toLocaleString() : 'N/A'}
      </td>
    )
  }

  if (editing) {
    return (
      <td style={{ padding: 2, background: '#fff', textAlign: 'right' }}>
        <input
          ref={ref}
          type="number"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={save}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') { setVal(display); setEditing(false) }
          }}
          style={{
            width: '100%', border: '1px solid #3b82f6', outline: 'none',
            padding: '2px 4px', fontSize: 'inherit', textAlign: 'right', boxSizing: 'border-box',
          }}
        />
      </td>
    )
  }

  return (
    <td
      onClick={() => setEditing(true)}
      title="Cumulative packs delivered as of this date — click to edit"
      style={{
        textAlign: 'right', fontWeight: 600, cursor: 'pointer',
        color: packs ? '#2563eb' : undefined,
        background: 'rgba(59,130,246,0.04)',
        opacity: saving ? 0.5 : 1,
      }}
    >
      {packs ? Number(packs).toLocaleString() : 'N/A'}
    </td>
  )
}

// ─────────────────────────────────────────────
// Main table
// ─────────────────────────────────────────────
export function SbfpCenterTable({
  center, initialRecords, userRole, year, allowAdd = false,
}: {
  center: string
  initialRecords: any[]
  userRole?: string | null
  year?: number
  allowAdd?: boolean
}) {
  const supabase                  = createClient()
  const [rows, setRows]           = useState(initialRecords)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [undoStack, setUndoStack] = useState<any[]>([])
  const [redoStack, setRedoStack] = useState<any[]>([])
  const [adding, setAdding]       = useState(false)
  const [extraSnapDates, setExtraSnapDates] = useState<string[]>([])
  const addSnapRef                = useRef<HTMLInputElement>(null)
  const editable                  = userRole !== 'viewer'
  const dbYear                    = year ?? (initialRecords[0]?.year as number | undefined)

  useEffect(() => { setRows(initialRecords) }, [initialRecords])

  const maybeRecompute = async (field?: string) => {
    if (!dbYear || center === 'OVERALL') return
    if (field && field !== 'packs_to_deliver') return
    await recomputeCenterSummary(supabase, center, dbYear)
  }

  // Ctrl+Z / Ctrl+Y undo-redo
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
        await maybeRecompute(action.field)
      }
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault()
        if (!redoStack.length) return
        const action = redoStack[redoStack.length - 1]
        setRedoStack(p => p.slice(0, -1))
        await supabase.from('sbfp_data').update({ [action.field]: action.newV }).eq('id', action.id)
        setRows(p => p.map(r => r.id === action.id ? { ...r, [action.field]: action.newV } : r))
        setUndoStack(p => [...p, action])
        await maybeRecompute(action.field)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undoStack, redoStack, dbYear, center])

  const handleSave = async (id: string, field: string, oldV: any, newV: any) => {
    let nextRow: any = null
    setRows(p => p.map(r => {
      if (r.id !== id) return r
      nextRow = { ...r, [field]: newV }
      return nextRow
    }))
    setUndoStack(p => [...p, { id, field, oldV, newV }])
    setRedoStack([])
    if (nextRow && (field === 'monthly_packs_delivered' || field === 'delivery_snapshots')) {
      const total = totalPacksDelivered(nextRow)
      if (total !== (Number(nextRow.packs_delivered) || 0)) {
        await supabase.from('sbfp_data').update({ packs_delivered: total }).eq('id', id)
        setRows(p => p.map(r => r.id === id ? { ...r, packs_delivered: total } : r))
      }
    }
    if (nextRow && field === 'sdo' && String(oldV) !== String(newV)) {
      await cascadeSdoRename(supabase, id, String(newV || ''), nextRow)
    } else if (
      nextRow &&
      (field === 'region' || field === 'milk_type' || field === 'batch' || field === 'feeding_days' || field === 'remarks')
    ) {
      await cascadeSdoFieldSync(supabase, id, nextRow)
    }
    await maybeRecompute(field)
  }

  const renameSnapDate = async (oldDate: string, newDate: string) => {
    if (!newDate || oldDate === newDate) return
    const taken = rows.some(r =>
      (r.delivery_snapshots || []).some((s: any) => s.date === newDate)
    ) || extraSnapDates.includes(newDate)
    if (taken) {
      alert(`A “Delivered as of ${newDate}” column already exists.`)
      return
    }
    setExtraSnapDates(p => p.map(d => d === oldDate ? newDate : d))
    await Promise.all(rows.map(async r => {
      const snaps = [...(r.delivery_snapshots || [])]
      const idx = snaps.findIndex((s: any) => s.date === oldDate)
      if (idx < 0) return
      snaps[idx] = { ...snaps[idx], date: newDate }
      const { error } = await supabase.from('sbfp_data').update({ delivery_snapshots: snaps }).eq('id', r.id)
      if (!error) {
        setRows(p => p.map(row => row.id === r.id ? { ...row, delivery_snapshots: snaps } : row))
      }
    }))
  }

  const addSnapDate = (iso: string) => {
    const parsed = parseSnapshotDate(iso)
    if (!parsed) return
    const label = formatDeliveredAsOf(parsed)
    const exists = extraSnapDates.includes(label) || rows.some(r =>
      (r.delivery_snapshots || []).some((s: any) => s.date === label)
    )
    if (exists) {
      alert(`A “Delivered as of ${label}” column already exists.`)
      return
    }
    setExtraSnapDates(p => [...p, label])
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this record? Linked drop-off schools and their masterlist rows will also be removed.')) return
    const { data: children } = await supabase
      .from('sbfp_dropoff_points')
      .select('id')
      .eq('sbfp_data_id', id)
    for (const child of children || []) {
      await unlinkDropoffFromMasterlist(supabase, child.id)
      await supabase.from('sbfp_dropoff_points').delete().eq('id', child.id)
    }
    await supabase.from('sbfp_data').delete().eq('id', id)
    setRows(p => p.filter(r => r.id !== id))
    await maybeRecompute('packs_to_deliver')
  }

  const handleAdd = async () => {
    if (!editable || !dbYear || center === 'OVERALL') return
    setAdding(true)
    const payload = {
      year: dbYear,
      center,
      region: '',
      sdo: 'New SDO',
      procurement_status: 'For Preparation',
      include_in_report: true,
      packs_to_deliver: 0,
      packs_delivered: 0,
      milk_type: 'PM',
      delivery_schedule: `FY ${dbYear}`,
      amount: 0,
      mode_of_procurement: 'Sagip Saka',
      beneficiaries_pm: 0,
      contract_amount: 0,
      delivery_snapshots: [],
      monthly_packs_delivered: {},
      raw_milk_prices: {},
    }
    const { data, error } = await supabase.from('sbfp_data').insert(payload).select().maybeSingle()
    setAdding(false)
    if (!error && data) {
      setRows(p => [...p, data])
      await maybeRecompute('packs_to_deliver')
    } else if (error) {
      alert(error.message)
    }
  }

  const toggleAll = () => setSelected(
    selected.size === rows.length ? new Set() : new Set(rows.map(r => r.id))
  )
  const toggleRow = (id: string) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const snapDates = Array.from(new Set([
    ...rows.flatMap(r => (r.delivery_snapshots || []).map((s: any) => s.date).filter(Boolean)),
    ...extraSnapDates,
  ])).sort((a, b) => {
    const da = parseSnapshotDate(a)?.getTime() ?? 0
    const db = parseSnapshotDate(b)?.getTime() ?? 0
    return da - db
  })

  const fmtNum  = (v: any) => (v != null && v !== 0 && v !== '') ? Number(v).toLocaleString() : 'N/A'
  const fmtPeso = (v: any) => (v != null && v !== 0 && v !== '') ? '₱' + Number(v).toLocaleString() : 'N/A'
  const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'

  // Sticky left identity columns so SDO stays visible while scrolling monthly packs/price/income.
  // Keep navy + white text so headers stay readable (globals .data-table th uses color:white).
  const stickyTh = (left: number, width: number, edge = false): CSSProperties => ({
    position: 'sticky', left, top: 0, zIndex: 20,
    width, minWidth: width, maxWidth: width,
    background: 'var(--navy)', color: '#fff',
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.18)' : undefined,
  })
  const stickyTd = (left: number, width: number, bg: string, edge = false): CSSProperties => ({
    position: 'sticky', left, zIndex: 5,
    width, minWidth: width, maxWidth: width,
    background: bg,
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.12)' : undefined,
  })

  return (
    <>
      {allowAdd && editable && center !== 'OVERALL' && dbYear && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              const el = addSnapRef.current
              if (el && typeof el.showPicker === 'function') el.showPicker()
              else el?.click()
            }}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium border bg-background hover:bg-muted"
          >
            <CalendarPlus size={14} />
            Add delivered-as-of date
          </button>
          <input
            ref={addSnapRef}
            type="date"
            onChange={e => {
              if (e.target.value) {
                addSnapDate(e.target.value)
                e.target.value = ''
              }
            }}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
            tabIndex={-1}
            aria-hidden
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={adding}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus size={14} />
            {adding ? 'Adding…' : 'Add SDO'}
          </button>
        </div>
      )}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
          <table className="data-table sbfp-center-table" style={{ minWidth: 3200, fontSize: '0.78rem', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th rowSpan={2} style={{ textAlign: 'center', ...stickyTh(0, 36) }}>
                  <input type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                <th rowSpan={2} style={{ textAlign: 'center', ...stickyTh(36, 60) }}>In Report?</th>
                <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, ...stickyTh(96, 150) }}>A — Status</th>
                <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, ...stickyTh(246, 140, true) }}>B — SDO</th>
                <th rowSpan={2} style={{ minWidth: 80,  whiteSpace: 'normal', lineHeight: 1.2 }}>C — Region</th>
                <th rowSpan={2} style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>D — Amount (₱)</th>
                <th rowSpan={2} style={{ minWidth: 145, whiteSpace: 'normal', lineHeight: 1.2 }}>E — Mode of Procurement</th>
                <th rowSpan={2} style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2 }}>F — Date Recd (Proc)</th>
                <th rowSpan={2} style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2 }}>G — PR Number</th>
                <th rowSpan={2} style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2 }}>H — ORS Date</th>
                <th rowSpan={2} style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2 }}>I — PO Number</th>
                <th rowSpan={2} style={{ minWidth: 80,  whiteSpace: 'normal', lineHeight: 1.2 }}>J — Batch</th>
                <th rowSpan={2} style={{ minWidth: 100, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>K — Beneficiaries</th>
                <th rowSpan={2} style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>L — Contract Amt (₱)</th>
                <th rowSpan={2} style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2 }}>M — Delivery Start</th>
                <th rowSpan={2} style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2 }}>N — Delivery End</th>
                <th rowSpan={2} style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>O — Packs to Deliver</th>
                {snapDates.map((d, i) => (
                  <SnapshotDateHeader
                    key={d}
                    letter={String.fromCharCode(80 + i)}
                    date={d}
                    editable={editable}
                    onRename={renameSnapDate}
                  />
                ))}
                {SBFP_RAW_MILK_MONTHS.map(m => (
                  <th
                    key={`grp-${m.key}`}
                    colSpan={3}
                    style={{
                      minWidth: 300, whiteSpace: 'nowrap', textAlign: 'center',
                      background: '#1e3a5f', color: '#fff',
                      borderLeft: '2px solid rgba(255,255,255,0.25)',
                    }}
                    title={`${m.label} packs completed this month × Raw ₱/L for ${m.label}`}
                  >
                    {m.label} {dbYear || ''}
                  </th>
                ))}
                <th
                  rowSpan={2}
                  style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right', background: '#92400e', color: '#fff' }}
                  title="Sum of each month’s income — only packs completed that month"
                >
                  Total Income
                </th>
                <th rowSpan={2} style={{ minWidth: 140, whiteSpace: 'normal', lineHeight: 1.2 }}>— Payment Status</th>
                <th rowSpan={2} style={{ minWidth: 185, whiteSpace: 'normal', lineHeight: 1.2 }}>— Remarks</th>
                {editable && <th rowSpan={2} style={{ minWidth: 70 }}>Actions</th>}
              </tr>
              <tr>
                {SBFP_RAW_MILK_MONTHS.map(m => (
                  <Fragment key={`sub-${m.key}`}>
                    <th style={{ minWidth: 100, whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'right', background: '#1e40af' }}>
                      Packs
                    </th>
                    <th style={{ minWidth: 90, whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'right', background: '#166534' }}>
                      Raw ₱/L
                    </th>
                    <th style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'right', background: '#9a3412' }}>
                      Income
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={17 + snapDates.length + SBFP_RAW_MILK_MONTHS.length * 3 + 3 + (editable ? 1 : 0)} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)' }}>
                    No records for {center}.
                  </td>
                </tr>
              )}
              {rows.map(r => {
                const isSelected = selected.has(r.id)
                const rowBg = isSelected ? '#e0e7ff' : !r.include_in_report ? '#fef2f2' : '#fff'
                return (
                  <tr key={r.id} style={{ background: rowBg }}>
                    <td style={{ textAlign: 'center', ...stickyTd(0, 36, rowBg) }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(r.id)} style={{ cursor: 'pointer' }} />
                    </td>

                    {/* In Report? toggle */}
                    {editable
                      ? <EditableCell id={r.id} field="include_in_report" value={r.include_in_report !== false} type="checkbox" onSave={handleSave} cellStyle={stickyTd(36, 60, rowBg)} />
                      : <td style={{ textAlign: 'center', ...stickyTd(36, 60, rowBg) }}>{r.include_in_report !== false ? '✓' : '✗'}</td>
                    }

                    {/* A — Status */}
                    {editable
                      ? <EditableCell id={r.id} field="procurement_status" value={r.procurement_status}
                          type="select" options={STATUSES} onSave={handleSave}
                          render={v => statusBadge(v)} cellStyle={stickyTd(96, 150, rowBg)} />
                      : <td style={stickyTd(96, 150, rowBg)}>{statusBadge(r.procurement_status)}</td>
                    }
                    {/* B — SDO */}
                    {editable
                      ? <EditableCell id={r.id} field="sdo" value={r.sdo} onSave={handleSave} cellStyle={stickyTd(246, 140, rowBg, true)} />
                      : <td style={stickyTd(246, 140, rowBg, true)}>{r.sdo || 'N/A'}</td>
                    }
                    {/* C — Region */}
                    {editable
                      ? <EditableCell id={r.id} field="region" value={r.region} onSave={handleSave} />
                      : <td>{r.region || 'N/A'}</td>
                    }
                    {/* D — Amount */}
                    {editable
                      ? <EditableCell id={r.id} field="amount" value={r.amount} type="number" align="right" format={fmtPeso} onSave={handleSave} />
                      : <td style={{ textAlign: 'right' }}>{fmtPeso(r.amount)}</td>
                    }
                    {/* E — Mode */}
                    {editable
                      ? <EditableCell id={r.id} field="mode_of_procurement" value={r.mode_of_procurement} type="select" options={MODES} onSave={handleSave} />
                      : <td>{r.mode_of_procurement || 'N/A'}</td>
                    }
                    {/* F — PR Date */}
                    {editable
                      ? <EditableCell id={r.id} field="pr_date_received" value={r.pr_date_received} type="date" format={fmtDate} onSave={handleSave} />
                      : <td>{fmtDate(r.pr_date_received)}</td>
                    }
                    {/* G — PR Number */}
                    {editable
                      ? <EditableCell id={r.id} field="pr_number" value={r.pr_number} onSave={handleSave} />
                      : <td>{r.pr_number || 'N/A'}</td>
                    }
                    {/* H — ORS Date */}
                    {editable
                      ? <EditableCell id={r.id} field="ors_date" value={r.ors_date} type="date" format={fmtDate} onSave={handleSave} />
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
                      ? <EditableCell id={r.id} field="beneficiaries_pm" value={r.beneficiaries_pm} type="number" align="right" format={fmtNum} onSave={handleSave} />
                      : <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.beneficiaries_pm)}</td>
                    }
                    {/* L — Contract Amount */}
                    {editable
                      ? <EditableCell id={r.id} field="contract_amount" value={r.contract_amount} type="number" align="right" format={fmtPeso} onSave={handleSave} />
                      : <td style={{ textAlign: 'right' }}>{fmtPeso(r.contract_amount)}</td>
                    }
                    {/* M — Delivery Start */}
                    {editable
                      ? <EditableCell id={r.id} field="delivery_start" value={r.delivery_start} type="date" format={fmtDate} onSave={handleSave} />
                      : <td>{fmtDate(r.delivery_start)}</td>
                    }
                    {/* N — Delivery End */}
                    {editable
                      ? <EditableCell id={r.id} field="delivery_end" value={r.delivery_end} type="date" format={fmtDate} onSave={handleSave} />
                      : <td>{fmtDate(r.delivery_end)}</td>
                    }
                    {/* O — Packs to Deliver */}
                    {editable
                      ? <EditableCell id={r.id} field="packs_to_deliver" value={r.packs_to_deliver} type="number" align="right" format={fmtNum} onSave={handleSave} />
                      : <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmtNum(r.packs_to_deliver)}</td>
                    }
                    {snapDates.map(d => (
                      <SnapshotCell
                        key={`${r.id}-${d}`}
                        id={r.id}
                        date={d}
                        snaps={r.delivery_snapshots || []}
                        editable={editable}
                        onSave={handleSave}
                      />
                    ))}
                    {SBFP_RAW_MILK_MONTHS.map((m, mi) => {
                      const monthNum = parseInt(m.key, 10)
                      const packMap = readMonthlyMap(r.monthly_packs_delivered)
                      const priceMap = readMonthlyMap(r.raw_milk_prices)
                      const derived = incrementFromSnapshots(r.delivery_snapshots, monthNum, dbYear)
                      const packs = packsForMonth(r, monthNum, { year: dbYear })
                      const price = Number(priceMap[m.key]) || 0
                      const income = incomeForMonth(r, monthNum, { year: dbYear })
                      const liters = rawMilkUtilizedLiters(packs)
                      return (
                        <Fragment key={`${r.id}-m-${m.key}`}>
                          {editable
                            ? <MonthlyMapCell
                                id={r.id}
                                field="monthly_packs_delivered"
                                monthKey={m.key}
                                map={packMap}
                                derived={derived}
                                background={mi === 0 ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.04)'}
                                onSave={handleSave}
                              />
                            : <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.04)' }}>
                                {packs ? packs.toLocaleString() : '—'}
                              </td>
                          }
                          {editable
                            ? <MonthlyMapCell
                                id={r.id}
                                field="raw_milk_prices"
                                monthKey={m.key}
                                map={priceMap}
                                format={v => `₱${Number(v).toLocaleString()}`}
                                onSave={handleSave}
                              />
                            : <td style={{ textAlign: 'right', background: 'rgba(16,185,129,0.06)' }}>
                                {price ? `₱${price.toLocaleString()}` : '—'}
                              </td>
                          }
                          <td
                            style={{ textAlign: 'right', background: 'rgba(245,158,11,0.06)', color: income ? '#92400e' : undefined }}
                            title={packs && price
                              ? `${m.short}: ${packs.toLocaleString()} packs completed this month → ${liters.toLocaleString()} L × ₱${price}`
                              : `Needs ${m.short} packs completed + Raw ₱/L for ${m.short}`}
                          >
                            {income ? `₱${income.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                          </td>
                        </Fragment>
                      )
                    })}
                    {(() => {
                      const totalIncome = sumRowIncome(r, { year: dbYear })
                      return (
                        <td
                          style={{ textAlign: 'right', fontWeight: 700, background: 'rgba(245,158,11,0.1)', color: totalIncome ? '#92400e' : undefined }}
                          title="Sum of monthly incomes (each month uses only packs completed that month)"
                        >
                          {totalIncome ? `₱${totalIncome.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
                        </td>
                      )
                    })()}
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

      {/* Floating multi-delete bar */}
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
            if (!confirm(`Delete ${selected.size} selected records? Linked drop-off schools will also be removed.`)) return
            ;(async () => {
              for (const id of selected) {
                const { data: children } = await supabase
                  .from('sbfp_dropoff_points')
                  .select('id')
                  .eq('sbfp_data_id', id)
                for (const child of children || []) {
                  await unlinkDropoffFromMasterlist(supabase, child.id)
                  await supabase.from('sbfp_dropoff_points').delete().eq('id', child.id)
                }
                await supabase.from('sbfp_data').delete().eq('id', id)
              }
              setRows(p => p.filter(r => !selected.has(r.id)))
              setSelected(new Set())
              await maybeRecompute('packs_to_deliver')
            })()
          }} className="btn btn-gold" style={{ padding: '0.5rem 1rem', borderRadius: 50, background: '#ef4444', border: 'none' }}>
            <Trash2 size={14} /> Delete Selected
          </button>
        </div>
      )}
    </>
  )
}
