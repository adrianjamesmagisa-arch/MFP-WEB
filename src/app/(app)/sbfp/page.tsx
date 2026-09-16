import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sbfpEncoderHomePath } from '@/lib/center-aliases'
import { dbYearToSchoolYear, labelFromDbYear } from '@/lib/sbfp-year'
import { loadSbfpDashboardStats } from '@/lib/sbfp-dashboard'
import { ProgramOverallDashboard } from '@/components/ProgramOverallDashboard'
import { ProgramOverallFilter } from '@/components/ProgramOverallFilter'
import type { MonitoringProgramConfig } from '@/lib/monitoring-programs'

const SBFP_DASH_PROGRAM: MonitoringProgramConfig = {
  id: 'others',
  label: 'SBFP Monitoring',
  shortLabel: 'SBFP',
  subtitle: 'School-Based Feeding Program (DepEd)',
  fundedBy: 'DepEd',
  accent: '#b45309',
  pimdFunder: 'DepEd',
  summaryHref: '/reports/summary-deped',
}

function centerOpenHref(center: string, year?: number) {
  const sy = year ? labelFromDbYear(year) : dbYearToSchoolYear(new Date().getFullYear())
  if (center.toUpperCase() === 'NHQ' || center.toUpperCase() === 'NHQGP') {
    return `/sbfp/nhq?sy=${sy}`
  }
  return `/sbfp/center/${encodeURIComponent(center)}?sy=${sy}`
}

export default async function SbfpPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string; center?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,center')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'encoder') {
    redirect(sbfpEncoderHomePath(profile.center))
  }

  const { year: yearParam, month: monthParam, center: centerParam } = await searchParams
  const year = yearParam ? parseInt(yearParam, 10) : undefined
  const month = monthParam ? parseInt(monthParam, 10) : undefined
  const center = centerParam?.trim() || undefined

  const stats = await loadSbfpDashboardStats(supabase, {
    year: Number.isFinite(year) ? year : undefined,
    month: Number.isFinite(month) && month! >= 1 && month! <= 12 ? month : undefined,
    center,
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ color: SBFP_DASH_PROGRAM.accent }}>
            SBFP dashboard
          </h1>
          <p className="page-subtitle">
            {SBFP_DASH_PROGRAM.subtitle}. Filter by year, month, and center. Open a center to encode.
          </p>
        </div>
      </div>

      <Suspense fallback={null}>
        <ProgramOverallFilter />
      </Suspense>

      <ProgramOverallDashboard
        program={SBFP_DASH_PROGRAM}
        stats={stats}
        year={Number.isFinite(year) ? year : undefined}
        month={Number.isFinite(month) && month! >= 1 && month! <= 12 ? month : undefined}
        center={center}
        areaLabel="SDOs"
        centerHref={c => centerOpenHref(c, Number.isFinite(year) ? year : undefined)}
      />
    </div>
  )
}
