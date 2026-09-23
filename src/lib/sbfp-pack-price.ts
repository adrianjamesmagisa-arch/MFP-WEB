/**
 * SBFP pack unit prices used to derive packs_to_deliver from Amount.
 * PM = ₱25, SM = ₱30, CM = encoder-entered pack_unit_price.
 */

export const SBFP_MILK_TYPES = [
  { value: 'PM', label: 'PM — Pasteurized', fixedPrice: 25 },
  { value: 'SM', label: 'SM — Sterilized', fixedPrice: 30 },
  { value: 'CM', label: 'CM — Commercial', fixedPrice: null },
] as const

export type SbfpMilkTypeCode = 'PM' | 'SM' | 'CM'

export const SBFP_MILK_TYPE_VALUES: SbfpMilkTypeCode[] = ['PM', 'SM', 'CM']

export function normalizeSbfpMilkType(value: unknown): SbfpMilkTypeCode | null {
  const s = String(value || '').trim().toUpperCase()
  if (s === 'PM' || s.startsWith('PASTEUR')) return 'PM'
  if (s === 'SM' || s.startsWith('STERIL')) return 'SM'
  if (s === 'CM' || s.startsWith('COMMERCIAL') || s === 'COM') return 'CM'
  // Legacy labels — treat as closest SBFP type (no SMP in SBFP UI)
  if (s === 'SMP') return 'PM'
  if (s === 'KARABAO') return 'CM'
  return null
}

/** Infer PM/SM/CM from SDO label / remarks, e.g. "Nueva Ecija (SM)". */
export function inferSbfpMilkType(...parts: Array<string | null | undefined>): SbfpMilkTypeCode | null {
  const blob = parts.filter(Boolean).join(' ').toUpperCase()
  if (!blob.trim()) return null
  if (/\(CM\)/.test(blob) || /\bCM\b/.test(blob) || /COMMERCIAL/.test(blob)) return 'CM'
  if (/\(SM\)/.test(blob) || /\bSM\b/.test(blob) || /STERIL/.test(blob)) return 'SM'
  if (/\(PM\)/.test(blob) || /\bPM\b/.test(blob) || /PASTEUR/.test(blob)) return 'PM'
  return null
}

export function fixedPackPriceForMilkType(milkType: unknown): number | null {
  const t = normalizeSbfpMilkType(milkType)
  if (t === 'PM') return 25
  if (t === 'SM') return 30
  return null
}

/**
 * Effective ₱/pack for Amount ÷ price.
 * CM uses encoder pack_unit_price; PM/SM use fixed rates.
 */
export function resolvePackUnitPrice(row: {
  milk_type?: unknown
  pack_unit_price?: number | null
}): number | null {
  const t = normalizeSbfpMilkType(row.milk_type)
  if (!t) return null
  if (t === 'CM') {
    const custom = Number(row.pack_unit_price)
    return custom > 0 ? custom : null
  }
  return fixedPackPriceForMilkType(t)
}

/** packs_to_deliver = round(amount / ₱ per pack) when both are known. */
export function packsFromAmount(
  amount: unknown,
  milkType: unknown,
  packUnitPrice?: number | null,
): number | null {
  const amt = Number(amount)
  if (!Number.isFinite(amt) || amt <= 0) return null
  const price = resolvePackUnitPrice({ milk_type: milkType, pack_unit_price: packUnitPrice ?? null })
  if (!price || price <= 0) return null
  return Math.round(amt / price)
}

export function milkTypeLabel(milkType: unknown): string {
  const t = normalizeSbfpMilkType(milkType)
  if (t === 'PM') return 'PM'
  if (t === 'SM') return 'SM'
  if (t === 'CM') return 'CM'
  return milkType ? String(milkType) : '—'
}

/** SM 180 ml packs needed for 1 L (1 ÷ 0.18). */
export const SBFP_SM_PACKS_PER_LITER = 5.5555555556

/** Finished milk per pack: PM/CM 200 ml, SM = 1 ÷ 5.5555555556 L. */
export const SBFP_FINISHED_LITERS_PER_PACK = {
  PM: 0.2,
  SM: 1 / SBFP_SM_PACKS_PER_LITER,
  CM: 0.2,
} as const

/**
 * Finished milk volume (L) for Senate / DA contracted-vs-actual figures.
 * - PM / CM: packs × 0.20 L (200 ml; 5 packs = 1 L)
 * - SM: packs ÷ 5.5555555556 (180 ml; 5.5555555556 packs = 1 L)
 */
export function finishedMilkLiters(opts: {
  milkType: unknown
  packs: number
  packUnitPrice?: number | null
  peso?: number | null
}): number {
  const packs = Number(opts.packs)
  const safePacks = Number.isFinite(packs) && packs > 0 ? packs : 0
  const t = normalizeSbfpMilkType(opts.milkType)
  if (t === 'SM') return safePacks / SBFP_SM_PACKS_PER_LITER
  if (t === 'CM') return safePacks * SBFP_FINISHED_LITERS_PER_PACK.CM
  return safePacks * SBFP_FINISHED_LITERS_PER_PACK.PM
}
