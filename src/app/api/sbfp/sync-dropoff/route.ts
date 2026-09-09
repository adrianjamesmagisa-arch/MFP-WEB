import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  syncDropoffToMasterlist,
  unlinkDropoffFromMasterlist,
  cascadeSdoRename,
  cascadeSdoFieldSync,
  loadParentSdo,
  resyncMasterlistDeliveryForCenter,
  type SbfpDropoffRow,
  type SbfpParentSdo,
} from '@/lib/sbfp-dropoff-sync'

export const dynamic = 'force-dynamic'

/** Masterlist sync/unlink for drop-offs (service role — works for encoders). */
export async function POST(req: Request) {
  const supabaseUser = await createServerClient()
  const { data: { user } } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | {
        action?: 'sync' | 'unlink' | 'cascade-rename' | 'cascade-fields' | 'resync-center-delivery'
        dropoff?: SbfpDropoffRow
        dropoffId?: string
        sbfpDataId?: string
        newSdoName?: string
        parent?: SbfpParentSdo
        center?: string
        year?: number
      }
    | null

  if (!body?.action) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const admin = supabaseAdmin

  if (body.action === 'unlink') {
    const id = body.dropoffId || body.dropoff?.id
    if (!id) return NextResponse.json({ error: 'dropoffId required' }, { status: 400 })
    const res = await unlinkDropoffFromMasterlist(admin, id)
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: res.deleted })
  }

  if (body.action === 'cascade-rename') {
    if (!body.sbfpDataId) return NextResponse.json({ error: 'sbfpDataId required' }, { status: 400 })
    const res = await cascadeSdoRename(
      admin,
      body.sbfpDataId,
      String(body.newSdoName || ''),
      body.parent,
    )
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
    return NextResponse.json({ ok: true, updated: res.updated })
  }

  if (body.action === 'cascade-fields') {
    if (!body.sbfpDataId || !body.parent) {
      return NextResponse.json({ error: 'sbfpDataId and parent required' }, { status: 400 })
    }
    const res = await cascadeSdoFieldSync(admin, body.sbfpDataId, body.parent)
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
    return NextResponse.json({ ok: true, updated: res.updated })
  }

  if (body.action === 'resync-center-delivery') {
    const center = String(body.center || '').trim()
    const year = Number(body.year)
    if (!center || !Number.isFinite(year)) {
      return NextResponse.json({ error: 'center and year required' }, { status: 400 })
    }
    const res = await resyncMasterlistDeliveryForCenter(admin, center, year)
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
    return NextResponse.json({ ok: true, updated: res.updated })
  }

  // default: sync
  const dropoff = body.dropoff
  if (!dropoff?.id) return NextResponse.json({ error: 'dropoff required' }, { status: 400 })

  const { data: latest, error: loadErr } = await admin
    .from('sbfp_dropoff_points')
    .select('*')
    .eq('id', dropoff.id)
    .maybeSingle()
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })
  if (!latest) return NextResponse.json({ error: 'Drop-off not found' }, { status: 404 })

  const parent = await loadParentSdo(admin, latest.sbfp_data_id)
  const res = await syncDropoffToMasterlist(admin, latest as SbfpDropoffRow, parent)
  if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ ok: true, mfpId: res.mfpId })
}
