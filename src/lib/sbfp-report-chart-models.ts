import type { CooperativePayments } from '@/lib/cooperative-payments'
import type { SbfpSenateMetrics } from '@/lib/sbfp-report-sync'
import { MAJOR_INDICATORS, HISTORICAL_ACCOMPLISHMENTS, HISTORICAL_SCHOOL_YEARS, resolveTarget, type MajorIndicatorKey, type MajorTargetsBySchoolYear, type MajorAccomplishmentMetrics } from '@/lib/sbfp-major-accomplishments'
import { GRAPH_COLORS, cdpGraphData, milkProcurementRows, graphFormat, progressGraph, progressGraphRow, graphNumber, recordedMonthlyMap, type GraphUnit, type ReportGraph, type ReportGraphRow } from '@/lib/sbfp-report-graphs'
import { toDateInputValue } from '@/lib/sbfp-raw-milk'

const PALETTE = ['#2563eb', '#15803d', '#9333ea', '#d97706', '#0891b2', '#be123c', '#64748b']
const RATE_SERIES = [{ key: 'delivery', label: 'Delivery rate', color: GRAPH_COLORS.delivered }, { key: 'payment', label: 'Disbursement rate', color: GRAPH_COLORS.paid }]
const RATE_NOTE = 'Delivery and disbursement are separate rates. Missing or zero denominators have no rate. Values above 100% and negative adjustments remain visible; timing differences do not establish lateness.'

function shareGraph(title: string, unit: GraphUnit, rows: ReportGraphRow[], center: ReportGraph['center']): ReportGraph {
  const total = rows.reduce((sum, row) => sum + (row.values.value ?? 0), 0)
  const invalid = rows.some(row => row.values.value == null || row.values.value < 0)
  return { title, unit, kind: 'donut', rows, center, series: [{ key: 'value', label: 'Amount', color: PALETTE[0] }],
    unavailableReason: invalid ? 'A share chart requires known, nonnegative amounts. Adjustments or unavailable figures are shown in the exact values instead.' : total <= 0 ? 'No positive total is available for a share chart.' : undefined }
}
function progressDonut(title: string, unit: GraphUnit, total: number, actual: number, remaining: number, payment = false): ReportGraph {
  const graph = shareGraph(title, unit, [
    { id: 'actual', label: payment ? 'Amount paid' : 'Delivered volume', values: { value: actual }, color: payment ? GRAPH_COLORS.paid : GRAPH_COLORS.delivered },
    { id: 'remaining', label: payment ? 'Remaining to pay' : 'Undelivered volume', values: { value: remaining }, color: payment ? GRAPH_COLORS.remaining : GRAPH_COLORS.pending },
  ], { value: total > 0 ? graphFormat(actual / total * 100, '%') : 'N/A', label: payment ? 'Paid' : 'Delivered' })
  if (actual > total || Math.abs(actual + remaining - total) > Math.max(0.01, Math.abs(total) * 1e-9)) {
    graph.unavailableReason = 'Actual and remaining amounts do not form a valid split of the total. Above-target amounts and adjustments are retained in the exact values; no slices are clamped.'
  }
  graph.note = `Total: ${graphFormat(total, unit)}. Actual: ${graphFormat(actual, unit)}. Remaining: ${graphFormat(remaining, unit)}.`
  return graph
}

