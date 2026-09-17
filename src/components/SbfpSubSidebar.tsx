'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  LayoutDashboard, List, DollarSign, CheckSquare,
  Building, ChevronRight, FileText, CalendarDays, BarChart3,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { DEFAULT_SCHOOL_YEAR, parseSchoolYear, schoolYearLabel, FALLBACK_SCHOOL_YEARS } from '@/lib/sbfp-year'

const CENTER_SHEETS = ['NHQ', 'UPLB', 'DMMMSU', 'CSU', 'MMSU', 'CLSU', 'LCSF', 'WVSU', 'USF', 'VSU', 'MLPC', 'CMU', 'USM']
const COLLAPSE_KEY = 'sbfp-subsidebar-collapsed'
const EXPANDED_W = 200
const COLLAPSED_W = 44

const mainItems = [
  { href: '/sbfp',            icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/sbfp/summary',    icon: BarChart3,       label: 'Summary' },
  { href: '/sbfp/overall',    icon: List,            label: 'Overall' },
  { href: '/sbfp/budget',     icon: DollarSign,      label: 'Budget Breakdown' },
  { href: '/sbfp/activities', icon: CheckSquare,     label: 'Status of Activities' },
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

  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {
      /* ignore */
    }
  }, [])

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const withSy = (href: string) => `${href}?sy=${sy}`

  const onSyChange = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('sy', next)
    router.push(`${pathname}?${params.toString()}`)
  }

  const centers = encoderCenter
    ? CENTER_SHEETS.filter(c => c.toUpperCase() === encoderCenter.toUpperCase())
    : CENTER_SHEETS

  const encoderHubHref = encoderCenter
    ? (encoderCenter === 'NHQ' ? '/sbfp/nhq' : `/sbfp/center/${encodeURIComponent(encoderCenter)}`)
    : null
  const hasSyInUrl = Boolean(searchParams.get('sy')?.trim())

  // Encoders: center monitoring only — hide national nav, SBFP Report, and center picker
  const navMain = encoderCenter ? [] : mainItems
  const navReports = encoderCenter ? [] : reportItems
  const showCentersNav = !encoderCenter

  const linkStyle = (isActive: boolean, compact?: boolean): CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: collapsed ? 'center' : 'flex-start',
    gap: collapsed ? 0 : (compact ? '0.4rem' : '0.5rem'),
    padding: collapsed ? '0.5rem 0' : (compact ? '0.35rem 1rem 0.35rem 1.25rem' : '0.45rem 1rem'),
    fontSize: compact ? '0.74rem' : '0.78rem',
    fontWeight: isActive ? 600 : 400,
    color: isActive ? 'var(--gold, #f59e0b)' : '#94a3b8',
    background: isActive ? 'rgba(245,158,11,0.1)' : 'transparent',
    borderLeft: isActive ? '2px solid var(--gold, #f59e0b)' : '2px solid transparent',
    textDecoration: 'none',
    transition: 'all 0.15s ease',
  })

  return (
    <aside
      style={{
        width: collapsed ? COLLAPSED_W : EXPANDED_W,
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(0,0,0,0.15)',
        padding: collapsed ? '0.5rem 0' : '1rem 0',
        transition: 'width 0.2s ease',
      }}
    >
      <div
        style={{
          padding: collapsed ? '0 0.25rem 0.5rem' : '0 0.75rem 0.75rem',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: collapsed ? 'center' : 'flex-start',
          justifyContent: 'space-between',
          gap: 6,
        }}
      >
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
              SBFP Monitoring
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={toggleCollapsed}
          title={collapsed ? 'Expand SBFP menu' : 'Collapse SBFP menu'}
          aria-label={collapsed ? 'Expand SBFP menu' : 'Collapse SBFP menu'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(15,23,42,0.6)',
            color: '#94a3b8',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
        </button>
      </div>

      {!collapsed && (
        <div style={{ padding: '0 1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
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
                  fontWeight: !hasSyInUrl ? 600 : 400,
                  color: !hasSyInUrl ? 'var(--gold, #f59e0b)' : '#94a3b8',
                  textDecoration: 'none',
                }}
              >
                <CalendarDays size={13} />
                <span>School years</span>
              </Link>
            </nav>
          ) : (
            <>
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
            </>
          )}
        </div>
      )}

      <nav style={{ padding: '0.5rem 0' }}>
        {navMain.map(item => {
          const Icon = item.icon
          const isActive =
            item.href === '/sbfp'
              ? pathname === '/sbfp'
              : pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href === '/sbfp' ? '/sbfp' : withSy(item.href)}
              title={item.label}
              style={linkStyle(isActive)}
            >
              <Icon size={13} />
              {!collapsed && <span>{item.label}</span>}
              {!collapsed && isActive && <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
            </Link>
          )
        })}
      </nav>

      {navReports.length > 0 && (
        <>
          {!collapsed && (
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '0.25rem', paddingTop: '0.75rem' }}>
              Reports
            </div>
          )}
          <nav style={{ padding: '0.125rem 0 0.25rem', borderTop: collapsed ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
            {navReports.map(item => {
              const Icon = item.icon
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={withSy(item.href)}
                  title={item.label}
                  style={linkStyle(isActive, true)}
                >
                  <Icon size={11} />
                  {!collapsed && <span>{item.label}</span>}
                  {!collapsed && isActive && <ChevronRight size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />}
                </Link>
              )
            })}
          </nav>
        </>
      )}

      {showCentersNav && (
        <>
          {!collapsed && (
            <div style={{ padding: '0.5rem 1rem', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '0.25rem', paddingTop: '0.75rem' }}>
              Centers
            </div>
          )}

          <nav style={{ padding: '0.125rem 0', borderTop: collapsed ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
            {centers.map(center => {
              const href = center === 'NHQ' ? '/sbfp/nhq' : `/sbfp/center/${center}`
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={center}
                  href={href}
                  title={center}
                  style={linkStyle(isActive, true)}
                >
                  <Building size={11} />
                  {!collapsed && <span>{center}</span>}
                </Link>
              )
            })}
          </nav>
        </>
      )}
    </aside>
  )
}
