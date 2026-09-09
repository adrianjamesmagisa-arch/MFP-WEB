/**
 * Sync program monitoring drop-offs (municipality) into mfp_data masterlist.
 */

import { calcMilkFormulations } from '@/lib/mfp-formulas'
import { toDateInputValue, totalPacksDelivered } from '@/lib/sbfp-raw-milk'
import { classifyDswdMasterlistPatch, MFP_GEO_NA } from '@/lib/mfp-record-classification'
import {
  MONITORING_PROGRAMS,
  rowMatchesMonitoringProgram,
  type MonitoringProgramId,
} from '@/lib/monitoring-programs'
import { normalizeSbfpMilkType } from '@/lib/sbfp-pack-price'

export type ProgramProcurementRow = {
  id: string
  year: number
  center: string
  program: MonitoringProgramId
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
    payload.date_started = toDateInputValue(parent.delivery_start) || null
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
): Promise<ProgramProcurementRow[]> {
  const { data, error } = await supabase
    .from('mfp_program_procurement')
    .select('*')
    .eq('center', center)
    .eq('year', year)
    .eq('program', programId)
    .order('label')
  if (error || !data) return []
  return data as ProgramProcurementRow[]
}

export async function loadProgramDropoffs(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
  year: number,
): Promise<ProgramDropoffRow[]> {
  const { data, error } = await supabase
    .from('mfp_program_dropoffs')
    .select('*')
    .eq('center', center)
    .eq('year', year)
    .eq('program', programId)
    .order('province')
    .order('dropoff_name')
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

export async function loadProgramYearCards(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
): Promise<ProgramYearCard[]> {
  const { data: proc, error: e1 } = await supabase
    .from('mfp_program_procurement')
    .select('year,packs_to_deliver,packs_delivered')
    .eq('center', center)
    .eq('program', programId)
  const { data: drops, error: e2 } = await supabase
    .from('mfp_program_dropoffs')
    .select('year,beneficiaries')
    .eq('center', center)
    .eq('program', programId)
  if (e1 || e2) return []

  const byYear = new Map<number, ProgramYearCard>()
  for (const r of proc || []) {
    const y = Number(r.year) || 0
    if (!y) continue
    if (!byYear.has(y)) {
      byYear.set(y, { year: y, areaCount: 0, municipalityCount: 0, beneficiaries: 0, targetPacks: 0, deliveredPacks: 0 })
    }
    const c = byYear.get(y)!
    c.areaCount++
    c.targetPacks += Number(r.packs_to_deliver) || 0
    c.deliveredPacks += Number(r.packs_delivered) || 0
  }
  for (const r of drops || []) {
    const y = Number(r.year) || 0
    if (!y) continue
    if (!byYear.has(y)) {
      byYear.set(y, { year: y, areaCount: 0, municipalityCount: 0, beneficiaries: 0, targetPacks: 0, deliveredPacks: 0 })
    }
    const c = byYear.get(y)!
    c.municipalityCount++
    c.beneficiaries += Number(r.beneficiaries) || 0
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year)
}
