'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  LayoutDashboard, Database, FileText, Users,
  Building2, LogOut, ChevronRight, Milk
} from 'lucide-react'

const navItems = [
  { href: '/dashboard',           icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/data',                icon: Database,         label: 'MFP Data' },
  { href: '/data/new',            icon: FileText,         label: 'Add Record',  indent: true },
  { href: '/centers',             icon: Building2,        label: 'Centers' },
  { href: '/users',               icon: Users,            label: 'Users' },
]

export default function Sidebar({ userRole, userCenter, userName }: {
  userRole: string
  userCenter: string
  userName: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const visibleItems = navItems.filter(item => {
    if (item.href === '/users' && userRole !== 'super_admin') return false
    if (item.href === '/centers' && userRole !== 'super_admin') return false
    return true
  })

  return (
    <aside className="sidebar" style={{ height: '100vh', overflowY: 'auto', flexShrink: 0 }}>
      {/* Logo */}
      <div style={{ padding: '1.5rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 40, height: 40, background: 'var(--gold)',
            borderRadius: 10, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0
          }}>🐃</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              DA-PCC MFP
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Monitoring System</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '1rem 0' }}>
        {visibleItems.map(item => {
          const Icon = item.icon
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
              style={item.indent ? { paddingLeft: '2.5rem', fontSize: '0.82rem' } : {}}
            >
              <Icon size={16} />
              {item.label}
              {isActive && <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{
          background: 'rgba(255,255,255,0.05)', borderRadius: 10,
          padding: '0.75rem', marginBottom: '0.75rem'
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white' }}>
            {userName || 'User'}
          </div>
          <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.2rem' }}>
            {userCenter && <span style={{ color: 'var(--gold)' }}>{userCenter} · </span>}
            {userRole?.replace('_', ' ')}
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="btn btn-outline"
          style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', color: '#94a3b8', borderColor: 'rgba(255,255,255,0.1)' }}
        >
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
