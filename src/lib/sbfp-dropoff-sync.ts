/**
 * Sync SBFP drop-off schools into mfp_data masterlist.
 * Identity fields always refresh from drop-off/SDO; HQ money fields are preserved.
 * Milk packs + formulations recompute when beneficiaries + feeding_days are set.
 * SDO delivery_start / delivery_end push to masterlist date_started / date_completed.
 */

import { calcMilkFormulations } from '@/lib/mfp-formulas'
import { toDateInputValue } from '@/lib/sbfp-raw-milk'
import { inferSbfpMilkType, normalizeSbfpMilkType } from '@/lib/sbfp-pack-price'

export type SbfpDropoffRow = {
  id: string
  year: number
  center: string
  sbfp_data_id?: string | null
  sdo: string
  dropoff_name: string
  beneficiaries?: number | null
  feeding_days?: number | null
  district?: string | null
  municipality?: string | null
  province?: string | null
  region?: string | null
  remarks?: string | null
  include_in_masterlist?: boolean | null
}

export type SbfpParentSdo = {
  id?: string
  sdo?: string | null
  region?: string | null
  milk_type?: string | null
  batch?: string | null
  feeding_days?: number | null
  remarks?: string | null
  delivery_start?: string | Date | null
  delivery_end?: string | Date | null
}

export type MfpMasterRow = {
  id?: string
  year?: number
  center?: string
  funded_by?: string | null
  region?: string | null
  province?: string | null
  division?: string | null
  municipality?: string | null
  elementary_school?: string | null
  beneficiaries?: number | null
  milk_type?: string | null
  feeding_days?: number | null
  batch?: string | null
  milk_packs?: number | null
  total_volume_requirements?: number | null
  raw_milk_liters?: number | null
  whole_milk_kg?: number | null
  skimmed_milk_kg?: number | null
  sugar?: number | null
  price?: number | null
  supplier_id?: string | null
  milk_cost?: number | null
  service_fee?: number | null
  total_funds_transferred?: number | null
  mode_of_procurement?: string | null
  moa_signing?: string | null
  fund_transfer?: string | null
  date_started?: string | null
  date_completed?: string | null
  liquidation?: string | null
  target_milk_packs_to_deliver?: number | null
  total_milk_packs_delivered?: number | null
  source_dropoff_id?: string | null
}

type SupabaseLike = {
  from: (table: string) => any
}

/**
 * Display / count name for an SDO — strips milk-type tags.
 * "Nueva Ecija (PM)" and "Nueva Ecija (SM)" → "Nueva Ecija"
 * "Zambales - PM" → "Zambales"
 */
export function baseSdoName(value: string): string {
  return String(value || '')
    .replace(/^\d+\.\s*/g, '')
    .replace(/^sdo\s+/i, '')
    .replace(/\s*\((PM|SM|SMP|CM|SPM|Sterilized|Pasteurized|Commercial)[^)]*\)\s*/gi, ' ')
    .replace(/\s*[-–—]\s*(PM|SM|SMP|CM|SPM)\b/gi, ' ')
    .replace(/\s*[-–—]?\s*\d+\s*Feeding\s*Days?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[-–—]+$/g, '')
    .trim()
}

/** Normalize SDO labels from Excel for fuzzy match / unique counting. */
export function normalizeSdoName(value: string): string {
  return baseSdoName(value)
    .toLowerCase()
    // common spelling variants
    .replace(/\bozamis\b/g, 'ozamiz')
    .replace(/\bciity\b/g, 'city')
}

/** Prefer PM over SM/CM when several procurement rows are the same geographic SDO. */
export function pickPreferredSdoVariant<T extends { sdo?: string | null; milk_type?: string | null }>(
  variants: T[],
): T | null {
  if (!variants.length) return null
  const rank = (row: T) => {
    const tag =
      inferSbfpMilkType(row.sdo) ||
      normalizeSbfpMilkType(row.milk_type) ||
      ''
    if (tag === 'PM') return 0
    if (tag === 'SM') return 1
    if (tag === 'CM') return 2
    return 3
  }
  return [...variants].sort((a, b) => rank(a) - rank(b) || String(a.sdo).localeCompare(String(b.sdo)))[0]
}

export function parseFeedingDaysFromText(...parts: Array<string | null | undefined>): number | null {
  for (const p of parts) {
    if (!p) continue
    const m = String(p).match(/(\d+)\s*Feeding\s*Days?/i)
    if (m) {
      const n = parseInt(m[1], 10)
      if (Number.isFinite(n) && n > 0) return n
    }
  }
  return null
}

