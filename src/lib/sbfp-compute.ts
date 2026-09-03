/**
 * SBFP summary/budget recompute helpers.
 * Summary formulas match the Excel SUMMARY TARGET MILK PROD sheet.
 */

export type SummaryCapacityInput = {
  jan_dec_target_milk_volume?: number | null
  jul_dec_projected_volume?: number | null
}

export type ComputedSummaryFields = {
  target_milk_packs: number
  equivalent_volume: number
  shortage_surplus: number
  pct_covered: number
  milk_packs_can_produce: number
  shortage_surplus_packs: number
  jul_dec_projected_volume: number
  jan_dec_target_milk_volume: number
}

export function computeSummaryFields(
  capacity: SummaryCapacityInput,
  packsToDeliverSum: number,
): ComputedSummaryFields {
  const janDec = Number(capacity.jan_dec_target_milk_volume) || 0
  let julDec = Number(capacity.jul_dec_projected_volume)
  if (!Number.isFinite(julDec) || julDec === 0) {
    julDec = janDec > 0 ? Math.round(janDec / 2) : 0
  }
  const targetPacks = Number(packsToDeliverSum) || 0
  const equivalentVolume = targetPacks / 25
  const shortageSurplus = janDec - equivalentVolume
  const packsProducible = julDec * 25
  const shortagePacks = packsProducible - targetPacks
  const pctCovered = janDec > 0 ? equivalentVolume / janDec : 0

  return {
    jan_dec_target_milk_volume: janDec,
    jul_dec_projected_volume: julDec,
    target_milk_packs: targetPacks,
    equivalent_volume: equivalentVolume,
    shortage_surplus: shortageSurplus,
    pct_covered: pctCovered,
    milk_packs_can_produce: packsProducible,
    shortage_surplus_packs: shortagePacks,
  }
}

export function computeBudgetTotal(row: {
  milk_supplies?: number | null
  office_professional?: number | null
  traveling_expenses?: number | null
  office_supplies?: number | null
  training_expenses?: number | null
  furniture_fixtures?: number | null
}): number {
  return (
    (Number(row.milk_supplies) || 0) +
    (Number(row.office_professional) || 0) +
    (Number(row.traveling_expenses) || 0) +
    (Number(row.office_supplies) || 0) +
    (Number(row.training_expenses) || 0) +
    (Number(row.furniture_fixtures) || 0)
  )
}

type SupabaseLike = {
  from: (table: string) => any
}

/** Sum packs_to_deliver for center+year and write computed columns on sbfp_summary. */
export async function recomputeCenterSummary(
  supabase: SupabaseLike,
  center: string,
  year: number,
): Promise<{ error: string | null }> {
  const { data: sdoRows, error: sdoErr } = await supabase
    .from('sbfp_data')
    .select('packs_to_deliver')
    .eq('center', center)
    .eq('year', year)

  if (sdoErr) return { error: sdoErr.message }

  const packsSum = (sdoRows || []).reduce(
    (sum: number, r: { packs_to_deliver?: number | null }) => sum + (Number(r.packs_to_deliver) || 0),
    0,
  )

  const { data: existing, error: getErr } = await supabase
    .from('sbfp_summary')
    .select('id, jan_dec_target_milk_volume, jul_dec_projected_volume')
    .eq('center', center)
    .eq('year', year)
    .maybeSingle()

  if (getErr) return { error: getErr.message }

  const computed = computeSummaryFields(
    {
      jan_dec_target_milk_volume: existing?.jan_dec_target_milk_volume,
      jul_dec_projected_volume: existing?.jul_dec_projected_volume,
    },
    packsSum,
  )

  if (existing?.id) {
    const { error } = await supabase
      .from('sbfp_summary')
      .update(computed)
      .eq('id', existing.id)
    return { error: error?.message ?? null }
  }

  const { error } = await supabase.from('sbfp_summary').insert({
    year,
    center,
    ...computed,
  })
  return { error: error?.message ?? null }
}

