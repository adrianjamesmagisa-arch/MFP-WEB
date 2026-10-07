import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { sbfpNavCenter } from '@/lib/center-aliases'

export default async function SbfpLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let encoderCenter: string | null = null
  let role: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,center')
      .eq('id', user.id)
      .single()
    role = profile?.role || null
    if (profile?.role === 'encoder') {
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
