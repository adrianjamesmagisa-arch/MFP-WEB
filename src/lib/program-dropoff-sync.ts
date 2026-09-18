/**
 * Sync program monitoring drop-offs (municipality) into mfp_data masterlist.
 */

import { calcMilkFormulations } from '@/lib/mfp-formulas'
import { packsDeliveredFromTracking, toDateInputValue } from '@/lib/sbfp-raw-milk'
import { classifyDswdMasterlistPatch, MFP_GEO_NA } from '@/lib/mfp-record-classification'
import {
  MONITORING_PROGRAMS,
  programMonthStartDate,
  rowMatchesMonitoringProgram,
  type MonitoringProgramId,
} from '@/lib/monitoring-programs'
import { normalizeSbfpMilkType } from '@/lib/sbfp-pack-price'
import {
  PROGRAM_DROPOFF_ENCODER_COLUMNS,
  PROGRAM_PROCUREMENT_ENCODER_COLUMNS,
} from '@/lib/encoder-selects'
import { fetchAllRows } from '@/lib/supabase-paginate'

export type ProgramProcurementRow = {
  id: string
  year: number
  month?: number | null
  center: string
  program: MonitoringProgramId
  supplier_id?: string | null
  region?: string | null
  province?: string | null
  label?: string | null
  procurement_status?: string | null
  amount?: number | null
  contract_amount?: number | null
  packs_to_deliver?: number | null
  packs_delivered?: number | null
  milk_type?: string | null
  mode_of_procurement?: string | null
  delivery_start?: string | Date | null
  delivery_end?: string | null
  include_in_report?: boolean | null
  remarks?: string | null
  beneficiaries?: number | null
  pr_number?: string | null
  pr_date_received?: string | Date | null
  ors_date?: string | Date | null
  po_number?: string | null
  batch?: string | null
  status_of_payment?: string | null
  pack_unit_price?: number | null
  delivery_snapshots?: unknown
  monthly_packs_delivered?: unknown
  raw_milk_prices?: unknown
}

export type ProgramDropoffRow = {
  id: string
  procurement_id?: string | null
  year: number
  month?: number | null
  center: string
  program: MonitoringProgramId
  province?: string | null
  municipality?: string | null
  dropoff_name?: string | null
  beneficiaries?: number | null
  feeding_days?: number | null
  region?: string | null
  district?: string | null
  remarks?: string | null
  include_in_masterlist?: boolean | null
}

/** Drop-offs under the given procurement rows (PIMD / reports). */
export function filterProgramDropoffsForProcurement<
  D extends { procurement_id?: string | null },
  P extends { id?: string },
>(dropoffs: D[], procurementRows: P[]): D[] {
  if (!procurementRows.length || !dropoffs.length) return []
  const ids = new Set(procurementRows.map(r => r.id).filter(Boolean) as string[])
  return dropoffs.filter(d => d.procurement_id && ids.has(d.procurement_id))
}

type SupabaseLike = { from: (table: string) => any }

function classifyProgramPatch(
  programId: MonitoringProgramId,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const fundedBy = MONITORING_PROGRAMS[programId].fundedBy
  const base = {
    ...patch,
    division: MFP_GEO_NA,
    elementary_school: MFP_GEO_NA,
  }
  if (programId === 'dswd') {
    return classifyDswdMasterlistPatch(base)
  }
  if (programId !== 'others') {
    return { ...base, funded_by: fundedBy }
  }
  return base
}

