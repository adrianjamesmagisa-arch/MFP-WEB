'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import { SBFP_PPMP_TYPE } from '@/lib/sbfp-aux'

export type PpmpCategory = 'office_supplies' | 'fixtures' | 'training'

export type PpmpRow = {
  id?: string
  year: number
  center: string
  category: PpmpCategory
  status: string
  item_name: string
  amount: number
  mode_of_procurement: string
  date_received: string
  pr_number: string
  ors_date: string
  po_number: string
  remarks: string
  sort_order: number
}

type InternalPpmpRow = PpmpRow & { _key: string }

const STATUSES = [
  'For Preparation', 'Ongoing Procurement', 'Ongoing (For Award)',
  'Awarded (For Delivery)', 'Awarded (Ongoing Delivery)', 'Completed', 'Failed',
]
const MODES = [
  'Sagip Saka',
  'Agency to Agency',
  'Small Value Procurement',
  'Negotiated Procurement',
  'Direct Contracting',
  'Emergency',
]
const MIN_ROWS = 14
const YELLOW = '#FFF2CC'
const BLUE = '#BDD7EE'
const GRAY = '#E8E8E8'
const BORDER = '1px solid #111827'

let keySeq = 0
function nextRowKey(prefix = 'ppmp') {
  keySeq += 1
  return `${prefix}-${Date.now()}-${keySeq}`
}

function emptyRow(center: string, year: number, category: PpmpCategory, sort: number): InternalPpmpRow {
  return {
    _key: nextRowKey(category),
    year, center, category, sort_order: sort,
    status: '', item_name: '', amount: 0, mode_of_procurement: '',
    date_received: '', pr_number: '', ors_date: '', po_number: '', remarks: '',
  }
}

function isFilled(r: PpmpRow) {
  return !!(
    r.item_name?.trim() || r.status || r.amount || r.pr_number?.trim() || r.remarks?.trim() ||
    r.mode_of_procurement || r.date_received || r.ors_date || r.po_number?.trim()
  )
}

function toInputDate(v: string | null | undefined) {
  if (!v) return ''
  return String(v).slice(0, 10)
}

function buildRows(
  initialRows: PpmpRow[],
  center: string,
  year: number,
  category: PpmpCategory,
): InternalPpmpRow[] {
  const seeded: InternalPpmpRow[] = (initialRows || []).map((r, i) => ({
    ...r,
    _key: r.id ? `id-${r.id}` : nextRowKey(category),
    category,
    date_received: toInputDate(r.date_received),
    ors_date: toInputDate(r.ors_date),
    amount: Number(r.amount) || 0,
    sort_order: r.sort_order ?? i,
  }))
  const padded = [...seeded]
  while (padded.length < MIN_ROWS) {
    padded.push(emptyRow(center, year, category, padded.length))
  }
  return padded
}

