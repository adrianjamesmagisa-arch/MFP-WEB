'use client'

import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  BarChart3, List, DollarSign, CheckSquare,
  Building, ChevronRight, FileText
} from 'lucide-react'
import { DEFAULT_SCHOOL_YEAR, parseSchoolYear, schoolYearLabel, FALLBACK_SCHOOL_YEARS } from '@/lib/sbfp-year'

const CENTER_SHEETS = ['NHQ', 'UPLB', 'DMMMSU', 'CSU', 'MMSU', 'CLSU', 'LCSF', 'WVSU', 'USF', 'VSU', 'MLPC', 'CMU', 'USM']

const mainItems = [
  { href: '/sbfp/summary',    icon: BarChart3,    label: 'Summary' },
  { href: '/sbfp/overall',    icon: List,         label: 'Overall' },
  { href: '/sbfp/budget',     icon: DollarSign,   label: 'Budget Breakdown' },
  { href: '/sbfp/activities', icon: CheckSquare,  label: 'Status of Activities' },
]

const reportItems = [
  { href: '/reports/sbfp-narrative', icon: FileText, label: 'SBFP Report' },
]

export function SbfpSubSidebar({
  schoolYears,
  encoderCenter = null,
}: {
  schoolYears?: string[]
  /** When set, only this center appears under Centers (encoder lock). */
  encoderCenter?: string | null
}) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const years = schoolYears && schoolYears.length > 0 ? schoolYears : [...FALLBACK_SCHOOL_YEARS]
  const sy = parseSchoolYear(searchParams.get('sy') || DEFAULT_SCHOOL_YEAR, years)

  const withSy = (href: string) => `${href}?sy=${sy}`

  const onSyChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sy', next)
    router.push(`${pathname}?${params.toString()}`)
  }

  const centers = encoderCenter
    ? CENTER_SHEETS.filter(c => c.toUpperCase() === encoderCenter.toUpperCase())
    : CENTER_SHEETS

  // Encoders: hide national rollups; keep Summary (scoped) + their center + report
  const navMain = encoderCenter
    ? mainItems.filter(i => i.href === '/sbfp/summary')
    : mainItems
  const navReports = reportItems

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
        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
          SBFP Monitoring
        </div>
        <label style={{ display: 'block', fontSize: '0.62rem', color: '#64748b', marginTop: 8, marginBottom: 4 }}>
          School Year
        </label>
        <select
          value={sy}
          onChange={e => onSyChange(e.target.value)}
          style={{
            width: '100%',
            fontSize: '0.75rem',
            fontWeight: 600,
            color: '#e2e8f0',
            background: 'rgba(15,23,42,0.8)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 6,
            padding: '0.35rem 0.4rem',
          }}
        >
          {years.map(y => (
            <option key={y} value={y}>{schoolYearLabel(y)}</option>
          ))}
        </select>
      </div>

      <nav style={{ padding: '0.5rem 0' }}>
        {navMain.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={withSy(item.href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 1rem',
                fontSize: '0.78rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--gold, #f59e0b)' : '#94a3b8',
                background: isActive ? 'rgba(245,158,11,0.1)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--gold, #f59e0b)' : '2px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={13} />
              <span>{item.label}</span>
              {isActive && <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
            </Link>
          )
        })}
      </nav>

      <div style={{ padding: '0.5rem 1rem', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '0.25rem', paddingTop: '0.75rem' }}>
        Reports
      </div>
      <nav style={{ padding: '0.125rem 0 0.25rem' }}>
        {navReports.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link key={item.href} href={withSy(item.href)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.4rem',
                padding: '0.35rem 1rem 0.35rem 1.25rem', fontSize: '0.74rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--gold, #f59e0b)' : '#94a3b8',
                background: isActive ? 'rgba(245,158,11,0.1)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--gold, #f59e0b)' : '2px solid transparent',
                textDecoration: 'none', transition: 'all 0.15s ease',
              }}>
              <Icon size={11} />
              <span>{item.label}</span>
              {isActive && <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
            </Link>
          )
        })}
      </nav>
      <div style={{ padding: '0.5rem 1rem', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '0.25rem', paddingTop: '0.75rem' }}>
        Centers
      </div>

      <nav style={{ padding: '0.125rem 0' }}>
        {centers.map(center => {
          const href = center === 'NHQ' ? '/sbfp/nhq' : `/sbfp/center/${center}`
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={center}
              href={withSy(href)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.35rem 1rem 0.35rem 1.25rem',
                fontSize: '0.74rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--gold, #f59e0b)' : '#94a3b8',
                background: isActive ? 'rgba(245,158,11,0.1)' : 'transparent',
                borderLeft: isActive ? '2px solid var(--gold, #f59e0b)' : '2px solid transparent',
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <Building size={11} />
              <span>{center}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