export function buildProgramMasterlistIdentity(
  dropoff: ProgramDropoffRow,
  parent: ProgramProcurementRow | null | undefined,
  existing?: Record<string, unknown> | null,
): Record<string, unknown> {
  const programId = dropoff.program
  const municipality = String(dropoff.dropoff_name || dropoff.municipality || '').trim()
  const province = String(dropoff.province || parent?.province || parent?.label || '').trim()
  const region = String(dropoff.region || parent?.region || existing?.region || '').trim()
  const beneficiaries = Number(dropoff.beneficiaries) || 0
  const feedingDays = Number(dropoff.feeding_days) || 0
  const milkType = normalizeSbfpMilkType(parent?.milk_type) || 'PM'

  const payload: Record<string, unknown> = {
    year: dropoff.year,
    center: dropoff.center,
    province,
    municipality,
    beneficiaries,
    feeding_days: feedingDays,
    source_program_dropoff_id: dropoff.id,
    region,
  }

  if (parent) {
    const monthKey = Number(dropoff.month) || Number(parent.month) || 0
    payload.date_started =
      toDateInputValue(parent.delivery_start) ||
      programMonthStartDate(dropoff.year, monthKey) ||
      null
    payload.date_completed = toDateInputValue(parent.delivery_end) || null
    payload.target_milk_packs_to_deliver = Number(parent.packs_to_deliver) || 0
    payload.total_milk_packs_delivered =
      packsDeliveredFromTracking(parent as import('@/lib/sbfp-raw-milk').SbfpRawMilkRow) ||
      Number(parent.packs_delivered) ||
      0
    const contract = Number(parent.contract_amount) || Number(parent.amount) || 0
    if (contract > 0) {
      payload.total_funds_transferred = contract
      payload.milk_cost = contract
    }
    if (parent.mode_of_procurement) payload.mode_of_procurement = parent.mode_of_procurement
    payload.supplier_id = parent.supplier_id || null
  }

  const calc = calcMilkFormulations(beneficiaries, feedingDays, milkType)
  if (calc) {
    payload.milk_packs = calc.milkPacks
    payload.total_volume_requirements = Number(calc.totalVol.toFixed(4))
    payload.raw_milk_liters = Number(calc.rawMilk.toFixed(4))
    payload.whole_milk_kg = Number(calc.wholeMilk.toFixed(4))
    payload.skimmed_milk_kg = Number(calc.skimMilk.toFixed(4))
    payload.sugar = Number(calc.sugar.toFixed(4))
    payload.milk_type = milkType
  }

  return classifyProgramPatch(programId, payload)
}

const MFP_SYNC_EXISTING_COLUMNS =
  'id,source_program_dropoff_id,funded_by,year,center,municipality,province'

const WRITE_CONCURRENCY = 6

export async function syncProgramDropoffToMasterlist(
  supabase: SupabaseLike,
  dropoff: ProgramDropoffRow,
  parent?: ProgramProcurementRow | null,
  existingRow?: Record<string, unknown> | null,
): Promise<{ error: string | null; mfpId?: string | null }> {
  if (dropoff.include_in_masterlist === false) {
    const { error } = await supabase
      .from('mfp_data')
      .delete()
      .eq('source_program_dropoff_id', dropoff.id)
    return { error: error?.message || null }
  }

  const name = String(dropoff.dropoff_name || dropoff.municipality || '').trim()
  if (!name) return { error: 'municipality required' }

  const municipality = String(dropoff.dropoff_name || dropoff.municipality || '').trim()
  const province = String(dropoff.province || '').trim()

  let parentRow = parent
  if (!parentRow && dropoff.procurement_id) {
    const { data } = await supabase
      .from('mfp_program_procurement')
      .select(PROGRAM_PROCUREMENT_ENCODER_COLUMNS)
      .eq('id', dropoff.procurement_id)
      .maybeSingle()
    parentRow = data as ProgramProcurementRow | null
  }

  let existing = existingRow || null
  if (!existing) {
    const { data: byLink } = await supabase
      .from('mfp_data')
      .select(MFP_SYNC_EXISTING_COLUMNS)
      .eq('source_program_dropoff_id', dropoff.id)
      .maybeSingle()
    existing = byLink || null
  }
  if (!existing) {
    const { data: byGeo } = await supabase
      .from('mfp_data')
      .select(MFP_SYNC_EXISTING_COLUMNS)
      .eq('year', dropoff.year)
      .eq('center', dropoff.center)
      .eq('municipality', municipality)
      .eq('province', province)
      .is('source_program_dropoff_id', null)
      .limit(1)
      .maybeSingle()
    if (byGeo && rowMatchesMonitoringProgram(byGeo.funded_by, dropoff.program)) {
      existing = byGeo
    }
  }

  const payload = buildProgramMasterlistIdentity(dropoff, parentRow, existing)

  if (existing?.id) {
    const { error } = await supabase.from('mfp_data').update(payload).eq('id', existing.id)
    if (error) return { error: error.message }
    return { error: null, mfpId: existing.id as string }
  }

  const insertPayload = {
    batch: '',
    price: 0,
    service_fee: 0,
    mode_of_procurement: payload.mode_of_procurement || '',
    target_milk_packs_to_deliver: 0,
    total_milk_packs_delivered: 0,
    ...payload,
  }

  const { data, error } = await supabase.from('mfp_data').insert(insertPayload).select('id').maybeSingle()
  if (error) return { error: error.message }
  return { error: null, mfpId: data?.id ?? null }
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  let next = 0
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      await worker(items[i])
    }
  })
  await Promise.all(runners)
}

