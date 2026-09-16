'use client'

import { useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Database,
  DollarSign,
  Download,
  Package,
  Search,
  SlidersHorizontal,
  Users,
} from 'lucide-react'
import { DashboardFilter } from '@/components/DashboardFilter'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { DashStats } from '@/lib/dashboard-stats'
import { PCC_CENTERS } from '@/lib/types'

const FUNDER_COLORS: Record<string, string> = {
  DepEd: '#312e81',
  DSWD: '#6366f1',
  LDS: '#a5b4fc',
}

function pctChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

function trendFromYears(byYear: DashStats['by_year'], pick: (y: (typeof byYear)[0]) => number) {
  const sorted = [...byYear].sort((a, b) => a.year - b.year)
  if (sorted.length < 2) return null
  const prev = pick(sorted[sorted.length - 2])
  const curr = pick(sorted[sorted.length - 1])
  return pctChange(curr, prev)
}

function TrendBadge({ value, label }: { value: number | null; label: string }) {
  if (value == null) {
    return (
      <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 500 }}>{label}</span>
    )
  }
  const up = value >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        fontSize: '0.72rem',
        fontWeight: 600,
        color: up ? '#059669' : '#dc2626',
      }}
    >
      <Icon size={14} />
      {up ? '+' : ''}
      {value.toFixed(1)}% {label}
    </span>
  )
}

