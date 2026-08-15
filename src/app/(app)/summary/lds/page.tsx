import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCurrency, formatNumber } from '@/lib/utils'

export default async function SummaryLDSPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, center').eq('id', user.id).single()

  const isEncoder    = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : null

  let query = supabase
    .from('mfp_data')
    .select('year, province, elementary_school, supplier_id, raw_milk_liters, milk_packs, milk_cost, feeding_days, mode_of_procurement, beneficiaries, region, center')
    .eq('funded_by', 'LDS')

  if (centerFilter) query = query.eq('center', centerFilter)
  const { data: records } = await query

  const years = [...new Set(records?.map(r => r.year))].sort()

  function forYear(yr: number) {
    const rows = records?.filter(r => r.year === yr) ?? []
    return {
      provinces:     new Set(rows.map(r => r.province)).size,
      schools:       new Set(rows.map(r => r.elementary_school)).size,
      coops:         new Set(rows.map(r => r.supplier_id)).size,
      rawMilk:       rows.reduce((s, r) => s + (r.raw_milk_liters || 0), 0),
      milkPacks:     rows.reduce((s, r) => s + (r.milk_packs || 0), 0),
      grossIncome:   rows.reduce((s, r) => s + (r.milk_cost || 0), 0),
      feedingDays:   rows[0]?.feeding_days ?? 0,
      mode:          rows[0]?.mode_of_procurement ?? '—',
      beneficiaries: rows.reduce((s, r) => s + (r.beneficiaries || 0), 0),
      regions:       new Set(rows.map(r => r.region)).size,
    }
  }

  const params = years.map(yr => ({ year: yr, ...forYear(yr) }))

  const rowDefs: { label: string; key: keyof typeof params[0]; currency?: boolean; highlight?: boolean }[] = [
    { label: 'No. of Regions',            key: 'regions' },
    { label: 'No. of Provinces',          key: 'provinces' },
    { label: 'No. of Elementary Schools', key: 'schools' },
    { label: 'No. of Cooperatives',       key: 'coops' },
    { label: 'Avg. Feeding Days',         key: 'feedingDays' },
    { label: 'Mode of Procurement',       key: 'mode' },
    { label: 'Total Beneficiaries',       key: 'beneficiaries',  highlight: true },
    { label: 'Raw Milk Used (Liters)',    key: 'rawMilk',        highlight: true },
    { label: 'No. of Milk Packs',         key: 'milkPacks',      highlight: true },
    { label: 'Gross Income of Dairy Cooperatives (₱)', key: 'grossIncome', currency: true, highlight: true },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Summary: Latter Day Saints (LDS)</h1>
          <p className="page-subtitle">
            {isEncoder && centerFilter
              ? <>📍 <strong>{centerFilter}</strong> Center — LDS-funded feeding program</>
              : 'Auto-computed from MFP Data — LDS-funded feeding program (All Centers)'}
          </p>
        </div>
        {isEncoder && centerFilter && (
          <div style={{ background: '#b45309', color: 'white', borderRadius: 10, padding: '0.6rem 1.25rem', fontSize: '0.82rem', fontWeight: 700 }}>
            📍 {centerFilter} data only
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Parameters</th>
                {params.map(p => <th key={p.year}>FY {p.year}</th>)}
              </tr>
            </thead>
            <tbody>
              {rowDefs.map(row => (
                <tr key={row.label}>
                  <td style={{
                    background: row.highlight ? '#fef3c7' : undefined,
                    fontWeight: row.highlight ? 700 : 600,
                    color: 'var(--navy)',
                    borderLeft: row.highlight ? '3px solid var(--gold)' : '3px solid transparent',
                  }}>
                    {row.label}
                  </td>
                  {params.map(p => {
                    const val = p[row.key]
                    return (
                      <td key={p.year} style={{
                        fontWeight: row.highlight ? 700 : 400,
                        color: row.currency ? '#15803d' : 'var(--gray-800)',
                        background: row.highlight ? '#fffbeb' : undefined,
                      }}>
                        <span>
                          {typeof val === 'string' ? val
                            : row.currency ? formatCurrency(val as number)
                            : formatNumber(val as number)}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {params.length === 0 && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)' }}>
          No LDS feeding records found{centerFilter ? ` for ${centerFilter}` : ''} yet.
        </div>
      )}
    </div>
  )
}
