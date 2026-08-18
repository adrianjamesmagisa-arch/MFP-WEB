import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'

export default async function PacksDeliveredPage(props: {
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
    .select('beneficiaries, milk_packs, milk_cost, total_funds_transferred, milk_type, funded_by, year, center, region, province, date_started, feeding_days')
    .range(0, 49999)

  if (centerFilter) query = query.eq('center', centerFilter)
  if (sp.year)      query = query.eq('year', parseInt(sp.year))

  let { data: rows } = await query

  if (sp.month && rows) {
    const m = parseInt(sp.month)
    rows = rows.filter(r => r.date_started && (new Date(r.date_started).getMonth() + 1) === m)
  }

  rows = rows ?? []

  const totalPacks   = rows.reduce((s, r) => s + (r.milk_packs || 0), 0)
  const totalCost    = rows.reduce((s, r) => s + (r.milk_cost || 0), 0)
  const totalFunds   = rows.reduce((s, r) => s + (r.total_funds_transferred || 0), 0)
  const totalBene    = rows.reduce((s, r) => s + (r.beneficiaries || 0), 0)
  const totalRecords = rows.length

  // Group by milk type
  const milkTypeMap: Record<string, { packs: number; cost: number; records: number }> = {}
  rows.forEach(r => {
    const k = r.milk_type || 'Unknown'
    if (!milkTypeMap[k]) milkTypeMap[k] = { packs: 0, cost: 0, records: 0 }
    milkTypeMap[k].packs   += r.milk_packs || 0
    milkTypeMap[k].cost    += r.milk_cost || 0
    milkTypeMap[k].records += 1
  })
  const milkTypeRows = Object.entries(milkTypeMap)
    .map(([type, v]) => ({ type, ...v }))
    .sort((a, b) => b.packs - a.packs)
  const maxTypePacks = Math.max(...milkTypeRows.map(r => r.packs), 1)

  // Group by center
  const centerMap: Record<string, { packs: number; cost: number; bene: number; records: number }> = {}
  rows.forEach(r => {
    const k = r.center || 'Unknown'
    if (!centerMap[k]) centerMap[k] = { packs: 0, cost: 0, bene: 0, records: 0 }
    centerMap[k].packs   += r.milk_packs || 0
    centerMap[k].cost    += r.milk_cost || 0
    centerMap[k].bene    += r.beneficiaries || 0
    centerMap[k].records += 1
  })
  const centerRows = Object.entries(centerMap)
    .map(([center, v]) => ({ center, ...v }))
    .sort((a, b) => b.packs - a.packs)
  const maxCenterPacks = Math.max(...centerRows.map(r => r.packs), 1)

  // Group by funder
  const funderMap: Record<string, { packs: number; cost: number; bene: number; records: number }> = {}
  rows.forEach(r => {
    const k = r.funded_by || 'Unknown'
    if (!funderMap[k]) funderMap[k] = { packs: 0, cost: 0, bene: 0, records: 0 }
    funderMap[k].packs   += r.milk_packs || 0
    funderMap[k].cost    += r.milk_cost || 0
    funderMap[k].bene    += r.beneficiaries || 0
    funderMap[k].records += 1
  })
  const funderRows = Object.entries(funderMap)
    .map(([funder, v]) => ({ funder, ...v }))
    .sort((a, b) => b.packs - a.packs)

  const funderColors: Record<string, string> = { DepEd: '#1d4ed8', DSWD: '#15803d', LDS: '#b45309' }
  const totalForPie = funderRows.reduce((s, r) => s + r.packs, 0) || 1

  const milkTypeColors: Record<string, string> = {
    PM:      '#0ea5e9',
    SM:      '#2563eb',
    SMP:     '#7c3aed',
    Karabao: '#b45309',
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">📦 Packs Delivered</h1>
          <p className="page-subtitle">Milk Packs Delivered Report — All Program Types</p>
        </div>
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} />
      </div>

      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Packs Delivered', value: formatNumber(totalPacks),  color: '#0369a1', icon: '📦' },
          { label: 'Total Beneficiaries',   value: formatNumber(totalBene),   color: '#1d4ed8', icon: '👥' },
          { label: 'Total Milk Cost (₱)',   value: formatCurrency(totalCost), color: '#15803d', icon: '💰' },
          { label: 'Records',               value: formatNumber(totalRecords), color: '#7c3aed', icon: '📋' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: '1.5rem', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* By Milk Type */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1.25rem', fontSize: '1rem' }}>
            Packs by Milk Type
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {milkTypeRows.map(r => {
              const pct  = (r.packs / maxTypePacks) * 100
              const col  = milkTypeColors[r.type] ?? '#64748b'
              const share = Math.round((r.packs / totalPacks) * 100)
              return (
                <div key={r.type}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--navy)' }}>{r.type}</span>
                    <span style={{ color: col, fontWeight: 700 }}>{share}% — {formatNumber(r.packs)} packs</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--gray-100)', borderRadius: 6 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 6 }} />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray-600)', marginTop: '0.2rem' }}>{formatCurrency(r.cost)} · {r.records} records</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* By Funder */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1.25rem', fontSize: '1rem' }}>
            Packs by Funding Source
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {funderRows.map(r => {
              const pct  = Math.round((r.packs / totalForPie) * 100)
              const col  = funderColors[r.funder] ?? '#64748b'
              return (
                <div key={r.funder}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{r.funder}</span>
                    <span style={{ color: col, fontWeight: 700 }}>{pct}% — {formatNumber(r.packs)} packs</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--gray-100)', borderRadius: 6 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 6 }} />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray-600)', marginTop: '0.2rem' }}>
                    {formatNumber(r.bene)} beneficiaries · {formatCurrency(r.cost)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* By Center Table */}
      <div className="card" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1.25rem', fontSize: '1rem' }}>
          Packs Delivered by Center
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: 'var(--navy)', color: 'white' }}>
                {['#', 'Center', 'Packs Delivered', 'Beneficiaries', 'Milk Cost (₱)', 'Records', '% of Total'].map(h => (
                  <th key={h} style={{ padding: '0.6rem 0.9rem', textAlign: h === 'Center' || h === '#' ? 'left' : 'right', fontWeight: 700 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {centerRows.map((c, i) => {
                const sharePct = Math.round((c.packs / totalPacks) * 100)
                return (
                  <tr key={c.center} style={{ background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                    <td style={{ padding: '0.5rem 0.9rem', color: 'var(--gray-600)' }}>{i + 1}</td>
                    <td style={{ padding: '0.5rem 0.9rem', fontWeight: 600 }}>{c.center}</td>
                    <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right', fontWeight: 700, color: '#0369a1' }}>{formatNumber(c.packs)}</td>
                    <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right' }}>{formatNumber(c.bene)}</td>
                    <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right' }}>{formatCurrency(c.cost)}</td>
                    <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right' }}>{c.records}</td>
                    <td style={{ padding: '0.5rem 0.9rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', justifyContent: 'flex-end' }}>
                        <div style={{ height: 6, width: 60, background: 'var(--gray-100)', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: `${sharePct}%`, background: 'var(--gold)', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: '0.72rem', color: 'var(--gray-600)', minWidth: 28 }}>{sharePct}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'var(--navy)', color: 'white', fontWeight: 700 }}>
                <td colSpan={2} style={{ padding: '0.6rem 0.9rem' }}>TOTAL</td>
                <td style={{ padding: '0.6rem 0.9rem', textAlign: 'right' }}>{formatNumber(totalPacks)}</td>
                <td style={{ padding: '0.6rem 0.9rem', textAlign: 'right' }}>{formatNumber(totalBene)}</td>
                <td style={{ padding: '0.6rem 0.9rem', textAlign: 'right' }}>{formatCurrency(totalCost)}</td>
                <td style={{ padding: '0.6rem 0.9rem', textAlign: 'right' }}>{totalRecords}</td>
                <td style={{ padding: '0.6rem 0.9rem', textAlign: 'right' }}>100%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
