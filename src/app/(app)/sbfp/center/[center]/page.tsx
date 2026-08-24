import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SbfpCenterTable } from '@/components/SbfpCenterTable'

export default async function SbfpCenterPage({ params }: { params: Promise<{ center: string }> }) {
  const { center } = await params
  const decodedCenter = decodeURIComponent(center)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const { data: records } = await supabase
    .from('sbfp_data')
    .select('*')
    .eq('center', decodedCenter)
    .order('region', { ascending: true })
    .order('sdo', { ascending: true })

  // Stats for header cards
  const total = records?.length || 0
  const statCounts = (records || []).reduce((acc, r) => {
    const s = (r.procurement_status || '').toUpperCase()
    if (s === 'FOR PREPARATION') acc.prep++
    else if (s.includes('ONGOING')) acc.ongoing++
    else if (s.includes('AWARDED')) acc.awarded++
    else if (s === 'DONE' || s === 'COMPLETED') acc.done++
    return acc
  }, { prep: 0, ongoing: 0, awarded: 0, done: 0 })

  const totalPacks = (records || []).reduce((sum, r) => sum + (r.packs_to_deliver || 0), 0)
  const totalDelivered = (records || []).reduce((sum, r) => {
    const snaps: any[] = r.delivery_snapshots || []
    const last = snaps[snaps.length - 1]
    return sum + (last?.packs || 0)
  }, 0)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{decodedCenter} Procurement</h1>
        <p className="text-muted-foreground text-sm mt-1">SBFP FY 2026 — SDO-level milk procurement monitoring</p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{total}</div>
          <div className="text-xs text-muted-foreground mt-1">Total SDOs</div>
        </div>
        <div className="rounded-lg border bg-amber-50 dark:bg-amber-900/20 p-3 text-center">
          <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{statCounts.prep}</div>
          <div className="text-xs text-amber-600 dark:text-amber-500 mt-1">For Preparation</div>
        </div>
        <div className="rounded-lg border bg-blue-50 dark:bg-blue-900/20 p-3 text-center">
          <div className="text-2xl font-bold text-blue-700 dark:text-blue-400">{statCounts.ongoing}</div>
          <div className="text-xs text-blue-600 dark:text-blue-500 mt-1">Ongoing</div>
        </div>
        <div className="rounded-lg border bg-purple-50 dark:bg-purple-900/20 p-3 text-center">
          <div className="text-2xl font-bold text-purple-700 dark:text-purple-400">{statCounts.awarded}</div>
          <div className="text-xs text-purple-600 dark:text-purple-500 mt-1">Awarded</div>
        </div>
        <div className="rounded-lg border bg-emerald-50 dark:bg-emerald-900/20 p-3 text-center">
          <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{statCounts.done}</div>
          <div className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">Completed</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-lg font-bold">{totalDelivered ? `${Math.round(totalDelivered / totalPacks * 100)}%` : '0%'}</div>
          <div className="text-xs text-muted-foreground mt-1">Delivery Progress</div>
        </div>
      </div>

      <SbfpCenterTable center={decodedCenter} initialRecords={records || []} userRole={profile?.role} />
    </div>
  )
}
