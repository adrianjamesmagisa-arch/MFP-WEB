'use client'

import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
  Package,
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

function DeliveryShareBar({
  label,
  deliveredPct,
  delivered,
  target,
  fillClass,
}: {
  label: string
  deliveredPct: number
  delivered: number
  target: number
  fillClass: string
}) {
  const pct = Math.min(100, Math.max(0, deliveredPct || 0))
  const remainingPct = Math.round((100 - pct) * 10) / 10
  const tip =
    target > 0
      ? `${label}: ${pct}% milk packs delivered · ${remainingPct}% still to be delivered`
      : `No ${label} target milk packs for this center`

  return (
    <div className="dash-bar-wrap" title={tip}>
      <div className="dash-bar-label">{label}</div>
      <div className="dash-bar-track dash-bar-track-split" aria-label={tip}>
        <div className={`dash-bar-fill ${fillClass}`} style={{ width: `${pct}%` }} />
        <div className="dash-bar-fill dash-bar-fill-remaining" style={{ width: `${remainingPct}%` }} />
      </div>
      <div className="dash-bar-tooltip" role="tooltip">
        <div>
          <strong>{label}</strong> milk packs delivered:{' '}
          <span style={{ color: '#059669' }}>{pct}%</span>
        </div>
        <div>
          Still to be delivered: <span style={{ color: '#ea580c' }}>{remainingPct}%</span>
        </div>
        <div className="dash-bar-tooltip-meta">
          {formatNumber(delivered)} / {formatNumber(target)} packs
        </div>
      </div>
    </div>
  )
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
  const todayLabel = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })

  const beneTrend = trendFromYears(stats.by_year, y => y.beneficiaries)
  const targetTrend = trendFromYears(stats.by_year, y => y.target_milk_packs)
  const deliveredTrend = trendFromYears(stats.by_year, y => y.delivered_milk_packs)
  const recordsTrend = trendFromYears(stats.by_year, y => y.records)

  const chartYears = useMemo(
    () =>
      [...stats.by_year]
        .sort((a, b) => a.year - b.year)
        .map(y => ({
          name: String(y.year),
          DepEd: y.deped_target_milk_packs || 0,
          DSWD: y.dswd_target_milk_packs || 0,
        }))
        .filter(y => y.DepEd > 0 || y.DSWD > 0),
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
        </div>
      </header>

      <div className="dash-filter-bar">
        <DashboardFilter centers={PCC_CENTERS} isEncoder={isEncoder} basePath="/dashboard" />
      </div>

      <div className="dash-kpi-grid">
        {kpiCards.slice(0, 1).map(card => {
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
        <div className="dash-card dash-kpi-card dash-kpi-card-split">
          <div className="dash-kpi-top">
            <span className="dash-kpi-label">Milk packs</span>
            <div className="dash-kpi-icon" style={{ background: '#f0fdf4', color: '#059669' }}>
              <Package size={18} />
            </div>
          </div>
          <div className="dash-kpi-split">
            <div>
              <div className="dash-kpi-value dash-kpi-value-sm">
                {formatNumber(stats.total_target_milk_packs)}
              </div>
              <div className="dash-kpi-sub">Total target milk packs</div>
              <TrendBadge value={targetTrend} label="vs prior year" />
            </div>
            <div>
              <div className="dash-kpi-value dash-kpi-value-sm">
                {formatNumber(stats.total_delivered_milk_packs)}
              </div>
              <div className="dash-kpi-sub">Total milk packs delivered</div>
              <TrendBadge value={deliveredTrend} label="vs prior year" />
            </div>
          </div>
        </div>
        {kpiCards.slice(1).map(card => {
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
              <h2 className="dash-card-title">Target milk packs by year</h2>
              <p className="dash-card-desc">DepEd vs DSWD target milk packs across loaded years</p>
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
                <BarChart data={chartYears} margin={{ top: 8, right: 12, left: 0, bottom: 0 }} barGap={6} barCategoryGap="28%">
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
                    formatter={(value, name) =>
                      [formatNumber(Number(value) || 0), `${name} target milk packs`] as [string, string]
                    }
                  />
                  <Legend
                    verticalAlign="top"
                    height={28}
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12, color: '#64748b' }}
                  />
                  <Bar dataKey="DepEd" name="DepEd" fill={FUNDER_COLORS.DepEd} radius={[6, 6, 0, 0]} maxBarSize={48} />
                  <Bar dataKey="DSWD" name="DSWD" fill={FUNDER_COLORS.DSWD} radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
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
              {isEncoder ? 'Program breakdown' : 'Top centers by target packs'}
            </h2>
            <p className="dash-card-desc">
              {isEncoder
                ? 'Your assigned center — DepEd & DSWD delivery progress (hover for %)'
                : 'DepEd & DSWD delivery progress per center — hover each bar for delivered vs remaining %'}
            </p>
          </div>
        </div>
        <div className="dash-table-scroll">
          <table className="dash-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Center / Program</th>
                <th style={{ width: '28%' }}>DepEd delivery</th>
                <th style={{ width: '28%' }}>DSWD delivery</th>
              </tr>
            </thead>
            <tbody>
              {stats.top_centers.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>
                    No centers for current filters.
                  </td>
                </tr>
              ) : (
                stats.top_centers.map((c, i) => (
                  <tr key={c.center}>
                    <td>{i + 1}</td>
                    <td style={{ fontWeight: 600, color: '#0f172a' }}>{c.center}</td>
                    <td>
                      <DeliveryShareBar
                        label="DepEd"
                        deliveredPct={c.deped_delivered_pct}
                        delivered={c.deped_delivered_milk_packs}
                        target={c.deped_target_milk_packs}
                        fillClass="dash-bar-fill-delivered"
                      />
                    </td>
                    <td>
                      <DeliveryShareBar
                        label="DSWD"
                        deliveredPct={c.dswd_delivered_pct}
                        delivered={c.dswd_delivered_milk_packs}
                        target={c.dswd_target_milk_packs}
                        fillClass="dash-bar-fill-dswd"
                      />
                    </td>
                  </tr>
                ))
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
            target_milk_packs: 0,
            delivered_milk_packs: 0,
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
                  <div className="dash-funder-num">{formatNumber(d.target_milk_packs)}</div>
                  <div className="dash-funder-lbl">Total target milk packs</div>
                </div>
                <div>
                  <div className="dash-funder-num">{formatNumber(d.delivered_milk_packs)}</div>
                  <div className="dash-funder-lbl">Total milk packs delivered</div>
                </div>
              </div>
              <div className="dash-funder-foot">
                {formatNumber(d.beneficiaries)} beneficiaries · {formatCurrency(d.milk_cost)} gross · {formatNumber(d.records)} records
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
