'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, CalendarDays, Package, School, Users } from 'lucide-react'
import { MONITORING_PROGRAMS, programMonthLabel, type MonitoringProgramId } from '@/lib/monitoring-programs'
import type { ProgramMonthCard } from '@/lib/program-dropoff-sync'
import { ProgramCreateMonthButton } from '@/components/ProgramCreateMonthButton'
import { formatNumber } from '@/lib/utils'
import { MFP_GEO_NA } from '@/lib/mfp-record-classification'

export function MfpProgramMonthHub({
  programId,
  center,
  centerLabel,
  months,
  workspaceBasePath,
  userRole,
}: {
  programId: MonitoringProgramId
  center: string
  centerLabel: string
  months: ProgramMonthCard[]
  workspaceBasePath: string
  userRole?: string | null
}) {
  const program = MONITORING_PROGRAMS[programId]
  const editable = userRole !== 'viewer'
  const existingKeys = months.map(m => `${m.year}-${m.month}`)

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
          <div style={{
            display: 'inline-block',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--gold)',
            marginBottom: 8,
          }}>
            {program.shortLabel} monitoring
          </div>
          <h1 style={{
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontSize: 'clamp(1.7rem, 3vw, 2.15rem)',
            fontWeight: 800,
            lineHeight: 1.2,
            margin: 0,
          }}>
            {centerLabel}
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 17, lineHeight: 1.5, color: '#dbe4f0', maxWidth: 640 }}>
            Create a month to open SBFP-style tables: (1) procurement and (1b) municipality drop-offs.
            Each month syncs to the masterlist. Division and Elementary School stay {MFP_GEO_NA}.
          </p>
        </div>
        {editable && (
          <ProgramCreateMonthButton
            programId={programId}
            center={center}
            existingKeys={existingKeys}
          />
        )}
      </header>

      {months.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '64px 28px',
          background: 'white',
          borderRadius: 16,
          border: '2px dashed #cbd5e1',
        }}>
          <CalendarDays size={40} style={{ color: program.accent, margin: '0 auto 12px' }} />
          <p style={{ fontWeight: 800, fontSize: 22, color: 'var(--navy)' }}>No months yet</p>
          <p style={{ color: 'var(--gray-500)', fontSize: '0.95rem', maxWidth: 440, margin: '8px auto 0' }}>
            Create August {new Date().getFullYear()} (or any month) to start a blank {program.shortLabel} workspace.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 20,
        }}>
          {months.map(m => (
            <Link
              key={`${m.year}-${m.month}`}
              href={`${workspaceBasePath}?year=${m.year}&month=${m.month}`}
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
                <span style={{ fontSize: '1.45rem', fontWeight: 800, color: program.accent }}>
                  {programMonthLabel(m.month, m.year)}
                </span>
                <ArrowRight size={20} style={{ color: program.accent }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: '0.82rem' }}>
                <Stat icon={<School size={14} />} label="Municipalities" value={formatNumber(m.municipalityCount)} />
                <Stat icon={<Users size={14} />} label="Beneficiaries" value={formatNumber(m.beneficiaries)} />
                <Stat icon={<Package size={14} />} label="Target packs" value={formatNumber(m.targetPacks)} />
                <Stat icon={<Package size={14} />} label="Delivered" value={formatNumber(m.deliveredPacks)} />
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--gray-500)' }}>
                {m.areaCount} {programId === 'dswd' ? 'province' : 'area'}{m.areaCount === 1 ? '' : 's'}
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
