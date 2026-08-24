import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return '—'
  return Number(n).toLocaleString('en-PH')
}

export default async function SbfpBudgetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('sbfp_budget')
    .select('*')
    .order('center', { ascending: true })

  const totals = (rows || []).reduce((acc, r) => ({
    milk_supplies:        acc.milk_supplies        + (r.milk_supplies        || 0),
    office_professional:  acc.office_professional  + (r.office_professional  || 0),
    traveling_expenses:   acc.traveling_expenses   + (r.traveling_expenses   || 0),
    office_supplies:      acc.office_supplies      + (r.office_supplies      || 0),
    training_expenses:    acc.training_expenses    + (r.training_expenses    || 0),
    furniture_fixtures:   acc.furniture_fixtures   + (r.furniture_fixtures   || 0),
    total:                acc.total                + (r.total                || 0),
  }), {
    milk_supplies: 0, office_professional: 0, traveling_expenses: 0,
    office_supplies: 0, training_expenses: 0, furniture_fixtures: 0, total: 0
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Budget Breakdown</h1>
          <p className="page-subtitle">Allocation of SBFP FY 2026 funds per PCC center</p>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
          <table className="data-table" style={{ minWidth: 1000, fontSize: '0.78rem' }}>
            <thead>
              <tr>
                <th style={{ minWidth: 80, whiteSpace: 'normal', lineHeight: 1.2 }}>CENTER</th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  A — Food/Milk Supplies
                </th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  B — Office & Professional
                </th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  C — Traveling Expenses
                </th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  D — Office Supplies
                </th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  E — Training Expenses
                </th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  F — Furniture & Fixtures
                </th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right', background: 'rgba(59,130,246,0.08)' }}>
                  G — Total (₱)
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 700 }}>{r.center}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.milk_supplies)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.office_professional)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.traveling_expenses)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.office_supplies)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.training_expenses)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(r.furniture_fixtures)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, background: 'rgba(59,130,246,0.03)' }}>
                    {fmt(r.total)}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr style={{ fontWeight: 700, background: 'var(--gray-100, #f8fafc)', borderTop: '2px solid var(--gray-300, #cbd5e1)' }}>
                <td style={{ fontWeight: 800 }}>TOTAL</td>
                <td style={{ textAlign: 'right' }}>{fmt(totals.milk_supplies)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(totals.office_professional)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(totals.traveling_expenses)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(totals.office_supplies)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(totals.training_expenses)}</td>
                <td style={{ textAlign: 'right' }}>{fmt(totals.furniture_fixtures)}</td>
                <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.06)' }}>
                  {fmt(totals.total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {(!rows || rows.length === 0) && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)', background: 'white', borderRadius: 12, border: '1px solid var(--gray-200)', marginTop: '-1rem' }}>
          No budget data yet. Run the seed script to populate from the Excel file.
        </div>
      )}
    </div>
  )
}
