import type { SupabaseClient } from '@supabase/supabase-js'
import { mfpCenterAliases } from '@/lib/center-aliases'
import { MFP_DATA_LIST_COLUMNS } from '@/lib/encoder-selects'
import { filterValues, filterYears, mfpDateIntervals, type MfpListFilters } from '@/lib/mfp-list-filters'
import { buildMasterlistIdentity, type MfpMasterRow, type SbfpDropoffRow, type SbfpParentSdo } from '@/lib/sbfp-dropoff-sync'
import { resolveDropoffFeedingDays } from '@/lib/sbfp-dropoff-sync'
import { inferSbfpMilkType, normalizeSbfpMilkType } from '@/lib/sbfp-pack-price'
import { calcMilkFormulationsFromPacks } from '@/lib/mfp-formulas'
import { fetchAllRows } from '@/lib/supabase-paginate'

/** This rollout changes 2026 DepEd membership; historical and other-year lists stay intact. */
export const SBFP_SOURCE_YEAR = 2026
type School = SbfpDropoffRow & { created_at?: string | null }
type Parent = SbfpParentSdo & { id: string; year: number; center: string; mode_of_procurement?: string | null; cooperatives?: { name?: string | null } | null }
export type MfpListRow = MfpMasterRow & {
  id: string
  created_at?: string | null
  cooperatives?: { name?: string | null } | null
  mfp_link_status?: 'linked' | 'missing'
  [field: string]: unknown
}

export function includesSbfpSource(filters: MfpListFilters): boolean {
  const years = filterYears(filters.year)
  const funders = filterValues(filters.funded_by)
  return (!years.length || years.includes(SBFP_SOURCE_YEAR)) && (!funders.length || funders.includes('DepEd'))
}

export function is2026Deped(row: MfpListRow): boolean {
  return row.year === SBFP_SOURCE_YEAR && row.funded_by === 'DepEd'
}

function sameCenter(a: string | null | undefined, b: string): boolean {
  return !!a && mfpCenterAliases(b).some(alias => alias.toUpperCase() === a.trim().toUpperCase())
}

/** One row per eligible source school. The MFP table supplies supplementary fields only. */
export function projectSbfpSchools(schools: School[], parents: Parent[], mirrors: MfpListRow[]): MfpListRow[] {
  const parentById = new Map(parents.map(parent => [parent.id, parent]))
  const mirrorBySource = new Map<string, MfpListRow>()
  for (const row of mirrors) {
    if (!row.source_dropoff_id) continue
    if (mirrorBySource.has(row.source_dropoff_id)) throw new Error('Multiple MFP records link to the same SBFP school. Review the school links.')
    mirrorBySource.set(row.source_dropoff_id, row)
  }
  const seen = new Set<string>()
  return schools.filter(school => {
    if (school.year !== SBFP_SOURCE_YEAR || school.include_in_masterlist === false || seen.has(school.id)) return false
    seen.add(school.id)
    return true
  }).map<MfpListRow>(school => {
    const candidate = mirrorBySource.get(school.id)
    const existing = candidate && candidate.year === school.year && candidate.funded_by === 'DepEd' && sameCenter(candidate.center, school.center)
      ? candidate : undefined
    const parentCandidate = school.sbfp_data_id ? parentById.get(school.sbfp_data_id) : undefined
    const parent = parentCandidate && parentCandidate.year === school.year && sameCenter(parentCandidate.center, school.center) ? parentCandidate : undefined
    const source = buildMasterlistIdentity(school, parent, existing)
    // The sync writer supplies defaults for inserts; the read view must preserve unknowns.
    const milkType = inferSbfpMilkType(parent?.sdo, parent?.remarks, school.sdo) ||
      normalizeSbfpMilkType(parent?.milk_type) || normalizeSbfpMilkType(existing?.milk_type)
    const packs = school.milk_packs ?? existing?.milk_packs ?? null
    const formulations = packs != null && milkType ? calcMilkFormulationsFromPacks(packs, milkType) : null
    const feedingDays = resolveDropoffFeedingDays(school, parent)
    const milkCost = school.contract_amount ?? existing?.milk_cost ?? null
    const serviceFee = school.service_fee ?? existing?.service_fee ?? null
    return {
      ...existing,
      ...source,
      id: existing?.id || `sbfp-school:${school.id}`,
      mfp_link_status: existing ? 'linked' : 'missing',
      milk_type: milkType || null,
      milk_packs: packs,
      beneficiaries: school.beneficiaries ?? null,
      feeding_days: feedingDays > 0 ? feedingDays : school.feeding_days ?? parent?.feeding_days ?? existing?.feeding_days ?? null,
      total_volume_requirements: formulations ? Number(formulations.totalVol.toFixed(4)) : null,
      raw_milk_liters: formulations ? Number(formulations.rawMilk.toFixed(4)) : null,
      whole_milk_kg: formulations ? Number(formulations.wholeMilk.toFixed(4)) : null,
      skimmed_milk_kg: formulations ? Number(formulations.skimMilk.toFixed(4)) : null,
      sugar: formulations ? Number(formulations.sugar.toFixed(4)) : null,
      milk_cost: milkCost,
      service_fee: serviceFee,
      total_funds_transferred: milkCost == null || serviceFee == null ? null :
        typeof source.total_funds_transferred === 'number' ? source.total_funds_transferred : existing?.total_funds_transferred ?? null,
      price: existing?.price ?? null,
      created_at: school.created_at ?? null,
      mode_of_procurement: parent?.mode_of_procurement ?? existing?.mode_of_procurement ?? null,
      cooperatives: parent ? parent.cooperatives ?? null : existing?.cooperatives ?? null,
    }
  })
}