/** Re-sync all program drop-offs for one center/year (batched reads + bounded writes). */
export async function resyncProgramDropoffsForCenter(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
  year: number,
): Promise<{ error: string | null; synced: number }> {
  const { data: dropoffs, error: listErr } = await supabase
    .from('mfp_program_dropoffs')
    .select(PROGRAM_DROPOFF_ENCODER_COLUMNS)
    .eq('program', programId)
    .eq('center', center)
    .eq('year', year)
    .neq('include_in_masterlist', false)
  if (listErr) return { error: listErr.message, synced: 0 }

  const rows = (dropoffs || []) as ProgramDropoffRow[]
  if (rows.length === 0) return { error: null, synced: 0 }

  const parentIds = [
    ...new Set(rows.map(r => r.procurement_id).filter((id): id is string => Boolean(id))),
  ]
  const parentCache = new Map<string, ProgramProcurementRow | null>()
  for (let i = 0; i < parentIds.length; i += 200) {
    const chunk = parentIds.slice(i, i + 200)
    const { data: parents, error: parentErr } = await supabase
      .from('mfp_program_procurement')
      .select(PROGRAM_PROCUREMENT_ENCODER_COLUMNS)
      .in('id', chunk)
    if (parentErr) return { error: parentErr.message, synced: 0 }
    for (const p of parents || []) {
      parentCache.set((p as ProgramProcurementRow).id, p as ProgramProcurementRow)
    }
  }

  const dropoffIds = rows.map(r => r.id)
  const existingByLink = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < dropoffIds.length; i += 200) {
    const chunk = dropoffIds.slice(i, i + 200)
    const { data: linked, error: linkErr } = await supabase
      .from('mfp_data')
      .select(MFP_SYNC_EXISTING_COLUMNS)
      .in('source_program_dropoff_id', chunk)
    if (linkErr) return { error: linkErr.message, synced: 0 }
    for (const row of linked || []) {
      const key = String((row as { source_program_dropoff_id?: string }).source_program_dropoff_id || '')
      if (key) existingByLink.set(key, row as Record<string, unknown>)
    }
  }

  const fundedBy = MONITORING_PROGRAMS[programId].fundedBy
  const { data: unlinked, error: geoErr } = await supabase
    .from('mfp_data')
    .select(MFP_SYNC_EXISTING_COLUMNS)
    .eq('year', year)
    .eq('center', center)
    .eq('funded_by', fundedBy)
    .is('source_program_dropoff_id', null)
  if (geoErr) return { error: geoErr.message, synced: 0 }

  const existingByGeo = new Map<string, Record<string, unknown>>()
  for (const row of unlinked || []) {
    const r = row as { municipality?: string; province?: string }
    const key = `${String(r.municipality || '').trim()}|${String(r.province || '').trim()}`
    if (key !== '|') existingByGeo.set(key, row as Record<string, unknown>)
  }

  let synced = 0
  let firstError: string | null = null

  await mapPool(rows, WRITE_CONCURRENCY, async row => {
    if (firstError) return
    const parent = row.procurement_id ? parentCache.get(row.procurement_id) ?? null : null
    let existing = existingByLink.get(row.id) || null
    if (!existing) {
      const municipality = String(row.dropoff_name || row.municipality || '').trim()
      const province = String(row.province || parent?.province || parent?.label || '').trim()
      const geoKey = `${municipality}|${province}`
      const byGeo = existingByGeo.get(geoKey)
      if (byGeo && rowMatchesMonitoringProgram(String(byGeo.funded_by || ''), row.program)) {
        existing = byGeo
      }
    }
    const res = await syncProgramDropoffToMasterlist(supabase, row, parent, existing)
    if (res.error) {
      firstError = res.error
      return
    }
    synced++
  })

  if (firstError) return { error: firstError, synced }
  return { error: null, synced }
}

