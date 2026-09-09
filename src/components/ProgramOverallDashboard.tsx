import Link from 'next/link'
import { MapPin, Building2, Users, Package, Truck, Wallet } from 'lucide-react'
import { PROGRAM_MONTHS, monitoringCenterPath, type MonitoringProgramConfig } from '@/lib/monitoring-programs'
import { formatCurrency, formatNumber } from '@/lib/utils'
import type { ProgramDashboardStats } from '@/lib/program-dashboard'

function progressPct(delivered: number, target: number) {
  if (!target) return 0
  return Math.round((delivered / target) * 100)
}

function Kpi({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  icon: typeof Users
  color: string
}) {
  return (
    <div className="stat-card" style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          flexShrink: 0,
          background: `${color}18`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon size={20} color={color} />
      </div>
      <div>
        <div className="stat-value" style={{ fontSize: '1.35rem' }}>{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

export function ProgramOverallDashboard({
  program,
  stats,
  year,
  month,
  center,
}: {
  program: MonitoringProgramConfig
  stats: ProgramDashboardStats
  year?: number
  month?: number
  center?: string
}) {
  const accent = program.accent
  const pct = progressPct(stats.deliveredPacks, stats.targetPacks)
  const maxCenterPacks = Math.max(...stats.byCenter.map(c => c.targetPacks || c.deliveredPacks), 1)
  const maxMonth = Math.max(...stats.byMonth.map(m => m.deliveredPacks), 1)
  const statusItems = [
    { label: 'For preparation', value: stats.status.prep, color: '#d97706', bg: '#fffbeb' },
    { label: 'Ongoing', value: stats.status.ongoing, color: '#1d4ed8', bg: '#eff6ff' },
    { label: 'Awarded', value: stats.status.awarded, color: '#6d28d9', bg: '#f5f3ff' },
    { label: 'Completed', value: stats.status.done, color: '#047857', bg: '#ecfdf5' },
    { label: 'Failed', value: stats.status.failed, color: '#b91c1c', bg: '#fef2f2' },
  ]
  const filterNote = [
    center || 'All centers',
    year ? String(year) : 'All years',
    month ? PROGRAM_MONTHS.find(m => m.value === month)?.label : 'All months',
  ].join(' · ')

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.85rem', marginBottom: '1.25rem' }}>
        <Kpi label={program.id === 'dswd' ? 'Provinces' : 'Areas'} value={formatNumber(stats.provinces)} icon={MapPin} color={accent} />
        <Kpi label="Municipalities" value={formatNumber(stats.municipalities)} icon={Building2} color="#0369a1" />
        <Kpi label="Beneficiaries" value={formatNumber(stats.beneficiaries)} icon={Users} color="#7c3aed" />
        <Kpi label="Target milk packs" value={formatNumber(stats.targetPacks)} icon={Package} color="#0f766e" />
        <Kpi label="Packs delivered" value={formatNumber(stats.deliveredPacks)} icon={Truck} color="#b45309" />
        <Kpi label="Procurement amount" value={formatCurrency(stats.amount)} icon={Wallet} color="#15803d" />
      </div>

      <div className="card" style={{ padding: '1.1rem 1.25rem', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <div style={{ fontWeight: 700, color: 'var(--navy)' }}>Delivery progress</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--gray-600)' }}>{filterNote}</div>
        </div>
        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: accent, marginBottom: 8 }}>{pct}%</div>
        <div style={{ height: 14, background: 'var(--gray-100)', borderRadius: 999 }}>
          <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: accent, borderRadius: 999 }} />
        </div>
        <div style={{ marginTop: 8, fontSize: '0.85rem', color: 'var(--gray-600)' }}>
          {formatNumber(stats.deliveredPacks)} of {formatNumber(stats.targetPacks)} packs
          {stats.masterlistRecords > 0 ? ` · ${formatNumber(stats.masterlistRecords)} masterlist row(s)` : ''}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
        {statusItems.map(s => (
          <div key={s.label} className="card" style={{ padding: '0.9rem', textAlign: 'center', background: s.bg }}>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: s.color }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem', fontSize: '1rem' }}>
            Packs by center
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {stats.byCenter.filter(c => c.provinces || c.municipalities || c.targetPacks || c.beneficiaries).length === 0 && (
              <p style={{ color: 'var(--gray-600)', fontSize: '0.9rem' }}>No procurement or drop-off data for these filters yet.</p>
            )}
            {stats.byCenter.filter(c => c.provinces || c.municipalities || c.targetPacks || c.beneficiaries).map(c => {
              const width = ((c.targetPacks || c.deliveredPacks) / maxCenterPacks) * 100
              return (
                <div key={c.center}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: 3 }}>
                    <Link href={`${monitoringCenterPath(program.id, c.center)}${year ? `?year=${year}` : ''}`} style={{ fontWeight: 700, color: 'var(--navy)' }}>
                      {c.center}
                    </Link>
                    <span style={{ color: 'var(--gray-600)' }}>
                      {formatNumber(c.deliveredPacks)} / {formatNumber(c.targetPacks)}
                    </span>
                  </div>
                  <div style={{ height: 8, background: 'var(--gray-100)', borderRadius: 4 }}>
                    <div style={{ height: '100%', width: `${Math.max(4, width)}%`, background: accent, borderRadius: 4 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <h3 style={{ fontWeight: 700, color: 'var(--navy)', marginBottom: '1rem', fontSize: '1rem' }}>
            Delivered packs by month
          </h3>
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end', height: 170 }}>
            {stats.byMonth.map(m => {
              const h = (m.deliveredPacks / maxMonth) * 100
              const active = !month || month === m.month
              return (
                <div key={m.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, opacity: active ? 1 : 0.35 }}>
                  <div style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--navy)' }}>
                    {m.deliveredPacks ? (m.deliveredPacks >= 1000 ? `${(m.deliveredPacks / 1000).toFixed(1)}k` : m.deliveredPacks) : ''}
                  </div>
                  <div style={{ width: '100%', background: accent, borderRadius: '4px 4px 0 0', height: `${Math.max(m.deliveredPacks ? 6 : 3, h)}%` }} />
                  <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--gray-600)' }}>
                    {PROGRAM_MONTHS[m.month - 1]?.short}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="card" style={{ overflow: 'auto' }}>
        <table className="data-table" style={{ fontSize: '0.82rem' }}>
          <thead>
            <tr>
              <th>Center</th>
              <th>{program.id === 'dswd' ? 'Provinces' : 'Areas'}</th>
              <th>Municipalities</th>
              <th>Beneficiaries</th>
              <th>Target packs</th>
              <th>Delivered</th>
              <th>Progress</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {stats.byCenter.map(c => {
              const p = progressPct(c.deliveredPacks, c.targetPacks)
              return (
                <tr key={c.center}>
                  <td style={{ textAlign: 'left', fontWeight: 700 }}>{c.center}</td>
                  <td>{formatNumber(c.provinces)}</td>
                  <td>{formatNumber(c.municipalities)}</td>
                  <td>{formatNumber(c.beneficiaries)}</td>
                  <td>{formatNumber(c.targetPacks)}</td>
                  <td>{formatNumber(c.deliveredPacks)}</td>
                  <td>{p}%</td>
                  <td>
                    <Link
                      href={`${monitoringCenterPath(program.id, c.center)}${year ? `?year=${year}` : ''}`}
                      style={{ fontWeight: 600, fontSize: '0.78rem' }}
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
