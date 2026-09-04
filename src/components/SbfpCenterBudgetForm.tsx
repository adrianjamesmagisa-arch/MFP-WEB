'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { computeBudgetTotal } from '@/lib/sbfp-compute'

export type BudgetRow = {
  id?: string
  year: number
  center: string
  milk_supplies: number
  office_professional: number
  traveling_expenses: number
  office_supplies: number
  training_expenses: number
  furniture_fixtures: number
  total: number
}

const FIELDS: { key: keyof BudgetRow; letter: string; label: string }[] = [
  { key: 'milk_supplies', letter: 'A', label: 'Food / Milk Supplies' },
  { key: 'office_professional', letter: 'B', label: 'Office & Professional' },
  { key: 'traveling_expenses', letter: 'C', label: 'Traveling Expenses' },
  { key: 'office_supplies', letter: 'D', label: 'Office Supplies' },
  { key: 'training_expenses', letter: 'E', label: 'Training Expenses' },
  { key: 'furniture_fixtures', letter: 'F', label: 'Furniture & Fixtures' },
]

const peso = (n: number) =>
  '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 0 })

export function SbfpCenterBudgetForm({
  center,
  year,
  initial,
  editable,
}: {
  center: string
  year: number
  initial: BudgetRow | null
  editable: boolean
}) {
  const supabase = createClient()
  const [row, setRow] = useState<BudgetRow>(() => initial || {
    year, center,
    milk_supplies: 0, office_professional: 0, traveling_expenses: 0,
    office_supplies: 0, training_expenses: 0, furniture_fixtures: 0, total: 0,
  })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const total = computeBudgetTotal(row)

  const save = async () => {
    if (!editable) return
    setSaving(true)
    setMsg(null)
    const payload = { ...row, year, center, total: computeBudgetTotal(row) }
    delete (payload as any).id
    const { data, error } = await supabase
      .from('sbfp_budget')
      .upsert(payload, { onConflict: 'year,center' })
      .select()
      .maybeSingle()
    setSaving(false)
    if (error) setMsg(error.message)
    else {
      if (data) setRow(data as BudgetRow)
      setMsg('Budget saved.')
    }
  }

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
      }}>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
          Allocation from SBFP Budget Breakdown. National Budget tab sums all centers.
        </p>
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-9 px-4 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Budget'}
          </button>
        )}
      </div>

      <div style={{ overflow: 'auto' }}>
        <table className="data-table" style={{ width: '100%', minWidth: 520 }}>
          <thead>
            <tr>
              <th style={{ width: 56 }}>#</th>
              <th style={{ textAlign: 'left' }}>Particulars</th>
              <th style={{ textAlign: 'right', minWidth: 180 }}>Amount (₱)</th>
            </tr>
          </thead>
          <tbody>
            {FIELDS.map(f => (
              <tr key={f.key}>
                <td style={{ fontWeight: 700, textAlign: 'center' }}>{f.letter}</td>
                <td style={{ textAlign: 'left' }}>{f.label}</td>
                <td style={{ textAlign: 'right' }}>
                  {editable ? (
                    <input
                      type="number"
                      value={Number(row[f.key]) || 0}
                      onChange={e => setRow(r => ({ ...r, [f.key]: Number(e.target.value) || 0 }))}
                      className="w-full border rounded px-2 py-1.5 text-right text-sm tabular-nums"
                    />
                  ) : (
                    <span className="tabular-nums font-semibold">{peso(Number(row[f.key]) || 0)}</span>
                  )}
                </td>
              </tr>
            ))}
            <tr style={{ background: '#eef2ff' }}>
              <td style={{ fontWeight: 800, textAlign: 'center' }}>G</td>
              <td style={{ textAlign: 'left', fontWeight: 800 }}>Total</td>
              <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '1.05rem' }}>{peso(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {msg && <p className="text-xs px-4 py-2 text-muted-foreground">{msg}</p>}
    </div>
  )
}