/** Sync every included program drop-off into mfp_data (same idea as SBFP resync-all-deped). */
export async function resyncAllProgramDropoffsToMasterlist(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  options?: { year?: number; enableExcluded?: boolean },
): Promise<{ error: string | null; synced: number; orphansRemoved: number; enabled: number }> {
  const fundedBy = MONITORING_PROGRAMS[programId].fundedBy
  let enabled = 0

  if (options?.enableExcluded) {
    let enableQ = supabase
      .from('mfp_program_dropoffs')
      .update({ include_in_masterlist: true })
      .eq('program', programId)
      .eq('include_in_masterlist', false)
    if (options.year) enableQ = enableQ.eq('year', options.year)
    const { data: enabledRows, error: enableErr } = await enableQ.select('id')
    if (enableErr) {
      return { error: enableErr.message, synced: 0, orphansRemoved: 0, enabled: 0 }
    }
    enabled = (enabledRows || []).length
  }

  let dropoffs: ProgramDropoffRow[]
  try {
    dropoffs = await fetchAllRows<ProgramDropoffRow>(() => {
      let q = supabase
        .from('mfp_program_dropoffs')
        .select(PROGRAM_DROPOFF_ENCODER_COLUMNS)
        .eq('program', programId)
        .neq('include_in_masterlist', false)
      if (options?.year) q = q.eq('year', options.year)
      return q
    })
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to load drop-offs',
      synced: 0,
      orphansRemoved: 0,
      enabled,
    }
  }

  // Reuse batched center sync when scoped to a single center+year is not available —
  // still preload parents once for the full program list.
  const parentIds = [
    ...new Set(dropoffs.map(r => r.procurement_id).filter((id): id is string => Boolean(id))),
  ]
  const parentCache = new Map<string, ProgramProcurementRow | null>()
  if (parentIds.length > 0) {
    for (let i = 0; i < parentIds.length; i += 200) {
      const chunk = parentIds.slice(i, i + 200)
      const { data: parents, error: parentErr } = await supabase
        .from('mfp_program_procurement')
        .select(PROGRAM_PROCUREMENT_ENCODER_COLUMNS)
        .in('id', chunk)
      if (parentErr) {
        return { error: parentErr.message, synced: 0, orphansRemoved: 0, enabled }
      }
      for (const p of parents || []) {
        parentCache.set((p as ProgramProcurementRow).id, p as ProgramProcurementRow)
      }
    }
  }

  let synced = 0
  let firstError: string | null = null
  await mapPool(dropoffs, WRITE_CONCURRENCY, async row => {
    if (firstError) return
    const parent = row.procurement_id ? parentCache.get(row.procurement_id) ?? null : null
    const res = await syncProgramDropoffToMasterlist(supabase, row, parent)
    if (res.error) {
      firstError = res.error
      return
    }
    synced++
  })
  if (firstError) return { error: firstError, synced, orphansRemoved: 0, enabled }

  const keepIds = new Set(dropoffs.map(d => d.id))
  let orphansRemoved = 0
  let masterRows: { id: string; source_program_dropoff_id?: string | null }[]
  try {
    masterRows = await fetchAllRows(() => {
      let q = supabase
        .from('mfp_data')
        .select('id,source_program_dropoff_id')
        .eq('funded_by', fundedBy)
      if (options?.year) q = q.eq('year', options.year)
      return q
    })
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : 'Failed to load masterlist',
      synced,
      orphansRemoved: 0,
      enabled,
    }
  }

  const orphans = masterRows.filter(
    r => !r.source_program_dropoff_id || !keepIds.has(r.source_program_dropoff_id),
  )
  for (let i = 0; i < orphans.length; i += 100) {
    const chunk = orphans.slice(i, i + 100).map(r => r.id)
    const { error } = await supabase.from('mfp_data').delete().in('id', chunk)
    if (error) return { error: error.message, synced, orphansRemoved, enabled }
    orphansRemoved += chunk.length
  }

  return { error: null, synced, orphansRemoved, enabled }
}

