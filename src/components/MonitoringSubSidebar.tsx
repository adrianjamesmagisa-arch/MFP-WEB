'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Building, ChevronRight, CalendarDays, BarChart3 } from 'lucide-react'
import {
  MONITORING_PROGRAMS,
  monitoringBasePath,
  monitoringCenterPath,
  type MonitoringProgramId,
} from '@/lib/monitoring-programs'
import { PCC_CENTERS } from '@/lib/types'

const CENTER_SHEETS = [...PCC_CENTERS]

export function MonitoringSubSidebar({
  programId,
  encoderCenter = null,
}: {
  programId: MonitoringProgramId
  encoderCenter?: string | null
}) {
  const program = MONITORING_PROGRAMS[programId]
  const pathname = usePathname()
  const base = monitoringBasePath(programId)

  const centers = encoderCenter
    ? CENTER_SHEETS.filter(c => c.toUpperCase() === encoderCenter.toUpperCase())
    : CENTER_SHEETS

  const encoderHubHref = encoderCenter ? monitoringCenterPath(programId, encoderCenter) : null
  const hasYearInUrl = /[?&]year=\d+/.test(pathname) || pathname.includes('year=')

  const navMain = encoderCenter
    ? []
    : [{ href: `${base}/overall`, icon: BarChart3, label: 'All centers' }]

  return (
    <aside
      style={{
        width: 200,
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.15)',
        padding: '1rem 0',
      }}
    >
      <div style={{ padding: '0 1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div
          style={{
            fontSize: '0.65rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#64748b',
          }}
        >
          {program.shortLabel} Monitoring
        </div>
        {encoderCenter && encoderHubHref ? (
          <nav style={{ paddingTop: 8 }}>
            <Link
              href={encoderHubHref}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0',
                fontSize: '0.78rem',
                fontWeight: !hasYearInUrl ? 600 : 400,
                color: !hasYearInUrl ? program.accent : '#94a3b8',
                textDecoration: 'none',
              }}
            >
              <CalendarDays size={13} />
              <span>Program years</span>
            </Link>
          </nav>
        ) : (
          <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '8px 0 0', lineHeight: 1.4 }}>
            Masterlist rows sync to MFP Data and PIMD when you set division delivery totals.
          </p>
        )}
      </div>

      <nav style={{ padding: '0.5rem 0' }}>
        {navMain.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 1rem',
                fontSize: '0.78rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? program.accent : '#94a3b8',
                background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderLeft: isActive ? `2px solid ${program.accent}` : '2px solid transparent',
                textDecoration: 'none',
              }}
            >
              <Icon size={13} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      {!encoderCenter && (
        <>
          <div
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.62rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#475569',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              marginTop: '0.25rem',
              paddingTop: '0.75rem',
            }}
          >
            Centers
          </div>
          <nav style={{ padding: '0.125rem 0' }}>
            {centers.map(center => {
              const href = monitoringCenterPath(programId, center)
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={center}
                  href={href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 1rem 0.35rem 1.25rem',
                    fontSize: '0.74rem',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? program.accent : '#94a3b8',
                    background: isActive ? 'rgba(255,255,255,0.06)' : 'transparent',
                    borderLeft: isActive ? `2px solid ${program.accent}` : '2px solid transparent',
                    textDecoration: 'none',
                  }}
                >
                  <Building size={11} />
                  <span>{center}</span>
                  {isActive && <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                </Link>
              )
            })}
          </nav>
        </>
      )}
    </aside>
  )
}