export function overallGraphs(stats: { totalContractAmt: number; totalPaid: number; totalRemainingPay: number; totalContractedL: number; totalDeliveredL: number; totalUndeliveredL: number; totalValueDelivered: number }): ReportGraph[] {
  const delivery = progressDonut('Milk delivery progress', 'L', stats.totalContractedL, stats.totalDeliveredL, stats.totalUndeliveredL)
  delivery.note += ` Value of delivered milk (pro-rated contract): ${graphFormat(stats.totalValueDelivered, 'PHP')}. Payment and delivered value are separate measures. Volume conversion follows the report's milk-type calculations.`
  return [progressDonut('Contract payment progress', 'PHP', stats.totalContractAmt, stats.totalPaid, stats.totalRemainingPay, true), delivery]
}
export function implementationGraphs(payments: CooperativePayments, buckets: Array<{ label: string; sdoCount: number; contractAmt: number; undeliveredL: number }>, measure: 'sdoCount' | 'contractAmt' | 'undeliveredL'): ReportGraph[] {
  const rows = [...payments.rows].sort((a, b) => (b.contractAmount ?? -Infinity) - (a.contractAmount ?? -Infinity)).map(row => {
    const progress = progressGraphRow(row.id, row.name, row.contractAmount, row.paid, row.balance)
    return { ...progress, details: {
      ...progress.details,
      'Payment status': row.status, Centers: row.centers.join(', '), Contracts: String(row.contracts.length),
    },
    }
  })
  return [{ ...progressGraph('Cooperatives that received payment', 'PHP', rows, true, true),
    note: `Only cooperatives with positive net recorded payments. Delivery filters select contracts; payments include all recorded payment dates. Fully paid requires every selected contract to be settled. ${payments.unknownContractCount} cooperative(s) have missing contract amounts. ${payments.unassignedCount} paid contract(s) without an assigned cooperative total ${graphFormat(payments.unassignedPaid, 'PHP')} and are excluded from these bars.` },
  { title: `Implementation status — ${measure === 'sdoCount' ? 'SDOs' : measure === 'contractAmt' ? 'contracted amount' : 'undelivered volume'}`, kind: measure === 'sdoCount' ? 'waffle' : 'dot', unit: measure === 'contractAmt' ? 'PHP' : measure === 'undeliveredL' ? 'L' : 'count',
    rows: buckets.map((row, index) => ({ id: row.label, label: row.label, color: PALETTE[index % PALETTE.length], values: { value: row[measure] } })), series: [{ key: 'value', label: measure === 'sdoCount' ? 'Unique SDOs' : measure === 'contractAmt' ? 'Contracted amount' : 'Undelivered volume', color: '#6366f1' }],
    note: 'Each waffle square represents one unique SDO using the whole-SDO hierarchy status. Financial and volume selections use a dot plot and each contract’s own procurement status, matching the table.' }]
}
export function distributionGraphs(rows: Array<SbfpSenateMetrics & { label: string; beneficiaries: number; sdoCount: number }>, type: 'region' | 'center'): ReportGraph[] {
  const rates = rows.map(row => ({ id: row.label, label: row.label,
    values: { delivery: row.targetPacks > 0 ? row.pctDelivered : null, payment: row.contractAmt > 0 ? row.pctDisbursed : null },
    details: { 'Delivered / target packs': `${row.deliveredPacks.toLocaleString()} / ${row.targetPacks.toLocaleString()}`, 'Paid / contract': `${graphFormat(row.paidAmt, 'PHP')} / ${graphFormat(row.contractAmt, 'PHP')}` },
  }))
  if (type === 'center') return [
    { title: 'Delivery versus disbursement by center', kind: 'scatter', unit: '%', rows: rates, series: RATE_SERIES, reference: 100, note: RATE_NOTE },
    { title: 'Remaining payment by center', kind: 'lollipop', unit: 'PHP', rows: [...rows].sort((a, b) => b.remainingPay - a.remainingPay).map(row => ({ id: row.label, label: row.label, values: { value: row.remainingPay } })),
      series: [{ key: 'value', label: 'Remaining to pay', color: GRAPH_COLORS.remaining }], note: 'Signed balances are retained. A negative balance indicates an adjustment or above-contract payment, not a remaining obligation.' },
  ]
  return [{ title: 'Regional delivery and disbursement rates', kind: 'heatmap', unit: '%', rows: rates, series: RATE_SERIES, note: RATE_NOTE },
    { title: 'Contracted versus delivered volume by region', kind: 'dumbbell', unit: 'L', rows: rows.map(row => ({ id: row.label, label: row.label,
      values: { contracted: row.contractedL, delivered: row.deliveredL }, details: { Beneficiaries: row.beneficiaries.toLocaleString(), SDOs: String(row.sdoCount) } })),
      series: [{ key: 'contracted', label: 'Contracted volume', color: '#64748b' }, { key: 'delivered', label: 'Delivered volume', color: GRAPH_COLORS.delivered }],
      note: 'Both endpoints share one liters scale. The connecting line shows the difference; values above contract remain visible.' }]
}
export function contractGraphs(rows: Array<{ id: string; sdo: string; center: string; contractValue: number; contractedVolumeLiters: number; volumeDelivered: number; amountPaid: number }>): ReportGraph[] {
  const ordered = [...rows].sort((a, b) => b.contractValue - a.contractValue)
  const mapped = ordered.map(row => ({ id: row.id, label: `${row.sdo} / ${row.center}`, sort: { contract: row.contractValue, paid: row.amountPaid, balance: row.contractValue - row.amountPaid } }))
  return [{ title: 'Delivery and payment rates per contract', kind: 'heatmap', unit: '%', filterable: true,
    rows: ordered.map((row, index) => ({ ...mapped[index], values: { delivery: row.contractedVolumeLiters > 0 ? row.volumeDelivered / row.contractedVolumeLiters * 100 : null, payment: row.contractValue > 0 ? row.amountPaid / row.contractValue * 100 : null } })),
    series: RATE_SERIES, note: RATE_NOTE },
  { title: 'Contract amount versus paid per contract', kind: 'dumbbell', unit: 'PHP', filterable: true,
    rows: ordered.map((row, index) => ({ ...mapped[index], values: { contracted: row.contractValue, paid: row.amountPaid } })),
    series: [{ key: 'contracted', label: 'Contracted amount', color: '#64748b' }, { key: 'paid', label: 'Amount paid', color: GRAPH_COLORS.paid }],
    note: 'Original, Add, Lot and milk-type contracts remain separate. Both charts use the same search, order and row limit. Amounts follow the Contract & Delivery Details table.' }]
}
export function majorGraphs(live: Record<string, MajorAccomplishmentMetrics>, targets: MajorTargetsBySchoolYear, indicator: MajorIndicatorKey, selectedYear: string, national: boolean, cutoff = ''): ReportGraph[] {
  const years = [...new Set([...(national ? HISTORICAL_SCHOOL_YEARS : []), ...Object.keys(live)])].sort()
  const metric = MAJOR_INDICATORS.find(item => item.key === indicator)!
  const unit = indicator === 'gross_income' ? 'PHP' : indicator === 'contracted_volume_liters' ? 'L' : indicator === 'milk_packs' ? 'packs' : 'count'
  const actual = (sy: string, key: MajorIndicatorKey) => {
    if (national && HISTORICAL_ACCOMPLISHMENTS[sy]) return HISTORICAL_ACCOMPLISHMENTS[sy][key]
    // The existing live calculation uses the stored calendar year, starting January 1.
    if (cutoff && cutoff < `${sy.slice(0, 4)}-01-01`) return null
    return live[sy]?.[key] ?? null
  }
  return [{ title: `School-year accomplishments - ${metric.label}`, kind: 'line', unit, rows: years.map(sy => {
    const historical = national && !!HISTORICAL_ACCOMPLISHMENTS[sy]
    return { id: sy, label: sy, values: { target: national ? resolveTarget(targets, sy, indicator) ?? null : null,
      annual: historical ? actual(sy, indicator) : null, live: historical ? null : actual(sy, indicator) },
    details: { Scope: national ? 'National' : 'Assigned center; national targets not comparable', Source: historical ? 'Official historical annual figures' : `Live / incomplete as of ${cutoff || 'selected cutoff'}; not an official annual total` } }
  }), series: [{ key: 'target', label: 'Target', color: '#64748b', dashed: true }, { key: 'annual', label: 'Official annual accomplishment', color: '#2563eb' }, { key: 'live', label: 'Live accomplishment (incomplete)', color: '#9333ea', dotsOnly: true }],
    note: 'Official annual figures are connected only across observed historical years. Live values are separate points, not completed annual trends; future actuals are unavailable. This tab uses its own dataset and cutoff.' },
  { title: `Target attainment - SY ${selectedYear}`, kind: 'dot', unit: '%', rows: MAJOR_INDICATORS.map(item => {
    const target = national ? resolveTarget(targets, selectedYear, item.key) : null
    const value = actual(selectedYear, item.key)
    return { id: item.key, label: item.label, values: { attainment: value != null && target != null && target > 0 ? value / target * 100 : null }, details: {
      Target: target == null ? 'Unavailable / scope mismatch' : String(target), Accomplishment: value == null ? 'Unavailable' : String(value), Source: national && HISTORICAL_ACCOMPLISHMENTS[selectedYear] ? 'Official annual figures' : `Live / incomplete as of ${cutoff || 'selected cutoff'}`,
    } }
  }), series: [{ key: 'attainment', label: 'Target attainment', color: '#2563eb' }], reference: 100,
    note: national ? '100% marks the target. Live attainment is provisional through the selected cutoff. Above-target attainment remains visible. Missing or zero targets have no percentage.' : 'National targets cannot be compared with assigned-center accomplishments; attainment is unavailable.' }]
}

