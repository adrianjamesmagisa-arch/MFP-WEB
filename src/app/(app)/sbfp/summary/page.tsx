import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { recomputeAllSummariesForYear } from '@/lib/sbfp-compute'
import { loadSchoolYears } from '@/lib/sbfp-school-years'
import { parseSchoolYear, schoolYearLabel, schoolYearToDbYear } from '@/lib/sbfp-year'
import { sbfpCenterAliases, sbfpEncoderHomePath } from '@/lib/center-aliases'

function fmt(n: number | null | undefined) {
  if (n == null || n === 0) return '—'
  return Number(n).toLocaleString('en-PH', { maximumFractionDigits: 2 })
}

export default async function SbfpSummaryPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>
}) {
  const { sy: syParam } = await searchParams
  const schoolYears = await loadSchoolYears()
  const sy = parseSchoolYear(syParam, schoolYears)
  const year = schoolYearToDbYear(sy)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,center')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'encoder') {
    redirect(sbfpEncoderHomePath(profile.center))
  }

  await recomputeAllSummariesForYear(supabase, year)

  let q = supabase
    .from('sbfp_summary')
    .select('*')
    .eq('year', year)
    .order('center', { ascending: true })

  if (profile?.role === 'encoder' && profile.center) {
    const aliases = sbfpCenterAliases(profile.center)
    q = aliases.length === 1 ? q.eq('center', aliases[0]) : q.in('center', aliases)
  }

  const { data: rows } = await q

  const visible = (rows || []).filter(r =>
    (r.jan_dec_target_milk_volume || 0) > 0 ||
    (r.target_milk_packs || 0) > 0 ||
    (r.jul_dec_projected_volume || 0) > 0
  )

  const totals = visible.reduce((acc, r) => ({
    jan_dec_target_milk_volume: acc.jan_dec_target_milk_volume + (r.jan_dec_target_milk_volume || 0),
    target_milk_packs:          acc.target_milk_packs          + (r.target_milk_packs          || 0),
    equivalent_volume:          acc.equivalent_volume          + (Number(r.equivalent_volume)  || 0),
    shortage_surplus:           acc.shortage_surplus           + (Number(r.shortage_surplus)   || 0),
    jul_dec_projected_volume:   acc.jul_dec_projected_volume   + (r.jul_dec_projected_volume   || 0),
    milk_packs_can_produce:     acc.milk_packs_can_produce     + (r.milk_packs_can_produce     || 0),
    shortage_surplus_packs:     acc.shortage_surplus_packs     + (Number(r.shortage_surplus_packs) || 0),
  }), {
    jan_dec_target_milk_volume: 0, target_milk_packs: 0, equivalent_volume: 0,
    shortage_surplus: 0, jul_dec_projected_volume: 0, milk_packs_can_produce: 0, shortage_surplus_packs: 0,
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Summary: Target Milk Production</h1>
          <p className="page-subtitle">
            Auto from center capacity + SDO packs to deliver — {schoolYearLabel(sy)}
          </p>
        </div>
      </div>

      {visible.length > 0 && (
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 220px)' }}>
          <table className="data-table" style={{ minWidth: 1100, fontSize: '0.78rem' }}>
            <thead>
              <tr>
                <th style={{ minWidth: 80, whiteSpace: 'normal', lineHeight: 1.2 }}>CENTER</th>
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
              {visible.map((r) => {
                const isDeficit = (Number(r.shortage_surplus_packs) || 0) < 0
                const isSurplus = (Number(r.shortage_surplus) || 0) >= 0
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
              {visible.length > 1 && (
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
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {visible.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--gray-400)', background: 'white', borderRadius: 12, border: '1px solid var(--gray-200)' }}>
          No summary data for {schoolYearLabel(sy)}. Centers enter CBED capacity under each center page (table 3); packs auto-fill from SDO rows.
        </div>
      )}
    </div>
  )
}
