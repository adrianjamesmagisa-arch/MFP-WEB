/** Shared MFP masterlist volume / formulation factors (same as MFP Data entry). */
export const MFP_DEFAULT_FORMULAS = {
  total_volume_factor: 0.18,
  raw_milk_factor: 0.20,
  whole_milk_factor: 0.268,
  skim_milk_factor: 0.274,
  sugar_factor: 0.02,
} as const

export type MfpFormulaFactors = typeof MFP_DEFAULT_FORMULAS

export type MilkFormulationResult = {
  milkPacks: number
  totalVol: number
  rawMilk: number
  wholeMilk: number
  skimMilk: number
  sugar: number
}

/** Milk packs = beneficiaries × feeding days; then volume / raw / powders / sugar. */
export function calcMilkFormulations(
  beneficiaries: number,
  feedingDays: number,
  factors: MfpFormulaFactors = MFP_DEFAULT_FORMULAS,
): MilkFormulationResult | null {
  const bene = Number(beneficiaries) || 0
  const days = Number(feedingDays) || 0
  if (bene <= 0 || days <= 0) return null
  const milkPacks = bene * days
  const totalVol = milkPacks * factors.total_volume_factor
  const rawMilk = totalVol * factors.raw_milk_factor
  const wholeMilk = rawMilk * factors.whole_milk_factor
  const skimMilk = rawMilk * factors.skim_milk_factor
  const sugar = totalVol * factors.sugar_factor
  return { milkPacks, totalVol, rawMilk, wholeMilk, skimMilk, sugar }
}

export const FEEDING_DAYS_OPTIONS = ['15', '18', '20', '21', '30', '60', '90', '100', '120', '180']
