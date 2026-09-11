import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { SbfpCenterWorkspace } from '@/components/SbfpCenterWorkspace'
import { SbfpCenterSchoolYearsHub } from '@/components/SbfpCenterSchoolYearsHub'
import { loadCenterSchoolYearCards, loadSchoolYears } from '@/lib/sbfp-school-years'
import { parseSchoolYear, schoolYearLabel, schoolYearToDbYear } from '@/lib/sbfp-year'
import { encoderCanAccessSbfpCenter, sbfpNavCenter } from '@/lib/center-aliases'
import { excludeAuxSbfp, SBFP_HIRING_TYPE, SBFP_PPMP_TYPE, toHiringRow, toPpmpRow } from '@/lib/sbfp-aux'
import { SBFP_DATA_ENCODER_COLUMNS, SBFP_DROPOFF_ENCODER_COLUMNS } from '@/lib/encoder-selects'

export default async function SbfpCenterPage({
  params,
  searchParams,
}: {
  params: Promise<{ center: string }>
  searchParams: Promise<{ sy?: string }>
}) {
  const { center } = await params
  const { sy: syParam } = await searchParams
  const decodedCenter = decodeURIComponent(center)
  const workspaceBase = `/sbfp/center/${encodeURIComponent(decodedCenter)}`

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()

  if (profile?.role === 'encoder') {
    if (!encoderCanAccessSbfpCenter(profile.center, decodedCenter)) {
      const nav = sbfpNavCenter(profile.center) || 'CSU'
      redirect(nav === 'NHQ' ? '/sbfp/nhq' : `/sbfp/center/${encodeURIComponent(nav)}`)
    }
  }

  if (!syParam?.trim()) {
    const yearCards = await loadCenterSchoolYearCards(decodedCenter)
    return (
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
        <SbfpCenterSchoolYearsHub
          center={decodedCenter}
          centerLabel={decodedCenter}
          years={yearCards}
          workspaceBasePath={workspaceBase}
          userRole={profile?.role}
        />
      </Suspense>
    )
  }

  const schoolYears = await loadSchoolYears()
  const sy = parseSchoolYear(syParam, schoolYears)
  const year = schoolYearToDbYear(sy)

  const [{ data: records }, { data: budget }, { data: capacity }, dropoffRes] = await Promise.all([
    supabase
      .from('sbfp_data')
      .select(SBFP_DATA_ENCODER_COLUMNS)
      .eq('center', decodedCenter)
      .eq('year', year)
      .order('created_at', { ascending: true }),
    supabase
      .from('sbfp_budget')
      .select('*')
      .eq('center', decodedCenter)
      .eq('year', year)
      .maybeSingle(),
    supabase
      .from('sbfp_summary')
      .select('*')
      .eq('center', decodedCenter)
      .eq('year', year)
      .maybeSingle(),
    supabase
      .from('sbfp_dropoff_points')
      .select(SBFP_DROPOFF_ENCODER_COLUMNS)
      .eq('center', decodedCenter)
      .eq('year', year)
      .order('sdo', { ascending: true })
      .order('dropoff_name', { ascending: true }),
  ])
  const all = records || []
  const sdoRecords = excludeAuxSbfp(all)
  const ppmpItems = all.filter(r => r.milk_type === SBFP_PPMP_TYPE).map(toPpmpRow)
  const hiringRows = all.filter(r => r.milk_type === SBFP_HIRING_TYPE).map(toHiringRow)
  const dropoffs = dropoffRes.error ? [] : (dropoffRes.data || [])
  const dropoffSchemaReady = !dropoffRes.error
  // feeding_days is included in the lean select — ready if that column query succeeded.
  const feedingDaysReady = dropoffSchemaReady

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <SbfpCenterWorkspace
        center={decodedCenter}
        title={`${decodedCenter} Procurement`}
        subtitle={`SBFP ${schoolYearLabel(sy)} — SDO procurement, drop-off schools, center budget, and milk capacity`}
        schoolYears={schoolYears}
        records={sdoRecords}
        budget={budget}
        capacity={capacity}
        ppmpItems={ppmpItems}
        hiringRows={hiringRows}
        dropoffRows={dropoffs}
        dropoffSchemaReady={dropoffSchemaReady}
        feedingDaysReady={feedingDaysReady}
        userRole={profile?.role}
        schoolYearsHubHref={workspaceBase}
      />
    </Suspense>
  )
}
