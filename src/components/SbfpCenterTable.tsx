'use client'

import { useState, useEffect, useRef, Fragment, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Trash2, Plus, CalendarPlus } from 'lucide-react'
import type { Cooperative } from '@/lib/types'
import { recomputeCenterSummary } from '@/lib/sbfp-compute'
import {
  SBFP_RAW_MILK_MONTHS,
  readMonthlyMap,
  packsForMonth,
  totalPacksDelivered,
  incomeForMonth,
  sumRowIncome,
  rawMilkUtilizedLiters,
  formatDeliveredAsOf,
  parseSnapshotDate,
  toDateInputValue,
  monthKeyFromDateValue,
} from '@/lib/sbfp-raw-milk'
import {
  SBFP_MILK_TYPE_VALUES,
  packsFromAmount,
  resolvePackUnitPrice,
  normalizeSbfpMilkType,
  fixedPackPriceForMilkType,
  inferSbfpMilkType,
} from '@/lib/sbfp-pack-price'
import { useAsyncTask } from '@/components/loading/AsyncFeedback'

async function apiDropoffMasterlist(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch('/api/sbfp/sync-dropoff', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({} as { error?: string }))
  if (!res.ok) return json.error || 'Masterlist sync failed'
  return null
}

async function cascadeMasterlistFromSdo(row: Record<string, unknown>): Promise<void> {
  if (!row?.id) return
  const err = await apiDropoffMasterlist({
    action: 'cascade-fields',
    sbfpDataId: String(row.id),
    parent: row,
  })
  if (err) console.warn('Masterlist delivery cascade:', err)
}

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
const MILK_TYPES = [...SBFP_MILK_TYPE_VALUES]

