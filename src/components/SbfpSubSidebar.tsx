'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BarChart3, List, DollarSign, CheckSquare,
  Building, ChevronRight
} from 'lucide-react'

const CENTER_SHEETS = ['NHQ', 'UPLB', 'DMMMSU', 'CSU', 'MMSU', 'CLSU', 'LCSF', 'WVSU', 'USF', 'VSU', 'MLPC', 'CMU', 'USM']

const mainItems = [
  { href: '/sbfp/summary',    icon: BarChart3,    label: 'Summary' },
  { href: '/sbfp/overall',    icon: List,         label: 'Overall' },
  { href: '/sbfp/budget',     icon: DollarSign,   label: 'Budget Breakdown' },
  { href: '/sbfp/activities', icon: CheckSquare,  label: 'Status of Activities' },
]

export function SbfpSubSidebar() {
  const pathname = usePathname()

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
      {/* Section Header */}
      <div style={{ padding: '0 1rem 0.75rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b' }}>
          SBFP Monitoring
        </div>
        <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: 2 }}>
          FY 2026
        </div>
      </div>

      {/* Main items */}
      <nav style={{ padding: '0.5rem 0' }}>
        {mainItems.map(item => {
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

      {/* Centers divider */}
      <div style={{ padding: '0.5rem 1rem', fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#475569', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '0.25rem', paddingTop: '0.75rem' }}>
        Centers
      </div>

      {/* Center links */}
      <nav style={{ padding: '0.125rem 0' }}>
        {CENTER_SHEETS.map(center => {
          const href = center === 'NHQ' ? '/sbfp/nhq' : `/sbfp/center/${center}`
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
