'use client'

import { useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus } from 'lucide-react'
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

const STATUSES = ['For Hiring', 'Filled Up', 'Hired', 'Ongoing', 'For Preparation', 'Cancelled']
const MIN_ROWS = 7
const YELLOW = '#FFF2CC'
const BLUE = '#BDD7EE'
const GRAY = '#E8E8E8'
const BORDER = '1px solid #111827'

function emptyRow(center: string, year: number, sort: number): HiringRow {
  return { year, center, status: '', position: '', base_salary: 0, remarks: '', sort_order: sort }
}

function isFilled(r: HiringRow) {
  return !!(r.position?.trim() || r.status || r.base_salary)
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
  const [rows, setRows] = useState<HiringRow[]>(() => {
    const seeded = (initialRows || []).map((r, i) => ({
      ...r, base_salary: Number(r.base_salary) || 0, sort_order: r.sort_order ?? i,
    }))
    const padded = [...seeded]
    while (padded.length < MIN_ROWS) padded.push(emptyRow(center, year, padded.length))
    return padded
  })
  const [msg, setMsg] = useState<string | null>(null)

  const persist = async (index: number, next: HiringRow) => {
    if (!editable) return
    const filled = isFilled(next)
    if (!next.id && !filled) return
    if (next.id && !filled) {
      const { error } = await supabase.from('sbfp_data').delete().eq('id', next.id)
      if (error) setMsg(error.message)
      else setRows(p => p.map((r, i) => i === index ? emptyRow(center, year, index) : r))
      return
    }
    const payload = {
      year, center,
      region: 'HIRING',
      sdo: next.position || '—',
      procurement_status: next.status || 'For Hiring',
      packs_to_deliver: 0,
      packs_delivered: 0,
      milk_type: SBFP_HIRING_TYPE,
      delivery_schedule: 'staff_hiring',
      amount: Number(next.base_salary) || 0,
      remarks: next.remarks || null,
      include_in_report: false,
      contract_amount: 0,
      beneficiaries_pm: 0,
    }
    if (next.id) {
      const { error } = await supabase.from('sbfp_data').update(payload).eq('id', next.id)
      if (error) setMsg(error.message)
    } else {
      const { data, error } = await supabase.from('sbfp_data').insert(payload).select().maybeSingle()
      if (error) setMsg(error.message)
      else if (data) setRows(p => p.map((r, i) => i === index ? { ...next, id: data.id } : r))
    }
  }

  const patch = (index: number, field: keyof HiringRow, value: string | number) => {
    setRows(p => p.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  const cell: CSSProperties = { border: BORDER, padding: 0, background: '#fff' }
  const inputStyle = (gray?: boolean): CSSProperties => ({
    width: '100%', border: 0, outline: 'none', background: gray ? GRAY : 'transparent',
    padding: '4px 6px', fontSize: '0.78rem', boxSizing: 'border-box',
  })

  return (
    <div style={{ overflow: 'auto', border: BORDER, background: '#fff', maxWidth: 720 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th colSpan={3} style={{
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
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || `blank-${i}`}>
              <td style={{ ...cell, background: GRAY, width: 180 }}>
                <select
                  disabled={!editable}
                  value={r.status}
                  onChange={e => { patch(i, 'status', e.target.value); persist(i, { ...r, status: e.target.value }) }}
                  style={inputStyle(true)}
                >
                  <option value="" />
                  {STATUSES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
                </select>
              </td>
              <td style={{ ...cell, minWidth: 240 }}>
                <input
                  disabled={!editable}
                  value={r.position}
                  onChange={e => patch(i, 'position', e.target.value)}
                  onBlur={() => persist(i, rows[i])}
                  style={inputStyle()}
                />
              </td>
              <td style={{ ...cell, width: 180 }}>
                <input
                  disabled={!editable}
                  type="number"
                  value={r.base_salary || ''}
                  onChange={e => patch(i, 'base_salary', Number(e.target.value) || 0)}
                  onBlur={() => persist(i, rows[i])}
                  style={{ ...inputStyle(), textAlign: 'right' }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editable && (
        <div style={{ padding: '6px 8px', borderTop: BORDER }}>
          <button
            type="button"
            onClick={() => setRows(p => [...p, emptyRow(center, year, p.length)])}
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
