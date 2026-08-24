import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return Number(n).toLocaleString('en-US')
}
function pct(n: number | null | undefined) {
  if (n == null) return '—'
  return (Number(n) * 100).toFixed(2) + '%'
}

export default async function SbfpSummaryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('sbfp_summary')
    .select('*')
    .order('center', { ascending: true })

  const totals = rows?.reduce((acc, r) => ({
    jan_dec_target_milk_volume: acc.jan_dec_target_milk_volume + (r.jan_dec_target_milk_volume || 0),
    target_milk_packs: acc.target_milk_packs + (r.target_milk_packs || 0),
    equivalent_volume: acc.equivalent_volume + (r.equivalent_volume || 0),
    shortage_surplus: acc.shortage_surplus + (r.shortage_surplus || 0),
    jul_dec_projected_volume: acc.jul_dec_projected_volume + (r.jul_dec_projected_volume || 0),
    milk_packs_can_produce: acc.milk_packs_can_produce + (r.milk_packs_can_produce || 0),
    shortage_surplus_packs: acc.shortage_surplus_packs + (r.shortage_surplus_packs || 0),
  }), {
    jan_dec_target_milk_volume: 0, target_milk_packs: 0, equivalent_volume: 0,
    shortage_surplus: 0, jul_dec_projected_volume: 0, milk_packs_can_produce: 0, shortage_surplus_packs: 0
  })

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Summary: Target Milk Production</h1>
      <p className="text-muted-foreground text-sm mb-6">Comparison of PCC center milk production capacity vs. SBFP requirements</p>

      <div className="rounded-md border bg-card overflow-x-auto">
        <table className="w-full text-sm whitespace-nowrap">
          <thead>
            <tr className="border-b bg-muted/50">
              <th rowSpan={2} className="h-10 px-4 text-left font-semibold">CENTER</th>
              <th colSpan={4} className="px-4 py-2 text-center font-semibold border-l border-b" style={{ background: 'rgba(59,130,246,0.07)' }}>
                JAN-DEC (Full Year)
              </th>
              <th colSpan={3} className="px-4 py-2 text-center font-semibold border-l border-b" style={{ background: 'rgba(16,185,129,0.07)' }}>
                JUL-DEC (2nd Semester)
              </th>
            </tr>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2 text-right font-medium border-l text-xs">Target Milk Volume (L)</th>
              <th className="px-3 py-2 text-right font-medium text-xs">Target Milk Packs</th>
              <th className="px-3 py-2 text-right font-medium text-xs">Equiv. Vol. (Packs/25)</th>
              <th className="px-3 py-2 text-right font-medium text-xs">Shortage / Surplus</th>
              <th className="px-3 py-2 text-right font-medium border-l text-xs">Projected Vol. (L)</th>
              <th className="px-3 py-2 text-right font-medium text-xs">Packs Producible</th>
              <th className="px-3 py-2 text-right font-medium text-xs">Shortage / Surplus (Packs)</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map((r) => {
              const isDeficit = (r.shortage_surplus_packs || 0) < 0
              return (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="px-4 py-2 font-semibold">{r.center}</td>
                  <td className="px-3 py-2 text-right border-l">{fmt(r.jan_dec_target_milk_volume)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.target_milk_packs)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.equivalent_volume)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${(r.shortage_surplus || 0) < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
                    {fmt(r.shortage_surplus)}
                  </td>
                  <td className="px-3 py-2 text-right border-l">{fmt(r.jul_dec_projected_volume)}</td>
                  <td className="px-3 py-2 text-right">{fmt(r.milk_packs_can_produce)}</td>
                  <td className={`px-3 py-2 text-right font-semibold ${isDeficit ? 'text-red-500' : 'text-emerald-600'}`}>
                    {fmt(r.shortage_surplus_packs)}
                  </td>
                </tr>
              )
            })}
            {/* Totals row */}
            {totals && (
              <tr className="border-t-2 bg-muted/60 font-bold">
                <td className="px-4 py-2">TOTAL</td>
                <td className="px-3 py-2 text-right border-l">{fmt(totals.jan_dec_target_milk_volume)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.target_milk_packs)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.equivalent_volume)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.shortage_surplus)}</td>
                <td className="px-3 py-2 text-right border-l">{fmt(totals.jul_dec_projected_volume)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.milk_packs_can_produce)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.shortage_surplus_packs)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(!rows || rows.length === 0) && (
        <div className="text-center py-12 text-muted-foreground border rounded-md mt-4">
          No summary data yet. Run the seed script to populate from the Excel file.
        </div>
      )}
    </div>
  )
}
