'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Trash2 } from 'lucide-react'
import { Spinner } from '@/components/loading/Spinner'
import { formatDeliveredAsOf, parseSnapshotDate, toDateInputValue } from '@/lib/sbfp-raw-milk'

function CellSavingOverlay({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <div className="cell-saving-overlay">
      <Spinner size={12} />
    </div>
  )
}

export function ProcEditableCell({
  table,
  id,
  field,
  value,
  type = 'text',
  options,
  align = 'left',
  format,
  onSave,
  cellStyle,
  title,
}: {
  table: string
  id: string
  field: string
  value: any
  type?: string
  options?: string[]
  align?: 'left' | 'right' | 'center'
  format?: (v: any) => any
  onSave: (id: string, f: string, oldV: any, newV: any) => void
  cellStyle?: CSSProperties
  title?: string
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<any>(null)
  const supabase = createClient()

  useEffect(() => {
    setVal(value)
  }, [value])
  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  const save = async (override?: any) => {
    const nextVal = override !== undefined ? override : val
    if (nextVal === value) {
      setEditing(false)
      return
    }
    setSaving(true)
    let v: any = nextVal
    if (type === 'number') v = nextVal === '' || nextVal == null ? null : Number(nextVal)
    if (type === 'checkbox') v = nextVal
    const { error } = await supabase.from(table).update({ [field]: v }).eq('id', id)
    if (!error) {
      setVal(nextVal)
      onSave(id, field, value, v)
    } else setVal(value)
    setSaving(false)
    setEditing(false)
  }

  if (type === 'checkbox') {
    return (
      <td style={{ textAlign: 'center', opacity: saving ? 0.5 : 1, ...cellStyle }}>
        <input
          type="checkbox"
          checked={!!val}
          onChange={async e => {
            const newVal = e.target.checked
            setVal(newVal)
            setSaving(true)
            const { error } = await supabase.from(table).update({ [field]: newVal }).eq('id', id)
            if (!error) onSave(id, field, value, newVal)
            else setVal(value)
            setSaving(false)
          }}
          style={{ cursor: 'pointer', width: 15, height: 15 }}
        />
      </td>
    )
  }

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
            width: '100%',
            border: '1px solid transparent',
            background: 'transparent',
            fontSize: 'inherit',
            cursor: 'pointer',
          }}
        >
          <option value="">—</option>
          {options.map(o => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </td>
    )
  }

  if (type === 'date' && !editing) {
    const display =
      val === null || val === undefined || val === ''
        ? 'N/A'
        : format
          ? format(val)
          : String(val).slice(0, 10)
    return (
      <td
        title={title}
        style={{ cursor: 'text', position: 'relative', opacity: saving ? 0.85 : 1, ...cellStyle }}
        onClick={() => !saving && setEditing(true)}
      >
        {display}
        <CellSavingOverlay show={saving} />
      </td>
    )
  }

  if (editing) {
    if (type === 'date') {
      return (
        <td style={{ padding: 2, background: '#fff', ...cellStyle }}>
          <input
            ref={ref}
            type="date"
            value={toDateInputValue(val)}
            disabled={saving}
            onChange={e => setVal(e.target.value)}
            onBlur={() => save()}
            onKeyDown={e => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setVal(value)
                setEditing(false)
              }
            }}
            style={{ width: '100%', border: '1px solid #3b82f6', fontSize: 'inherit' }}
          />
        </td>
      )
    }
    if (type === 'select' && options) {
      return (
        <td style={{ padding: 2, background: '#fff', ...cellStyle }}>
          <select
            ref={ref}
            value={val || ''}
            onBlur={() => save()}
            onChange={e => {
              const next = e.target.value
              setVal(next)
              void save(next)
            }}
            style={{ width: '100%', border: '1px solid #3b82f6', fontSize: 'inherit' }}
          >
            <option value="">—</option>
            {options.map(o => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </td>
      )
    }
    return (
      <td style={{ padding: 2, background: '#fff', ...cellStyle }}>
        <input
          ref={ref}
          type={type}
          value={val ?? ''}
          disabled={saving}
          onChange={e => setVal(e.target.value)}
          onBlur={() => save()}
          onKeyDown={e => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setVal(value)
              setEditing(false)
            }
          }}
          style={{
            width: '100%',
            border: '1px solid #3b82f6',
            padding: '2px 4px',
            fontSize: 'inherit',
            textAlign: type === 'number' ? 'right' : 'left',
          }}
        />
      </td>
    )
  }

  const display =
    val === null || val === undefined || val === '' ? 'N/A' : format ? format(val) : val

  return (
    <td
      title={title}
      style={{ cursor: 'text', textAlign: align, position: 'relative', opacity: saving ? 0.85 : 1, ...cellStyle }}
      onClick={() => !saving && setEditing(true)}
    >
      {display}
      <CellSavingOverlay show={saving} />
    </td>
  )
}