export function milkGraphs(rows: ReturnType<typeof milkProcurementRows>, range: { year: number; from: string; to: string }): ReportGraph[] {
  const events = new Map<string, { packs: number; monthly: number; dated: number }>()
  let observed = 0, omittedMonthly = 0, omittedSnapshots = 0
  for (const { r } of rows) {
    let included = false
    const snapshots = (r.delivery_snapshots || []).filter(item => toDateInputValue(item.date))
    const add = (date: string, packs: number, monthly: boolean) => {
      if (date < range.from || date > range.to) return
      const event = events.get(date) ?? { packs: 0, monthly: 0, dated: 0 }
      event.packs += packs
      event[monthly ? 'monthly' : 'dated']++
      events.set(date, event)
      included = true
    }
    if (snapshots.length) {
      // Snapshots are delivery tranches, not cumulative readings; exclude monthly mirrors.
      for (const item of snapshots) {
        const packs = graphNumber(item.packs)
        if (packs != null && packs >= 0) add(toDateInputValue(item.date), packs, false)
        else omittedSnapshots++
      }
    } else {
      for (const [monthText, packs] of Object.entries(recordedMonthlyMap(r.monthly_packs_delivered))) {
        const month = Number(monthText)
        if (!Number.isInteger(month) || month < 1 || month > 12 || packs < 0) continue
        const start = `${range.year}-${String(month).padStart(2, '0')}-01`
        const end = new Date(Date.UTC(range.year, month, 0)).toISOString().slice(0, 10)
        if (start >= range.from && end <= range.to) add(end, packs, true)
        else if (start <= range.to && end >= range.from) omittedMonthly++
      }
    }
    if (included) observed++
  }
  let cumulative = 0
  const history = [...events].sort(([a], [b]) => a.localeCompare(b)).map(([date, event]) => {
    cumulative += event.packs
    return { id: date, label: date, values: { cumulative }, details: { 'Observed increment': graphFormat(event.packs, 'packs'), Resolution: `${event.dated} dated tranche(s); ${event.monthly} calendar-month total(s) placed at period end` } }
  })
  const knownTargets = rows.every(row => row.packsToDeliver != null)
  return [{ title: 'Cumulative recorded deliveries', kind: 'step', unit: 'packs', rows: history,
    series: [{ key: 'cumulative', label: 'Cumulative observed packs', color: GRAPH_COLORS.delivered }],
    reference: rows.length && knownTargets ? rows.reduce((sum, row) => sum + row.packsToDeliver!, 0) : undefined,
    note: `${range.from} through ${range.to}. Full filtered scope; contract search and Top N apply only to the schedule. ${observed} of ${rows.length} contracts have observations in this range. Dated snapshots take precedence over monthly maps for the entire contract, matching the report calculation. ${omittedSnapshots} snapshot(s) with unavailable or negative packs omitted. Monthly-only totals appear at month end; ${omittedMonthly} partial-month total(s) omitted because exact dates are unknown. Legacy current totals are not converted into history. The reference is the current full contract target, not a historical target; ${knownTargets ? 'all targets known' : 'reference unavailable because some targets are missing'}. This observed subtotal may differ from table totals that include legacy estimates.` },
  { title: 'Saved delivery schedule', kind: 'timeline', unit: 'count', filterable: true, series: [],
    rows: rows.map(({ r, index, status, packsToDeliver, deliveredPacks, balance }) => ({ ...progressGraphRow(r.id || `row-${index}`, `${r.sdo} / ${r.center || 'Unassigned center'}`, packsToDeliver, deliveredPacks, balance), start: toDateInputValue(r.delivery_start), end: toDateInputValue(r.delivery_end), status })),
    note: 'Saved procurement schedules are not actual delivery histories. Missing or reversed dates are listed separately.' }]
}

