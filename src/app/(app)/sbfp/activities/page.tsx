import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SbfpActivitiesChecklist } from '@/components/SbfpActivitiesChecklist'
import { loadSchoolYears } from '@/lib/sbfp-school-years'
import { parseSchoolYear, schoolYearLabel, schoolYearToDbYear } from '@/lib/sbfp-year'
import { sbfpNavCenter } from '@/lib/center-aliases'

export default async function SbfpActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>
}) {
  const { sy: syParam } = await searchParams
  const schoolYears = await loadSchoolYears()
  const sy = parseSchoolYear(syParam, schoolYears)
  const year = schoolYearToDbYear(sy)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()
  const canEditChecklist = profile?.role === 'super_admin'

  // National activities checklist is admin-only; encoders go to their center
  if (profile?.role === 'encoder' && profile.center) {
    const nav = sbfpNavCenter(profile.center) || profile.center
    redirect(nav === 'NHQ' ? `/sbfp/nhq?sy=${sy}` : `/sbfp/center/${encodeURIComponent(nav)}?sy=${sy}`)
  }

  const [{ data: rows }, { data: sdoRows }] = await Promise.all([
    supabase
      .from('sbfp_activities')
      .select('*')
      .eq('year', year)
      .order('sort_order', { ascending: true }),
    supabase
      .from('sbfp_data')
      .select('procurement_status, packs_to_deliver')
      .eq('year', year),
  ])

  const total = sdoRows?.length || 0
  const totalPacks = (sdoRows || []).reduce((s, r) => s + (r.packs_to_deliver || 0), 0)
  const counts = (sdoRows || []).reduce((acc, r) => {
    const st = (r.procurement_status || '').toUpperCase()
    if (st === 'FOR PREPARATION' || st === 'NOT STARTED') acc.prep++
    else if (st.includes('ONGOING')) acc.ongoing++
    else if (st.includes('AWARDED')) acc.awarded++
    else if (st === 'DONE' || st === 'COMPLETED') acc.done++
    else if (st === 'FAILED') acc.failed++
    else acc.other++
    return acc
  }, { prep: 0, ongoing: 0, awarded: 0, done: 0, failed: 0, other: 0 })

  const pct = (n: number) => (total ? `${((n / total) * 100).toFixed(1)}%` : '0%')

  return (
    <div className="flex flex-col gap-5">
      <div className="page-header">
        <div>
          <h1 className="page-title">Status of Activities</h1>
          <p className="page-subtitle">
            Auto stats from center SDO data plus national checklist — {schoolYearLabel(sy)}
          </p>
        </div>
      </div>

      <section>
        <h2 className="text-base font-semibold mb-2">Auto stats (from center SDOs)</h2>
        {total === 0 ? (
          <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground text-sm">
            No SDO procurement rows for {schoolYearLabel(sy)} yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className="text-2xl font-bold">{total}</div>
              <div className="text-xs text-muted-foreground mt-1">Total SDO rows</div>
            </div>
            <div className="rounded-lg border bg-card p-3 text-center">
              <div className="text-lg font-bold">{totalPacks.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-1">Packs to Deliver</div>
            </div>
            <div className="rounded-lg border bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">{counts.prep}</div>
              <div className="text-xs text-amber-600 mt-1">For Preparation ({pct(counts.prep)})</div>
            </div>
            <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
              <div className="text-2xl font-bold text-blue-700">{counts.ongoing}</div>
              <div className="text-xs text-blue-600 mt-1">Ongoing ({pct(counts.ongoing)})</div>
            </div>
            <div className="rounded-lg border bg-purple-50 dark:bg-purple-900/20 p-3 text-center">
              <div className="text-2xl font-bold text-purple-700">{counts.awarded}</div>
              <div className="text-xs text-purple-600 mt-1">Awarded ({pct(counts.awarded)})</div>
            </div>
            <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
              <div className="text-2xl font-bold text-emerald-700">{counts.done}</div>
              <div className="text-xs text-emerald-600 mt-1">Completed ({pct(counts.done)})</div>
            </div>
            <div className="rounded-lg border bg-red-50 dark:bg-red-900/20 p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{counts.failed}</div>
              <div className="text-xs text-red-600 mt-1">Failed ({pct(counts.failed)})</div>
            </div>
          </div>
        )}
      </section>

      <section>
        <SbfpActivitiesChecklist
          year={year}
          initialRows={(rows || []) as any}
          canEdit={!!canEditChecklist}
        />
      </section>
    </div>
  )
}
