import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return 'N/A'
  return Number(n).toLocaleString('en-PH')
}

export default async function SbfpSummaryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: rows } = await supabase
    .from('sbfp_summary')
    .select('*')
    .order('center', { ascending: true })

  const totals = (rows || []).reduce((acc, r) => ({
    jan_dec_target_milk_volume: acc.jan_dec_target_milk_volume + (r.jan_dec_target_milk_volume || 0),
    target_milk_packs:          acc.target_milk_packs          + (r.target_milk_packs          || 0),
    equivalent_volume:          acc.equivalent_volume          + (r.equivalent_volume          || 0),
    shortage_surplus:           acc.shortage_surplus           + (r.shortage_surplus           || 0),
    jul_dec_projected_volume:   acc.jul_dec_projected_volume   + (r.jul_dec_projected_volume   || 0),
    milk_packs_can_produce:     acc.milk_packs_can_produce     + (r.milk_packs_can_produce     || 0),
    shortage_surplus_packs:     acc.shortage_surplus_packs     + (r.shortage_surplus_packs     || 0),
  }), {
    jan_dec_target_milk_volume: 0, target_milk_packs: 0, equivalent_volume: 0,
    shortage_surplus: 0, jul_dec_projected_volume: 0, milk_packs_can_produce: 0, shortage_surplus_packs: 0,
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Summary: Target Milk Production</h1>
          <p className="page-subtitle">Comparison of PCC center milk production capacity vs. SBFP requirements</p>
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
          <table className="data-table" style={{ minWidth: 1100, fontSize: '0.78rem' }}>
            <thead>
              <tr>
                <th style={{ minWidth: 80, whiteSpace: 'normal', lineHeight: 1.2 }}>CENTER</th>
                {/* JAN-DEC group */}
                <th style={{ minWidth: 130, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  A — Target Milk Volume (L)
                </th>
                <th style={{ minWidth: 110, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  B — Target Milk Packs
                </th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  C — Equiv. Vol. (Packs/25)
                </th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  D — Shortage / Surplus
                </th>
                {/* JUL-DEC group */}
                <th style={{ minWidth: 130, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  E — Projected Vol. (L)
                </th>
                <th style={{ minWidth: 120, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  F — Packs Producible
                </th>
                <th style={{ minWidth: 130, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'right' }}>
                  G — Shortage / Surplus (Packs)
                </th>
              </tr>
            </thead>
            <tbody>
              {(rows || []).map((r) => {
                const isDeficit = (r.shortage_surplus_packs || 0) < 0
                const isSurplus = (r.shortage_surplus || 0) >= 0
                return (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 700 }}>{r.center}</td>
                    <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.03)' }}>{fmt(r.jan_dec_target_milk_volume)}</td>
                    <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.03)' }}>{fmt(r.target_milk_packs)}</td>
                    <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.03)' }}>{fmt(r.equivalent_volume)}</td>
                    <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.03)', fontWeight: 600, color: isSurplus ? '#059669' : '#dc2626' }}>
                      {fmt(r.shortage_surplus)}
                    </td>
                    <td style={{ textAlign: 'right', background: 'rgba(16,185,129,0.03)' }}>{fmt(r.jul_dec_projected_volume)}</td>
                    <td style={{ textAlign: 'right', background: 'rgba(16,185,129,0.03)' }}>{fmt(r.milk_packs_can_produce)}</td>
                    <td style={{ textAlign: 'right', background: 'rgba(16,185,129,0.03)', fontWeight: 700, color: isDeficit ? '#dc2626' : '#059669' }}>
                      {fmt(r.shortage_surplus_packs)}
                    </td>
                  </tr>
                )
              })}
              {/* Totals row */}
              <tr style={{ fontWeight: 700, background: 'var(--gray-100, #f8fafc)', borderTop: '2px solid var(--gray-300, #cbd5e1)' }}>
                <td style={{ fontWeight: 800 }}>TOTAL</td>
                <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.06)' }}>{fmt(totals.jan_dec_target_milk_volume)}</td>
                <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.06)' }}>{fmt(totals.target_milk_packs)}</td>
                <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.06)' }}>{fmt(totals.equivalent_volume)}</td>
                <td style={{ textAlign: 'right', background: 'rgba(59,130,246,0.06)' }}>{fmt(totals.shortage_surplus)}</td>
                <td style={{ textAlign: 'right', background: 'rgba(16,185,129,0.06)' }}>{fmt(totals.jul_dec_projected_volume)}</td>
                <td style={{ textAlign: 'right', background: 'rgba(16,185,129,0.06)' }}>{fmt(totals.milk_packs_can_produce)}</td>
                <td style={{ textAlign: 'right', background: 'rgba(16,185,129,0.06)' }}>{fmt(totals.shortage_surplus_packs)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {(!rows || rows.length === 0) && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)', background: 'white', borderRadius: 12, border: '1px solid var(--gray-200)', marginTop: '-1rem' }}>
          No summary data yet. Run the seed script to populate from the Excel file.
        </div>
      )}
    </div>
  )
}