export function matchesSourceFilters(row: MfpListRow, filters: MfpListFilters, fallbackYears: number[]): boolean {
  for (const key of ['funded_by', 'region', 'province', 'division', 'municipality', 'milk_type', 'supplier'] as const) {
    const values = filterValues(filters[key])
    if (values.length && !values.includes(String(row[key === 'supplier' ? 'supplier_id' : key] ?? ''))) return false
  }
  const years = filterYears(filters.year)
  if (years.length && !years.includes(Number(row.year))) return false
  const centers = filterValues(filters.center).flatMap(mfpCenterAliases)
  if (centers.length && !centers.some(center => sameCenter(row.center, center))) return false
  if (filters.search) {
    const search = filters.search.toLowerCase()
    if (!['center', 'province', 'municipality', 'elementary_school', 'division']
      .some(key => String(row[key] ?? '').toLowerCase().includes(search))) return false
  }
  for (const field of ['date_started', 'date_completed'] as const) {
    const intervals = mfpDateIntervals(filters[`${field}_year`], filters[`${field}_month`], fallbackYears)
    if (intervals.length) {
      const date = row[field]
      if (!date || !intervals.some(interval => date >= interval.start && date < interval.end)) return false
    }
  }
  if (filters.input_year && filters.input_month) {
    const start = new Date(Number(filters.input_year), Number(filters.input_month) - 1, 1).toISOString()
    const end = new Date(Number(filters.input_year), Number(filters.input_month), 1).toISOString()
    if (!row.created_at || row.created_at < start || row.created_at >= end) return false
  }
  return true
}

const PARENT_COLUMNS = 'id,year,center,sdo,region,milk_type,batch,feeding_days,remarks,delivery_start,delivery_end,packs_to_deliver,packs_delivered,monthly_packs_delivered,delivery_snapshots,supplier_id,mode_of_procurement,cooperatives!supplier_id(name)'

/** Read-only: never invokes sync endpoints or creates/deletes an MFP row. */
export async function loadSbfpSourceRows(
  supabase: SupabaseClient,
  profile: { role: string; center?: string | null },
  filters: MfpListFilters,
  fallbackYears: number[],
): Promise<MfpListRow[]> {
  if (profile.role === 'encoder' && !profile.center?.trim()) throw new Error('Your account has no assigned center. Contact an administrator.')
  const centers = profile.role === 'encoder' && profile.center
    ? mfpCenterAliases(profile.center) : filterValues(filters.center).flatMap(mfpCenterAliases)
  const schools = await fetchAllRows<School>(() => {
    // select('*') also tolerates the additive financial columns before/after their migration.
    let query = supabase.from('sbfp_dropoff_points').select('*')
      .eq('year', SBFP_SOURCE_YEAR).eq('include_in_masterlist', true).order('id')
    if (centers.length) query = query.in('center', centers)
    return query
  })
  if (!schools.length) return []
  const parents: Parent[] = []
  const mirrors: MfpListRow[] = []
  const parentIds = [...new Set(schools.map(school => school.sbfp_data_id).filter((id): id is string => !!id))]
  for (let offset = 0; offset < parentIds.length; offset += 200) {
    parents.push(...await fetchAllRows<Parent>(() => supabase.from('sbfp_data').select(PARENT_COLUMNS)
      .in('id', parentIds.slice(offset, offset + 200)).eq('year', SBFP_SOURCE_YEAR).order('id')))
  }
  for (let offset = 0; offset < schools.length; offset += 200) {
    mirrors.push(...await fetchAllRows<MfpListRow>(() => supabase.from('mfp_data').select(MFP_DATA_LIST_COLUMNS)
      .in('source_dropoff_id', schools.slice(offset, offset + 200).map(school => school.id)).order('id')))
  }
  const effectiveFilters = profile.role === 'encoder' ? { ...filters, center: undefined } : filters
  return projectSbfpSchools(schools, parents, mirrors).filter(row => matchesSourceFilters(row, effectiveFilters, fallbackYears))
}
