import { createClient } from '@/lib/supabase/server'
import { excludeAuxSbfp } from '@/lib/sbfp-aux'
import { normalizeSdoName } from '@/lib/sbfp-dropoff-sync'
import {
  FALLBACK_SCHOOL_YEARS,
  labelFromDbYear,
  schoolYearsFromRows,
  type SchoolYear,
  type SchoolYearRow,
} from '@/lib/sbfp-year'

/** Load active school years from DB registry + distinct years in data, with hardcoded fallback. */
export async function loadSchoolYears(): Promise<SchoolYear[]> {
  const years = new Set<number>()

  try {
    const supabase = await createClient()

    const { data: registry, error } = await supabase
      .from('sbfp_school_years')
      .select('year, label, is_active')
      .order('year', { ascending: true })

    if (!error && registry && registry.length > 0) {
      for (const y of schoolYearsFromRows(registry as SchoolYearRow[])) {
        const start = parseInt(y.slice(0, 4), 10)
        if (Number.isFinite(start)) years.add(start)
      }
    }

    const [{ data: fromData }, { data: fromSum }, { data: fromBud }] = await Promise.all([
      supabase.from('sbfp_data').select('year'),
      supabase.from('sbfp_summary').select('year'),
      supabase.from('sbfp_budget').select('year'),
    ])

    for (const row of [...(fromData || []), ...(fromSum || []), ...(fromBud || [])]) {
      if (row?.year) years.add(Number(row.year))
    }
  } catch {
    // ignore
  }

  if (years.size === 0) return [...FALLBACK_SCHOOL_YEARS]

  return Array.from(years)
    .filter(y => Number.isFinite(y))
    .sort((a, b) => a - b)
    .map(labelFromDbYear)
}

export type CenterSchoolYearCard = {
  sy: string
  year: number
  sdoCount: number
  packsToDeliver: number
  dropoffSchools: number
  forPreparation: number
  ongoing: number
  awarded: number
  completed: number
  failed: number
}

/** Distinct school years that have any SBFP data for one center. */
export async function loadSchoolYearsForCenter(center: string): Promise<SchoolYear[]> {
  const supabase = await createClient()
  const years = new Set<number>()
  const tables = ['sbfp_data', 'sbfp_summary', 'sbfp_budget', 'sbfp_dropoff_points'] as const
  await Promise.all(
    tables.map(async table => {
      const { data } = await supabase.from(table).select('year').eq('center', center)
      for (const row of data || []) {
        if (row?.year) years.add(Number(row.year))
      }
    }),
  )
  return Array.from(years)
    .filter(y => Number.isFinite(y))
    .sort((a, b) => b - a)
    .map(labelFromDbYear)
}

/** KPI-style summary per school year for the center hub page. */
export async function loadCenterSchoolYearCards(center: string): Promise<CenterSchoolYearCard[]> {
  const supabase = await createClient()

  const labels = await loadSchoolYearsForCenter(center)
  if (labels.length === 0) return []

  const years = labels.map(l => parseInt(l.slice(0, 4), 10)).filter(Number.isFinite)

  const [{ data: allSbfp }, { data: allDrop }] = await Promise.all([
    supabase
      .from('sbfp_data')
      .select('year,sdo,procurement_status,packs_to_deliver,milk_type')
      .eq('center', center),
    supabase.from('sbfp_dropoff_points').select('year').eq('center', center),
  ])

  const dropByYear = new Map<number, number>()
  for (const d of allDrop || []) {
    const y = Number(d.year)
    if (Number.isFinite(y)) dropByYear.set(y, (dropByYear.get(y) || 0) + 1)
  }

  return years.map(year => {
    const rows = excludeAuxSbfp((allSbfp || []).filter(r => Number(r.year) === year))
    const sdoCount = new Set(rows.map(r => normalizeSdoName(String(r.sdo || ''))).filter(Boolean)).size
    const packsToDeliver = rows.reduce((s, r) => s + (Number(r.packs_to_deliver) || 0), 0)
    const stats = rows.reduce(
      (acc, r) => {
        const st = String(r.procurement_status || '').toUpperCase()
        if (st === 'FOR PREPARATION') acc.forPreparation++
        else if (st.includes('ONGOING')) acc.ongoing++
        else if (st.includes('AWARDED')) acc.awarded++
        else if (st === 'DONE' || st === 'COMPLETED') acc.completed++
        else if (st === 'FAILED') acc.failed++
        return acc
      },
      { forPreparation: 0, ongoing: 0, awarded: 0, completed: 0, failed: 0 },
    )
    return {
      sy: labelFromDbYear(year),
      year,
      sdoCount,
      packsToDeliver,
      dropoffSchools: dropByYear.get(year) || 0,
      ...stats,
    }
  })
}
