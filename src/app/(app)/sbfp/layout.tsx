import { Suspense } from 'react'
import { getCurrentUser } from '@/lib/auth-session'
import { sbfpNavCenter } from '@/lib/center-aliases'

export default async function SbfpLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getCurrentUser()
  let encoderCenter: string | null = null
  let role: string | null = null
  if (user && profile) {
    role = profile.role || null
    if (profile.role === 'encoder') {
      encoderCenter = sbfpNavCenter(profile.center)
    }
  }

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', minHeight: 0, overflow: 'hidden' }}>
      <main
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          padding: '0.75rem 1rem 1.25rem',
        }}
      >
        {children}
      </main>
    </div>
  )
}