export async function cascadeProgramProcurementSync(
  supabase: SupabaseLike,
  procurementId: string,
  parent: ProgramProcurementRow,
): Promise<{ error: string | null; updated: number }> {
  const { data: children, error: listErr } = await supabase
    .from('mfp_program_dropoffs')
    .select('*')
    .eq('procurement_id', procurementId)
  if (listErr) return { error: listErr.message, updated: 0 }

  // Keep child geo aligned with parent when procurement label/region changes (like SBFP SDO rename).
  const parentProvince = String(parent.province || parent.label || '').trim()
  const parentRegion = String(parent.region || '').trim()
  if (parentProvince || parentRegion) {
    const geoPatch: Record<string, string> = {}
    if (parentProvince) geoPatch.province = parentProvince
    if (parentRegion) geoPatch.region = parentRegion
    await supabase.from('mfp_program_dropoffs').update(geoPatch).eq('procurement_id', procurementId)
  }

  let updated = 0
  for (const row of children || []) {
    const child = {
      ...(row as ProgramDropoffRow),
      ...(parentProvince ? { province: parentProvince } : {}),
      ...(parentRegion ? { region: parentRegion } : {}),
    }
    const res = await syncProgramDropoffToMasterlist(supabase, child, parent)
    if (res.error) return { error: res.error, updated }
    updated++
  }
  return { error: null, updated }
}

/** Delete procurement + child municipalities + linked masterlist rows (SBFP SDO delete parity). */
export async function deleteProgramProcurementCascade(
  supabase: SupabaseLike,
  procurementId: string,
): Promise<{ error: string | null; removedDropoffs: number }> {
  const { data: children, error: listErr } = await supabase
    .from('mfp_program_dropoffs')
    .select('id')
    .eq('procurement_id', procurementId)
  if (listErr) return { error: listErr.message, removedDropoffs: 0 }

  const ids = (children || []).map((c: { id: string }) => c.id)
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const { error: unlinkErr } = await supabase
      .from('mfp_data')
      .delete()
      .in('source_program_dropoff_id', chunk)
    if (unlinkErr) return { error: unlinkErr.message, removedDropoffs: 0 }
  }

  if (ids.length) {
    const { error: dropErr } = await supabase.from('mfp_program_dropoffs').delete().in('id', ids)
    if (dropErr) return { error: dropErr.message, removedDropoffs: 0 }
  }

  const { error: procErr } = await supabase.from('mfp_program_procurement').delete().eq('id', procurementId)
  if (procErr) return { error: procErr.message, removedDropoffs: ids.length }
  return { error: null, removedDropoffs: ids.length }
}

export async function loadProgramProcurement(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
  year: number,
  month?: number,
): Promise<ProgramProcurementRow[]> {
  let q = supabase
    .from('mfp_program_procurement')
    .select(PROGRAM_PROCUREMENT_ENCODER_COLUMNS)
    .eq('center', center)
    .eq('year', year)
    .eq('program', programId)
  if (month != null) q = q.eq('month', month)
  const { data, error } = await q.order('label')
  if (error || !data) return []
  return data as ProgramProcurementRow[]
}

export async function loadProgramDropoffs(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
  year: number,
  month?: number,
): Promise<ProgramDropoffRow[]> {
  let q = supabase
    .from('mfp_program_dropoffs')
    .select(PROGRAM_DROPOFF_ENCODER_COLUMNS)
    .eq('center', center)
    .eq('year', year)
    .eq('program', programId)
  if (month != null) q = q.eq('month', month)
  const { data, error } = await q.order('province').order('dropoff_name')
  if (error || !data) return []
  return data as ProgramDropoffRow[]
}

export async function isProgramMonitoringSchemaReady(supabase: SupabaseLike): Promise<boolean> {
  const { error } = await supabase.from('mfp_program_procurement').select('id').limit(1)
  if (error) return false
  const { error: e2 } = await supabase.from('mfp_data').select('source_program_dropoff_id').limit(1)
  return !e2
}