export function ProcSnapshotCell({
  table,
  id,
  date,
  snaps,
  editable,
  onSave,
}: {
  table: string
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

  useEffect(() => {
    setVal(display)
  }, [display])
  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  const save = async () => {
    const nextNum = val === '' || val == null ? null : Number(val)
    const oldSnaps = [...(snaps || [])]
    const newSnaps = oldSnaps.filter(s => s.date !== date)
    if (nextNum != null && Number.isFinite(nextNum) && nextNum !== 0) {
      newSnaps.push({ date, packs: nextNum })
    }
    if (JSON.stringify(oldSnaps) === JSON.stringify(newSnaps)) {
      setEditing(false)
      return
    }
    setSaving(true)
    const { error } = await supabase.from(table).update({ delivery_snapshots: newSnaps }).eq('id', id)
    if (!error) onSave(id, 'delivery_snapshots', oldSnaps, newSnaps)
    else setVal(display)
    setSaving(false)
    setEditing(false)
  }

  if (!editable) {
    return (
      <td style={{ textAlign: 'right', fontWeight: 600, color: packs ? '#2563eb' : undefined }}>
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
          style={{ width: '100%', border: '1px solid #3b82f6', textAlign: 'right' }}
        />
      </td>
    )
  }

  return (
    <td
      onClick={() => setEditing(true)}
      style={{
        textAlign: 'right',
        fontWeight: 600,
        cursor: 'pointer',
        color: packs ? '#2563eb' : undefined,
        background: 'rgba(59,130,246,0.04)',
      }}
    >
      {packs ? Number(packs).toLocaleString() : 'N/A'}
    </td>
  )
}

export function ProcSnapshotDateHeader({
  letter,
  date,
  editable,
  onRename,
  onDelete,
}: {
  letter: string
  date: string
  editable: boolean
  onRename: (oldDate: string, newDate: string) => void
  onDelete: (date: string) => void
}) {
  return (
    <th rowSpan={2} style={{ minWidth: 150, textAlign: 'right', verticalAlign: 'middle' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, alignItems: 'flex-start' }}>
        <div>
          {letter} — Delivered as of
          <div style={{ fontWeight: 700 }}>{date}</div>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => onDelete(date)}
            title="Remove column"
            style={{
              border: '1px solid rgba(255,255,255,0.35)',
              background: 'rgba(239,68,68,0.25)',
              borderRadius: 4,
              cursor: 'pointer',
              padding: 2,
            }}
          >
            <Trash2 size={12} color="#fecaca" />
          </button>
        )}
      </div>
    </th>
  )
}

export function ProcMonthlyPriceCell({
  table,
  id,
  monthKey,
  map,
  onSave,
}: {
  table: string
  id: string
  monthKey: string
  map: Record<string, number>
  onSave: (id: string, f: string, oldV: any, newV: any) => void
}) {
  const has = Object.prototype.hasOwnProperty.call(map || {}, monthKey)
  const current = has ? Number((map || {})[monthKey]) : undefined
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState<string | number>(has ? current! : '')
  const supabase = createClient()

  const save = async () => {
    const nextNum = val === '' ? null : Number(val)
    const oldMap = { ...(map || {}) }
    const newMap = { ...oldMap }
    if (nextNum == null || !Number.isFinite(nextNum)) delete newMap[monthKey]
    else newMap[monthKey] = nextNum
    const { error } = await supabase.from(table).update({ raw_milk_prices: newMap }).eq('id', id)
    if (!error) onSave(id, 'raw_milk_prices', oldMap, newMap)
    setEditing(false)
  }

  if (editing) {
    return (
      <td style={{ padding: 2, background: '#fff', textAlign: 'right' }}>
        <input
          type="number"
          value={val}
          autoFocus
          onBlur={save}
          onChange={e => setVal(e.target.value)}
          style={{ width: '100%', textAlign: 'right' }}
        />
      </td>
    )
  }

  return (
    <td
      onClick={() => setEditing(true)}
      style={{ textAlign: 'right', cursor: 'pointer', background: 'rgba(16,185,129,0.06)' }}
    >
      {has && current ? `₱${current.toLocaleString()}` : '—'}
    </td>
  )
}