/** Date input with an explicit clear (×) button so posted dates can be removed. */
function DateCell({
  value, onChange, disabled, style,
}: {
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  style: CSSProperties
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <input
        disabled={disabled}
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (!disabled && (e.key === 'Delete' || e.key === 'Backspace') && value) {
            e.preventDefault()
            onChange('')
          }
        }}
        style={{ ...style, flex: 1, minWidth: 0 }}
      />
      {!disabled && value && (
        <button
          type="button"
          title="Clear date"
          onClick={() => onChange('')}
          style={{
            border: 0, background: 'transparent', cursor: 'pointer',
            color: '#dc2626', fontWeight: 700, padding: '0 6px', fontSize: '0.85rem',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}

export function SbfpExcelPpmpTable({
  title,
  itemLabel,
  category,
  center,
  year,
  initialRows,
  editable,
}: {
  title: string
  itemLabel: string
  category: PpmpCategory
  center: string
  year: number
  initialRows: PpmpRow[]
  editable: boolean
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<InternalPpmpRow[]>(() =>
    buildRows(initialRows, center, year, category),
  )
  const rowsRef = useRef<InternalPpmpRow[]>(rows)
  const rowIdsRef = useRef<Map<string, string>>(new Map())
  const saveChainsRef = useRef<Map<string, Promise<void>>>(new Map())
  const deletedKeysRef = useRef<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)

  // Seed rowIdsRef on mount and whenever server rows arrive for a new center/year/category
  const seedSig = useMemo(
    () => `${center}|${year}|${category}|${(initialRows || []).map(r => r.id || '').join(',')}`,
    [center, year, category, initialRows],
  )
  const prevSigRef = useRef(seedSig)
  useEffect(() => {
    const map = new Map<string, string>()
    for (const r of rowsRef.current) {
      if (r.id) map.set(r._key, r.id)
    }
    rowIdsRef.current = map
  }, [])

  useEffect(() => {
    if (prevSigRef.current === seedSig) return
    prevSigRef.current = seedSig
    const fresh = buildRows(initialRows, center, year, category)
    rowsRef.current = fresh
    const map = new Map<string, string>()
    for (const r of fresh) {
      if (r.id) map.set(r._key, r.id)
    }
    rowIdsRef.current = map
    saveChainsRef.current.clear()
    deletedKeysRef.current.clear()
    setRows(fresh)
  }, [seedSig, initialRows, center, year, category])

  const applyRows = (updater: (prev: InternalPpmpRow[]) => InternalPpmpRow[]) => {
    const next = updater(rowsRef.current)
    rowsRef.current = next
    setRows(next)
    return next
  }

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows])

  const runPersist = async (rowKey: string) => {
    if (!editable || deletedKeysRef.current.has(rowKey)) return
    const current = rowsRef.current.find(r => r._key === rowKey)
    if (!current) return
    const existingId = current.id || rowIdsRef.current.get(rowKey)
    const filled = isFilled(current)

    if (!existingId && !filled) return

    if (existingId && !filled) {
      const { error } = await supabase.from('sbfp_data').delete().eq('id', existingId)
      if (error) {
        setMsg(error.message)
      } else {
        setMsg(null)
        rowIdsRef.current.delete(rowKey)
        applyRows(prev =>
          prev.map((r, idx) =>
            r._key === rowKey ? { ...emptyRow(center, year, category, idx), _key: rowKey } : r,
          ),
        )
      }
      return
    }

    const payload = {
      year,
      center,
      region: `PPMP:${category}`,
      sdo: current.item_name?.trim() || '—',
      procurement_status: current.status || 'For Preparation',
      packs_to_deliver: 0,
      packs_delivered: 0,
      milk_type: SBFP_PPMP_TYPE,
      delivery_schedule: category,
      amount: Number(current.amount) || 0,
      mode_of_procurement: current.mode_of_procurement || null,
      pr_date_received: current.date_received || null,
      pr_number: current.pr_number?.trim() || null,
      ors_date: current.ors_date || null,
      po_number: current.po_number?.trim() || null,
      remarks: current.remarks?.trim() || null,
      include_in_report: false,
      contract_amount: 0,
      beneficiaries_pm: 0,
      updated_at: new Date().toISOString(),
    }

    if (existingId) {
      const { error } = await supabase.from('sbfp_data').update(payload).eq('id', existingId)
      if (error) setMsg(error.message)
      else setMsg(null)
    } else {
      const { data, error } = await supabase
        .from('sbfp_data')
        .insert(payload)
        .select('id')
        .maybeSingle()
      if (error) {
        setMsg(error.message)
      } else if (data?.id) {
        setMsg(null)
        rowIdsRef.current.set(rowKey, data.id)
        // Merge ONLY id so any edits typed while INSERT was in flight are preserved
        applyRows(prev =>
          prev.map(r => (r._key === rowKey ? { ...r, id: data.id } : r)),
        )
      }
    }
  }

  const enqueuePersist = (rowKey: string) => {
    const prev = saveChainsRef.current.get(rowKey) || Promise.resolve()
    const next = prev.catch(() => {}).then(() => runPersist(rowKey))
    saveChainsRef.current.set(rowKey, next)
    return next
  }

  const patchByKey = (rowKey: string, field: keyof PpmpRow, value: string | number) => {
    applyRows(prev => prev.map(r => (r._key === rowKey ? { ...r, [field]: value } : r)))
  }

  const setImmediate = (rowKey: string, field: keyof PpmpRow, value: string | number) => {
    patchByKey(rowKey, field, value)
    void enqueuePersist(rowKey)
  }

  const deleteRow = async (rowKey: string) => {
    if (!editable) return
    deletedKeysRef.current.add(rowKey)
    const inflight = saveChainsRef.current.get(rowKey)
    if (inflight) await inflight.catch(() => {})
    const existingId =
      rowIdsRef.current.get(rowKey) || rowsRef.current.find(r => r._key === rowKey)?.id
    if (existingId) {
      const { error } = await supabase.from('sbfp_data').delete().eq('id', existingId)
      if (error) {
        deletedKeysRef.current.delete(rowKey)
        setMsg(error.message)
        return
      }
      rowIdsRef.current.delete(rowKey)
    }
    setMsg(null)
    applyRows(prev => {
      const filtered = prev.filter(r => r._key !== rowKey)
      while (filtered.length < MIN_ROWS) {
        filtered.push(emptyRow(center, year, category, filtered.length))
      }
      return filtered.map((r, idx) => ({ ...r, sort_order: idx }))
    })
  }

  const cell: CSSProperties = {
    border: BORDER, padding: 0, background: '#fff', verticalAlign: 'middle',
  }
  const inputStyle = (gray?: boolean): CSSProperties => ({
    width: '100%', border: 0, outline: 'none', background: gray ? GRAY : 'transparent',
    padding: '4px 6px', fontSize: '0.78rem', boxSizing: 'border-box',
  })

  return (
    <div style={{ overflow: 'auto', border: BORDER, background: '#fff' }}>
      <table style={{ width: '100%', minWidth: 1120, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th colSpan={3} style={{
              background: YELLOW, border: BORDER, padding: '7px 8px',
              fontWeight: 800, letterSpacing: '0.02em', fontSize: '0.82rem',
            }}>
              {title}
            </th>
            <th colSpan={editable ? 7 : 6} style={{ background: '#fff', border: BORDER }} />
          </tr>
          <tr>
            {['STATUS', itemLabel.toUpperCase(), 'AMOUNT', 'MODE OF PROCUREMENT', 'DATE RECEIVED BY PROCUREMENT', 'PR NUMBER', 'ORS DATE', 'PO NUMBER', 'REMARKS'].map(h => (
              <th key={h} style={{
                background: BLUE, border: BORDER, padding: '6px 4px',
                fontWeight: 800, fontSize: '0.68rem', color: '#111',
                textAlign: 'center', lineHeight: 1.2,
              }}>
                {h}
              </th>
            ))}
            {editable && (
              <th style={{
                background: BLUE, border: BORDER, padding: '6px 2px', width: 30,
              }} />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const hasContent = Boolean(r.id || isFilled(r))
            return (
              <tr key={r._key}>
                <td style={{ ...cell, background: GRAY, width: 150 }}>
                  <select
                    disabled={!editable}
                    value={r.status}
                    onChange={e => setImmediate(r._key, 'status', e.target.value)}
                    style={inputStyle(true)}
                  >
                    <option value="" />
                    {r.status && !STATUSES.includes(r.status) && (
                      <option value={r.status}>{r.status}</option>
                    )}
                    {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ ...cell, minWidth: 160 }}>
                  <input
                    disabled={!editable}
                    value={r.item_name}
                    onChange={e => patchByKey(r._key, 'item_name', e.target.value)}
                    onBlur={() => void enqueuePersist(r._key)}
                    style={inputStyle()}
                  />
                </td>
                <td style={{ ...cell, width: 110 }}>
                  <input
                    disabled={!editable}
                    type="number"
                    value={r.amount || ''}
                    onChange={e => patchByKey(r._key, 'amount', Number(e.target.value) || 0)}
                    onBlur={() => void enqueuePersist(r._key)}
                    style={{ ...inputStyle(), textAlign: 'right' }}
                  />
                </td>
                <td style={{ ...cell, background: GRAY, width: 200 }}>
                  <select
                    disabled={!editable}
                    value={r.mode_of_procurement}
                    onChange={e => setImmediate(r._key, 'mode_of_procurement', e.target.value)}
                    style={inputStyle(true)}
                  >
                    <option value="" />
                    {r.mode_of_procurement && !MODES.includes(r.mode_of_procurement) && (
                      <option value={r.mode_of_procurement}>{r.mode_of_procurement}</option>
                    )}
                    {MODES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td style={{ ...cell, width: 150 }}>
                  <DateCell
                    disabled={!editable}
                    value={r.date_received}
                    onChange={v => setImmediate(r._key, 'date_received', v)}
                    style={inputStyle()}
                  />
                </td>
                <td style={{ ...cell, width: 110 }}>
                  <input
                    disabled={!editable}
                    value={r.pr_number}
                    onChange={e => patchByKey(r._key, 'pr_number', e.target.value)}
                    onBlur={() => void enqueuePersist(r._key)}
                    style={inputStyle()}
                  />
                </td>
                <td style={{ ...cell, width: 150 }}>
                  <DateCell
                    disabled={!editable}
                    value={r.ors_date}
                    onChange={v => setImmediate(r._key, 'ors_date', v)}
                    style={inputStyle()}
                  />
                </td>
                <td style={{ ...cell, width: 110 }}>
                  <input
                    disabled={!editable}
                    value={r.po_number}
                    onChange={e => patchByKey(r._key, 'po_number', e.target.value)}
                    onBlur={() => void enqueuePersist(r._key)}
                    style={inputStyle()}
                  />
                </td>
                <td style={{ ...cell, minWidth: 140 }}>
                  <input
                    disabled={!editable}
                    value={r.remarks}
                    onChange={e => patchByKey(r._key, 'remarks', e.target.value)}
                    onBlur={() => void enqueuePersist(r._key)}
                    style={inputStyle()}
                  />
                </td>
                {editable && (
                  <td style={{ ...cell, width: 30, textAlign: 'center' }}>
                    {hasContent && (
                      <button
                        type="button"
                        title="Delete row"
                        onClick={() => void deleteRow(r._key)}
                        style={{
                          border: 0, background: 'transparent', cursor: 'pointer',
                          color: '#dc2626', padding: 4, display: 'inline-flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            )
          })}
          <tr>
            <td colSpan={2} style={{ border: BORDER, background: '#fff', padding: '6px 8px', textAlign: 'right', fontWeight: 800 }}>
              TOTAL
            </td>
            <td style={{ border: BORDER, background: '#fff', padding: '6px 8px', textAlign: 'right', fontWeight: 800 }}>
              {total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td colSpan={editable ? 7 : 6} style={{ border: BORDER, background: '#fff' }} />
          </tr>
        </tbody>
      </table>
      {editable && (
        <div style={{ padding: '6px 8px', borderTop: BORDER }}>
          <button
            type="button"
            onClick={() => applyRows(p => [...p, emptyRow(center, year, category, p.length)])}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-slate-900"
          >
            <Plus size={12} /> Add row
          </button>
        </div>
      )}
      {msg && <p className="text-xs px-2 py-1 text-red-600">{msg}</p>}
    </div>
  )
}
