import { createClient } from '@/lib/supabase/server'
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
