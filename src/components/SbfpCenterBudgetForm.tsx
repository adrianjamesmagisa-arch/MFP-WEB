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

const FIELDS: { key: keyof BudgetRow; label: string }[] = [
  { key: 'milk_supplies', label: 'A — Food/Milk Supplies' },
  { key: 'office_professional', label: 'B — Office & Professional' },
  { key: 'traveling_expenses', label: 'C — Traveling Expenses' },
  { key: 'office_supplies', label: 'D — Office Supplies' },
  { key: 'training_expenses', label: 'E — Training Expenses' },
  { key: 'furniture_fixtures', label: 'F — Furniture & Fixtures' },
]

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
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-base font-semibold">Center Budget (A–F)</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Enter this center&apos;s allocation for the selected school year. National Budget Breakdown sums all centers.
          </p>
        </div>
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

      <div className="overflow-auto">
        <table className="data-table w-full text-sm" style={{ minWidth: 720 }}>
          <thead>
            <tr>
              {FIELDS.map(f => (
                <th key={f.key} style={{ textAlign: 'right', whiteSpace: 'normal', lineHeight: 1.2 }}>{f.label}</th>
              ))}
              <th style={{ textAlign: 'right' }}>G — Total (₱)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              {FIELDS.map(f => (
                <td key={f.key} style={{ textAlign: 'right' }}>
                  {editable ? (
                    <input
                      type="number"
                      value={Number(row[f.key]) || 0}
                      onChange={e => setRow(r => ({ ...r, [f.key]: Number(e.target.value) || 0 }))}
                      className="w-full max-w-[9rem] ml-auto block border rounded px-2 py-1 text-right text-sm"
                    />
                  ) : (
                    Number(row[f.key] || 0).toLocaleString()
                  )}
                </td>
              ))}
              <td style={{ textAlign: 'right', fontWeight: 700 }}>{total.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {msg && <p className="text-xs mt-2 text-muted-foreground">{msg}</p>}
    </div>
  )
}
