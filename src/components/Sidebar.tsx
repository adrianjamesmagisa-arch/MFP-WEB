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
  const isCollapsed = pathname.includes('/edit') || pathname.includes('/add') || pathname.includes('/bulk-edit')

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const visibleItems = navItems.filter(item => {
    if (item.href === '/users' && userRole !== 'super_admin') return false
    if (item.href === '/centers' && userRole !== 'super_admin') return false
    return true
  }).map(item => {
    if (item.href === '/data' && userRole === 'encoder' && userCenter) {
      return { ...item, label: `${userCenter} Masterlist` }
    }
    return item
  })

  return (
    <aside className={`sidebar ${isCollapsed ? 'collapsed' : ''}`} style={{ height: '100vh', overflowY: 'auto', flexShrink: 0, transition: 'width 0.2s ease' }}>
      {/* Logo */}
      <div style={{ padding: '1.5rem 1.25rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: 40, height: 40, background: 'var(--gold)',
            borderRadius: 10, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '1.2rem', flexShrink: 0
          }}>🐃</div>
          <div>
            {!isCollapsed && <>
            <div style={{ fontWeight: 800, fontSize: '0.85rem', color: 'white', fontFamily: 'Plus Jakarta Sans, sans-serif' }}>
              DA-PCC MFP
            </div>
            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Monitoring System</div>
          </>}
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
            >
              <Icon size={16} />
              {!isCollapsed && <span>{item.label}</span>}
              {isActive && !isCollapsed && <ChevronRight size={14} style={{ marginLeft: 'auto' }} />}
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      <div style={{ padding: '1rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        {!isCollapsed && <div style={{
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
        </div>}
        <button
          onClick={handleSignOut}
          className="btn btn-outline"
          style={{ width: '100%', justifyContent: 'center', fontSize: '0.8rem', color: '#94a3b8', borderColor: 'rgba(255,255,255,0.1)' }}
        >
          <LogOut size={14} />
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  )
}
