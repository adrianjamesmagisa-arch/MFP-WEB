import type { MonitoringProgramId } from '@/lib/monitoring-programs'
import { MONITORING_PROGRAMS, rowMatchesMonitoringProgram } from '@/lib/monitoring-programs'
import { mfpCenterAliases } from '@/lib/center-aliases'

export type MfpProgramYearCard = {
  year: number
  schoolCount: number
  divisionCount: number
  beneficiaries: number
  targetPacks: number
  deliveredPacks: number
}

export type MfpProgramRecord = {
  id: string
  year: number
  center: string
  funded_by: string | null
  region: string | null
  province: string | null
  division: string | null
  municipality: string | null
  elementary_school: string | null
  beneficiaries: number | null
  feeding_days: number | null
  milk_packs: number | null
  milk_type: string | null
  date_started: string | null
  date_completed: string | null
  target_milk_packs_to_deliver: number | null
  total_milk_packs_delivered: number | null
  milk_cost: number | null
  total_funds_transferred: number | null
}

type SupabaseLike = { from: (table: string) => any }

function centerFilter(query: any, center: string) {
  const aliases = mfpCenterAliases(center)
  return aliases.length === 1 ? query.eq('center', aliases[0]) : query.in('center', aliases)
}

export async function loadMfpProgramRecords(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
  year: number,
): Promise<MfpProgramRecord[]> {
  let q = centerFilter(
    supabase.from('mfp_data').select(
      'id,year,center,funded_by,region,province,division,municipality,elementary_school,beneficiaries,feeding_days,milk_packs,milk_type,date_started,date_completed,target_milk_packs_to_deliver,total_milk_packs_delivered,milk_cost,total_funds_transferred',
    ),
    center,
  ).eq('year', year)

  const { data, error } = await q.order('province').order('municipality').limit(5000)
  if (error || !data) return []
  return (data as MfpProgramRecord[]).filter(r => rowMatchesMonitoringProgram(r.funded_by, programId))
}

/** After load, normalize DSWD classification on in-memory rows (division/school N/A). */
export function normalizeDswdRecords(records: MfpProgramRecord[]): MfpProgramRecord[] {
  return records.map(r => ({
    ...r,
    division: r.division?.trim() || 'N/A',
    elementary_school: r.elementary_school?.trim() || 'N/A',
  }))
}

export async function loadMfpProgramYearCards(
  supabase: SupabaseLike,
  programId: MonitoringProgramId,
  center: string,
): Promise<MfpProgramYearCard[]> {
  let q = centerFilter(
    supabase.from('mfp_data').select(
      'year,division,elementary_school,beneficiaries,target_milk_packs_to_deliver,total_milk_packs_delivered,funded_by',
    ),
    center,
  )

  const { data, error } = await q.limit(10000)
  if (error || !data) return []

  const byYear = new Map<number, MfpProgramYearCard>()
  for (const row of data) {
    if (!rowMatchesMonitoringProgram(row.funded_by, programId)) continue
    const y = Number(row.year) || 0
    if (!y) continue
    if (!byYear.has(y)) {
      byYear.set(y, {
        year: y,
        schoolCount: 0,
        divisionCount: 0,
        beneficiaries: 0,
        targetPacks: 0,
        deliveredPacks: 0,
      })
    }
    const card = byYear.get(y)!
    card.beneficiaries += Number(row.beneficiaries) || 0
    card.schoolCount += 1
  }

  for (const card of byYear.values()) {
    const yearRows = data.filter(
      (r: any) =>
        Number(r.year) === card.year && rowMatchesMonitoringProgram(r.funded_by, programId),
    )
    if (programId === 'dswd') {
      card.divisionCount = new Set(yearRows.map((r: any) => r.province).filter(Boolean)).size
      card.targetPacks = 0
      card.deliveredPacks = 0
      for (const r of yearRows) {
        card.targetPacks += Number(r.target_milk_packs_to_deliver) || 0
        card.deliveredPacks += Number(r.total_milk_packs_delivered) || 0
      }
    } else {
      const divisions = new Set<string>()
      const divTarget = new Map<string, number>()
      const divDelivered = new Map<string, number>()
      for (const r of yearRows) {
        const div = String(r.division || '').trim() || '(No division)'
        divisions.add(div)
        const t = Number(r.target_milk_packs_to_deliver) || 0
        const d = Number(r.total_milk_packs_delivered) || 0
        if (t > (divTarget.get(div) || 0)) divTarget.set(div, t)
        if (d > (divDelivered.get(div) || 0)) divDelivered.set(div, d)
      }
      card.divisionCount = divisions.size
      card.targetPacks = [...divTarget.values()].reduce((s, n) => s + n, 0)
      card.deliveredPacks = [...divDelivered.values()].reduce((s, n) => s + n, 0)
      continue
    }
  }

  return [...byYear.values()].sort((a, b) => b.year - a.year)
}

/** Push division-level AD/AE to every masterlist row in that division (masterlist sync for non-SBFP). */
export async function syncDivisionDeliveryToMasterlist(
  supabase: SupabaseLike,
  opts: {
    programId: MonitoringProgramId
    center: string
    year: number
    division: string
    target: number
    delivered: number
  },
): Promise<{ error: string | null; updated: number }> {
  const fundedBy = MONITORING_PROGRAMS[opts.programId].fundedBy
  const records = await loadMfpProgramRecords(supabase, opts.programId, opts.center, opts.year)
  const divNorm = opts.division.trim().toLowerCase()
  const ids = records
    .filter(r => String(r.division || '').trim().toLowerCase() === divNorm)
    .map(r => r.id)
  if (!ids.length) return { error: 'No schools in this division', updated: 0 }

  let updated = 0
  for (const id of ids) {
    const patch: Record<string, unknown> = {
      target_milk_packs_to_deliver: opts.target,
      total_milk_packs_delivered: opts.delivered,
    }
    if (opts.programId !== 'others') {
      patch.funded_by = fundedBy
    }
    const { error } = await supabase.from('mfp_data').update(patch).eq('id', id)
    if (error) return { error: error.message, updated }
    updated++
  }
  return { error: null, updated }
}

export function aggregateDivisions(records: MfpProgramRecord[]) {
  const map = new Map<
    string,
    {
      division: string
      schools: number
      beneficiaries: number
      target: number
      delivered: number
    }
  >()
  for (const r of records) {
    const div = String(r.division || '').trim() || '(No division)'
    if (!map.has(div)) {
      map.set(div, { division: div, schools: 0, beneficiaries: 0, target: 0, delivered: 0 })
    }
    const row = map.get(div)!
    row.schools += 1
    row.beneficiaries += Number(r.beneficiaries) || 0
    const t = Number(r.target_milk_packs_to_deliver) || 0
    const d = Number(r.total_milk_packs_delivered) || 0
    if (t > row.target) row.target = t
    if (d > row.delivered) row.delivered = d
  }
  return [...map.values()].sort((a, b) => a.division.localeCompare(b.division))
}
