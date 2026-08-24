import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return '—'
  return Number(n).toLocaleString('en-US')
}

export default async function SbfpBudgetPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('sbfp_budget')
    .select('*')
    .order('center', { ascending: true })

  const totals = rows?.reduce((acc, r) => ({
    milk_supplies: acc.milk_supplies + (r.milk_supplies || 0),
    office_professional: acc.office_professional + (r.office_professional || 0),
    traveling_expenses: acc.traveling_expenses + (r.traveling_expenses || 0),
    office_supplies: acc.office_supplies + (r.office_supplies || 0),
    training_expenses: acc.training_expenses + (r.training_expenses || 0),
    furniture_fixtures: acc.furniture_fixtures + (r.furniture_fixtures || 0),
    total: acc.total + (r.total || 0),
  }), {
    milk_supplies: 0, office_professional: 0, traveling_expenses: 0,
    office_supplies: 0, training_expenses: 0, furniture_fixtures: 0, total: 0
  })

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Budget Breakdown</h1>
      <p className="text-muted-foreground text-sm mb-6">SBFP FY 2026 budget allocation per center</p>

      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="h-10 px-4 text-left font-semibold">CENTER</th>
              <th className="px-4 py-2 text-right font-semibold">Other Supplies & Materials (Milk)</th>
              <th className="px-4 py-2 text-right font-semibold">Office Professional Expenses</th>
              <th className="px-4 py-2 text-right font-semibold">Traveling Expenses</th>
              <th className="px-4 py-2 text-right font-semibold">Office Supplies</th>
              <th className="px-4 py-2 text-right font-semibold">Training Expenses</th>
              <th className="px-4 py-2 text-right font-semibold">Furniture & Fixtures</th>
              <th className="px-4 py-2 text-right font-bold text-blue-600">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => (
              <tr key={r.id} className="border-b hover:bg-muted/30">
                <td className="px-4 py-2 font-semibold">{r.center}</td>
                <td className="px-4 py-2 text-right">{fmt(r.milk_supplies)}</td>
                <td className="px-4 py-2 text-right">{fmt(r.office_professional)}</td>
                <td className="px-4 py-2 text-right">{fmt(r.traveling_expenses)}</td>
                <td className="px-4 py-2 text-right">{fmt(r.office_supplies)}</td>
                <td className="px-4 py-2 text-right">{fmt(r.training_expenses)}</td>
                <td className="px-4 py-2 text-right">{fmt(r.furniture_fixtures)}</td>
                <td className="px-4 py-2 text-right font-bold text-blue-600">{fmt(r.total)}</td>
              </tr>
            ))}
            {totals && (
              <tr className="border-t-2 bg-muted/60 font-bold">
                <td className="px-4 py-2">TOTAL</td>
                <td className="px-4 py-2 text-right">{fmt(totals.milk_supplies)}</td>
                <td className="px-4 py-2 text-right">{fmt(totals.office_professional)}</td>
                <td className="px-4 py-2 text-right">{fmt(totals.traveling_expenses)}</td>
                <td className="px-4 py-2 text-right">{fmt(totals.office_supplies)}</td>
                <td className="px-4 py-2 text-right">{fmt(totals.training_expenses)}</td>
                <td className="px-4 py-2 text-right">{fmt(totals.furniture_fixtures)}</td>
                <td className="px-4 py-2 text-right text-blue-600">{fmt(totals.total)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(!rows || rows.length === 0) && (
        <div className="text-center py-12 text-muted-foreground border rounded-md mt-4">
          No budget data yet. Run the seed script to populate from the Excel file.
        </div>
      )}
    </div>
  )
}
