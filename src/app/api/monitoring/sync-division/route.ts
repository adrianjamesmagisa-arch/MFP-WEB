import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { parseMonitoringProgram } from '@/lib/monitoring-programs'
import { syncDivisionDeliveryToMasterlist } from '@/lib/mfp-program-monitoring'

export const dynamic = 'force-dynamic'

/** Apply division-level target/delivered to all masterlist rows (non-SBFP programs). */
export async function POST(req: Request) {
  const supabaseUser = await createServerClient()
  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as {
    program?: string
    center?: string
    year?: number
    division?: string
    target?: number
    delivered?: number
  } | null

  const programId = parseMonitoringProgram(body?.program)
  const center = String(body?.center || '').trim()
  const year = Number(body?.year)
  const division = String(body?.division || '').trim()
  if (!programId || !center || !Number.isFinite(year) || !division) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { data: profile } = await supabaseUser
    .from('profiles')
    .select('role,center')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'encoder' && profile.center) {
    const { encoderCanAccessMonitoringCenter } = await import('@/lib/center-aliases')
    if (!encoderCanAccessMonitoringCenter(profile.center, center)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  const res = await syncDivisionDeliveryToMasterlist(supabaseAdmin, {
    programId,
    center,
    year,
    division,
    target: Number(body?.target) || 0,
    delivered: Number(body?.delivered) || 0,
  })
  if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ ok: true, updated: res.updated })
}
