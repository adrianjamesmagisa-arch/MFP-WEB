import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { SbfpCenterWorkspace } from '@/components/SbfpCenterWorkspace'
import { loadSchoolYears } from '@/lib/sbfp-school-years'
import { parseSchoolYear, schoolYearLabel, schoolYearToDbYear } from '@/lib/sbfp-year'

import { encoderCanAccessSbfpCenter, sbfpNavCenter } from '@/lib/center-aliases'

export default async function CenterSbfpMasterlist({
  params,
  searchParams,
}: {
  params: Promise<{ center: string }>
  searchParams: Promise<{ sy?: string }>
}) {
  const { center } = await params
  const decodedCenter = decodeURIComponent(center)
  const { sy: syParam } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*').eq('id', user.id).single()

  if (profile?.role === 'encoder' && profile?.center) {
    if (!encoderCanAccessSbfpCenter(profile.center, decodedCenter)) {
      const nav = sbfpNavCenter(profile.center) || profile.center
      redirect(`/centers/${encodeURIComponent(nav)}/sbfp-masterlist`)
    }
  }

  const schoolYears = await loadSchoolYears()
  const sy = parseSchoolYear(syParam, schoolYears)
  const year = schoolYearToDbYear(sy)

  const [{ data: records }, { data: budget }, { data: capacity }] = await Promise.all([
    supabase
      .from('sbfp_data')
      .select('*')
      .eq('center', decodedCenter)
      .eq('year', year)
      .order('region', { ascending: true })
      .order('sdo', { ascending: true }),
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
  ])

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <SbfpCenterWorkspace
        center={decodedCenter}
        title={`${decodedCenter} SBFP Masterlist`}
        subtitle={`Manage SDO procurement, budget, and capacity for ${schoolYearLabel(sy)} — separate tables so encoders stay clear.`}
        schoolYears={schoolYears}
        records={records || []}
        budget={budget}
        capacity={capacity}
        userRole={profile?.role}
      />
    </Suspense>
  )
}
