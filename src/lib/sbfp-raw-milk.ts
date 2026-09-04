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
 * Packs basis for raw-milk income.
 * Uses packs_delivered; falls back to latest delivery_snapshots packs (same as “Delivered as of”).
 */
export function packsForMonth(
  row: {
    monthly_packs_delivered?: unknown
    packs_delivered?: number | null
    delivery_snapshots?: Array<{ date?: string; packs?: number | null }> | null
  },
  _month?: number,
  _opts?: { allowLegacyFallback?: boolean }
): number {
  const direct = Number(row.packs_delivered) || 0
  if (direct > 0) return direct
  const snaps = Array.isArray(row.delivery_snapshots) ? row.delivery_snapshots : []
  let best = 0
  for (const snap of snaps) {
    const p = Number(snap?.packs) || 0
    if (p > best) best = p
  }
  return best
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

/** Calendar month key ("1".."12") from Delivery Start. */
export function monthKeyFromDeliveryStart(value: unknown): string | null {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(String(value))
  if (Number.isNaN(d.getTime())) return null
  return String(d.getMonth() + 1)
}

/**
 * Month for Raw ₱/L / Income = Delivery Start month.
 * Empty when the row has no start date yet.
 */
export function resolveRawMilkMonthKey(row: {
  delivery_start?: string | Date | null
  raw_milk_month?: string | number | null
  raw_milk_prices?: unknown
}): string {
  return monthKeyFromDeliveryStart(row.delivery_start) ?? ''
}

export function monthMeta(key: string) {
  const listed = SBFP_RAW_MILK_MONTHS.find(m => m.key === key)
  if (listed) return listed
  const n = parseInt(key, 10)
  if (n >= 1 && n <= 12) {
    const d = new Date(2026, n - 1, 1)
    return {
      key,
      short: d.toLocaleString('en-US', { month: 'short' }),
      label: d.toLocaleString('en-US', { month: 'long' }),
    }
  }
  return { key: '', short: '—', label: '—' }
}

/** Gross income across rows (null if nothing calculable). */
export function sumGrossIncomeRawMilk(
  rows: Array<{
    monthly_packs_delivered?: unknown
    packs_delivered?: number | null
    delivery_snapshots?: Array<{ date?: string; packs?: number | null }> | null
    raw_milk_prices?: unknown
    delivery_start?: string | Date | null
    raw_milk_month?: string | number | null
  }>,
  _month?: number | null,
  _opts?: { allowLegacyFallback?: boolean }
): number | null {
  let income = 0
  let any = false

  for (const r of rows) {
    const packs = packsForMonth(r)
    if (packs <= 0) continue

    const key = resolveRawMilkMonthKey(r)
    if (!key) continue
    const price = priceForMonth(r, parseInt(key, 10))
    if (price == null) continue
    any = true
    income += rawMilkIncome(packs, price)
  }

  return any ? income : null
}
