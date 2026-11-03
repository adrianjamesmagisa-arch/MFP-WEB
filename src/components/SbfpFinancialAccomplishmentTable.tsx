'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'
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

/** Format numeric string live while typing: adds commas per 3 integer digits and keeps up to 2 decimal places. */
function formatMoneyInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '')
  if (!cleaned) return ''
  const dotIdx = cleaned.indexOf('.')
  const intRaw = (dotIdx >= 0 ? cleaned.slice(0, dotIdx) : cleaned).replace(/^0+(?=\d)/, '')
  const intFormatted = intRaw
    ? intRaw.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    : dotIdx >= 0
      ? '0'
      : ''
  if (dotIdx >= 0) {
    const dec = cleaned.slice(dotIdx + 1).replace(/\./g, '').slice(0, 2)
    return `${intFormatted}.${dec}`
  }
  return intFormatted
}

function parseMoneyInput(raw: string): number {
  const n = Number(String(raw || '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Table 5. MFP Financial Accomplishment — shows ONLY the current center's row
 * (e.g. PCC at MMSU sees/edits only PCC at MMSU).
 */
export function SbfpFinancialAccomplishmentTable({
  center, year, editable,
}: { center: string; year: number; editable: boolean }) {
  const supabase = createClient()
  const [row, setRow] = useState<Row>({ allotment: 0, obligation: 0, disbursement: 0 })
  const rowRef = useRef<Row>(row)
  const [draft, setDraft] = useState<Record<Field, string>>({
    allotment: '',
    obligation: '',
    disbursement: '',
  })
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
        rowRef.current = r
        setRow(r)
        setDraft({
          allotment: r.allotment ? fmt(r.allotment) : '',
          obligation: r.obligation ? fmt(r.obligation) : '',
          disbursement: r.disbursement ? fmt(r.disbursement) : '',
        })
      })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, year])

  const handleChange = (field: Field, el: HTMLInputElement) => {
    const raw = el.value
    const cursor = el.selectionStart ?? raw.length
    const charsBeforeCursor = raw.slice(0, cursor).replace(/[^0-9.]/g, '').length
    const formatted = formatMoneyInput(raw)
    setDraft(d => ({ ...d, [field]: formatted }))
    requestAnimationFrame(() => {
      if (document.activeElement !== el) return
      let seen = 0
      let newPos = 0
      while (newPos < formatted.length && seen < charsBeforeCursor) {
        if (formatted[newPos] !== ',') seen += 1
        newPos += 1
      }
      el.setSelectionRange(newPos, newPos)
    })
  }

  const save = async (field: Field) => {
    if (!editable) return
    const value = parseMoneyInput(draft[field])
    setDraft(d => ({ ...d, [field]: value ? fmt(value) : '' }))
    const current = rowRef.current
    if (value === current[field]) return
    const next: Row = { ...current, [field]: value }
    rowRef.current = next
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
    else if (data?.id) {
      rowRef.current = { ...rowRef.current, id: data.id }
      setRow(r => ({ ...r, id: data.id }))
    }
  }

  const cell: CSSProperties = { border: BORDER, padding: 0, background: '#fff' }
  const th: CSSProperties = {
    background: BLUE, border: BORDER, padding: '6px 4px', fontWeight: 800,
    fontSize: '0.72rem', textAlign: 'center',
  }
  const input: CSSProperties = {
    width: '100%', border: 0, outline: 'none', background: 'transparent',
    padding: '6px 8px', fontSize: '0.82rem', textAlign: 'center', boxSizing: 'border-box',
    fontVariantNumeric: 'tabular-nums',
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
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={draft[f]}
                    onChange={e => handleChange(f, e.currentTarget)}
                    onBlur={() => void save(f)}
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
