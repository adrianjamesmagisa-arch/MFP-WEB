import Link from 'next/link'
import { Building } from 'lucide-react'
import {
  MONITORING_PROGRAMS,
  monitoringCenterPath,
  type MonitoringProgramId,
} from '@/lib/monitoring-programs'
import { PCC_CENTERS } from '@/lib/types'
import { centerDisplayLabel } from '@/lib/center-aliases'

export function ProgramCenterSelector({ programId }: { programId: MonitoringProgramId }) {
  const program = MONITORING_PROGRAMS[programId]

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.25rem' }}>
          {program.shortLabel} Monitoring
        </h1>
        <p style={{ fontSize: '0.9rem', color: '#64748b' }}>
          Select a center to manage procurement and deliveries.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {PCC_CENTERS.map(center => (
          <Link
            key={center}
            href={monitoringCenterPath(programId, center)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '1rem',
              padding: '2rem',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 16,
              color: '#1e293b',
              textDecoration: 'none',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
              transition: 'all 0.2s ease',
            }}
            className="card-hover"
          >
            <span
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: `${program.accent}18`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: program.accent,
              }}
            >
              <Building size={28} aria-hidden="true" />
            </span>
            <span style={{ fontSize: '1.1rem', fontWeight: 700 }}>
              {centerDisplayLabel(center)}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
