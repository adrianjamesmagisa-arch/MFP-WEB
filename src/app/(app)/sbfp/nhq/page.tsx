import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { SbfpCenterWorkspace } from '@/components/SbfpCenterWorkspace'
import { loadSchoolYears } from '@/lib/sbfp-school-years'
import { parseSchoolYear, schoolYearLabel, schoolYearToDbYear } from '@/lib/sbfp-year'

export default async function SbfpNhqPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>
}) {
  const { sy: syParam } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const schoolYears = await loadSchoolYears()
  const sy = parseSchoolYear(syParam, schoolYears)
  const year = schoolYearToDbYear(sy)

  const [{ data: records }, { data: budget }, { data: capacity }] = await Promise.all([
    supabase
      .from('sbfp_data')
      .select('*')
      .eq('center', 'NHQ')
      .eq('year', year)
      .order('region', { ascending: true })
      .order('sdo', { ascending: true }),
    supabase
      .from('sbfp_budget')
      .select('*')
      .eq('center', 'NHQ')
      .eq('year', year)
      .maybeSingle(),
    supabase
      .from('sbfp_summary')
      .select('*')
      .eq('center', 'NHQ')
      .eq('year', year)
      .maybeSingle(),
  ])

  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading…</div>}>
      <SbfpCenterWorkspace
        center="NHQ"
        title="NHQ Procurement Activities"
        subtitle={`National Headquarters — ${schoolYearLabel(sy)} SDO procurement, budget, and capacity`}
        schoolYears={schoolYears}
        records={records || []}
        budget={budget}
        capacity={capacity}
        userRole={profile?.role}
      />
    </Suspense>
  )
}