function isBlank(v: unknown): boolean {
  return v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))
}

/** Resolve feeding days: drop-off value first, then parent SDO / label text. */
export function resolveDropoffFeedingDays(
  dropoff: SbfpDropoffRow,
  parent?: SbfpParentSdo | null,
): number {
  const direct = Number(dropoff.feeding_days) || 0
  if (direct > 0) return direct
  if (parent?.feeding_days && parent.feeding_days > 0) return parent.feeding_days
  return (
    parseFeedingDaysFromText(parent?.sdo, parent?.remarks, dropoff.sdo, dropoff.remarks) || 0
  )
}

/** Build identity + auto milk packs / formulations for mfp_data upsert. */
export function buildMasterlistIdentity(
  dropoff: SbfpDropoffRow,
  parent?: SbfpParentSdo | null,
  existing?: MfpMasterRow | null,
): Record<string, unknown> {
  const rawDivision = (parent?.sdo || dropoff.sdo || existing?.division || '').trim()
  // One geographic SDO even when procurement has PM/SM/CM variants
  const division = baseSdoName(rawDivision) || rawDivision
  const region = (dropoff.region || parent?.region || existing?.region || '').trim()
  const province = (dropoff.province || existing?.province || '').trim()
  const municipality = (
    dropoff.municipality ||
    dropoff.district ||
    existing?.municipality ||
    ''
  ).trim()

  const beneficiaries = Number(dropoff.beneficiaries) || 0
  const feedingDays = resolveDropoffFeedingDays(dropoff, parent)

  const payload: Record<string, unknown> = {
    year: dropoff.year,
    center: dropoff.center,
    funded_by: 'DepEd',
    division,
    elementary_school: String(dropoff.dropoff_name || '').trim(),
    beneficiaries,
    feeding_days: feedingDays,
    source_dropoff_id: dropoff.id,
    region,
    province,
    municipality,
  }

  // Auto milk type from "(PM)/(SM)/(CM)" on the SDO label, else parent.milk_type
  const milkFromLabel = inferSbfpMilkType(parent?.sdo, parent?.remarks, dropoff.sdo)
  const milkFromParent = normalizeSbfpMilkType(parent?.milk_type)
  const milkType = milkFromLabel || milkFromParent
  if (milkType) payload.milk_type = milkType
  if (isBlank(existing?.batch) && parent?.batch) payload.batch = parent.batch

  // SDO Delivery Start/End → masterlist Date Started / Date Completed (all drop-offs under that SDO)
  if (parent) {
    const start = toDateInputValue(parent.delivery_start)
    const end = toDateInputValue(parent.delivery_end)
    payload.date_started = start || null
    payload.date_completed = end || null
  }

  const calc = calcMilkFormulations(beneficiaries, feedingDays)
  if (calc) {
    // Encoder-driven volume columns — always refresh from drop-off formula
    payload.milk_packs = calc.milkPacks
    payload.total_volume_requirements = Number(calc.totalVol.toFixed(4))
    payload.raw_milk_liters = Number(calc.rawMilk.toFixed(4))
    payload.whole_milk_kg = Number(calc.wholeMilk.toFixed(4))
    payload.skimmed_milk_kg = Number(calc.skimMilk.toFixed(4))
    payload.sugar = Number(calc.sugar.toFixed(4))
    payload.target_milk_packs_to_deliver = calc.milkPacks
  } else if (beneficiaries <= 0 || feedingDays <= 0) {
    payload.milk_packs = 0
    payload.total_volume_requirements = 0
    payload.raw_milk_liters = 0
    payload.whole_milk_kg = 0
    payload.skimmed_milk_kg = 0
    payload.sugar = 0
    payload.target_milk_packs_to_deliver = 0
  }

  return payload
}

