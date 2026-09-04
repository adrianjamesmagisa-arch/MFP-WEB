import { litersPerPackForMilkType } from '@/lib/mfp-formulas'

/** Pack volume (L) for raw-milk utilization — SM=0.18, PM=0.2 (see mfp-formulas). */
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
export type DeliverySnapshot = { date?: string; packs?: number | null }

export type SbfpRawMilkRow = {
  monthly_packs_delivered?: unknown
  packs_delivered?: number | null
  delivery_snapshots?: DeliverySnapshot[] | null
  raw_milk_prices?: unknown
  delivery_start?: string | Date | null
  raw_milk_month?: string | number | null
  /** PM → ×0.2 · SM → ×0.18 in raw milk used (L) */
  milk_type?: string | null
}

/**
 * Raw milk utilized (L) = (packs delivered for month / 5) × liters/pack
 * SM = 0.18 · PM/CM = 0.2
 */
export function rawMilkUtilizedLiters(packs: number, milkType?: unknown): number {
  if (!packs || packs <= 0) return 0
  return (packs / 5) * litersPerPackForMilkType(milkType)
}

/** Income = utilized liters × raw milk price (₱/L) */
export function rawMilkIncome(packs: number, pricePerLiter: number, milkType?: unknown): number {
  if (!packs || packs <= 0 || !pricePerLiter || pricePerLiter <= 0) return 0
  return rawMilkUtilizedLiters(packs, milkType) * pricePerLiter
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

/** Parse snapshot / delivery dates including "Aug. 18, 2026" and yyyy-mm-dd. */
export function parseSnapshotDate(value: unknown): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }
  const s = String(value).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
  const named = s.match(/^([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (named) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
    const mi = months.indexOf(named[1].slice(0, 3).toLowerCase())
    if (mi >= 0) return new Date(Number(named[3]), mi, Number(named[2]))
  }
  const cleaned = s.replace(/\./g, '')
  const d = new Date(cleaned)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Header label matching existing NHQ snapshots, e.g. "Aug. 18, 2026". */
export function formatDeliveredAsOf(d: Date): string {
  const mon = d.toLocaleString('en-US', { month: 'short' })
  return `${mon}. ${d.getDate()}, ${d.getFullYear()}`
}

export function toDateInputValue(value: unknown): string {
  const d = parseSnapshotDate(value)
  if (!d) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function monthKeyFromDateValue(value: unknown): string | null {
  const d = parseSnapshotDate(value)
  if (!d) return null
  return String(d.getMonth() + 1)
}

/**
 * Packs completed in one calendar month (not the running total).
 * 1. Explicit monthly_packs_delivered[m] (including 0)
 * 2. Else increment from cumulative “Delivered as of” snapshots
 *    (max in month − max before that month)
 * 3. Else legacy packs_delivered only when that month is Delivery Start
 *    and the row has no monthly map and no snapshots
 */
export function packsForMonth(
  row: SbfpRawMilkRow,
  month?: number,
  opts?: { allowLegacyFallback?: boolean; year?: number }
): number {
  if (month == null || !Number.isFinite(month)) {
    return totalPacksDelivered(row)
  }

  const monthly = readMonthlyMap(row.monthly_packs_delivered)
  const key = monthKey(month)
  if (Object.prototype.hasOwnProperty.call(monthly, key)) {
    return Math.max(0, Number(monthly[key]) || 0)
  }

  const increment = incrementFromSnapshots(row.delivery_snapshots, month, opts?.year)
  if (increment != null) return increment

  const allowLegacy = opts?.allowLegacyFallback !== false
  const snaps = Array.isArray(row.delivery_snapshots) ? row.delivery_snapshots : []
  const hasAnyMonthly = Object.keys(monthly).length > 0
  if (allowLegacy && !hasAnyMonthly && snaps.length === 0) {
    const startKey = monthKeyFromDeliveryStart(row.delivery_start)
    if (startKey === key) return Number(row.packs_delivered) || 0
  }
  return 0
}

/** Cumulative snapshot increment completed during `month`. */
export function incrementFromSnapshots(
  snaps: DeliverySnapshot[] | null | undefined,
  month: number,
  year?: number
): number | null {
  if (!Array.isArray(snaps) || snaps.length === 0) return null
  const parsed = snaps
    .map(s => ({ date: parseSnapshotDate(s.date), packs: Number(s.packs) || 0 }))
    .filter((s): s is { date: Date; packs: number } => s.date != null)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
  if (parsed.length === 0) return null

  const inMonth = parsed.filter(s => {
    if (s.date.getMonth() + 1 !== month) return false
    if (year != null && s.date.getFullYear() !== year) return false
    return true
  })
  if (inMonth.length === 0) return null

  const maxInMonth = Math.max(...inMonth.map(s => s.packs))
  const monthStart = inMonth.reduce((earliest, s) =>
    s.date.getTime() < earliest.getTime() ? s.date : earliest, inMonth[0].date)
  const startOfMonth = new Date(monthStart.getFullYear(), monthStart.getMonth(), 1)
  const before = parsed.filter(s => s.date.getTime() < startOfMonth.getTime())
  const maxBefore = before.length ? Math.max(...before.map(s => s.packs)) : 0
  return Math.max(0, maxInMonth - maxBefore)
}

/** Best available total packs delivered (monthly sum, latest snapshot, or legacy). */
export function totalPacksDelivered(row: SbfpRawMilkRow): number {
  const monthly = readMonthlyMap(row.monthly_packs_delivered)
  const monthlySum = Object.values(monthly).reduce((s, n) => s + (Number(n) || 0), 0)
  const snaps = Array.isArray(row.delivery_snapshots) ? row.delivery_snapshots : []
  const latestSnap = snaps.reduce((best, s) => Math.max(best, Number(s?.packs) || 0), 0)
  const legacy = Number(row.packs_delivered) || 0
  return Math.max(monthlySum, latestSnap, legacy)
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
  return monthKeyFromDateValue(value)
}

/**
 * Month for a single Raw ₱/L when only Delivery Start is known.
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

export function incomeForMonth(
  row: SbfpRawMilkRow,
  month: number,
  opts?: { year?: number }
): number {
  const packs = packsForMonth(row, month, opts)
  const price = priceForMonth(row, month)
  if (price == null) return 0
  return rawMilkIncome(packs, price, row.milk_type)
}

/** Sum per-month incomes on one row (each month uses only that month’s completed packs). */
export function sumRowIncome(row: SbfpRawMilkRow, opts?: { year?: number }): number {
  const months = new Set<number>()
  for (const m of SBFP_RAW_MILK_MONTHS) months.add(parseInt(m.key, 10))
  const monthly = readMonthlyMap(row.monthly_packs_delivered)
  for (const k of Object.keys(monthly)) {
    const n = parseInt(k, 10)
    if (Number.isFinite(n)) months.add(n)
  }
  const prices = readMonthlyMap(row.raw_milk_prices)
  for (const k of Object.keys(prices)) {
    const n = parseInt(k, 10)
    if (Number.isFinite(n)) months.add(n)
  }
  const snaps = Array.isArray(row.delivery_snapshots) ? row.delivery_snapshots : []
  for (const s of snaps) {
    const mk = monthKeyFromDateValue(s.date)
    if (mk) months.add(parseInt(mk, 10))
  }
  const start = monthKeyFromDeliveryStart(row.delivery_start)
  if (start) months.add(parseInt(start, 10))

  let income = 0
  for (const m of months) {
    if (!Number.isFinite(m) || m < 1 || m > 12) continue
    income += incomeForMonth(row, m, opts)
  }
  return income
}

/**
 * Gross income across rows.
 * When `month` is set (PIMD filter), only that month’s completed packs × that month’s ₱/L.
 * Otherwise join every month on the row.
 */
export function sumGrossIncomeRawMilk(
  rows: SbfpRawMilkRow[],
  month?: number | null,
  opts?: { allowLegacyFallback?: boolean; year?: number }
): number | null {
  let income = 0
  let any = false

  for (const r of rows) {
    if (month != null && Number.isFinite(month)) {
      const packs = packsForMonth(r, month, opts)
      const price = priceForMonth(r, month)
      if (packs <= 0 || price == null) continue
      any = true
      income += rawMilkIncome(packs, price, r.milk_type)
    } else {
      const rowIncome = sumRowIncome(r, opts)
      if (rowIncome > 0) {
        any = true
        income += rowIncome
      }
    }
  }

  return any ? income : null
}
