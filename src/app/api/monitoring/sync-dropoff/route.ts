import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { parseMonitoringProgram } from '@/lib/monitoring-programs'
import {
  syncProgramDropoffToMasterlist,
  cascadeProgramProcurementSync,
  loadProgramProcurement,
  resyncAllProgramDropoffsToMasterlist,
  resyncProgramDropoffsForCenter,
  deleteProgramProcurementCascade,
  type ProgramDropoffRow,
  type ProgramProcurementRow,
} from '@/lib/program-dropoff-sync'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const supabaseUser = await createServerClient()
  const {
    data: { user },
  } = await supabaseUser.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as
    | {
        action?:
          | 'sync'
          | 'unlink'
          | 'cascade-procurement'
          | 'resync-all-program'
          | 'resync-center-program'
          | 'delete-procurement'
        dropoff?: ProgramDropoffRow
        dropoffId?: string
        procurementId?: string
        parent?: ProgramProcurementRow
        program?: string
        center?: string
        year?: number
        enableExcluded?: boolean
      }
    | null

  if (!body?.action) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const admin = supabaseAdmin

  if (body.action === 'delete-procurement') {
    const procurementId = String(body.procurementId || '').trim()
    if (!procurementId) return NextResponse.json({ error: 'procurementId required' }, { status: 400 })
    const res = await deleteProgramProcurementCascade(admin, procurementId)
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
    return NextResponse.json({ ok: true, removedDropoffs: res.removedDropoffs })
  }

  if (body.action === 'unlink') {
    const id = body.dropoffId || body.dropoff?.id
    if (!id) return NextResponse.json({ error: 'dropoffId required' }, { status: 400 })
    await admin.from('mfp_data').delete().eq('source_program_dropoff_id', id)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'resync-all-program') {
    const programId = parseMonitoringProgram(body.program || 'dswd')
    if (!programId) return NextResponse.json({ error: 'Invalid program' }, { status: 400 })
    const year = body.year != null ? Number(body.year) : undefined
    const res = await resyncAllProgramDropoffsToMasterlist(admin, programId, {
      year: Number.isFinite(year) ? year : undefined,
      enableExcluded: body.enableExcluded === true,
    })
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
    return NextResponse.json({
      ok: true,
      synced: res.synced,
      orphansRemoved: res.orphansRemoved,
      enabled: res.enabled,
    })
  }

  if (body.action === 'resync-center-program') {
    const programId = parseMonitoringProgram(body.program || 'dswd')
    const center = String(body.center || '').trim()
    const year = Number(body.year)
    if (!programId || !center || !Number.isFinite(year)) {
      return NextResponse.json({ error: 'program, center, and year required' }, { status: 400 })
    }
    const res = await resyncProgramDropoffsForCenter(admin, programId, center, year)
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
    return NextResponse.json({ ok: true, synced: res.synced })
  }

  if (body.action === 'cascade-procurement') {
    if (!body.procurementId || !body.parent) {
      return NextResponse.json({ error: 'procurementId and parent required' }, { status: 400 })
    }
    const res = await cascadeProgramProcurementSync(admin, body.procurementId, body.parent)
    if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
    return NextResponse.json({ ok: true, updated: res.updated })
  }

  const dropoff = body.dropoff
  if (!dropoff?.id) return NextResponse.json({ error: 'dropoff required' }, { status: 400 })

  const { data: latest } = await admin
    .from('mfp_program_dropoffs')
    .select('*')
    .eq('id', dropoff.id)
    .maybeSingle()
  if (!latest) return NextResponse.json({ error: 'Drop-off not found' }, { status: 404 })

  let parent: ProgramProcurementRow | null = null
  if (latest.procurement_id) {
    parent = (await loadProgramProcurement(
      admin,
      parseMonitoringProgram(latest.program) || 'dswd',
      latest.center,
      latest.year,
    ).then(rows => rows.find(r => r.id === latest.procurement_id) || null)) as ProgramProcurementRow | null
    if (!parent) {
      const { data: p } = await admin
        .from('mfp_program_procurement')
        .select('*')
        .eq('id', latest.procurement_id)
        .maybeSingle()
      parent = p as ProgramProcurementRow | null
    }
  }

  const res = await syncProgramDropoffToMasterlist(admin, latest as ProgramDropoffRow, parent)
  if (res.error) return NextResponse.json({ error: res.error }, { status: 500 })
  return NextResponse.json({ ok: true, mfpId: res.mfpId })
}
