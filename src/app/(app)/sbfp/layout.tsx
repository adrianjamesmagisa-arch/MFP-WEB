import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { SbfpSubSidebar } from '@/components/SbfpSubSidebar'
import { loadSchoolYears } from '@/lib/sbfp-school-years'
import { sbfpNavCenter } from '@/lib/center-aliases'

export default async function SbfpLayout({ children }: { children: React.ReactNode }) {
  const schoolYears = await loadSchoolYears()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  let encoderCenter: string | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role,center')
      .eq('id', user.id)
      .single()
    if (profile?.role === 'encoder') {
      encoderCenter = sbfpNavCenter(profile.center)
    }
  }

  return (
    <div style={{ display: 'flex', flex: 1, height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {!encoderCenter && (
        <Suspense fallback={<aside style={{ width: 44, flexShrink: 0, background: 'var(--navy)' }} />}>
          <SbfpSubSidebar schoolYears={schoolYears} encoderCenter={encoderCenter} />
        </Suspense>
      )}
      <main
        style={{
          flex: 1,
          minWidth: 0,
          overflowY: 'auto',
          padding: encoderCenter ? '0.5rem 0.75rem 1.25rem' : '0.75rem 1rem 1.25rem',
        }}
      >
        {children}
      </main>
    </div>
  )
}
