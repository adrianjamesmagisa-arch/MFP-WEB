'use client'

import Link from 'next/link'
import { ArrowRight, CalendarDays, Package, School, Users } from 'lucide-react'
import { MONITORING_PROGRAMS, type MonitoringProgramId } from '@/lib/monitoring-programs'
import type { MfpProgramYearCard } from '@/lib/mfp-program-monitoring'
import { formatNumber } from '@/lib/utils'

export function MfpProgramYearHub({
  programId,
  center,
  centerLabel,
  years,
  workspaceBasePath,
}: {
  programId: MonitoringProgramId
  center: string
  centerLabel: string
  years: MfpProgramYearCard[]
  workspaceBasePath: string
}) {
  const program = MONITORING_PROGRAMS[programId]
  return (
    <div style={{ maxWidth: 1100, margin: '0 auto' }}>
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 20,
          marginBottom: 28,
          padding: '28px 32px',
          borderRadius: 20,
          background: `linear-gradient(135deg, #0a1628 0%, ${program.accent} 120%)`,
          color: '#fff',
          boxShadow: '0 12px 32px rgba(10,22,40,0.18)',
        }}
      >
        <div style={{ minWidth: 240, flex: '1 1 360px' }}>
          <div
            style={{
              display: 'inline-block',
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
              marginBottom: 8,
            }}
          >
            {program.shortLabel} monitoring
          </div>
          <h1
            style={{
              fontFamily: 'Plus Jakarta Sans, sans-serif',
              fontSize: 'clamp(1.7rem, 3vw, 2.15rem)',
              fontWeight: 800,
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            {centerLabel}
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 17, lineHeight: 1.5, color: '#dbe4f0', maxWidth: 640 }}>
            {program.subtitle}. Pick a calendar year to update sites and sync division delivery to the
            masterlist (feeds PIMD when you filter by funder, center, year, and month).
            {programId === 'dswd' && (
              <> DSWD uses province + municipality; Division (F) and School (H) stay N/A in the masterlist.</>
            )}
          </p>
        </div>
      </header>

      {years.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 28px',
            background: 'white',
            borderRadius: 16,
            border: '1px solid var(--gray-200)',
          }}
        >
          <CalendarDays size={40} style={{ color: program.accent, marginBottom: 12 }} />
          <p style={{ fontWeight: 600, color: 'var(--navy)' }}>No {program.fundedBy} records yet</p>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.9rem', maxWidth: 420, margin: '8px auto 0' }}>
            Add schools in MFP Data with Funded By = {program.fundedBy === 'Others' ? 'your funder' : program.fundedBy}{' '}
            and Center = {centerLabel}, then return here.
          </p>
          <Link href="/data/new" className="btn btn-gold" style={{ marginTop: 20, display: 'inline-flex' }}>
            Add masterlist record
          </Link>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}
        >
          {years.map(y => (
            <Link
              key={y.year}
              href={`${workspaceBasePath}?year=${y.year}`}
              style={{
                textDecoration: 'none',
                color: 'inherit',
                background: 'white',
                borderRadius: 16,
                border: '1px solid var(--gray-200)',
                padding: '22px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
                transition: 'box-shadow 0.15s, border-color 0.15s',
              }}
              className="card-hover"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: program.accent }}>{y.year}</span>
                <ArrowRight size={20} style={{ color: program.accent }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.82rem' }}>
                <Stat icon={<School size={14} />} label={programId === 'dswd' ? 'Municipalities' : 'Schools'} value={formatNumber(y.schoolCount)} />
                <Stat icon={<Users size={14} />} label="Beneficiaries" value={formatNumber(y.beneficiaries)} />
                <Stat icon={<Package size={14} />} label="Target packs" value={formatNumber(y.targetPacks)} />
                <Stat
                  icon={<Package size={14} />}
                  label="Delivered"
                  value={formatNumber(y.deliveredPacks)}
                />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                {programId === 'dswd'
                  ? `${y.divisionCount} province${y.divisionCount === 1 ? '' : 's'}`
                  : `${y.divisionCount} division${y.divisionCount === 1 ? '' : 's'}`}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <span style={{ color: 'var(--gray-400)' }}>{icon}</span>
      <div>
        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--gray-400)' }}>{label}</div>
        <div style={{ fontWeight: 700, color: 'var(--navy)' }}>{value}</div>
      </div>
    </div>
  )
}
