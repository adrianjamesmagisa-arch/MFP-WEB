import { notFound, redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { MONITORING_PROGRAMS, parseMonitoringProgram } from '@/lib/monitoring-programs'
import { monitoringEncoderHomePath } from '@/lib/center-aliases'
import { isProgramMonitoringSchemaReady } from '@/lib/program-dropoff-sync'
import { loadProgramDashboardStats } from '@/lib/program-dashboard'
import { ProgramOverallDashboard } from '@/components/ProgramOverallDashboard'
import { ProgramOverallFilter } from '@/components/ProgramOverallFilter'

export default async function MonitoringOverallPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string }>
  searchParams: Promise<{ year?: string; month?: string; center?: string }>
}) {
  const { program: programParam } = await params
  const { year: yearParam, month: monthParam, center: centerParam } = await searchParams
  const programId = parseMonitoringProgram(programParam)
  if (!programId) notFound()
  const program = MONITORING_PROGRAMS[programId]

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()
  if (profile?.role === 'encoder') {
    redirect(monitoringEncoderHomePath(programId, profile.center))
  }

  const year = yearParam ? parseInt(yearParam, 10) : undefined
  const month = monthParam ? parseInt(monthParam, 10) : undefined
  const center = centerParam?.trim() || undefined
  const schemaReady = await isProgramMonitoringSchemaReady(supabase)
  const stats = await loadProgramDashboardStats(supabase, programId, {
    year: Number.isFinite(year) ? year : undefined,
    month: Number.isFinite(month) && month! >= 1 && month! <= 12 ? month : undefined,
    center,
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: program.accent }}>
            {program.shortLabel} dashboard
          </h1>
          <p className="page-subtitle">
            {program.subtitle}. Filter by year, month, and center. Open a center to encode.
          </p>
        </div>
      </div>

      {!schemaReady && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 mb-4">
          Program monitoring tables are not in the database yet. Figures below use masterlist rows only.
        </div>
      )}

      <Suspense fallback={null}>
        <ProgramOverallFilter />
      </Suspense>

      <ProgramOverallDashboard
        program={program}
        stats={stats}
        year={Number.isFinite(year) ? year : undefined}
        month={Number.isFinite(month) && month! >= 1 && month! <= 12 ? month : undefined}
        center={center}
      />
    </div>
  )
}
