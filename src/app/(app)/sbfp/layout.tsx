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
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <Suspense fallback={<aside style={{ width: 200, flexShrink: 0 }} />}>
        <SbfpSubSidebar schoolYears={schoolYears} encoderCenter={encoderCenter} />
      </Suspense>
      <main style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
        {children}
      </main>
    </div>
  )
}
