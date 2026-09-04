'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Plus } from 'lucide-react'
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

const STATUSES = [
  'For Preparation', 'Ongoing Procurement', 'Ongoing (For Award)',
  'Awarded (For Delivery)', 'Awarded (Ongoing Delivery)', 'Completed', 'Failed',
]
const MODES = ['Sagip Saka', 'Small Value Procurement', 'Negotiated Procurement', 'Direct Contracting', 'Emergency']
const MIN_ROWS = 14
const YELLOW = '#FFF2CC'
const BLUE = '#BDD7EE'
const GRAY = '#E8E8E8'
const BORDER = '1px solid #111827'

function emptyRow(center: string, year: number, category: PpmpCategory, sort: number): PpmpRow {
  return {
    year, center, category, sort_order: sort,
    status: '', item_name: '', amount: 0, mode_of_procurement: '',
    date_received: '', pr_number: '', ors_date: '', po_number: '', remarks: '',
  }
}

function isFilled(r: PpmpRow) {
  return !!(r.item_name?.trim() || r.status || r.amount || r.pr_number || r.remarks)
}

function toInputDate(v: string | null | undefined) {
  if (!v) return ''
  return String(v).slice(0, 10)
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
  const [rows, setRows] = useState<PpmpRow[]>(() => {
    const seeded = (initialRows || []).map((r, i) => ({
      ...r,
      date_received: toInputDate(r.date_received),
      ors_date: toInputDate(r.ors_date),
      amount: Number(r.amount) || 0,
      sort_order: r.sort_order ?? i,
    }))
    const padded = [...seeded]
    while (padded.length < MIN_ROWS) padded.push(emptyRow(center, year, category, padded.length))
    return padded
  })
  const [msg, setMsg] = useState<string | null>(null)

  const total = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows])

  const persist = async (index: number, next: PpmpRow) => {
    if (!editable) return
    const filled = isFilled(next)
    if (!next.id && !filled) return
    if (next.id && !filled) {
      const { error } = await supabase.from('sbfp_data').delete().eq('id', next.id)
      if (error) setMsg(error.message)
      else setRows(p => p.map((r, i) => i === index ? emptyRow(center, year, category, index) : r))
      return
    }
    const payload = {
      year, center,
      region: 'PPMP',
      sdo: next.item_name || '—',
      procurement_status: next.status || 'For Preparation',
      packs_to_deliver: 0,
      packs_delivered: 0,
      milk_type: SBFP_PPMP_TYPE,
      delivery_schedule: category,
      amount: Number(next.amount) || 0,
      mode_of_procurement: next.mode_of_procurement || null,
      pr_date_received: next.date_received || null,
      pr_number: next.pr_number || null,
      ors_date: next.ors_date || null,
      po_number: next.po_number || null,
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

  const patch = (index: number, field: keyof PpmpRow, value: string | number) => {
    setRows(p => p.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }

  const commit = (index: number) => {
    persist(index, rows[index])
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
      <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th colSpan={3} style={{
              background: YELLOW, border: BORDER, padding: '7px 8px',
              fontWeight: 800, letterSpacing: '0.02em', fontSize: '0.82rem',
            }}>
              {title}
            </th>
            <th colSpan={6} style={{ background: '#fff', border: BORDER }} />
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
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || `blank-${i}`}>
              <td style={{ ...cell, background: GRAY, width: 150 }}>
                <select
                  disabled={!editable}
                  value={r.status}
                  onChange={e => { patch(i, 'status', e.target.value); persist(i, { ...r, status: e.target.value }) }}
                  style={inputStyle(true)}
                >
                  <option value="" />
                  {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td style={{ ...cell, minWidth: 160 }}>
                <input disabled={!editable} value={r.item_name} onChange={e => patch(i, 'item_name', e.target.value)} onBlur={() => commit(i)} style={inputStyle()} />
              </td>
              <td style={{ ...cell, width: 110 }}>
                <input
                  disabled={!editable}
                  type="number"
                  value={r.amount || ''}
                  onChange={e => patch(i, 'amount', Number(e.target.value) || 0)}
                  onBlur={() => commit(i)}
                  style={{ ...inputStyle(), textAlign: 'right' }}
                />
              </td>
              <td style={{ ...cell, background: GRAY, width: 170 }}>
                <select
                  disabled={!editable}
                  value={r.mode_of_procurement}
                  onChange={e => { patch(i, 'mode_of_procurement', e.target.value); persist(i, { ...r, mode_of_procurement: e.target.value }) }}
                  style={inputStyle(true)}
                >
                  <option value="" />
                  {MODES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </td>
              <td style={{ ...cell, width: 130 }}>
                <input disabled={!editable} type="date" value={r.date_received} onChange={e => patch(i, 'date_received', e.target.value)} onBlur={() => commit(i)} style={inputStyle()} />
              </td>
              <td style={{ ...cell, width: 110 }}>
                <input disabled={!editable} value={r.pr_number} onChange={e => patch(i, 'pr_number', e.target.value)} onBlur={() => commit(i)} style={inputStyle()} />
              </td>
              <td style={{ ...cell, width: 120 }}>
                <input disabled={!editable} type="date" value={r.ors_date} onChange={e => patch(i, 'ors_date', e.target.value)} onBlur={() => commit(i)} style={inputStyle()} />
              </td>
              <td style={{ ...cell, width: 110 }}>
                <input disabled={!editable} value={r.po_number} onChange={e => patch(i, 'po_number', e.target.value)} onBlur={() => commit(i)} style={inputStyle()} />
              </td>
              <td style={{ ...cell, minWidth: 140 }}>
                <input disabled={!editable} value={r.remarks} onChange={e => patch(i, 'remarks', e.target.value)} onBlur={() => commit(i)} style={inputStyle()} />
              </td>
            </tr>
          ))}
          <tr>
            <td colSpan={2} style={{ border: BORDER, background: '#fff', padding: '6px 8px', textAlign: 'right', fontWeight: 800 }}>
              TOTAL
            </td>
            <td style={{ border: BORDER, background: '#fff', padding: '6px 8px', textAlign: 'right', fontWeight: 800 }}>
              {total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td colSpan={6} style={{ border: BORDER, background: '#fff' }} />
          </tr>
        </tbody>
      </table>
      {editable && (
        <div style={{ padding: '6px 8px', borderTop: BORDER }}>
          <button
            type="button"
            onClick={() => setRows(p => [...p, emptyRow(center, year, category, p.length)])}
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
