import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'

export default async function SummaryDSWDPage(props: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>
}) {
  const sp = await props.searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const isEncoder = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : sp.center

  let query = supabase
    .from('mfp_data')
    .select('beneficiaries, milk_packs, milk_cost, total_funds_transferred, funded_by, year, center, region, province, municipality, date_started')
    .eq('funded_by', 'DSWD')
    .range(0, 49999)

  if (centerFilter) query = query.eq('center', centerFilter)
  if (sp.year)      query = query.eq('year', parseInt(sp.year))

  let { data: rows } = await query

  if (sp.month && rows) {
    const m = parseInt(sp.month)
    rows = rows.filter(r => r.date_started && (new Date(r.date_started).getMonth() + 1) === m)
  }

  rows = rows ?? []

  const totalBene    = rows.reduce((s, r) => s + (r.beneficiaries || 0), 0)
  const totalPacks   = rows.reduce((s, r) => s + (r.milk_packs || 0), 0)
  const totalFunds   = rows.reduce((s, r) => s + (r.total_funds_transferred || 0), 0)
  const totalCost    = rows.reduce((s, r) => s + (r.milk_cost || 0), 0)
  const totalRecords = rows.length

  const regionMap: Record<string, { bene: number; packs: number; cost: number; records: number }> = {}
  rows.forEach(r => {
    const k = r.region || 'Unknown'
    if (!regionMap[k]) regionMap[k] = { bene: 0, packs: 0, cost: 0, records: 0 }
    regionMap[k].bene    += r.beneficiaries || 0
    regionMap[k].packs   += r.milk_packs || 0
    regionMap[k].cost    += r.milk_cost || 0
    regionMap[k].records += 1
  })
  const regionRows = Object.entries(regionMap)
    .map(([region, v]) => ({ region, ...v }))
    .sort((a, b) => b.bene - a.bene)

  const centerMap: Record<string, { bene: number; packs: number; cost: number; records: number }> = {}
  rows.forEach(r => {
    const k = r.center || 'Unknown'
    if (!centerMap[k]) centerMap[k] = { bene: 0, packs: 0, cost: 0, records: 0 }
    centerMap[k].bene    += r.beneficiaries || 0
    centerMap[k].packs   += r.milk_packs || 0
    centerMap[k].cost    += r.milk_cost || 0
    centerMap[k].records += 1
  })
  const centerRows = Object.entries(centerMap)
    .map(([center, v]) => ({ center, ...v }))
    .sort((a, b) => b.bene - a.bene)

  const maxBene = Math.max(...regionRows.map(r => r.bene), 1)
  const DSWD_COLOR = '#15803d'
  const DSWD_BG    = '#dcfce7'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: DSWD_COLOR }}>🤝 Summary — DSWD</h1>
          <p className="page-subtitle">DSWD Supplementary Feeding Program</p>
        </div>
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} />
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Beneficiaries', value: formatNumber(totalBene),   color: DSWD_COLOR },
          { label: 'Milk Packs',          value: formatNumber(totalPacks),  color: '#0369a1' },
          { label: 'Gross Income (₱)',    value: formatCurrency(totalCost), color: '#15803d' },
          { label: 'Total Records',       value: formatNumber(totalRecords), color: '#7c3aed' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div style={{ fontWeight: 800, fontSize: '1.5rem', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* By Region */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: DSWD_COLOR, marginBottom: '1.25rem', fontSize: '1rem' }}>
            Beneficiaries by Region
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 380, overflowY: 'auto' }}>
            {regionRows.map(r => {
              const pct = (r.bene / maxBene) * 100
              return (
                <div key={r.region}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--navy)' }}>Region {r.region}</span>
                    <span style={{ color: DSWD_COLOR, fontWeight: 700 }}>{formatNumber(r.bene)}</span>
                  </div>
                  <div style={{ height: 7, background: 'var(--gray-100)', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: DSWD_COLOR, borderRadius: 4 }} />
                  </div>
                  <div style={{ fontSize: '0.68rem', color: 'var(--gray-600)' }}>{formatNumber(r.packs)} packs · {formatCurrency(r.cost)}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Center Table */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: DSWD_COLOR, marginBottom: '1.25rem', fontSize: '1rem' }}>
            Summary by Center
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: DSWD_BG }}>
                  {['Center', 'Beneficiaries', 'Milk Packs', 'Gross Income', 'Records'].map(h => (
                    <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: h === 'Center' ? 'left' : 'right', color: DSWD_COLOR, fontWeight: 700 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {centerRows.map((c, i) => (
                  <tr key={c.center} style={{ background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                    <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{c.center}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{formatNumber(c.bene)}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{formatNumber(c.packs)}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{formatCurrency(c.cost)}</td>
                    <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{c.records}</td>
                  </tr>
                ))}
                <tr style={{ background: DSWD_BG, fontWeight: 700 }}>
                  <td style={{ padding: '0.5rem 0.75rem' }}>TOTAL</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{formatNumber(totalBene)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{formatNumber(totalPacks)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{formatCurrency(totalCost)}</td>
                  <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>{totalRecords}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
