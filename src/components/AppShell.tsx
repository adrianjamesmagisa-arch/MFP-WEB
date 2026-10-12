'use client'

import { usePathname } from 'next/navigation'
import { AsyncFeedbackProvider, AppMainWithLoading } from '@/components/loading/AsyncFeedback'

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const fullBleed =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  return (
    <AsyncFeedbackProvider>
      <div className="app-shell-root" style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        <div className="app-shell-sidebar no-print" style={{ height: '100%', flexShrink: 0 }}>
          {sidebar}
        </div>
        <AppMainWithLoading
          className="app-shell-main"
          style={{ flex: 1, overflowY: 'auto', background: 'var(--gray-50)', position: 'relative' }}
        >
          <div className="app-shell-content" style={{ padding: fullBleed ? '1rem 1.25rem 1.5rem' : '2rem' }}>
            {children}
          </div>
        </AppMainWithLoading>
      </div>
    </AsyncFeedbackProvider>
  )
}
