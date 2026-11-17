import { deliveredPacksInDateRange, officialSbfpStatusLabel, type SbfpReportSourceRow, type SbfpReportViewRow } from '@/lib/sbfp-report-sync'
import { milkTypeLabel } from '@/lib/sbfp-pack-price'
import { packsForMonth, rawMilkUtilizedLiters, readMonthlyMap, toDateInputValue } from '@/lib/sbfp-raw-milk'

export type GraphUnit = 'PHP' | 'L' | 'packs' | 'count' | '%'
export interface ReportGraphRow {
  id: string
  label: string
  values: Record<string, number | null>
  details?: Record<string, string>
  sort?: Record<string, number>
  start?: string
  end?: string
  status?: string
  color?: string
}
export interface ReportGraph {
  title: string
  unit: GraphUnit
  kind?: 'bars' | 'columns' | 'line' | 'timeline' | 'donut' | 'waffle' | 'heatmap' | 'dumbbell' | 'scatter' | 'lollipop' | 'dot' | 'step'
  stacked?: boolean
  filterable?: boolean
  rows: ReportGraphRow[]
  series: Array<{ key: string; label: string; color: string; dotsOnly?: boolean; dashed?: boolean }>
  note?: string
  reference?: number
  center?: { value: string; label: string }
  unavailableReason?: string
}
export const GRAPH_COLORS = { paid: '#15803d', remaining: '#d97706', delivered: '#2563eb', pending: '#94a3b8', extra: '#9333ea', adjustment: '#be123c' }

export function graphNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}
/** Recorded observations exclude blanks/nulls; a recorded numeric zero remains meaningful. */
export function recordedMonthlyMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return readMonthlyMap(Object.fromEntries(Object.entries(value).filter(([, amount]) =>
    typeof amount === 'number' || typeof amount === 'string' && amount.trim() !== '')))
}
export function graphFormat(value: number | null, unit: GraphUnit) {
  return value == null ? 'Unavailable' : `${unit === 'PHP' ? '\u20b1' : ''}${value.toLocaleString('en-PH', { maximumFractionDigits: unit === '%' ? 1 : unit === 'PHP' ? 2 : 3 })}${unit === 'PHP' || unit === 'count' ? '' : ` ${unit}`}`
}
/** Keep exceptions visible instead of allowing a normal stack to disguise them. */
export function progressGraphRow(id: string | undefined, label: string, total: number | null, actual: number | null, remaining?: number | null): ReportGraphRow {
  const known = total != null && actual != null
  return { id: id || label, label, values: {
    applied: known ? Math.min(Math.max(actual, 0), Math.max(total, 0)) : null,
    remaining: known ? Math.max(0, remaining ?? total - actual) : null,
    excess: known ? Math.max(0, actual - total) : null,
    adjustment: actual != null ? Math.min(0, actual) : null,
    unallocated: !known ? actual : null,
  }, details: { 'Total / target': String(total ?? 'Unavailable'), Actual: String(actual ?? 'Unavailable'),
    Remaining: String(known ? remaining ?? total - actual : 'Unavailable'),
    Rate: known && total > 0 ? `${(actual / total * 100).toFixed(1)}%` : 'Unavailable',
    ...(!known ? { Notice: 'Total or actual unavailable; no completion percentage inferred.' } : {}),
    ...(known && (actual < 0 || actual > total || total < 0) ? { Exception: 'Adjustment or above-target amount; see exact values.' } : {}),
  }, sort: { contract: total ?? -Infinity, paid: actual ?? -Infinity, balance: remaining ?? (known ? total - actual : -Infinity) } }
}
export function progressGraph(title: string, unit: GraphUnit, rows: ReportGraphRow[], payment = false, filterable = false): ReportGraph {
  return { title, unit, rows, stacked: true, filterable, series: [
    { key: 'applied', label: payment ? 'Paid within contract' : 'Delivered within target', color: payment ? GRAPH_COLORS.paid : GRAPH_COLORS.delivered },
    { key: 'remaining', label: payment ? 'Remaining to pay' : 'Undelivered', color: payment ? GRAPH_COLORS.remaining : GRAPH_COLORS.pending },
    { key: 'excess', label: payment ? 'Above contract' : 'Above target', color: GRAPH_COLORS.extra },
    { key: 'adjustment', label: 'Negative adjustment', color: GRAPH_COLORS.adjustment },
    { key: 'unallocated', label: 'Known actual; total unavailable', color: '#64748b' },
  ], note: 'Bar segments show known amounts. Exact totals and rates are in the details. Above-target amounts and adjustments are shown separately; missing values are not zero.' }
}

