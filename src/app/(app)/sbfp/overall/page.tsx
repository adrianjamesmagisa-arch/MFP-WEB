import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SbfpCenterTable } from '@/components/SbfpCenterTable'
import { parseSchoolYear, schoolYearLabel, schoolYearToDbYear } from '@/lib/sbfp-year'
import { sbfpCenterAliases } from '@/lib/center-aliases'
import { excludeAuxSbfp } from '@/lib/sbfp-aux'

export default async function SbfpOverallPage({
  searchParams,
}: {
  searchParams: Promise<{ sy?: string }>
}) {
  const { sy: syParam } = await searchParams
  const sy = parseSchoolYear(syParam)
  const year = schoolYearToDbYear(sy)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role,center').eq('id', user.id).single()

  // Encoders should use their center page, not the national overall rollup
  if (profile?.role === 'encoder' && profile.center) {
    const aliases = sbfpCenterAliases(profile.center)
    const nav = aliases.includes('NHQ') ? 'NHQ' : aliases[0]
    redirect(nav === 'NHQ' ? `/sbfp/nhq?sy=${sy}` : `/sbfp/center/${encodeURIComponent(nav)}?sy=${sy}`)
  }

  const { data: rawRecords } = await supabase
    .from('sbfp_data')
    .select('*')
    .eq('year', year)
    .order('center', { ascending: true })
    .order('region', { ascending: true })
    .order('sdo', { ascending: true })

  const records = excludeAuxSbfp(rawRecords)

  const total = records.length
  const totalPacks = records.reduce((sum, r) => sum + (r.packs_to_deliver || 0), 0)

  const statusCounts = records.reduce((acc, r) => {
    const s = (r.procurement_status || '').toUpperCase()
    if (s === 'FOR PREPARATION') acc.prep++
    else if (s.includes('ONGOING')) acc.ongoing++
    else if (s.includes('AWARDED')) acc.awarded++
    else if (s === 'DONE' || s === 'COMPLETED') acc.done++
    else if (s === 'FAILED') acc.failed++
    return acc
  }, { prep: 0, ongoing: 0, awarded: 0, done: 0, failed: 0 })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overall Monitoring</h1>
        <p className="text-muted-foreground text-sm mt-1">All centers — {schoolYearLabel(sy)} consolidated SDO procurement status</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{total}</div>
          <div className="text-xs text-muted-foreground mt-1">Total SDO Rows</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-lg font-bold">{totalPacks.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">Packs to Deliver</div>
        </div>
        <div className="rounded-lg border bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{statusCounts.prep}</div>
          <div className="text-xs text-amber-600 mt-1">For Preparation</div>
        </div>
        <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{statusCounts.ongoing}</div>
          <div className="text-xs text-blue-600 mt-1">Ongoing</div>
        </div>
        <div className="rounded-lg border bg-purple-50 dark:bg-purple-900/20 p-3 text-center">
          <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{statusCounts.awarded}</div>
          <div className="text-xs text-purple-600 mt-1">Awarded</div>
        </div>
        <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{statusCounts.done}</div>
          <div className="text-xs text-emerald-600 mt-1">Completed</div>
        </div>
        <div className="rounded-lg border bg-red-50 dark:bg-red-900/20 p-3 text-center">
          <div className="text-2xl font-bold text-red-700 dark:text-red-400">{statusCounts.failed}</div>
          <div className="text-xs text-red-600 mt-1">Failed</div>
        </div>
      </div>

      <SbfpCenterTable center="OVERALL" initialRecords={records || []} userRole={profile?.role} year={year} />
    </div>
  )
}
