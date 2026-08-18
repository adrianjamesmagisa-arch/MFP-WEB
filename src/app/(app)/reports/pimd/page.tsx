import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'
import { Users, Package, DollarSign, BookOpen, HeartHandshake, Church, Milk } from 'lucide-react'

export default async function PIMDReportPage(props: {
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
    .select('beneficiaries, milk_packs, milk_cost, total_funds_transferred, funded_by, year, center, date_started, total_volume_requirements, raw_milk_liters, whole_milk_kg, skimmed_milk_kg, sugar')
    .range(0, 49999)

  if (centerFilter) query = query.eq('center', centerFilter)
  if (sp.year)      query = query.eq('year', parseInt(sp.year))

  let { data: rows } = await query

  if (sp.month && rows) {
    const m = parseInt(sp.month)
    rows = rows.filter(r => {
      if (!r.date_started) return false
      return (new Date(r.date_started).getMonth() + 1) === m
    })
  }

  rows = rows ?? []

  const totalBene        = rows.reduce((s, r) => s + (r.beneficiaries || 0), 0)
  const totalPacks       = rows.reduce((s, r) => s + (r.milk_packs || 0), 0)
  const totalFunds       = rows.reduce((s, r) => s + (r.total_funds_transferred || 0), 0)
  const totalCost        = rows.reduce((s, r) => s + (r.milk_cost || 0), 0)
  const totalVolume      = rows.reduce((s, r) => s + (r.total_volume_requirements || 0), 0)
  const totalRawMilk     = rows.reduce((s, r) => s + (r.raw_milk_liters || 0), 0)
  const totalWholeMilk   = rows.reduce((s, r) => s + (r.whole_milk_kg || 0), 0)
  const totalSkimMilk    = rows.reduce((s, r) => s + (r.skimmed_milk_kg || 0), 0)
  const totalSugar       = rows.reduce((s, r) => s + (r.sugar || 0), 0)

  const funderMap: Record<string, { bene: number; packs: number; cost: number; records: number }> = {}
  rows.forEach(r => {
    const k = r.funded_by || 'Unknown'
    if (!funderMap[k]) funderMap[k] = { bene: 0, packs: 0, cost: 0, records: 0 }
    funderMap[k].bene    += r.beneficiaries || 0
    funderMap[k].packs   += r.milk_packs || 0
    funderMap[k].cost    += r.milk_cost || 0
    funderMap[k].records += 1
  })

  const centerMap: Record<string, { bene: number; packs: number }> = {}
  rows.forEach(r => {
    if (!r.center) return
    if (!centerMap[r.center]) centerMap[r.center] = { bene: 0, packs: 0 }
    centerMap[r.center].bene  += r.beneficiaries || 0
    centerMap[r.center].packs += r.milk_packs || 0
  })
  const topCenters = Object.entries(centerMap)
    .map(([c, v]) => ({ center: c, ...v }))
    .sort((a, b) => b.bene - a.bene)

  const maxPacks = Math.max(...topCenters.map(c => c.packs), 1)
  const maxBene  = Math.max(...topCenters.map(c => c.bene),  1)

  const funderColors: Record<string, string> = {
    DepEd: '#1d4ed8', DSWD: '#15803d', LDS: '#b45309'
  }
  const totalForPie = Object.values(funderMap).reduce((s, v) => s + v.packs, 0) || 1

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">PIMD Report</h1>
          <p className="page-subtitle">Program Implementation Monitoring & Data — Infographic Overview</p>
        </div>
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} />
      </div>

      {/* Top KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Beneficiaries', value: formatNumber(totalBene),   color: '#1d4ed8', icon: '👨‍👩‍👧‍👦' },
          { label: 'Milk Packs Delivered', value: formatNumber(totalPacks),  color: '#0369a1', icon: '📦' },
          { label: 'Total Funds (₱)',      value: formatCurrency(totalFunds), color: '#15803d', icon: '💰' },
          { label: 'Total Volume (L)',      value: formatNumber(Math.round(totalVolume)), color: '#7c3aed', icon: '🥛' },
        ].map(s => (
          <div key={s.label} className="stat-card" style={{ textAlign: 'center', padding: '1.5rem 1rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{s.icon}</div>
            <div style={{ fontWeight: 800, fontSize: '1.5rem', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--gray-600)', marginTop: '0.25rem' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Funder breakdown – pie-like donut */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1.25rem', fontSize: '1rem' }}>
            Milk Packs by Funding Source
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            {Object.entries(funderMap).sort((a,b) => b[1].packs - a[1].packs).map(([key, val]) => {
              const pct = Math.round((val.packs / totalForPie) * 100)
              const col = funderColors[key] ?? '#64748b'
              return (
                <div key={key}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.83rem', marginBottom: '0.3rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{key}</span>
                    <span style={{ color: col, fontWeight: 700 }}>{pct}% — {formatNumber(val.packs)} packs</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--gray-100)', borderRadius: 6 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: col, borderRadius: 6, transition: 'width 0.4s ease' }} />
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray-600)', marginTop: '0.2rem' }}>
                    {formatNumber(val.bene)} beneficiaries · {formatCurrency(val.cost)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Ingredients summary */}
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1.25rem', fontSize: '1rem' }}>
            Raw Ingredients Required
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {[
              { label: 'Total Volume', value: `${formatNumber(Math.round(totalVolume))} L`,     color: '#0ea5e9', icon: '💧' },
              { label: 'Raw Milk',     value: `${formatNumber(Math.round(totalRawMilk))} L`,    color: '#2563eb', icon: '🥛' },
              { label: 'Whole Milk',   value: `${formatNumber(Math.round(totalWholeMilk))} kg`, color: '#7c3aed', icon: '🧴' },
              { label: 'Skim Milk',    value: `${formatNumber(Math.round(totalSkimMilk))} kg`,  color: '#0369a1', icon: '🍼' },
              { label: 'Sugar',        value: `${formatNumber(Math.round(totalSugar))} kg`,     color: '#b45309', icon: '🍬' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'var(--gray-50)', borderRadius: 8, padding: '0.6rem 0.9rem' }}>
                <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--gray-600)' }}>{item.label}</span>
                <span style={{ fontWeight: 700, color: item.color }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Center breakdown bar chart */}
      {!centerFilter && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1.25rem', fontSize: '1rem' }}>
            Beneficiaries by Center
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: 420, overflowY: 'auto' }}>
            {topCenters.map((c, i) => {
              const pct = (c.bene / maxBene) * 100
              return (
                <div key={c.center}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--navy)' }}>#{i + 1} {c.center}</span>
                    <span style={{ color: 'var(--gray-600)', fontWeight: 600 }}>{formatNumber(c.bene)} bene · {formatNumber(c.packs)} packs</span>
                  </div>
                  <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gold)', borderRadius: 4 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
