'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { createClient } from '@/lib/supabase/client'

type Field = 'allotment' | 'obligation' | 'disbursement'
type Row = { id?: string; allotment: number; obligation: number; disbursement: number }

const BORDER = '1px solid #111827'
const YELLOW = '#FFF2CC'
const BLUE = '#BDD7EE'

function centerLabel(center: string) {
  const c = center.trim()
  if (/^NHQ/i.test(c)) return 'PCC NHQ'
  return `PCC at ${c.replace(/\s*\(.*\)$/, '')}`
}

const fmt = (n: number) =>
  (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * Table 5. MFP Financial Accomplishment — shows ONLY the current center's row
 * (e.g. PCC at MMSU sees/edits only PCC at MMSU).
 */
export function SbfpFinancialAccomplishmentTable({
  center, year, editable,
}: { center: string; year: number; editable: boolean }) {
  const supabase = createClient()
  const [row, setRow] = useState<Row>({ allotment: 0, obligation: 0, disbursement: 0 })
  const [draft, setDraft] = useState<Record<Field, string>>({ allotment: '', obligation: '', disbursement: '' })
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    supabase
      .from('sbfp_financial_accomplishment')
      .select('id, allotment, obligation, disbursement')
      .eq('center', center)
      .eq('year', year)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return
        if (error) { setMsg(error.message); return }
        const r: Row = {
          id: data?.id,
          allotment: Number(data?.allotment) || 0,
          obligation: Number(data?.obligation) || 0,
          disbursement: Number(data?.disbursement) || 0,
        }
        setRow(r)
        setDraft({
          allotment: r.allotment ? String(r.allotment) : '',
          obligation: r.obligation ? String(r.obligation) : '',
          disbursement: r.disbursement ? String(r.disbursement) : '',
        })
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, year])

  const save = async (field: Field) => {
    if (!editable) return
    const value = Number(String(draft[field]).replace(/,/g, '')) || 0
    if (value === row[field]) return
    const next = { ...row, [field]: value }
    setRow(next)
    setMsg(null)
    const { data, error } = await supabase
      .from('sbfp_financial_accomplishment')
      .upsert(
        {
          center, year,
          allotment: next.allotment,
          obligation: next.obligation,
          disbursement: next.disbursement,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'center,year' },
      )
      .select('id')
      .maybeSingle()
    if (error) setMsg(error.message)
    else if (data?.id) setRow(r => ({ ...r, id: data.id }))
  }

  const cell: CSSProperties = { border: BORDER, padding: 0, background: '#fff' }
  const th: CSSProperties = {
    background: BLUE, border: BORDER, padding: '6px 4px', fontWeight: 800,
    fontSize: '0.72rem', textAlign: 'center',
  }
  const input: CSSProperties = {
    width: '100%', border: 0, outline: 'none', background: 'transparent',
    padding: '6px 8px', fontSize: '0.82rem', textAlign: 'center', boxSizing: 'border-box',
  }

  return (
    <div style={{ overflow: 'auto', border: BORDER, background: '#fff' }}>
      <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th colSpan={4} style={{
              background: YELLOW, border: BORDER, padding: '7px 8px',
              fontWeight: 800, fontSize: '0.82rem', textAlign: 'left',
            }}>
              MFP FINANCIAL ACCOMPLISHMENT
            </th>
          </tr>
          <tr>
            <th style={th}>CENTER</th>
            <th style={th}>ALLOTMENT</th>
            <th style={th}>OBLIGATION</th>
            <th style={th}>DISBURSEMENT</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...cell, padding: '6px 8px', fontWeight: 700, fontSize: '0.82rem' }}>
              {centerLabel(center)}
            </td>
            {(['allotment', 'obligation', 'disbursement'] as Field[]).map(f => (
              <td key={f} style={cell}>
                {editable ? (
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={draft[f]}
                    onChange={e => setDraft(d => ({ ...d, [f]: e.target.value }))}
                    onBlur={() => save(f)}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    style={input}
                  />
                ) : (
                  <div style={{ ...input }}>{fmt(row[f])}</div>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      {msg && (
        <p className="text-xs px-2 py-1 text-red-600">
          {msg.includes('sbfp_financial_accomplishment')
            ? 'Table not in database yet — run supabase/migrations/20261103130000_sbfp_financial_accomplishment.sql in Supabase SQL Editor.'
            : msg}
        </p>
      )}
    </div>
  )
}

