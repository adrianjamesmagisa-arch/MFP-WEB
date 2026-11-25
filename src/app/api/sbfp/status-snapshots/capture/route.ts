import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/admin'
import type { SbfpReportSourceRow } from '@/lib/sbfp-report-sync'
import {
  computePerCenterStatusSnapshots,
  todayManilaIso,
} from '@/lib/sbfp-status-snapshots'

export const dynamic = 'force-dynamic'

const TABLE = 'sbfp_status_daily_snapshots'
const PAGE_SIZE = 1000
const SBFP_STATUS_SELECT =
  'id,year,center,region,sdo,procurement_status,include_in_report,milk_type,delivery_snapshots,monthly_packs_delivered,delivery_start,delivery_end,packs_delivered'

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

async function fetchAllSbfpStatusRows(year: number): Promise<SbfpReportSourceRow[]> {
  const all: SbfpReportSourceRow[] = []
  let from = 0
  while (true) {
    const { data, error } = await supabaseAdmin
      .from('sbfp_data')
      .select(SBFP_STATUS_SELECT)
      .eq('year', year)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const batch = (data || []) as unknown as SbfpReportSourceRow[]
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export async function POST(req: Request) {
  const sb = await createServerClient()
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as { year?: unknown } | null
  const year = Number(body?.year)
  if (!Number.isInteger(year) || year < 2020) {
    return NextResponse.json({ error: 'Valid year is required' }, { status: 400 })
  }

  const snapshotDate = todayManilaIso()
  const allRows = await fetchAllSbfpStatusRows(year)
  const computedRows = computePerCenterStatusSnapshots(allRows, year, snapshotDate)

  const { data: existingData, error: existingErr } = await supabaseAdmin
    .from(TABLE)
    .select('center,source')
    .eq('snapshot_date', snapshotDate)
    .eq('year', year)

  if (existingErr) {
    if (isMissingTableError(existingErr)) {
      return NextResponse.json({ ok: false, tableMissing: true })
    }
    return NextResponse.json({ error: existingErr.message }, { status: 500 })
  }

  const existing = (existingData || []) as Array<{ center: string; source: string }>
  const backfilledCenters = new Set(
    existing.filter(r => r.source === 'backfill').map(r => r.center),
  )
  const freshCenters = new Set(computedRows.map(r => r.center))
  const staleAutoCenters = existing
    .filter(r => r.source === 'auto' && !freshCenters.has(r.center))
    .map(r => r.center)

  if (staleAutoCenters.length > 0) {
    await supabaseAdmin
      .from(TABLE)
      .delete()
      .eq('snapshot_date', snapshotDate)
      .eq('year', year)
      .eq('source', 'auto')
      .in('center', staleAutoCenters)
  }

  const nowIso = new Date().toISOString()
  const rowsToUpsert = computedRows
    .filter(r => !backfilledCenters.has(r.center))
    .map(r => ({
      ...r,
      updated_by: user.id,
      captured_at: nowIso,
    }))

  if (rowsToUpsert.length > 0) {
    const { error: upsertErr } = await supabaseAdmin
      .from(TABLE)
      .upsert(rowsToUpsert, { onConflict: 'snapshot_date,year,center' })
    if (upsertErr) {
      if (isMissingTableError(upsertErr)) {
        return NextResponse.json({ ok: false, tableMissing: true })
      }
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({
    ok: true,
    snapshotDate,
    captured: rowsToUpsert.length,
  })
}
