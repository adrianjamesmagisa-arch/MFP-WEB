/** Pack volume (L) used in client raw-milk utilization formula. */
export const RAW_MILK_PACK_LITERS = 0.2

/** Feeding months shown on SBFP center monitoring (Aug–Dec of the SY start year). */
export const SBFP_RAW_MILK_MONTHS = [
  { key: '8', short: 'Aug', label: 'August' },
  { key: '9', short: 'Sep', label: 'September' },
  { key: '10', short: 'Oct', label: 'October' },
  { key: '11', short: 'Nov', label: 'November' },
  { key: '12', short: 'Dec', label: 'December' },
] as const

export type MonthlyNumberMap = Record<string, number>

/** Raw milk utilized (L) = (packs delivered for month / 5) × 0.2 */
export function rawMilkUtilizedLiters(packs: number): number {
  if (!packs || packs <= 0) return 0
  return (packs / 5) * RAW_MILK_PACK_LITERS
}

/** Income = utilized liters × raw milk price (₱/L) */
export function rawMilkIncome(packs: number, pricePerLiter: number): number {
  if (!packs || packs <= 0 || !pricePerLiter || pricePerLiter <= 0) return 0
  return rawMilkUtilizedLiters(packs) * pricePerLiter
}

export function readMonthlyMap(value: unknown): MonthlyNumberMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: MonthlyNumberMap = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(v)
    if (Number.isFinite(n)) out[String(k)] = n
  }
  return out
}

export function monthKey(month: number): string {
  return String(month)
}

/**
 * Packs for a given calendar month.
 * Prefers monthly_packs_delivered[m]; falls back to packs_delivered when no monthly map entry exists
 * (legacy rows seeded before monthly columns).
 */
export function packsForMonth(
  row: {
    monthly_packs_delivered?: unknown
    packs_delivered?: number | null
  },
  month: number,
  opts?: { allowLegacyFallback?: boolean }
): number {
  const map = readMonthlyMap(row.monthly_packs_delivered)
  const key = monthKey(month)
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    return Number(map[key]) || 0
  }
  if (opts?.allowLegacyFallback !== false) {
    return Number(row.packs_delivered) || 0
  }
  return 0
}

export function priceForMonth(
  row: { raw_milk_prices?: unknown },
  month: number
): number | null {
  const map = readMonthlyMap(row.raw_milk_prices)
  const key = monthKey(month)
  if (!Object.prototype.hasOwnProperty.call(map, key)) return null
  const n = Number(map[key])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Gross income for one month across rows (null if nothing calculable). */
export function sumGrossIncomeRawMilk(
  rows: Array<{
    monthly_packs_delivered?: unknown
    packs_delivered?: number | null
    raw_milk_prices?: unknown
  }>,
  month: number | null | undefined,
  opts?: { allowLegacyFallback?: boolean }
): number | null {
  let income = 0
  let any = false

  const months =
    month != null && month >= 1 && month <= 12
      ? [month]
      : SBFP_RAW_MILK_MONTHS.map(m => parseInt(m.key, 10))

  for (const r of rows) {
    for (const m of months) {
      const packs = packsForMonth(r, m, {
        // Only fall back to total packs_delivered when filtering a single month
        // and that row has no monthly map at all.
        allowLegacyFallback:
          opts?.allowLegacyFallback !== false &&
          month != null &&
          Object.keys(readMonthlyMap(r.monthly_packs_delivered)).length === 0,
      })
      if (packs <= 0) continue
      const price = priceForMonth(r, m)
      if (price == null) continue
      any = true
      income += rawMilkIncome(packs, price)
    }
  }

  return any ? income : null
}
