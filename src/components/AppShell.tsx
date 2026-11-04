'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { AsyncFeedbackProvider, AppMainWithLoading } from '@/components/loading/AsyncFeedback'

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const fullBleed =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/')

  useEffect(() => {
    if (!mobileSidebarOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileSidebarOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [mobileSidebarOpen])

  function closeSidebarAfterNavigation(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('a[href]')) {
      setMobileSidebarOpen(false)
    }
  }

  return (
    <AsyncFeedbackProvider>
      <div className="app-shell-root">
        <div
          id="app-navigation"
          className="app-shell-sidebar no-print"
          data-mobile-open={mobileSidebarOpen}
          onClick={closeSidebarAfterNavigation}
        >
          {sidebar}
        </div>
        {mobileSidebarOpen && (
          <button
            type="button"
            className="app-shell-mobile-backdrop no-print"
            aria-label="Close navigation menu"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <AppMainWithLoading
          className="app-shell-main"
          style={{ background: 'var(--gray-50)', position: 'relative' }}
        >
          <header className="app-mobile-header no-print">
            <button
              type="button"
              className="app-mobile-menu-button"
              aria-label={mobileSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-controls="app-navigation"
              aria-expanded={mobileSidebarOpen}
              onClick={() => setMobileSidebarOpen(open => !open)}
            >
              {mobileSidebarOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
            <span>DA-PCC MFP</span>
          </header>
          <div className={`app-shell-content${fullBleed ? ' app-shell-content-full-bleed' : ''}`}>
            {children}
          </div>
        </AppMainWithLoading>
      </div>
    </AsyncFeedbackProvider>
  )
}