export async function syncDropoffToMasterlist(
  supabase: SupabaseLike,
  dropoff: SbfpDropoffRow,
  parent?: SbfpParentSdo | null,
): Promise<{ error: string | null; mfpId?: string | null }> {
  if (dropoff.include_in_masterlist === false) {
    const removed = await unlinkDropoffFromMasterlist(supabase, dropoff.id)
    return { error: removed.error }
  }

  const name = String(dropoff.dropoff_name || '').trim()
  if (!name) return { error: 'dropoff_name required' }

  const { data: byLink, error: linkErr } = await supabase
    .from('mfp_data')
    .select('*')
    .eq('source_dropoff_id', dropoff.id)
    .maybeSingle()
  if (linkErr) return { error: linkErr.message }

  let existing: MfpMasterRow | null = byLink || null

  if (!existing) {
    const { data: byName } = await supabase
      .from('mfp_data')
      .select('*')
      .eq('year', dropoff.year)
      .eq('center', dropoff.center)
      .eq('elementary_school', name)
      .is('source_dropoff_id', null)
      .limit(1)
      .maybeSingle()
    existing = byName || null
  }

  const payload = buildMasterlistIdentity(dropoff, parent, existing)

  if (existing?.id) {
    const { error } = await supabase.from('mfp_data').update(payload).eq('id', existing.id)
    if (error) return { error: error.message }
    return { error: null, mfpId: existing.id }
  }

  const insertPayload = {
    milk_packs: 0,
    total_volume_requirements: 0,
    raw_milk_liters: 0,
    whole_milk_kg: 0,
    skimmed_milk_kg: 0,
    sugar: 0,
    feeding_days: Number(payload.feeding_days) || 0,
    batch: payload.batch || '',
    milk_type: payload.milk_type || 'PM',
    price: 0,
    milk_cost: 0,
    service_fee: 0,
    total_funds_transferred: 0,
    mode_of_procurement: '',
    target_milk_packs_to_deliver: 0,
    total_milk_packs_delivered: 0,
    ...payload,
  }

  const { data, error } = await supabase.from('mfp_data').insert(insertPayload).select('id').maybeSingle()
  if (error) return { error: error.message }
  return { error: null, mfpId: data?.id ?? null }
}

export async function unlinkDropoffFromMasterlist(
  supabase: SupabaseLike,
  dropoffId: string,
): Promise<{ error: string | null; deleted: number }> {
  const { data, error } = await supabase
    .from('mfp_data')
    .delete()
    .eq('source_dropoff_id', dropoffId)
    .select('id')
  if (error) return { error: error.message, deleted: 0 }
  return { error: null, deleted: Array.isArray(data) ? data.length : 0 }
}

export async function cascadeSdoRename(
  supabase: SupabaseLike,
  sbfpDataId: string,
  newSdoName: string,
  parent?: SbfpParentSdo | null,
): Promise<{ error: string | null; updated: number }> {
  const { data: children, error: listErr } = await supabase
    .from('sbfp_dropoff_points')
    .select('*')
    .eq('sbfp_data_id', sbfpDataId)
  if (listErr) return { error: listErr.message, updated: 0 }

  const rows: SbfpDropoffRow[] = children || []
  if (!rows.length) return { error: null, updated: 0 }

  const { error: updErr } = await supabase
    .from('sbfp_dropoff_points')
    .update({ sdo: newSdoName, updated_at: new Date().toISOString() })
    .eq('sbfp_data_id', sbfpDataId)
  if (updErr) return { error: updErr.message, updated: 0 }

  let updated = 0
  for (const row of rows) {
    const next = { ...row, sdo: newSdoName }
    const res = await syncDropoffToMasterlist(supabase, next, {
      ...(parent || {}),
      id: sbfpDataId,
      sdo: newSdoName,
    })
    if (res.error) return { error: res.error, updated }
    updated++
  }
  return { error: null, updated }
}

export async function cascadeSdoFieldSync(
  supabase: SupabaseLike,
  sbfpDataId: string,
  parent: SbfpParentSdo,
): Promise<{ error: string | null; updated: number }> {
  const { data: children, error: listErr } = await supabase
    .from('sbfp_dropoff_points')
    .select('*')
    .eq('sbfp_data_id', sbfpDataId)
  if (listErr) return { error: listErr.message, updated: 0 }

  let updated = 0
  for (const row of children || []) {
    const res = await syncDropoffToMasterlist(supabase, row as SbfpDropoffRow, parent)
    if (res.error) return { error: res.error, updated }
    updated++
  }
  return { error: null, updated }
}

export async function loadParentSdo(
  supabase: SupabaseLike,
  sbfpDataId: string | null | undefined,
): Promise<SbfpParentSdo | null> {
  if (!sbfpDataId) return null
  const { data, error } = await supabase
    .from('sbfp_data')
    .select('id,sdo,region,milk_type,batch,feeding_days,remarks,delivery_start,delivery_end')
    .eq('id', sbfpDataId)
    .maybeSingle()
  if (error || !data) return null
  return data as SbfpParentSdo
}
