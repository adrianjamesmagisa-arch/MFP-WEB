import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { Suspense } from 'react'
import { MfpProgramYearHub } from '@/components/MfpProgramYearHub'
import { ProgramCenterWorkspace } from '@/components/ProgramCenterWorkspace'
import { loadMfpProgramYearCards } from '@/lib/mfp-program-monitoring'
import {
  isProgramMonitoringSchemaReady,
  loadProgramDropoffs,
  loadProgramProcurement,
  loadProgramYearCards,
} from '@/lib/program-dropoff-sync'
import { parseMonitoringProgram, monitoringBasePath } from '@/lib/monitoring-programs'
import {
  centerDisplayLabel,
  encoderCanAccessMonitoringCenter,
  monitoringEncoderHomePath,
} from '@/lib/center-aliases'

export default async function MonitoringCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ program: string; center: string }>
  searchParams: Promise<{ year?: string }>
}) {
  const { program: programParam, center: centerParam } = await params
  const { year: yearParam } = await searchParams
  const programId = parseMonitoringProgram(programParam)
  if (!programId) notFound()
  const decodedCenter = decodeURIComponent(centerParam)
  const workspaceBase = `${monitoringBasePath(programId)}/center/${encodeURIComponent(decodedCenter)}`

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()

  if (profile?.role === 'encoder') {
    if (!encoderCanAccessMonitoringCenter(profile.center, decodedCenter)) {
      redirect(monitoringEncoderHomePath(programId, profile.center))
    }
  }

  const centerLabel = centerDisplayLabel(decodedCenter)
  const schemaReady = await isProgramMonitoringSchemaReady(supabase)

  if (!yearParam?.trim()) {
    let years = await loadMfpProgramYearCards(supabase, programId, decodedCenter)
    if (schemaReady) {
      const cards = await loadProgramYearCards(supabase, programId, decodedCenter)
      if (cards.length > 0) {
        years = cards.map(c => ({
          year: c.year,
          schoolCount: c.municipalityCount,
          divisionCount: c.areaCount,
          beneficiaries: c.beneficiaries,
          targetPacks: c.targetPacks,
          deliveredPacks: c.deliveredPacks,
        }))
      }
    }
    return (
      <Suspense fallback={<div className="p-6">Loading…</div>}>
        <MfpProgramYearHub
          programId={programId}
          center={decodedCenter}
          centerLabel={centerLabel}
          years={years}
          workspaceBasePath={workspaceBase}
        />
      </Suspense>
    )
  }

  const year = parseInt(yearParam, 10)
  if (!Number.isFinite(year)) redirect(workspaceBase)

  const [procurementRows, dropoffRows] = schemaReady
    ? await Promise.all([
        loadProgramProcurement(supabase, programId, decodedCenter, year),
        loadProgramDropoffs(supabase, programId, decodedCenter, year),
      ])
    : [[], []]

  return (
    <ProgramCenterWorkspace
      programId={programId}
      center={decodedCenter}
      centerLabel={centerLabel}
      year={year}
      procurementRows={procurementRows}
      dropoffRows={dropoffRows}
      schemaReady={schemaReady}
      userRole={profile?.role}
      hubPath={workspaceBase}
    />
  )
}
