/**
 * Sync program monitoring drop-offs (municipality) into mfp_data masterlist.
 */

import { calcMilkFormulations } from '@/lib/mfp-formulas'
import { toDateInputValue, totalPacksDelivered } from '@/lib/sbfp-raw-milk'
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
      totalPacksDelivered(parent as import('@/lib/sbfp-raw-milk').SbfpRawMilkRow) ||
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

export async function syncProgramDropoffToMasterlist(
  supabase: SupabaseLike,
  dropoff: ProgramDropoffRow,
  parent?: ProgramProcurementRow | null,
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
      .select('*')
      .eq('id', dropoff.procurement_id)
      .maybeSingle()
    parentRow = data as ProgramProcurementRow | null
  }

  const { data: byLink } = await supabase
    .from('mfp_data')
    .select('*')
    .eq('source_program_dropoff_id', dropoff.id)
    .maybeSingle()

  let existing = byLink || null
  if (!existing) {
    const { data: byGeo } = await supabase
      .from('mfp_data')
      .select('*')
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

  let updated = 0
  for (const row of children || []) {
    const res = await syncProgramDropoffToMasterlist(supabase, row as ProgramDropoffRow, parent)
    if (res.error) return { error: res.error, updated }
    updated++
  }
  return { error: null, updated }
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