/** Ensure budget total = sum of A–F for center+year. */
export async function recomputeBudgetTotal(
  supabase: SupabaseLike,
  center: string,
  year: number,
): Promise<{ error: string | null }> {
  const { data, error: getErr } = await supabase
    .from('sbfp_budget')
    .select('*')
    .eq('center', center)
    .eq('year', year)
    .maybeSingle()

  if (getErr) return { error: getErr.message }
  if (!data) return { error: null }

  const total = computeBudgetTotal(data)
  if (total === data.total) return { error: null }

  const { error } = await supabase
    .from('sbfp_budget')
    .update({ total })
    .eq('id', data.id)
  return { error: error?.message ?? null }
}

/** Create SY registry row + empty summary/budget shells for a center. */
export async function ensureCenterSchoolYear(
  supabase: SupabaseLike,
  center: string,
  year: number,
  opts?: { copyFromYear?: number | null },
): Promise<{ error: string | null }> {
  const label = `${year}-${year + 1}`

  const { error: syErr } = await supabase.from('sbfp_school_years').upsert(
    { year, label, is_active: true },
    { onConflict: 'year' },
  )
  // Registry table may not be migrated yet — continue with summary/budget shells.
  if (syErr && !/schema cache|does not exist|PGRST205/i.test(syErr.message)) {
    return { error: syErr.message }
  }

  let capacity: SummaryCapacityInput = {
    jan_dec_target_milk_volume: 0,
    jul_dec_projected_volume: 0,
  }
  let budgetCopy: Record<string, number> | null = null

  if (opts?.copyFromYear) {
    const { data: prevSum } = await supabase
      .from('sbfp_summary')
      .select('jan_dec_target_milk_volume, jul_dec_projected_volume')
      .eq('center', center)
      .eq('year', opts.copyFromYear)
      .maybeSingle()
    if (prevSum) {
      capacity = {
        jan_dec_target_milk_volume: prevSum.jan_dec_target_milk_volume || 0,
        jul_dec_projected_volume: prevSum.jul_dec_projected_volume || 0,
      }
    }
    const { data: prevBud } = await supabase
      .from('sbfp_budget')
      .select('milk_supplies, office_professional, traveling_expenses, office_supplies, training_expenses, furniture_fixtures')
      .eq('center', center)
      .eq('year', opts.copyFromYear)
      .maybeSingle()
    if (prevBud) budgetCopy = prevBud
  }

  const computed = computeSummaryFields(capacity, 0)
  const { error: sumErr } = await supabase.from('sbfp_summary').upsert(
    { year, center, ...computed },
    { onConflict: 'year,center' },
  )
  if (sumErr) return { error: sumErr.message }

  const budgetRow = {
    year,
    center,
    milk_supplies: budgetCopy?.milk_supplies || 0,
    office_professional: budgetCopy?.office_professional || 0,
    traveling_expenses: budgetCopy?.traveling_expenses || 0,
    office_supplies: budgetCopy?.office_supplies || 0,
    training_expenses: budgetCopy?.training_expenses || 0,
    furniture_fixtures: budgetCopy?.furniture_fixtures || 0,
    total: 0,
  }
  budgetRow.total = computeBudgetTotal(budgetRow)

  const { error: budErr } = await supabase.from('sbfp_budget').upsert(
    budgetRow,
    { onConflict: 'year,center' },
  )
  if (budErr) return { error: budErr.message }

  return { error: null }
}

/** Recompute summary for every center that has SDO rows in the year. */
export async function recomputeAllSummariesForYear(
  supabase: SupabaseLike,
  year: number,
): Promise<void> {
  const { data: centers } = await supabase
    .from('sbfp_data')
    .select('center')
    .eq('year', year)

  const list = (centers || []) as { center: string }[]
  const unique = Array.from(new Set(list.map(r => r.center).filter(Boolean)))
  for (const center of unique) {
    await recomputeCenterSummary(supabase, center, year)
  }
}