export function milkProcurementRows(records: SbfpReportSourceRow[], getView: (id: string) => SbfpReportViewRow | null | undefined, year: number, asOfMonth: string, asOfYear = year) {
  return records.map((r, index) => {
    const view = getView(r.id || '')
    const target = graphNumber(view?.packs_to_deliver)
    const packsToDeliver = target != null && target > 0 ? target : graphNumber(r.packs_to_deliver)
    const monthly = readMonthlyMap(r.monthly_packs_delivered)
    const hasDeliveryEvidence = graphNumber(r.packs_delivered) != null || Object.keys(monthly).length > 0 ||
      (r.delivery_snapshots || []).some(snapshot => graphNumber(snapshot.packs) != null && !!toDateInputValue(snapshot.date))
    const delivered = graphNumber(view?.delivered_packs)
    let deliveredPacks = delivered != null && delivered > 0 ? delivered : hasDeliveryEvidence ? delivered ?? graphNumber(r.packs_delivered) ?? 0 : null
    if (asOfMonth !== 'ALL' && (hasDeliveryEvidence || deliveredPacks != null)) {
      const month = Number(asOfMonth)
      const lastDay = new Date(Date.UTC(asOfYear, month, 0)).getUTCDate()
      deliveredPacks = deliveredPacksInDateRange(r, `${year}-08-01`, `${asOfYear}-${String(month).padStart(2, '0')}-${lastDay}`, year)
    }
    const formatDate = (value: string | null | undefined) => {
      if (!value) return ''
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    }
    const start = formatDate(r.delivery_start), end = formatDate(r.delivery_end)
    const milk = view?.milk_type ?? milkTypeLabel(r.milk_type ?? '')
    return { r, index, status: officialSbfpStatusLabel(view?.procurement_status ?? r.procurement_status), packsToDeliver,
      deliveredPacks, balance: packsToDeliver != null && deliveredPacks != null ? Math.max(0, packsToDeliver - deliveredPacks) : null,
      packLabel: `${packsToDeliver == null ? 'Unavailable' : packsToDeliver.toLocaleString()}${milk ? ` (${milk})` : ''}`,
      schedule: start && end && start !== end ? `${start} to ${end}` : start || end }
  })
}

export function sbfpCluster(region?: string | null) {
  const r = (region || '').toUpperCase().trim()
  if (['NCR', 'NATIONAL CAPITAL REGION', 'CAR', 'CORDILLERA ADMINISTRATIVE REGION', 'I', 'II', 'III', 'IV-A', 'IVA', 'CALABARZON', 'IV-B', 'IVB', 'MIMAROPA', 'V'].includes(r)) return 'Luzon'
  if (['VI', 'VII', 'VIII', 'NIR'].includes(r)) return 'Visayas'
  if (['IX', 'X', 'XI', 'XII', 'XIII', 'CARAGA', 'BARMM'].includes(r)) return 'Mindanao'
  return 'Unassigned'
}
export function cdpGraphData(records: SbfpReportSourceRow[], year: number, from: number, to: number) {
  const names = ['Luzon', 'Visayas', 'Mindanao', 'Unassigned']
  const groups = names.map(cluster => ({ cluster, regions: new Set<string>(), beneficiaries: 0, coopIds: new Set<string>(), rawMilkLiters: 0, packs: 0, contractAmount: 0 }))
  const months = Array.from({ length: Math.abs(to - from) + 1 }, (_, index) => Math.min(from, to) + index)
  for (const r of records) {
    const lastDay = new Date(Date.UTC(year, Math.max(from, to), 0)).getUTCDate()
    const packs = deliveredPacksInDateRange(r, `${year}-${String(Math.min(from, to)).padStart(2, '0')}-01`, `${year}-${String(Math.max(from, to)).padStart(2, '0')}-${lastDay}`, year)
    if (packs <= 0) continue
    const group = groups[names.indexOf(sbfpCluster(r.region))]
    if (r.region) group.regions.add(r.region)
    group.beneficiaries += (Number(r.beneficiaries_pm) || 0) + (Number(r.beneficiaries_sm) || 0) + (Number(r.beneficiaries_cm) || 0)
    if (r.supplier_id) group.coopIds.add(r.supplier_id)
    group.packs += packs
    group.rawMilkLiters += rawMilkUtilizedLiters(packs)
    group.contractAmount += Number(r.contract_amount) || 0
  }
  const clusters = groups.filter(group => group.cluster !== 'Unassigned' || group.packs > 0).map(group => ({ ...group, region: [...group.regions].join(', '), coops: group.coopIds.size }))
  const trend: ReportGraphRow[] = months.map(month => {
    const values: Record<string, number | null> = Object.fromEntries(names.map(name => [name, null]))
    const coverage = Object.fromEntries(names.map(name => [name, { known: 0, total: 0 }]))
    for (const row of records) {
      const cluster = sbfpCluster(row.region)
      coverage[cluster].total++
      const monthly = recordedMonthlyMap(row.monthly_packs_delivered)
      const sameYearSnapshots = (row.delivery_snapshots || []).filter(snapshot => toDateInputValue(snapshot.date).startsWith(`${year}-`))
      const hasDated = sameYearSnapshots.some(snapshot => Number(toDateInputValue(snapshot.date).slice(5, 7)) === month)
      if (!Object.hasOwn(monthly, String(month)) && !hasDated) continue
      coverage[cluster].known++
      const amount = packsForMonth({ ...row, delivery_snapshots: sameYearSnapshots }, month, { year, allowLegacyFallback: false })
      values[cluster] = (values[cluster] ?? 0) + amount
    }
    return { id: `${year}-${month}`, label: `${year}-${String(month).padStart(2, '0')}`, values,
      details: Object.fromEntries(names.map(name => [`${name} coverage`, `${coverage[name].known} of ${coverage[name].total} contract(s) have a recorded observation; known amounts only`])) }
  })
  return { clusters, trend }
}
