/** Shared MFP volume / formulation factors.
 *  Total volume (L) = packs × liters per pack:
 *    SM (Sterilized) → 0.18 L (180 ml) — packaging always 180 ML CAN/POUCH
 *    PM (Pasteurized) → 0.20 L (200 ml) — packaging 200 POUCH
 *    CM / other → 0.20 L default
 */

export const MFP_VOLUME_LITERS_PER_PACK = {
  SM: 0.18,
  PM: 0.2,
  CM: 0.2,
  SMP: 0.2,
  Karabao: 0.2,
  default: 0.2,
} as const

export const MFP_DEFAULT_FORMULAS = {
  total_volume_factor: 0.18,
  raw_milk_factor: 0.20,
  whole_milk_factor: 0.268,
  skim_milk_factor: 0.274,
  sugar_factor: 0.02,
} as const

/** Mutable factor bag — values are numbers so milk-type overrides type-check. */
export type MfpFormulaFactors = {
  total_volume_factor: number
  raw_milk_factor: number
  whole_milk_factor: number
  skim_milk_factor: number
  sugar_factor: number
}

export type MilkFormulationResult = {
  milkPacks: number
  totalVol: number
  rawMilk: number
  wholeMilk: number
  skimMilk: number
  sugar: number
  litersPerPack: number
  packagingSize: string
}

export function normalizeMilkTypeCode(milkType: unknown): string {
  const s = String(milkType || '').trim().toUpperCase()
  if (s === 'PM' || s.startsWith('PASTEUR')) return 'PM'
  if (s === 'SM' || s.startsWith('STERIL')) return 'SM'
  if (s === 'CM' || s.startsWith('COMMERCIAL') || s === 'COM') return 'CM'
  if (s === 'SMP' || s === 'SPM') return 'SMP'
  if (s.startsWith('KARABAO')) return 'Karabao'
  return s || 'PM'
}

/** Liters per pack from milk type (SM=0.18, PM=0.2). */
export function litersPerPackForMilkType(milkType: unknown): number {
  const code = normalizeMilkTypeCode(milkType)
  if (code === 'SM') return MFP_VOLUME_LITERS_PER_PACK.SM
  if (code === 'PM') return MFP_VOLUME_LITERS_PER_PACK.PM
  if (code === 'CM') return MFP_VOLUME_LITERS_PER_PACK.CM
  if (code === 'SMP') return MFP_VOLUME_LITERS_PER_PACK.SMP
  if (code === 'Karabao') return MFP_VOLUME_LITERS_PER_PACK.Karabao
  return MFP_VOLUME_LITERS_PER_PACK.default
}

/** Packaging label for PIMD chart — SM is always 180 ml. */
export function packagingSizeForMilkType(milkType: unknown): string {
  const code = normalizeMilkTypeCode(milkType)
  if (code === 'SM') return '180 ML CAN/POUCH'
  if (code === 'PM' || code === 'CM' || code === 'Karabao') return '200 POUCH'
  if (code === 'SMP') return '1 LITER BOTTLE'
  return '200 POUCH'
}

export function factorsForMilkType(milkType?: unknown): MfpFormulaFactors {
  return {
    ...MFP_DEFAULT_FORMULAS,
    total_volume_factor: litersPerPackForMilkType(milkType),
  }
}

/** Milk packs = beneficiaries × feeding days; volume uses milk-type liters/pack. */
export function calcMilkFormulations(
  beneficiaries: number,
  feedingDays: number,
  factorsOrMilkType: MfpFormulaFactors | string | null | undefined = MFP_DEFAULT_FORMULAS,
): MilkFormulationResult | null {
  const bene = Number(beneficiaries) || 0
  const days = Number(feedingDays) || 0
  if (bene <= 0 || days <= 0) return null

  const factors: MfpFormulaFactors =
    factorsOrMilkType == null || typeof factorsOrMilkType === 'string'
      ? factorsForMilkType(factorsOrMilkType)
      : factorsOrMilkType

  const milkTypeHint =
    typeof factorsOrMilkType === 'string' ? factorsOrMilkType : undefined

  const milkPacks = bene * days
  const litersPerPack = factors.total_volume_factor
  const totalVol = milkPacks * litersPerPack
  const rawMilk = totalVol * factors.raw_milk_factor
  const wholeMilk = rawMilk * factors.whole_milk_factor
  const skimMilk = rawMilk * factors.skim_milk_factor
  const sugar = totalVol * factors.sugar_factor
  return {
    milkPacks,
    totalVol,
    rawMilk,
    wholeMilk,
    skimMilk,
    sugar,
    litersPerPack,
    packagingSize: packagingSizeForMilkType(
      milkTypeHint ||
        (Math.abs(litersPerPack - 0.18) < 0.001 ? 'SM' : 'PM'),
    ),
  }
}

export const FEEDING_DAYS_OPTIONS = ['15', '18', '20', '21', '30', '60', '90', '100', '120', '180']
