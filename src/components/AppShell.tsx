'use client'

import { AsyncFeedbackProvider, AppMainWithLoading } from '@/components/loading/AsyncFeedback'

export function AppShell({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <AsyncFeedbackProvider>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
        {sidebar}
        <AppMainWithLoading
          style={{ flex: 1, overflowY: 'auto', background: 'var(--gray-50)', position: 'relative' }}
        >
          <div style={{ padding: '2rem' }}>{children}</div>
        </AppMainWithLoading>
      </div>
    </AsyncFeedbackProvider>
  )
}
