import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { SBFP_MAJOR_TARGETS_TYPE } from '@/lib/sbfp-aux'
import { MAJOR_INDICATORS, type MajorTargetsBySchoolYear } from '@/lib/sbfp-major-accomplishments'

export const dynamic = 'force-dynamic'

const TABLE = 'sbfp_major_accomplishment_targets'

/** Fallback: single aux row in sbfp_data with JSON in `remarks`. */
async function loadFallback(): Promise<{ id: string | null; targets: MajorTargetsBySchoolYear }> {
  const { data } = await supabaseAdmin
    .from('sbfp_data')
    .select('id, remarks')
    .eq('milk_type', SBFP_MAJOR_TARGETS_TYPE)
    .limit(1)
    .maybeSingle()
  if (!data) return { id: null, targets: {} }
  try {
    return { id: data.id, targets: JSON.parse(data.remarks || '{}') }
  } catch {
    return { id: data.id, targets: {} }
  }
}

async function loadAll(): Promise<MajorTargetsBySchoolYear> {
  const fb = await loadFallback()
  const merged: MajorTargetsBySchoolYear = { ...fb.targets }
  const { data, error } = await supabaseAdmin.from(TABLE).select('school_year, targets')
  if (!error && data) {
    for (const r of data) merged[r.school_year] = { ...(merged[r.school_year] || {}), ...(r.targets || {}) }
  }
  return merged
}

async function requireUser() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user
}

export async function GET() {
  if (!(await requireUser())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ targets: await loadAll() })
}

export async function PUT(req: Request) {
  const user = await requireUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = (await req.json().catch(() => null)) as
    | { schoolYear?: string; key?: string; value?: number | null }
    | null
  const sy = String(body?.schoolYear || '')
  const key = String(body?.key || '')
  if (!/^\d{4}-\d{4}$/.test(sy) || !MAJOR_INDICATORS.some(i => i.key === key)) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const value = body?.value == null || !Number.isFinite(Number(body.value)) ? null : Number(body.value)

  const all = await loadAll()
  const syTargets: Record<string, number> = { ...(all[sy] as Record<string, number> || {}) }
  if (value == null) delete syTargets[key]
  else syTargets[key] = value

  // Preferred: dedicated table.
  const { error: tblErr } = await supabaseAdmin.from(TABLE).upsert({
    school_year: sy,
    targets: syTargets,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  })

  // Always mirror into the fallback row so data survives if the table is missing.
  const fb = await loadFallback()
  const nextFb = { ...fb.targets, [sy]: syTargets }
  let fbErr: unknown = null
  if (fb.id) {
    const { error } = await supabaseAdmin.from('sbfp_data').update({ remarks: JSON.stringify(nextFb) }).eq('id', fb.id)
    fbErr = error
  } else {
    const { error } = await supabaseAdmin.from('sbfp_data').insert({
      year: 0,
      center: '__CONFIG__',
      sdo: '—',
      milk_type: SBFP_MAJOR_TARGETS_TYPE,
      remarks: JSON.stringify(nextFb),
    })
    fbErr = error
  }

  if (tblErr && fbErr) {
    return NextResponse.json({ error: String((tblErr as any).message || tblErr) }, { status: 500 })
  }
  return NextResponse.json({ targets: { ...all, [sy]: syTargets } })
}
