import { Suspense } from 'react'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { MonitoringSubSidebar } from '@/components/MonitoringSubSidebar'
import { parseMonitoringProgram } from '@/lib/monitoring-programs'
import { monitoringNavCenter } from '@/lib/center-aliases'

export default async function MonitoringProgramLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ program: string }>
}) {
  const { program: programParam } = await params
  const programId = parseMonitoringProgram(programParam)
  if (!programId) notFound()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  let encoderCenter: string | null = null
  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()
  if (profile?.role === 'encoder') {
    encoderCenter = monitoringNavCenter(profile.center)
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <Suspense fallback={<aside style={{ width: 200, flexShrink: 0 }} />}>
        <MonitoringSubSidebar programId={programId} encoderCenter={encoderCenter} />
      </Suspense>
      <main
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: encoderCenter ? '0.25rem 0.5rem 1.5rem' : '1.5rem',
        }}
      >
        {children}
      </main>
    </div>
  )
}
