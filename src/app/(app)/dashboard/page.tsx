import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Users, Package, DollarSign, Database, BookOpen, HeartHandshake, Church } from 'lucide-react'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'

interface FunderStat { funded_by: string; records: number; beneficiaries: number; milk_packs: number; milk_cost: number; total_funds: number }
interface YearStat   { year: number; records: number; beneficiaries: number; milk_packs: number }
interface CenterStat { center: string; beneficiaries: number }
interface DashStats  {
  total_records: number; total_beneficiaries: number; total_milk_packs: number
  total_funds: number; total_milk_cost: number
  by_funder: FunderStat[]; by_year: YearStat[]; top_centers: CenterStat[]
}

export default async function DashboardPage(props: { searchParams: Promise<{ year?: string, month?: string, center?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  const isEncoder   = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : searchParams.center

  let stats: DashStats | null = null

  // ── FETCH DATA ────────────────────────────────
  let query = supabase
    .from('mfp_data')
    .select('beneficiaries, milk_packs, milk_cost, total_funds_transferred, funded_by, year, center, date_started')
    .range(0, 49999)

  if (centerFilter) {
    query = query.eq('center', centerFilter)
  }
  if (searchParams.year) {
    query = query.eq('year', parseInt(searchParams.year))
  }

  let { data: rows } = await query

  // ── IN-MEMORY MONTH FILTER ────────────────────────────────
  if (searchParams.month && rows) {
    const m = parseInt(searchParams.month)
    rows = rows.filter(r => {
      if (!r.date_started) return false
      const d = new Date(r.date_started)
      return (d.getMonth() + 1) === m
    })
  }

  // ── AGGREGATE STATS ────────────────────────────────
  const _totalRecords       = rows?.length ?? 0
  const _totalBeneficiaries = rows?.reduce((s, r) => s + (r.beneficiaries || 0), 0) ?? 0
  const _totalMilkPacks     = rows?.reduce((s, r) => s + (r.milk_packs || 0), 0) ?? 0
  const _totalFunds         = rows?.reduce((s, r) => s + (r.total_funds_transferred || 0), 0) ?? 0
  const _totalMilkCost      = rows?.reduce((s, r) => s + (r.milk_cost || 0), 0) ?? 0

  const funderMap: Record<string, FunderStat> = {}
  rows?.forEach(r => {
    if (!funderMap[r.funded_by]) funderMap[r.funded_by] = { funded_by: r.funded_by, records: 0, beneficiaries: 0, milk_packs: 0, milk_cost: 0, total_funds: 0 }
    funderMap[r.funded_by].records      += 1
    funderMap[r.funded_by].beneficiaries += r.beneficiaries || 0
    funderMap[r.funded_by].milk_packs   += r.milk_packs || 0
    funderMap[r.funded_by].milk_cost    += r.milk_cost || 0
    funderMap[r.funded_by].total_funds  += r.total_funds_transferred || 0
  })

  const yearMap: Record<number, YearStat> = {}
  rows?.forEach(r => {
    if (!yearMap[r.year]) yearMap[r.year] = { year: r.year, records: 0, beneficiaries: 0, milk_packs: 0 }
    yearMap[r.year].records      += 1
    yearMap[r.year].beneficiaries += r.beneficiaries || 0
    yearMap[r.year].milk_packs   += r.milk_packs || 0
  })

  const centerMap: Record<string, CenterStat> = {}
  rows?.forEach(r => {
    if (!r.center) return
    if (!centerMap[r.center]) centerMap[r.center] = { center: r.center, beneficiaries: 0 }
    centerMap[r.center].beneficiaries += r.beneficiaries || 0
  })
  const topCentersArray = Object.values(centerMap).sort((a, b) => b.beneficiaries - a.beneficiaries).slice(0, 5)

  stats = {
    total_records: _totalRecords,
    total_beneficiaries: _totalBeneficiaries,
    total_milk_packs: _totalMilkPacks,
    total_funds: _totalFunds,
    total_milk_cost: _totalMilkCost,
    by_funder: Object.values(funderMap),
    by_year: Object.values(yearMap).sort((a, b) => a.year - b.year),
    top_centers: topCentersArray,
  }

  const totalRecords       = stats?.total_records       ?? 0
  const totalBeneficiaries = stats?.total_beneficiaries ?? 0
  const totalMilkPacks     = stats?.total_milk_packs    ?? 0
  const totalFunds         = stats?.total_funds         ?? 0
  const byFunder           = stats?.by_funder           ?? []
  const byYear             = stats?.by_year             ?? []
  const topCenters         = stats?.top_centers         ?? []
  const maxBene            = Math.max(...byYear.map(y => y.beneficiaries), 1)

  const funderConfig: Record<string, { label: string; icon: typeof BookOpen; color: string; bg: string }> = {
    DepEd: { label: 'DepEd – School-Based Feeding',  icon: BookOpen,       color: '#1d4ed8', bg: '#dbeafe' },
    DSWD:  { label: 'DSWD – Supplementary Feeding',  icon: HeartHandshake, color: '#15803d', bg: '#dcfce7' },
    LDS:   { label: 'LDS – Latter Day Saints',        icon: Church,         color: '#b45309', bg: '#fef3c7' },
  }

  const topCards = [
    { label: 'Total Beneficiaries', value: formatNumber(totalBeneficiaries), icon: Users,      color: 'var(--navy)' },
    { label: 'Total Milk Packs',    value: formatNumber(totalMilkPacks),     icon: Package,    color: '#0369a1'    },
    { label: 'Total Funds (₱)',     value: formatCurrency(totalFunds),        icon: DollarSign, color: '#15803d'    },
    { label: 'Total Records',       value: formatNumber(totalRecords),        icon: Database,   color: '#7c3aed'    },
  ]

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Welcome back, <strong>{profile?.full_name ?? user.email}</strong>
            {profile?.role && <> · <span style={{ color: 'var(--gold)', textTransform: 'capitalize' }}>{profile.role.replace('_', ' ')}</span></>}
            {profile?.center && <> · {profile.center}</>}
          </p>
        </div>
        {/* Center badge for encoders */}
        {centerFilter && (
          <div style={{ background: 'var(--navy)', color: 'white', borderRadius: 10, padding: '0.6rem 1.25rem', fontSize: '0.82rem', fontWeight: 700 }}>
            📍 Showing {centerFilter} data only
          </div>
        )}
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} />
      </div>

      {/* Top stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {topCards.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="stat-card" style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, flexShrink: 0, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} color={s.color} />
              </div>
              <div>
                <div className="stat-value" style={{ fontSize: '1.4rem' }}>{s.value}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* By Funder */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {(['DepEd', 'DSWD', 'LDS'] as const).map(key => {
          const cfg = funderConfig[key]
          const Icon = cfg.icon
          const d = byFunder.find(f => f.funded_by === key) ?? { beneficiaries: 0, milk_packs: 0, milk_cost: 0, records: 0 }
          return (
            <div key={key} className="card" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color={cfg.color} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--navy)' }}>{key}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--gray-600)' }}>{cfg.label}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '0.75rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: cfg.color }}>{formatNumber(d.beneficiaries)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray-600)' }}>Beneficiaries</div>
                </div>
                <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '0.75rem' }}>
                  <div style={{ fontWeight: 800, fontSize: '1.1rem', color: cfg.color }}>{formatNumber(d.milk_packs)}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--gray-600)' }}>Milk Packs</div>
                </div>
              </div>
              <div style={{ marginTop: '0.75rem', padding: '0.6rem 0.75rem', background: `${cfg.color}10`, borderRadius: 8 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: cfg.color }}>{formatCurrency(d.milk_cost)}</div>
                <div style={{ fontSize: '0.68rem', color: 'var(--gray-600)' }}>Gross Income · {formatNumber(d.records)} records</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom: Year Chart + Centers */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1.25rem', fontSize: '1rem' }}>
            Beneficiaries by Fiscal Year {isEncoder && centerFilter && `— ${centerFilter}`}
          </h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', height: 160 }}>
            {byYear.map(yr => {
              const pct = (yr.beneficiaries / maxBene) * 100
              return (
                <div key={yr.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--navy)', textAlign: 'center' }}>
                    {yr.beneficiaries >= 1000 ? `${(yr.beneficiaries/1000).toFixed(0)}K` : yr.beneficiaries}
                  </div>
                  <div style={{ width: '100%', background: 'var(--navy)', borderRadius: '4px 4px 0 0', height: `${pct}%`, minHeight: 4 }} />
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--gray-600)' }}>FY{yr.year}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1.25rem', fontSize: '1rem' }}>
            {isEncoder ? 'Program Breakdown' : 'Top Centers by Beneficiaries'}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {topCenters.map((c, i) => {
              const pct = (c.beneficiaries / (topCenters[0]?.beneficiaries || 1)) * 100
              return (
                <div key={c.center}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.2rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--navy)' }}>{isEncoder ? c.center : `#${i+1} ${c.center}`}</span>
                    <span style={{ color: 'var(--gray-600)', fontWeight: 600 }}>{formatNumber(c.beneficiaries)}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 3 }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--gold)', borderRadius: 3 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
