import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatCurrency, formatNumber } from '@/lib/utils'
import { Users, Package, DollarSign, Database, BookOpen, HeartHandshake, Church } from 'lucide-react'
import { DashboardFilter } from '@/components/DashboardFilter'
import { PCC_CENTERS } from '@/lib/types'
import { loadDashboardStats } from '@/lib/dashboard-stats'

export default async function DashboardPage(props: { searchParams: Promise<{ year?: string, month?: string, center?: string }> }) {
  const searchParams = await props.searchParams;
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  const isEncoder   = profile?.role === 'encoder'
  const centerFilter = isEncoder ? profile?.center : searchParams.center
  const year = searchParams.year ? parseInt(searchParams.year, 10) : undefined
  const month = searchParams.month ? parseInt(searchParams.month, 10) : undefined

  const stats = await loadDashboardStats(supabase, {
    year: Number.isFinite(year) ? year : undefined,
    month: Number.isFinite(month) && month! >= 1 && month! <= 12 ? month : undefined,
    center: centerFilter || undefined,
  })

  const totalRecords       = stats.total_records
  const totalBeneficiaries = stats.total_beneficiaries
  const totalMilkPacks     = stats.total_milk_packs
  const totalFunds         = stats.total_funds
  const byFunder           = stats.by_funder
  const byYear             = stats.by_year
  const topCenters         = stats.top_centers
  const maxBene            = Math.max(...byYear.map(y => y.beneficiaries), 1)

  const funderConfig: Record<string, { label: string; icon: typeof BookOpen; color: string; bg: string }> = {
    DepEd: { label: 'DepEd – School-Based Feeding (from SBFP)',  icon: BookOpen,       color: '#1d4ed8', bg: '#dbeafe' },
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
          <p style={{ fontSize: '0.78rem', color: 'var(--gray-600)', marginTop: 6 }}>
            DepEd figures come from SBFP drop-off schools (encoder-entered beneficiaries). Other funders use the masterlist.
          </p>
        </div>
        {centerFilter && (
          <div style={{ background: 'var(--navy)', color: 'white', borderRadius: 10, padding: '0.6rem 1.25rem', fontSize: '0.82rem', fontWeight: 700 }}>
            📍 Showing {centerFilter} data only
          </div>
        )}
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} />
      </div>

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
                <div style={{ fontSize: '0.68rem', color: 'var(--gray-600)' }}>Gross Income · {formatNumber(d.records)} {key === 'DepEd' ? 'schools' : 'records'}</div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1.25rem', fontSize: '1rem' }}>
            Beneficiaries by Year {isEncoder && centerFilter && `— ${centerFilter}`}
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
                  <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--gray-600)' }}>{yr.year}</div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: 4, fontSize: '1rem' }}>
            {isEncoder ? 'Program Breakdown' : 'Top Centers by Beneficiaries'}
          </h3>
          {!isEncoder && (
            <p style={{ fontSize: '0.72rem', color: 'var(--gray-600)', marginBottom: '1rem' }}>
              From SBFP SDO Procurement — column K (Beneficiaries)
            </p>
          )}
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
