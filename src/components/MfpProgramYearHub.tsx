'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Package, School, Users } from 'lucide-react'
import { MONITORING_PROGRAMS, type MonitoringProgramId } from '@/lib/monitoring-programs'
import type { ProgramYearCard } from '@/lib/program-dropoff-sync'
import { ProgramCreateYearButton } from '@/components/ProgramCreateYearButton'
import { formatNumber } from '@/lib/utils'
import { MFP_GEO_NA } from '@/lib/mfp-record-classification'

export function MfpProgramYearHub({
  programId,
  center,
  centerLabel,
  years,
  workspaceBasePath,
  userRole,
  monthsTableReady = true,
}: {
  programId: MonitoringProgramId
  center: string
  centerLabel: string
  years: ProgramYearCard[]
  workspaceBasePath: string
  userRole?: string | null
  monthsTableReady?: boolean
}) {
  const program = MONITORING_PROGRAMS[programId]
  const editable = userRole !== 'viewer'

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
            Same as SBFP: open a year for procurement and drop-off tables. Years are calendar years
            (2026, 2027) — not school years (2026–2027). Masterlist Division and School stay {MFP_GEO_NA}.
          </p>
        </div>
        {editable && (
          <ProgramCreateYearButton
            programId={programId}
            center={center}
            existingYears={years.map(y => y.year)}
          />
        )}
      </header>

      {!monthsTableReady && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900" style={{ marginBottom: 20 }}>
          The year registry table is not in the database yet. Open{' '}
          <a className="underline font-semibold" href="/api/apply-program-monitoring-migration" target="_blank" rel="noreferrer">
            /api/apply-program-monitoring-migration
          </a>
          , paste the SQL in Supabase → SQL Editor, then refresh. You can still click Create year and work in 2026.
        </div>
      )}

      {years.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '64px 28px',
            background: 'white',
            borderRadius: 16,
            border: '2px dashed #cbd5e1',
          }}
        >
          <CalendarDays size={40} style={{ color: program.accent, margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 800, fontSize: 22, color: 'var(--navy)' }}>No years yet</p>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.95rem', maxWidth: 440, margin: '8px auto 0' }}>
            Create 2026 (or 2027, 2028) to start a blank {program.shortLabel} workspace.
          </p>
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
              }}
              className="card-hover"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: program.accent }}>{y.year}</span>
                <ArrowRight size={20} style={{ color: program.accent }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.82rem' }}>
                <Stat icon={<School size={14} />} label="Municipalities" value={formatNumber(y.municipalityCount)} />
                <Stat icon={<Users size={14} />} label="Beneficiaries" value={formatNumber(y.beneficiaries)} />
                <Stat icon={<Package size={14} />} label="Target packs" value={formatNumber(y.targetPacks)} />
                <Stat icon={<Package size={14} />} label="Delivered" value={formatNumber(y.deliveredPacks)} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                {y.areaCount} {programId === 'dswd' ? 'province' : 'area'}{y.areaCount === 1 ? '' : 's'}
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
