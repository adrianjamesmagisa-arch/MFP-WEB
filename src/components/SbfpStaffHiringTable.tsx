'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus, Trash2 } from 'lucide-react'
import { SBFP_HIRING_TYPE } from '@/lib/sbfp-aux'

export type HiringRow = {
  id?: string
  year: number
  center: string
  status: string
  position: string
  base_salary: number
  remarks: string
  sort_order: number
}

type InternalHiringRow = HiringRow & { _key: string }

const STATUSES = ['For Hiring', 'Filled Up', 'Hired', 'Ongoing', 'For Preparation', 'Cancelled']
const MIN_ROWS = 7
const YELLOW = '#FFF2CC'
const BLUE = '#BDD7EE'
const GRAY = '#E8E8E8'
const BORDER = '1px solid #111827'

let hiringKeySeq = 0
function nextHiringKey() {
  hiringKeySeq += 1
  return `hiring-${Date.now()}-${hiringKeySeq}`
}

function emptyRow(center: string, year: number, sort: number): InternalHiringRow {
  return {
    _key: nextHiringKey(),
    year, center, status: '', position: '', base_salary: 0, remarks: '', sort_order: sort,
  }
}

function isFilled(r: HiringRow) {
  return !!(r.position?.trim() || r.status || r.base_salary || r.remarks?.trim())
}

function buildHiringRows(initialRows: HiringRow[], center: string, year: number): InternalHiringRow[] {
  const seeded: InternalHiringRow[] = (initialRows || []).map((r, i) => ({
    ...r,
    _key: r.id ? `id-${r.id}` : nextHiringKey(),
    base_salary: Number(r.base_salary) || 0,
    sort_order: r.sort_order ?? i,
  }))
  const padded = [...seeded]
  while (padded.length < MIN_ROWS) padded.push(emptyRow(center, year, padded.length))
  return padded
}

export function SbfpStaffHiringTable({
  center, year, initialRows, editable,
}: {
  center: string
  year: number
  initialRows: HiringRow[]
  editable: boolean
}) {
  const supabase = createClient()
  const [rows, setRows] = useState<InternalHiringRow[]>(() =>
    buildHiringRows(initialRows, center, year),
  )
  const rowsRef = useRef<InternalHiringRow[]>(rows)
  const rowIdsRef = useRef<Map<string, string>>(new Map())
  const saveChainsRef = useRef<Map<string, Promise<void>>>(new Map())
  const deletedKeysRef = useRef<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)

  const seedSig = useMemo(
    () => `${center}|${year}|${(initialRows || []).map(r => r.id || '').join(',')}`,
    [center, year, initialRows],
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
    const fresh = buildHiringRows(initialRows, center, year)
    rowsRef.current = fresh
    const map = new Map<string, string>()
    for (const r of fresh) {
      if (r.id) map.set(r._key, r.id)
    }
    rowIdsRef.current = map
    saveChainsRef.current.clear()
    deletedKeysRef.current.clear()
    setRows(fresh)
  }, [seedSig, initialRows, center, year])

  const applyRows = (updater: (prev: InternalHiringRow[]) => InternalHiringRow[]) => {
    const next = updater(rowsRef.current)
    rowsRef.current = next
    setRows(next)
    return next
  }

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
            r._key === rowKey ? { ...emptyRow(center, year, idx), _key: rowKey } : r,
          ),
        )
      }
      return
    }

    const payload = {
      year,
      center,
      region: 'HIRING',
      sdo: current.position?.trim() || '—',
      procurement_status: current.status || 'For Hiring',
      packs_to_deliver: 0,
      packs_delivered: 0,
      milk_type: SBFP_HIRING_TYPE,
      delivery_schedule: 'staff_hiring',
      amount: Number(current.base_salary) || 0,
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

  const patchByKey = (rowKey: string, field: keyof HiringRow, value: string | number) => {
    applyRows(prev => prev.map(r => (r._key === rowKey ? { ...r, [field]: value } : r)))
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
      while (filtered.length < MIN_ROWS) filtered.push(emptyRow(center, year, filtered.length))
      return filtered.map((r, idx) => ({ ...r, sort_order: idx }))
    })
  }

  const cell: CSSProperties = { border: BORDER, padding: 0, background: '#fff', verticalAlign: 'middle' }
  const inputStyle = (gray?: boolean): CSSProperties => ({
    width: '100%', border: 0, outline: 'none', background: gray ? GRAY : 'transparent',
    padding: '4px 6px', fontSize: '0.78rem', boxSizing: 'border-box',
  })

  return (
    <div style={{ overflow: 'auto', border: BORDER, background: '#fff', maxWidth: 750 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th colSpan={editable ? 4 : 3} style={{
              background: YELLOW, border: BORDER, padding: '7px 8px',
              fontWeight: 800, letterSpacing: '0.02em', fontSize: '0.82rem', textAlign: 'center',
            }}>
              STAFF HIRING STATUS
            </th>
          </tr>
          <tr>
            {['STATUS', 'POSITION', 'BASE SALARY PER MONTH'].map(h => (
              <th key={h} style={{
                background: BLUE, border: BORDER, padding: '6px 4px',
                fontWeight: 800, fontSize: '0.72rem', color: '#111', textAlign: 'center',
              }}>
                {h}
              </th>
            ))}
            {editable && (
              <th style={{ background: BLUE, border: BORDER, padding: '6px 2px', width: 30 }} />
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const hasContent = Boolean(r.id || isFilled(r))
            return (
              <tr key={r._key}>
                <td style={{ ...cell, background: GRAY, width: 180 }}>
                  <select
                    disabled={!editable}
                    value={r.status}
                    onChange={e => {
                      patchByKey(r._key, 'status', e.target.value)
                      void enqueuePersist(r._key)
                    }}
                    style={inputStyle(true)}
                  >
                    <option value="" />
                    {r.status && !STATUSES.includes(r.status) && (
                      <option value={r.status}>{r.status.toUpperCase()}</option>
                    )}
                    {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                  </select>
                </td>
                <td style={{ ...cell, minWidth: 240 }}>
                  <input
                    disabled={!editable}
                    value={r.position}
                    onChange={e => patchByKey(r._key, 'position', e.target.value)}
                    onBlur={() => void enqueuePersist(r._key)}
                    style={inputStyle()}
                  />
                </td>
                <td style={{ ...cell, width: 180 }}>
                  <input
                    disabled={!editable}
                    type="number"
                    value={r.base_salary || ''}
                    onChange={e => patchByKey(r._key, 'base_salary', Number(e.target.value) || 0)}
                    onBlur={() => void enqueuePersist(r._key)}
                    style={{ ...inputStyle(), textAlign: 'right' }}
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
        </tbody>
      </table>
      {editable && (
        <div style={{ padding: '6px 8px', borderTop: BORDER }}>
          <button
            type="button"
            onClick={() => applyRows(p => [...p, emptyRow(center, year, p.length)])}
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
