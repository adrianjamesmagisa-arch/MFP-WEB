import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { SbfpCenterWorkspace } from '@/components/SbfpCenterWorkspace'
import { loadSchoolYears } from '@/lib/sbfp-school-years'
import { parseSchoolYear, schoolYearLabel, schoolYearToDbYear } from '@/lib/sbfp-year'
import { encoderCanAccessSbfpCenter, sbfpNavCenter } from '@/lib/center-aliases'
import { excludeAuxSbfp, SBFP_HIRING_TYPE, SBFP_PPMP_TYPE, toHiringRow, toPpmpRow } from '@/lib/sbfp-aux'

export default async function SbfpNhqPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>
}) {
  const { sy: syParam } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()

  if (profile?.role === 'encoder' && profile.center) {
    if (!encoderCanAccessSbfpCenter(profile.center, 'NHQ')) {
      const nav = sbfpNavCenter(profile.center) || 'CSU'
      redirect(`/sbfp/center/${encodeURIComponent(nav)}?sy=${syParam || '2026-2027'}`)
    }
  }

  const schoolYears = await loadSchoolYears()
  const sy = parseSchoolYear(syParam, schoolYears)
  const year = schoolYearToDbYear(sy)

  const [{ data: records }, { data: budgetRows }, { data: capacityRows }, dropoffRes] = await Promise.all([
    supabase
      .from('sbfp_data')
      .select('*')
      .eq('center', 'NHQ')
      .eq('year', year)
      .order('created_at', { ascending: true }),
    supabase
      .from('sbfp_budget')
      .select('*')
      .in('center', ['NHQ', 'NIZ'])
      .eq('year', year),
    supabase
      .from('sbfp_summary')
      .select('*')
      .in('center', ['NHQ', 'NIZ'])
      .eq('year', year),
    supabase
      .from('sbfp_dropoff_points')
      .select('*')
      .eq('center', 'NHQ')
      .eq('year', year)
      .order('sdo', { ascending: true })
      .order('dropoff_name', { ascending: true }),
  ])
  const all = records || []
  const sdoRecords = excludeAuxSbfp(all)
  const ppmpItems = all.filter(r => r.milk_type === SBFP_PPMP_TYPE).map(toPpmpRow)
  const hiringRows = all.filter(r => r.milk_type === SBFP_HIRING_TYPE).map(toHiringRow)
  const pickNhq = <T extends { center?: string }>(rows: T[] | null) =>
    (rows || []).find(r => r.center === 'NHQ') || (rows || []).find(r => r.center === 'NIZ') || null
  const budget = pickNhq(budgetRows)
  const capacity = pickNhq(capacityRows)
  const dropoffs = dropoffRes.error ? [] : (dropoffRes.data || [])
  const dropoffSchemaReady = !dropoffRes.error
  const { error: feedingErr } = await supabase.from('sbfp_dropoff_points').select('feeding_days').limit(1)
  const feedingDaysReady = !feedingErr

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <SbfpCenterWorkspace
        center="NHQ"
        title="NHQ Procurement Activities"
        subtitle={`National Headquarters — ${schoolYearLabel(sy)} SDO procurement, drop-off schools, budget, and capacity`}
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
      />
    </Suspense>
  )
}
