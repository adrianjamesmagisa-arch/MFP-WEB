import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { reportCenterLabel } from '@/lib/sbfp-report-sync'
import {
  NATIONAL_SNAPSHOT_CENTER,
  sumBreakdownTotal,
  type SbfpStatusSnapshotRow,
} from '@/lib/sbfp-status-snapshots'

export const dynamic = 'force-dynamic'

const TABLE = 'sbfp_status_daily_snapshots'

function isMissingTableError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const rec = err as { code?: unknown; message?: unknown }
  const code = String(rec.code || '')
  const msg = String(rec.message || '').toLowerCase()
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (msg.includes('sbfp_status_daily_snapshots') &&
      (msg.includes('does not exist') || msg.includes('schema cache')))
  )
}

async function requireAuthUser() {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  return user
}

async function isSuperAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle()
  return data?.role === 'super_admin'
}

function parseNonNegInt(val: unknown): number | null {
  if (val == null || val === '') return 0
  const n = Number(val)
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null
  return n
}

export async function GET(req: Request) {
  const user = await requireAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const rawYear = Number(searchParams.get('year'))
  if (!Number.isInteger(rawYear) || rawYear < 2020) {
    return NextResponse.json({ error: 'Invalid year parameter' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('year', rawYear)
    .order('snapshot_date', { ascending: false })

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ snapshots: [], tableMissing: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    snapshots: (data || []) as SbfpStatusSnapshotRow[],
    tableMissing: false,
  })
}

export async function PUT(req: Request) {
  const user = await requireAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden — Super Admin only' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const snapshotDate = String(body.snapshotDate || '').trim()
  const year = Number(body.year)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate) || !Number.isInteger(year) || year < 2020) {
    return NextResponse.json({ error: 'Valid snapshotDate (YYYY-MM-DD) and year are required' }, { status: 400 })
  }

  const rawCenter = String(body.center || '').trim()
  const center =
    !rawCenter || rawCenter === NATIONAL_SNAPSHOT_CENTER || rawCenter === 'ALL'
      ? NATIONAL_SNAPSHOT_CENTER
      : reportCenterLabel(rawCenter)

  const forPreparation = parseNonNegInt(body.forPreparation)
  const ongoingProcurement = parseNonNegInt(body.ongoingProcurement)
  const ongoingForAward = parseNonNegInt(body.ongoingForAward)
  const forDelivery = parseNonNegInt(body.forDelivery)
  const ongoingDelivery = parseNonNegInt(body.ongoingDelivery)
  const completed = parseNonNegInt(body.completed)
  const failed = parseNonNegInt(body.failed)

  if (
    forPreparation == null ||
    ongoingProcurement == null ||
    ongoingForAward == null ||
    forDelivery == null ||
    ongoingDelivery == null ||
    completed == null ||
    failed == null
  ) {
    return NextResponse.json({ error: 'All status counts must be non-negative integers' }, { status: 400 })
  }

  const sdoCount = sumBreakdownTotal({
    forPreparation,
    ongoingProcurement,
    ongoingForAward,
    forDelivery,
    ongoingDelivery,
    completed,
    failed,
  })

  const payload = {
    snapshot_date: snapshotDate,
    year,
    center,
    for_preparation: forPreparation,
    ongoing_procurement: ongoingProcurement,
    ongoing_for_award: ongoingForAward,
    for_delivery: forDelivery,
    ongoing_delivery: ongoingDelivery,
    completed,
    failed,
    sdo_count: sdoCount,
    source: 'backfill' as const,
    updated_by: user.id,
    captured_at: new Date().toISOString(),
  }

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(payload, { onConflict: 'snapshot_date,year,center' })
    .select('*')
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: 'Snapshot table is not created yet in Supabase.', tableMissing: true },
        { status: 503 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, snapshot: data as SbfpStatusSnapshotRow })
}

export async function DELETE(req: Request) {
  const user = await requireAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await isSuperAdmin(user.id))) {
    return NextResponse.json({ error: 'Forbidden — Super Admin only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const rawYear = Number(searchParams.get('year'))
  const date = String(searchParams.get('date') || '').trim()
  const rawCenter = String(searchParams.get('center') || '').trim()

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(rawYear) || rawYear < 2020) {
    return NextResponse.json({ error: 'Valid date and year parameters are required' }, { status: 400 })
  }

  let query = supabaseAdmin
    .from(TABLE)
    .delete()
    .eq('snapshot_date', date)
    .eq('year', rawYear)

  if (rawCenter && rawCenter !== 'ALL_CENTERS_SUM') {
    const center =
      rawCenter === NATIONAL_SNAPSHOT_CENTER
        ? NATIONAL_SNAPSHOT_CENTER
        : reportCenterLabel(rawCenter)
    query = query.eq('center', center)
  }

  const { error } = await query
  if (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json({ ok: false, tableMissing: true }, { status: 503 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
