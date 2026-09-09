import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { parseMonitoringProgram } from '@/lib/monitoring-programs'
import { monitoringEncoderHomePath } from '@/lib/center-aliases'

export default async function MonitoringProgramIndex({
  params,
}: {
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

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()

  if (profile?.role === 'encoder') {
    redirect(monitoringEncoderHomePath(programId, profile.center))
  }

  redirect(`/monitoring/${programId}/overall`)
}
