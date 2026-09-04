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