export type ProgramYearCard = {
  year: number
  areaCount: number
  municipalityCount: number
  beneficiaries: number
  targetPacks: number
  deliveredPacks: number
}

export type ProgramMonthCard = ProgramYearCard & { month: number }

function periodKey(year: number, month: number) {
  return `${year}-${month}`
}

function isMissingMonthsTable(message: string | undefined) {
  return /mfp_program_months/i.test(message || '') || /schema cache/i.test(message || '')
}

export async function ensureProgramMonth(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
  year: number,
  month: number,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('mfp_program_months').upsert(
    { year, month, center, program: programId },
    { onConflict: 'center,program,year,month' },
  )
  if (error && !isMissingMonthsTable(error.message)) return { error: error.message }
  return { error: null }
}

/** Register a calendar year workspace (2026, not SY 2026–2027). */
export async function ensureProgramYear(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
  year: number,
): Promise<{ error: string | null }> {
  return ensureProgramMonth(supabase, programId, center, year, 1)
}

export async function loadProgramYearCards(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
): Promise<ProgramYearCard[]> {
  const months = await loadProgramMonthCards(supabase, programId, center)
  const byYear = new Map<number, ProgramYearCard>()
  const { data: periodYears } = await supabase
    .from('mfp_program_months')
    .select('year')
    .eq('center', center)
    .eq('program', programId)
  for (const r of periodYears || []) {
    const y = Number(r.year) || 0
    if (!y || byYear.has(y)) continue
    byYear.set(y, {
      year: y,
      areaCount: 0,
      municipalityCount: 0,
      beneficiaries: 0,
      targetPacks: 0,
      deliveredPacks: 0,
    })
  }
  for (const m of months) {
    if (!byYear.has(m.year)) {
      byYear.set(m.year, {
        year: m.year,
        areaCount: 0,
        municipalityCount: 0,
        beneficiaries: 0,
        targetPacks: 0,
        deliveredPacks: 0,
      })
    }
    const c = byYear.get(m.year)!
    c.areaCount += m.areaCount
    c.municipalityCount += m.municipalityCount
    c.beneficiaries += m.beneficiaries
    c.targetPacks += m.targetPacks
    c.deliveredPacks += m.deliveredPacks
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year)
}

export async function loadProgramMonthCards(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
): Promise<ProgramMonthCard[]> {
  const { data: periods } = await supabase
    .from('mfp_program_months')
    .select('year,month')
    .eq('center', center)
    .eq('program', programId)
  const { data: proc } = await supabase
    .from('mfp_program_procurement')
    .select('year,month,packs_to_deliver,packs_delivered')
    .eq('center', center)
    .eq('program', programId)
  const { data: drops } = await supabase
    .from('mfp_program_dropoffs')
    .select('year,month,beneficiaries')
    .eq('center', center)
    .eq('program', programId)

  const byPeriod = new Map<string, ProgramMonthCard>()
  const addPeriod = (year: number, month: number) => {
    const key = periodKey(year, month)
    if (!byPeriod.has(key)) {
      byPeriod.set(key, {
        year,
        month,
        areaCount: 0,
        municipalityCount: 0,
        beneficiaries: 0,
        targetPacks: 0,
        deliveredPacks: 0,
      })
    }
    return byPeriod.get(key)!
  }

  for (const r of periods || []) {
    const y = Number(r.year) || 0
    const m = Number(r.month) || 0
    if (y && m) addPeriod(y, m)
  }
  for (const r of proc || []) {
    const y = Number(r.year) || 0
    const m = Number(r.month) || 8
    if (!y) continue
    const c = addPeriod(y, m)
    c.areaCount++
    c.targetPacks += Number(r.packs_to_deliver) || 0
    c.deliveredPacks += Number(r.packs_delivered) || 0
  }
  for (const r of drops || []) {
    const y = Number(r.year) || 0
    const m = Number(r.month) || 8
    if (!y) continue
    const c = addPeriod(y, m)
    c.municipalityCount++
    c.beneficiaries += Number(r.beneficiaries) || 0
  }
  return [...byPeriod.values()].sort((a, b) => b.year - a.year || b.month - a.month)
}