// ─────────────────────────────────────────────
// Editable cell
// ─────────────────────────────────────────────
function EditableCell({
  id, field, value, type = 'text', options, align = 'left',
  format, render, onSave, cellStyle, title,
}: {
  id: string; field: string; value: any; type?: string; options?: string[];
  align?: 'left' | 'right' | 'center';
  format?: (v: any) => any; render?: (v: any) => React.ReactNode;
  onSave: (id: string, f: string, oldV: any, newV: any) => void
  cellStyle?: CSSProperties
  title?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value)
  const [saving, setSaving]   = useState(false)
  const ref                   = useRef<any>(null)
  const supabase              = createClient()

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async (override?: any) => {
    const nextVal = override !== undefined ? override : val
    if (nextVal === value) { setEditing(false); return }
    setSaving(true)
    let v: any = nextVal
    if (type === 'number') v = nextVal === '' || nextVal == null ? null : Number(nextVal)
    if (type === 'checkbox') v = nextVal
    const { error } = await supabase.from('sbfp_data').update({ [field]: v }).eq('id', id)
    if (!error) {
      setVal(nextVal)
      onSave(id, field, value, v)
    } else setVal(value)
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

  // Always-visible select — change applies immediately (milk type, etc.)
  if (type === 'select' && options && !editing) {
    return (
      <td title={title} style={{ padding: 2, opacity: saving ? 0.5 : 1, ...cellStyle }}>
        <select
          value={val || ''}
          disabled={saving}
          onChange={e => {
            const next = e.target.value
            setVal(next)
            void save(next)
          }}
          style={{
            width: '100%', border: '1px solid transparent', background: 'transparent',
            fontSize: 'inherit', cursor: 'pointer', boxSizing: 'border-box',
          }}
        >
          <option value="">—</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
    )
  }

  if (editing) {
    if (type === 'select' && options) {
      return (
        <td style={{ padding: 2, background: '#fff', ...cellStyle }}>
          <select ref={ref} value={val || ''} onBlur={() => save()} onKeyDown={onKey}
            onChange={e => { const next = e.target.value; setVal(next); void save(next) }}
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
          onChange={e => setVal(e.target.value)} onBlur={() => save()} onKeyDown={onKey}
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
    <td
      title={title}
      style={{ cursor: 'text', textAlign: align, opacity: saving ? 0.5 : 1, ...cellStyle }}
      onClick={() => setEditing(true)}
    >
      {display}
    </td>
  )
}

function CoopSelectCell({
  id,
  value,
  cooperatives,
  editable,
  onSave,
}: {
  id: string
  value: string | null | undefined
  cooperatives: Cooperative[]
  editable: boolean
  onSave: (id: string, field: string, oldV: any, newV: any) => void
}) {
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [val, setVal] = useState(value || '')
  useEffect(() => { setVal(value || '') }, [value])
  const label = cooperatives.find(c => c.id === val)?.name

  if (!editable) {
    return <td title={label}>{label || 'N/A'}</td>
  }

  return (
    <td title="Applies to every drop-off school under this SDO in the masterlist" style={{ padding: 2, opacity: saving ? 0.5 : 1 }}>
      <select
        value={val}
        disabled={saving}
        onChange={async e => {
          const next = e.target.value || null
          setVal(next || '')
          setSaving(true)
          const { error } = await supabase.from('sbfp_data').update({ supplier_id: next }).eq('id', id)
          if (!error) onSave(id, 'supplier_id', value || null, next)
          else {
            setVal(value || '')
            alert(
              error.message.includes('supplier_id')
                ? 'Coop column is not in the database yet. Run supabase/migrations/20260909120000_sbfp_supplier_id.sql in Supabase SQL Editor, then refresh.'
                : error.message,
            )
          }
          setSaving(false)
        }}
        style={{
          width: '100%', minWidth: 140, border: '1px solid transparent', background: 'transparent',
          fontSize: 'inherit', cursor: 'pointer', boxSizing: 'border-box',
        }}
      >
        <option value="">—</option>
        {cooperatives.map(c => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
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
  letter, date, editable, onRename, onDelete,
}: {
  letter: string
  date: string
  editable: boolean
  onRename: (oldDate: string, newDate: string) => void
  onDelete: (date: string) => void
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
      title={editable ? 'Click the date to rename, or trash to delete this Delivered-as-of column' : undefined}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 6 }}>
        <div style={{ flex: 1, textAlign: 'right' }}>
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
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => onDelete(date)}
            title={`Delete “Delivered as of ${date}” column`}
            aria-label={`Delete Delivered as of ${date} column`}
            style={{
              flexShrink: 0, marginTop: 1, width: 22, height: 22, borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(239,68,68,0.25)',
              color: '#fecaca', cursor: 'pointer', display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', padding: 0,
            }}
          >
            <Trash2 size={12} />
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
  const [cooperatives, setCooperatives] = useState<Cooperative[]>([])
  const addSnapRef                = useRef<HTMLInputElement>(null)
  const editable                  = userRole !== 'viewer'
  const dbYear                    = year ?? (initialRecords[0]?.year as number | undefined)
  const runTask                   = useAsyncTask('Saving…')

  const cascadeWithFeedback = (row: Record<string, unknown>) => {
    // Fire-and-forget — encoders keep editing while masterlist syncs in the background
    void cascadeMasterlistFromSdo(row).catch(err => console.warn('Masterlist sync:', err))
  }

  useEffect(() => { setRows(initialRecords) }, [initialRecords])
  useEffect(() => {
    supabase
      .from('cooperatives')
      .select('id, name, short_name, region, is_active, created_at')
      .order('name')
      .then(({ data }) => {
        const list = (data || []) as Cooperative[]
        setCooperatives(list.filter(c => c.is_active !== false))
      })
  }, [])

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
        nextRow = { ...nextRow, packs_delivered: total }
        setRows(p => p.map(r => r.id === id ? { ...r, packs_delivered: total } : r))
      }
      cascadeWithFeedback(nextRow)
    }

    // Amount / milk type / CM pack ₱ → packs_to_deliver = amount ÷ ₱ per pack
    if (
      nextRow &&
      (field === 'amount' || field === 'milk_type' || field === 'pack_unit_price')
    ) {
      const milk = normalizeSbfpMilkType(nextRow.milk_type) || String(nextRow.milk_type || '').toUpperCase()
      let packPrice: number | null | undefined = nextRow.pack_unit_price
      if (milk === 'PM' || milk === 'SM') {
        packPrice = fixedPackPriceForMilkType(milk)
        if (nextRow.pack_unit_price != null) {
          const { error: clearErr } = await supabase
            .from('sbfp_data')
            .update({ pack_unit_price: null })
            .eq('id', id)
          if (!clearErr) {
            nextRow = { ...nextRow, pack_unit_price: null }
            setRows(p => p.map(r => r.id === id ? { ...r, pack_unit_price: null } : r))
          }
        }
      }
      const derived = packsFromAmount(nextRow.amount, milk, packPrice)
      // CM without Pack ₱ yet → clear packs; otherwise write Amount ÷ price
      const nextPacks = derived != null ? derived : (milk === 'CM' ? 0 : null)
      if (nextPacks != null && nextPacks !== (Number(nextRow.packs_to_deliver) || 0)) {
        const { error: packErr } = await supabase
          .from('sbfp_data')
          .update({ packs_to_deliver: nextPacks })
          .eq('id', id)
        if (!packErr) {
          nextRow = { ...nextRow, packs_to_deliver: nextPacks }
          setRows(p => p.map(r => r.id === id ? { ...r, packs_to_deliver: nextPacks } : r))
          cascadeWithFeedback(nextRow)
        } else {
          alert(`Could not update Packs to Deliver: ${packErr.message}`)
        }
      } else if (milk === 'CM' && derived == null && !(Number(nextRow.amount) > 0)) {
        // no-op: need Amount first
      } else if (milk === 'CM' && derived == null) {
        // waiting for Pack ₱ — packs already cleared above if needed
      } else if ((milk === 'PM' || milk === 'SM') && !(Number(nextRow.amount) > 0)) {
        alert('Enter Amount (₱) first — Packs to Deliver = Amount ÷ Pack ₱')
      }
    }

    if (nextRow && field === 'sdo' && String(oldV) !== String(newV)) {
      // Auto-detect milk type from label e.g. "Zambales (SM)" → SM
      const inferred = inferSbfpMilkType(String(newV || ''))
      if (inferred && inferred !== normalizeSbfpMilkType(nextRow.milk_type)) {
        await supabase.from('sbfp_data').update({ milk_type: inferred }).eq('id', id)
        nextRow = { ...nextRow, milk_type: inferred }
        setRows(p => p.map(r => r.id === id ? { ...r, milk_type: inferred } : r))
        // Recalc packs from Amount ÷ milk pack ₱
        const price = inferred === 'CM' ? nextRow.pack_unit_price : fixedPackPriceForMilkType(inferred)
        const derived = packsFromAmount(nextRow.amount, inferred, price)
        if (derived != null && derived !== (Number(nextRow.packs_to_deliver) || 0)) {
          await supabase.from('sbfp_data').update({ packs_to_deliver: derived }).eq('id', id)
          nextRow = { ...nextRow, packs_to_deliver: derived }
          setRows(p => p.map(r => r.id === id ? { ...r, packs_to_deliver: derived } : r))
        }
      }
      void apiDropoffMasterlist({
        action: 'cascade-rename',
        sbfpDataId: id,
        newSdoName: String(newV || ''),
        parent: nextRow,
      }).then(err => {
        if (err) alert(err)
      })
    } else if (
      nextRow &&
      (field === 'region' ||
        field === 'milk_type' ||
        field === 'batch' ||
        field === 'feeding_days' ||
        field === 'remarks' ||
        field === 'delivery_start' ||
        field === 'delivery_end' ||
        field === 'packs_to_deliver' ||
        field === 'packs_delivered' ||
        field === 'supplier_id')
    ) {
      void apiDropoffMasterlist({
        action: 'cascade-fields',
        sbfpDataId: id,
        parent: nextRow,
      }).then(err => {
        if (err) alert(err)
      })
    }
    await maybeRecompute(field === 'amount' || field === 'milk_type' || field === 'pack_unit_price' ? 'packs_to_deliver' : field)
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

  const deleteSnapDate = async (date: string) => {
    if (!editable || !date) return
    const hasValues = rows.some(r =>
      (r.delivery_snapshots || []).some((s: any) => s.date === date && Number(s.packs) > 0)
    )
    const ok = confirm(
      hasValues
        ? `Delete the “Delivered as of ${date}” column and clear its packs for all SDOs?`
        : `Delete the “Delivered as of ${date}” column?`,
    )
    if (!ok) return

    setExtraSnapDates(p => p.filter(d => d !== date))

    await runTask(async () => {
    await Promise.all(rows.map(async r => {
      const oldSnaps = [...(r.delivery_snapshots || [])]
      if (!oldSnaps.some((s: any) => s.date === date)) return
      const newSnaps = oldSnaps.filter((s: any) => s.date !== date)
      const nextRow = { ...r, delivery_snapshots: newSnaps }
      const total = totalPacksDelivered(nextRow)
      const { error } = await supabase
        .from('sbfp_data')
        .update({ delivery_snapshots: newSnaps, packs_delivered: total })
        .eq('id', r.id)
      if (!error) {
        setRows(p => p.map(row =>
          row.id === r.id ? { ...row, delivery_snapshots: newSnaps, packs_delivered: total } : row
        ))
        cascadeWithFeedback(nextRow)
      }
    }))
    await maybeRecompute('delivery_snapshots')
    }, 'Updating delivery columns…', { blocking: true })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this record? Linked drop-off schools and their masterlist rows will also be removed.')) return
    await runTask(async () => {
      const { data: children } = await supabase
        .from('sbfp_dropoff_points')
        .select('id')
        .eq('sbfp_data_id', id)
      for (const child of children || []) {
        const err = await apiDropoffMasterlist({ action: 'unlink', dropoffId: child.id })
        if (err) { alert(err); return }
        await supabase.from('sbfp_dropoff_points').delete().eq('id', child.id)
      }
      await supabase.from('sbfp_data').delete().eq('id', id)
      setRows(p => p.filter(r => r.id !== id))
      await maybeRecompute('packs_to_deliver')
    }, 'Deleting record…', { blocking: true })
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
      pack_unit_price: null,
      delivery_schedule: `FY ${dbYear}`,
      amount: 0,
      mode_of_procurement: 'Sagip Saka',
      beneficiaries_pm: 0,
      contract_amount: 0,
      delivery_snapshots: [],
      monthly_packs_delivered: {},
      raw_milk_prices: {},
      supplier_id: null,
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

  // Packs / Raw ₱/L / Income month groups only appear when a Delivered-as-of date exists for that month
  const visibleRawMonths = SBFP_RAW_MILK_MONTHS.filter(m =>
    snapDates.some(d => monthKeyFromDateValue(d) === m.key)
  )

  const fmtNum  = (v: any) => (v != null && v !== 0 && v !== '') ? Number(v).toLocaleString() : 'N/A'
  const fmtPeso = (v: any) => (v != null && v !== 0 && v !== '') ? '₱' + Number(v).toLocaleString() : 'N/A'
  const fmtDate = (v: any) => v ? new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'

  // Sticky: first 4 columns (checkbox + In Report? + Status + SDO).
  const stickyTh = (left: number, width: number, edge = false, z = 20): CSSProperties => ({
    position: 'sticky', left, top: 0, zIndex: z,
    width, minWidth: width, maxWidth: width,
    background: 'var(--navy)', color: '#fff',
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.18)' : undefined,
  })
  const stickyTd = (left: number, width: number, bg: string, edge = false, z = 5): CSSProperties => ({
    position: 'sticky', left, zIndex: z,
    width, minWidth: width, maxWidth: width,
    background: bg,
    boxShadow: edge ? '3px 0 6px rgba(15,23,42,0.12)' : undefined,
  })
  const SL = { check: 0, report: 36, status: 96, sdo: 246 } as const
  const SW = { check: 36, report: 60, status: 150, sdo: 140 } as const

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
                <th rowSpan={2} style={{ textAlign: 'center', ...stickyTh(SL.check, SW.check, false, 24) }}>
                  <input type="checkbox"
                    checked={rows.length > 0 && selected.size === rows.length}
                    onChange={toggleAll} style={{ cursor: 'pointer' }} />
                </th>
                <th rowSpan={2} style={{ textAlign: 'center', ...stickyTh(SL.report, SW.report, false, 23) }}>In Report?</th>
                <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, ...stickyTh(SL.status, SW.status, false, 22) }}>A — Status</th>
                <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, ...stickyTh(SL.sdo, SW.sdo, true, 21) }}>B — SDO</th>
                <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 80 }}>C — Region</th>
                <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right', minWidth: 110 }}>D — Amount (₱)</th>
                <th
                  rowSpan={2}
                  style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 90 }}
                  title="PM → packs = Amount÷25 · SM → Amount÷30 · CM → Amount÷Pack ₱ you type"
                >
                  — Milk type
                </th>
                <th
                  rowSpan={2}
                  style={{ whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right', minWidth: 90 }}
                  title="₱ per pack. Fixed for PM (25) / SM (30). For CM, type the commercial pack cost — Packs to Deliver updates automatically."
                >
                  — Pack ₱
                </th>
                <th rowSpan={2} style={{ whiteSpace: 'normal', lineHeight: 1.2, minWidth: 145 }}>E — Mode of Procurement</th>
                <th
                  rowSpan={2}
                  style={{ minWidth: 180, whiteSpace: 'normal', lineHeight: 1.2 }}
                  title="Cooperative for this SDO. Saved to every drop-off school under this SDO on the masterlist (PIMD coop count)."
                >
                  — Coop
                </th>
                <th rowSpan={2} style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2 }}>F — Date Recd (Proc)</th>
                <th rowSpan={2} style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2 }}>G — PR Number</th>
                <th rowSpan={2} style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2 }}>H — ORS Date</th>
                <th rowSpan={2} style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2 }}>I — PO Number</th>
                <th rowSpan={2} style={{ minWidth: 80,  whiteSpace: 'normal', lineHeight: 1.2 }}>J — Batch</th>
                <th rowSpan={2} style={{ minWidth: 100, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>K — Beneficiaries</th>
                <th rowSpan={2} style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>L — Contract Amt (₱)</th>
                <th
                  rowSpan={2}
                  style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2 }}
                  title="Also sets Date Started on all linked drop-off schools in the masterlist"
                >
                  M — Delivery Start
                </th>
                <th
                  rowSpan={2}
                  style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2 }}
                  title="Also sets Date Completed on all linked drop-off schools in the masterlist"
                >
                  N — Delivery End
                </th>
                <th
                  rowSpan={2}
                  style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}
                  title="Auto: Amount ÷ Pack ₱ (PM=25, SM=30, CM=typed). You can still override."
                >
                  O — Packs to Deliver
                </th>
                {snapDates.map((d, i) => (
                  <SnapshotDateHeader
                    key={d}
                    letter={String.fromCharCode(80 + i)}
                    date={d}
                    editable={editable}
                    onRename={renameSnapDate}
                    onDelete={deleteSnapDate}
                  />
                ))}
                {visibleRawMonths.map(m => (
                  <th
                    key={`grp-${m.key}`}
                    colSpan={3}
                    style={{
                      minWidth: 300, whiteSpace: 'nowrap', textAlign: 'center',
                      background: '#1e3a5f', color: '#fff',
                      borderLeft: '2px solid rgba(255,255,255,0.25)',
                    }}
                    title={`Raw milk used (L) and income for ${m.label} — packs come from Delivered-as-of dates`}
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
                {visibleRawMonths.map(m => (
                  <Fragment key={`sub-${m.key}`}>
                    <th
                      style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.15, textAlign: 'right', background: '#1e40af' }}
                      title={`Raw Milk used (L) = (packs ÷ 5) × 0.20`}
                    >
                      Raw milk used (L)
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
                  <td colSpan={20 + snapDates.length + visibleRawMonths.length * 3 + 3 + (editable ? 1 : 0)} style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)' }}>
                    No records for {center}.
                  </td>
                </tr>
              )}
              {rows.map(r => {
                const isSelected = selected.has(r.id)
                const rowBg = isSelected ? '#e0e7ff' : !r.include_in_report ? '#fef2f2' : '#fff'
                return (
                  <tr key={r.id} style={{ background: rowBg }}>
                    <td style={{ textAlign: 'center', ...stickyTd(SL.check, SW.check, rowBg, false, 8) }}>
                      <input type="checkbox" checked={isSelected} onChange={() => toggleRow(r.id)} style={{ cursor: 'pointer' }} />
                    </td>

                    {/* In Report? toggle */}
                    {editable
                      ? <EditableCell id={r.id} field="include_in_report" value={r.include_in_report !== false} type="checkbox" onSave={handleSave} cellStyle={stickyTd(SL.report, SW.report, rowBg, false, 7)} />
                      : <td style={{ textAlign: 'center', ...stickyTd(SL.report, SW.report, rowBg, false, 7) }}>{r.include_in_report !== false ? '✓' : '✗'}</td>
                    }

                    {/* A — Status */}
                    {editable
                      ? <EditableCell id={r.id} field="procurement_status" value={r.procurement_status}
                          type="select" options={STATUSES} onSave={handleSave}
                          render={v => statusBadge(v)} cellStyle={stickyTd(SL.status, SW.status, rowBg, false, 6)} />
                      : <td style={stickyTd(SL.status, SW.status, rowBg, false, 6)}>{statusBadge(r.procurement_status)}</td>
                    }
                    {/* B — SDO */}
                    {editable
                      ? <EditableCell id={r.id} field="sdo" value={r.sdo} onSave={handleSave} cellStyle={stickyTd(SL.sdo, SW.sdo, rowBg, true, 5)} />
                      : <td style={stickyTd(SL.sdo, SW.sdo, rowBg, true, 5)}>{r.sdo || 'N/A'}</td>
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
                    {/* Milk type PM / SM / CM */}
                    {editable
                      ? <EditableCell
                          id={r.id}
                          field="milk_type"
                          value={normalizeSbfpMilkType(r.milk_type) || r.milk_type || 'PM'}
                          type="select"
                          options={MILK_TYPES}
                          onSave={handleSave}
                          title="PM ₱25 · SM ₱30 · CM type Pack ₱"
                        />
                      : <td>{normalizeSbfpMilkType(r.milk_type) || r.milk_type || 'N/A'}</td>
                    }
                    {/* Pack ₱ — fixed for PM/SM, editable for CM */}
                    {(() => {
                      const milk = normalizeSbfpMilkType(r.milk_type) || r.milk_type
                      const shown = resolvePackUnitPrice(r)
                      if (milk === 'CM' && editable) {
                        return (
                          <EditableCell
                            id={r.id}
                            field="pack_unit_price"
                            value={r.pack_unit_price}
                            type="number"
                            align="right"
                            format={v => (v != null && v !== '' ? `₱${Number(v).toLocaleString()}` : '—')}
                            onSave={handleSave}
                            title="Type commercial milk ₱ per pack — packs = Amount ÷ this"
                          />
                        )
                      }
                      return (
                        <td
                          style={{ textAlign: 'right', color: shown ? undefined : 'var(--gray-400)' }}
                          title={milk === 'CM' ? 'Set Pack ₱ for commercial milk' : milk === 'PM' ? 'PM fixed ₱25/pack' : milk === 'SM' ? 'SM fixed ₱30/pack' : 'Select milk type'}
                        >
                          {shown ? `₱${shown.toLocaleString()}` : '—'}
                        </td>
                      )
                    })()}
                    {/* E — Mode */}
                    {editable
                      ? <EditableCell id={r.id} field="mode_of_procurement" value={r.mode_of_procurement} type="select" options={MODES} onSave={handleSave} />
                      : <td>{r.mode_of_procurement || 'N/A'}</td>
                    }
                    <CoopSelectCell
                      id={r.id}
                      value={r.supplier_id}
                      cooperatives={cooperatives}
                      editable={editable}
                      onSave={handleSave}
                    />
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
                    {visibleRawMonths.map((m, mi) => {
                      const monthNum = parseInt(m.key, 10)
                      const priceMap = readMonthlyMap(r.raw_milk_prices)
                      const packs = packsForMonth(r, monthNum, { year: dbYear })
                      const price = Number(priceMap[m.key]) || 0
                      const income = incomeForMonth(r, monthNum, { year: dbYear })
                      const liters = rawMilkUtilizedLiters(packs)
                      return (
                        <Fragment key={`${r.id}-m-${m.key}`}>
                          <td
                            style={{
                              textAlign: 'right',
                              background: mi === 0 ? 'rgba(59,130,246,0.08)' : 'rgba(59,130,246,0.04)',
                              fontWeight: liters ? 600 : undefined,
                              color: liters ? '#1e40af' : undefined,
                            }}
                            title={packs
                              ? `Raw Milk used for the month of ${m.label} ${dbYear || ''} (L)\n${packs.toLocaleString()} packs → (${packs.toLocaleString()} ÷ 5) × 0.20 = ${liters.toLocaleString(undefined, { maximumFractionDigits: 4 })} L`
                              : `Enter packs in Delivered-as-of columns to compute raw milk used for ${m.label}`}
                          >
                            {liters
                              ? liters.toLocaleString(undefined, { maximumFractionDigits: 2 })
                              : '—'}
                          </td>
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
                              ? `${m.short}: ${liters.toLocaleString(undefined, { maximumFractionDigits: 2 })} L × ₱${price}`
                              : `Needs ${m.short} delivered packs + Raw ₱/L for ${m.short}`}
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
                  const err = await apiDropoffMasterlist({ action: 'unlink', dropoffId: child.id })
                  if (err) { alert(err); return }
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