export type CdpGraphMeasure = 'packs' | 'beneficiaries' | 'coops' | 'rawMilkLiters' | 'contractAmount'
export function cdpGraphs(data: ReturnType<typeof cdpGraphData>, measure: CdpGraphMeasure): ReportGraph[] {
  const labels = { packs: 'Delivered packs', beneficiaries: 'Beneficiaries', coops: 'Cooperatives', rawMilkLiters: 'Raw milk used', contractAmount: 'Contracted amount' }
  const unit = measure === 'contractAmount' ? 'PHP' : measure === 'rawMilkLiters' ? 'L' : measure === 'packs' ? 'packs' : 'count'
  const rows = data.clusters.map((row, index) => ({ id: row.cluster, label: row.cluster, values: { value: row[measure] }, color: PALETTE[index % PALETTE.length] }))
  const shares: ReportGraph = measure === 'coops'
    ? { title: 'Cooperative counts by cluster', kind: 'lollipop', unit, rows, series: [{ key: 'value', label: labels[measure], color: '#2563eb' }] }
    : shareGraph(`Cluster share - ${labels[measure]}`, unit, rows, { value: graphFormat(rows.reduce((sum, row) => sum + row.values.value, 0), unit), label: 'Total in scope' })
  shares.note = 'Unassigned regions remain visible. Cooperatives may participate in multiple clusters, so cooperative counts are separate and never treated as additive shares or a national distinct count. Beneficiary shares follow the CDP table contract-based totals.'
  return [shares,
  { title: 'Recorded monthly deliveries by cluster', kind: 'line', unit: 'packs', rows: data.trend,
    series: ['Luzon', 'Visayas', 'Mindanao', 'Unassigned'].map((key, index) => ({ key, label: key, color: ['#2563eb', '#15803d', '#9333ea', '#64748b'][index] })),
    note: 'Gaps indicate no explicit monthly entry or dated delivery in that calendar month. Cluster totals can also include legacy delivery-start fallback; those amounts are not invented as monthly observations.' }]
}