export function DashboardOverview({
  stats,
  userName,
  userRole,
  userCenter,
  centerFilter,
  isEncoder,
}: {
  stats: DashStats
  userName: string
  userRole?: string
  userCenter?: string
  centerFilter?: string
  isEncoder: boolean
}) {
  const [centerSearch, setCenterSearch] = useState('')

  const todayLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const beneTrend = trendFromYears(stats.by_year, y => y.beneficiaries)
  const packsTrend = trendFromYears(stats.by_year, y => y.milk_packs)
  const recordsTrend = trendFromYears(stats.by_year, y => y.records)

  const chartYears = useMemo(
    () =>
      [...stats.by_year]
        .sort((a, b) => a.year - b.year)
        .map(y => ({
          name: String(y.year),
          beneficiaries: y.beneficiaries,
          packs: y.milk_packs,
        })),
    [stats.by_year],
  )

  const funderPie = useMemo(() => {
    const keys = ['DepEd', 'DSWD', 'LDS'] as const
    return keys.map(k => {
      const row = stats.by_funder.find(f => f.funded_by === k)
      return {
        name: k,
        value: row?.beneficiaries ?? 0,
        color: FUNDER_COLORS[k],
      }
    }).filter(d => d.value > 0)
  }, [stats.by_funder])

  const funderTotal = funderPie.reduce((s, d) => s + d.value, 0)

  const filteredCenters = useMemo(() => {
    const q = centerSearch.trim().toLowerCase()
    if (!q) return stats.top_centers
    return stats.top_centers.filter(c => c.center.toLowerCase().includes(q))
  }, [stats.top_centers, centerSearch])

  const kpiCards = [
    {
      label: 'Total Beneficiaries',
      value: formatNumber(stats.total_beneficiaries),
      trend: beneTrend,
      icon: Users,
      iconBg: '#eef2ff',
      iconColor: '#4f46e5',
    },
    {
      label: 'Total Milk Packs',
      value: formatNumber(stats.total_milk_packs),
      trend: packsTrend,
      icon: Package,
      iconBg: '#f0fdf4',
      iconColor: '#059669',
    },
    {
      label: 'Total Funds',
      value: formatCurrency(stats.total_funds),
      trend: null,
      icon: DollarSign,
      iconBg: '#fff7ed',
      iconColor: '#ea580c',
    },
    {
      label: 'Total Records',
      value: formatNumber(stats.total_records),
      trend: recordsTrend,
      icon: Database,
      iconBg: '#ecfeff',
      iconColor: '#0891b2',
    },
  ]

  const exportSummary = () => {
    const lines = [
      'MFP Dashboard Export',
      `Date,${todayLabel}`,
      '',
      'Metric,Value',
      `Beneficiaries,${stats.total_beneficiaries}`,
      `Milk Packs,${stats.total_milk_packs}`,
      `Funds,${stats.total_funds}`,
      `Records,${stats.total_records}`,
      '',
      'Center,Beneficiaries',
      ...stats.top_centers.map(c => `${c.center},${c.beneficiaries}`),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mfp-dashboard-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="dash-overview">
      <header className="dash-overview-header">
        <div>
          <h1 className="dash-overview-title">Overview</h1>
          <p className="dash-overview-subtitle">
            Welcome back, {userName.split(' ')[0] || userName}
            {userRole ? (
              <>
                {' '}
                · <span style={{ textTransform: 'capitalize' }}>{userRole.replace('_', ' ')}</span>
              </>
            ) : null}
            {userCenter ? <> · {userCenter}</> : null}
            . Here&apos;s what&apos;s happening in the monitoring program.
          </p>
          <p className="dash-overview-note">
            DepEd figures from SBFP SDO procurement; DSWD from program monitoring; other funders from MFP masterlist.
          </p>
        </div>
        <div className="dash-overview-header-actions">
          {centerFilter && (
            <span className="dash-pill">{centerFilter} only</span>
          )}
          <span className="dash-pill dash-pill-muted">{todayLabel}</span>
          <button type="button" className="dash-btn-primary" onClick={exportSummary}>
            <Download size={16} />
            Export
          </button>
        </div>
      </header>

      <div className="dash-filter-bar">
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} basePath="/dashboard" />
      </div>

      <div className="dash-kpi-grid">
        {kpiCards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="dash-card dash-kpi-card">
              <div className="dash-kpi-top">
                <span className="dash-kpi-label">{card.label}</span>
                <div
                  className="dash-kpi-icon"
                  style={{ background: card.iconBg, color: card.iconColor }}
                >
                  <Icon size={18} />
                </div>
              </div>
              <div className="dash-kpi-value">{card.value}</div>
              <TrendBadge value={card.trend} label="vs prior year in chart" />
            </div>
          )
        })}
      </div>

      <div className="dash-charts-row">
        <div className="dash-card dash-chart-card dash-chart-wide">
          <div className="dash-card-head">
            <div>
              <h2 className="dash-card-title">Beneficiaries by year</h2>
              <p className="dash-card-desc">Trend across loaded school / calendar years</p>
            </div>
            <span className="dash-pill dash-pill-muted">
              <Clock size={12} style={{ marginRight: 4, verticalAlign: -2 }} />
              Filtered period
            </span>
          </div>
          <div className="dash-chart-body">
            {chartYears.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '2rem 0' }}>No year data for current filters.</p>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartYears} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="beneFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fill: '#64748b', fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v =>
                      v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                    }
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 10,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 4px 12px rgba(15,23,42,0.08)',
                    }}
                    formatter={value =>
                      [formatNumber(Number(value) || 0), 'Beneficiaries'] as [string, string]
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="beneficiaries"
                    stroke="#312e81"
                    strokeWidth={2.5}
                    fill="url(#beneFill)"
                    dot={{ r: 4, fill: '#312e81', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="dash-card dash-chart-card">
          <div className="dash-card-head">
            <div>
              <h2 className="dash-card-title">Program mix</h2>
              <p className="dash-card-desc">Share of beneficiaries by funder</p>
            </div>
          </div>
          <div className="dash-donut-wrap">
            {funderPie.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>No funder breakdown.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={funderPie}
                      innerRadius={68}
                      outerRadius={96}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {funderPie.map(entry => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={value => formatNumber(Number(value) || 0)} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="dash-legend">
                  {funderPie.map(item => {
                    const pct = funderTotal > 0 ? Math.round((item.value / funderTotal) * 100) : 0
                    return (
                      <li key={item.name}>
                        <span className="dash-legend-dot" style={{ background: item.color }} />
                        <span className="dash-legend-name">{item.name}</span>
                        <span className="dash-legend-pct">{pct}%</span>
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="dash-card dash-table-card">
        <div className="dash-card-head">
          <div>
            <h2 className="dash-card-title">
              {isEncoder ? 'Program breakdown' : 'Top centers by beneficiaries'}
            </h2>
            <p className="dash-card-desc">
              {isEncoder
                ? 'Your assigned center and programs'
                : 'From SBFP SDO procurement — column K (beneficiaries)'}
            </p>
          </div>
          <div className="dash-table-tools">
            <div className="dash-search">
              <Search size={15} color="#94a3b8" />
              <input
                type="search"
                placeholder="Search centers..."
                value={centerSearch}
                onChange={e => setCenterSearch(e.target.value)}
              />
            </div>
            <button type="button" className="dash-btn-ghost" aria-label="Filter">
              <SlidersHorizontal size={16} />
              Filter
            </button>
          </div>
        </div>
        <div className="dash-table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Center / Program</th>
                <th style={{ textAlign: 'right' }}>Beneficiaries</th>
                <th style={{ width: '40%' }}>Share</th>
              </tr>
            </thead>
            <tbody>
              {filteredCenters.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>
                    No centers match your search.
                  </td>
                </tr>
              ) : (
                filteredCenters.map((c, i) => {
                  const max = filteredCenters[0]?.beneficiaries || 1
                  const pct = (c.beneficiaries / max) * 100
                  return (
                    <tr key={c.center}>
                      <td>{i + 1}</td>
                      <td style={{ fontWeight: 600, color: '#0f172a' }}>{c.center}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#312e81' }}>
                        {formatNumber(c.beneficiaries)}
                      </td>
                      <td>
                        <div className="dash-bar-track">
                          <div className="dash-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="dash-funder-grid">
        {(['DepEd', 'DSWD', 'LDS'] as const).map(key => {
          const d = stats.by_funder.find(f => f.funded_by === key) ?? {
            beneficiaries: 0,
            milk_packs: 0,
            milk_cost: 0,
            records: 0,
          }
          return (
            <div key={key} className="dash-card dash-funder-card">
              <div className="dash-funder-head">
                <span className="dash-funder-badge" style={{ background: FUNDER_COLORS[key] }} />
                <strong>{key}</strong>
              </div>
              <div className="dash-funder-stats">
                <div>
                  <div className="dash-funder-num">{formatNumber(d.beneficiaries)}</div>
                  <div className="dash-funder-lbl">Beneficiaries</div>
                </div>
                <div>
                  <div className="dash-funder-num">{formatNumber(d.milk_packs)}</div>
                  <div className="dash-funder-lbl">Milk packs</div>
                </div>
              </div>
              <div className="dash-funder-foot">
                {formatCurrency(d.milk_cost)} gross · {formatNumber(d.records)} records
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
