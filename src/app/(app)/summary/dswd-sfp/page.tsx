import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCurrency, formatNumber } from '@/lib/utils'

export default async function SummaryDSWDPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role, center').eq('id', user.id).single()

  const isEncoder    = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : null

  let query = supabase
    .from('mfp_data')
    .select('year, region, province, municipality, supplier_id, beneficiaries, milk_packs, raw_milk_liters, milk_cost, service_fee, total_funds_transferred, feeding_days, milk_type, center')
    .eq('funded_by', 'DSWD')

  if (centerFilter) query = query.eq('center', centerFilter)
  const { data: records } = await query

  const years = [...new Set(records?.map(r => r.year))].sort()

  function forYear(yr: number) {
    const rows = records?.filter(r => r.year === yr) ?? []
    return {
      regions:          new Set(rows.map(r => r.region)).size,
      provinces:        new Set(rows.map(r => r.province)).size,
      municipalities:   new Set(rows.map(r => r.municipality)).size,
      coops:            new Set(rows.map(r => r.supplier_id)).size,
      beneficiaries:    rows.reduce((s, r) => s + (r.beneficiaries || 0), 0),
      milkPacks:        rows.reduce((s, r) => s + (r.milk_packs || 0), 0),
      rawMilk:          rows.reduce((s, r) => s + (r.raw_milk_liters || 0), 0),
      grossIncome:      rows.reduce((s, r) => s + (r.milk_cost || 0), 0),
      adminCost:        rows.reduce((s, r) => s + (r.service_fee || 0), 0),
      fundsTransferred: rows.reduce((s, r) => s + (r.total_funds_transferred || 0), 0),
      feedingDays: rows.length > 0 ? Math.round(rows.reduce((s, r) => s + (r.feeding_days || 0), 0) / rows.length) : 0,
    }
  }

  const params = years.map(yr => ({ year: yr, ...forYear(yr) }))
  const regions = [...new Set(records?.map(r => r.region))].filter(Boolean).sort()
  function regionByYear(region: string, yr: number) {
    return records?.filter(r => r.region === region && r.year === yr)
      .reduce((s, r) => s + (r.beneficiaries || 0), 0) ?? 0
  }

  const rowDefs: { label: string; key: keyof typeof params[0]; currency?: boolean; highlight?: boolean }[] = [
    { label: 'No. of Regions',                     key: 'regions' },
    { label: 'No. of Provinces',                   key: 'provinces' },
    { label: 'No. of Municipalities/Cities',       key: 'municipalities' },
    { label: 'No. of Cooperatives',                key: 'coops' },
    { label: 'Avg. Feeding Days',                  key: 'feedingDays' },
    { label: 'PCC Commitment (Beneficiaries)',      key: 'beneficiaries',    highlight: true },
    { label: 'Raw Milk Used in Liters',            key: 'rawMilk',          highlight: true },
    { label: 'No. of Milk Packs',                  key: 'milkPacks',        highlight: true },
    { label: 'Gross Income of Dairy Cooperatives', key: 'grossIncome',      currency: true, highlight: true },
    { label: 'Administrative Cost',                key: 'adminCost',        currency: true },
    { label: 'Total Funds Transferred to PCC',     key: 'fundsTransferred', currency: true, highlight: true },
  ]



  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Summary: DSWD-SFP</h1>
          <p className="page-subtitle">
            {isEncoder && centerFilter
              ? <>📍 <strong>{centerFilter}</strong> Center — Dept. of Social Welfare &amp; Development Supplementary Feeding Program</>
              : 'Department of Social Welfare & Development — Supplementary Feeding Program (All Centers)'}
          </p>
        </div>
        {isEncoder && centerFilter && (
          <div style={{ background: '#15803d', color: 'white', borderRadius: 10, padding: '0.6rem 1.25rem', fontSize: '0.82rem', fontWeight: 700 }}>
            📍 {centerFilter} data only
          </div>
        )}
      </div>

      {/* Main parameters table */}
      <div className="card" style={{ marginBottom: '1.5rem', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Parameters</th>
                {years.map(p => <th key={p}>FY {p}</th>)}
              </tr>
            </thead>
            <tbody>
              {rowDefs.map(row => (
                <tr key={row.label}>
                  <td style={{
                    background: row.highlight ? '#dcfce7' : undefined,
                    fontWeight: row.highlight ? 700 : 600,
                    color: 'var(--navy)',
                    borderLeft: row.highlight ? '3px solid #16a34a' : '3px solid transparent',
                  }}>
                    {row.label}
                  </td>
                  {params.map(p => {
                    const val = p[row.key]
                    return (
                      <td key={p.year} style={{
                        fontWeight: row.highlight ? 700 : 400,
                        color: row.currency ? '#15803d' : 'var(--gray-800)',
                        background: row.highlight ? '#f0fdf4' : undefined,
                      }}>
                        <span>{row.currency ? formatCurrency(val as number) : formatNumber(val as number)}</span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Region */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--gray-200)' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', fontSize: '0.95rem' }}>
            Beneficiaries by Region {centerFilter && `— ${centerFilter}`}
          </h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="summary-table">
            <thead>
              <tr>
                <th>Region</th>
                {years.map(yr => <th key={yr}>FY {yr}</th>)}
              </tr>
            </thead>
            <tbody>
              {regions.map(region => (
                <tr key={region}>
                  <td style={{ color: 'var(--navy)' }}>{region}</td>
                  {years.map(yr => {
                    const val = regionByYear(region, yr)
                    return <td key={yr}><span>{val > 0 ? formatNumber(val) : '—'}</span></td>
                  })}
                </tr>
              ))}
              <tr>
                <td style={{ fontWeight: 800, background: '#16a34a', color: 'white', borderLeft: 'none' }}>TOTAL</td>
                {params.map(p => (
                  <td key={p.year} style={{ fontWeight: 800, background: '#dcfce7', color: '#15803d' }}>
                    <span>{formatNumber(p.beneficiaries)}</span>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {params.length === 0 && (
        <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--gray-400)', marginTop: '1rem' }}>
          No DSWD records found{centerFilter ? ` for ${centerFilter}` : ''} yet.
        </div>
      )}
    </div>
  )
}
