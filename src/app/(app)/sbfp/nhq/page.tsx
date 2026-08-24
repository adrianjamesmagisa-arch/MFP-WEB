import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SbfpCenterTable } from '@/components/SbfpCenterTable'

export default async function SbfpNhqPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()

  const { data: records } = await supabase
    .from('sbfp_data')
    .select('*')
    .eq('center', 'NHQ')
    .order('region', { ascending: true })
    .order('sdo', { ascending: true })

  const total = records?.length || 0
  const totalPacks = (records || []).reduce((sum, r) => sum + (r.packs_to_deliver || 0), 0)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">NHQ Procurement Activities</h1>
        <p className="text-muted-foreground text-sm mt-1">National Headquarters — SBFP FY 2026 SDO Procurement Monitoring</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{total}</div>
          <div className="text-xs text-muted-foreground mt-1">Total SDOs</div>
        </div>
        <div className="rounded-lg border bg-card p-3 text-center">
          <div className="text-2xl font-bold">{totalPacks.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground mt-1">Total Packs to Deliver</div>
        </div>
      </div>

      <SbfpCenterTable center="NHQ" initialRecords={records || []} userRole={profile?.role} />
    </div>
  )
}
