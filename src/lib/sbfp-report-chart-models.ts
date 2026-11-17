import type { CooperativePayments } from '@/lib/cooperative-payments'
import type { SbfpSenateMetrics } from '@/lib/sbfp-report-sync'
import { MAJOR_INDICATORS, HISTORICAL_ACCOMPLISHMENTS, HISTORICAL_SCHOOL_YEARS, resolveTarget, type MajorIndicatorKey, type MajorTargetsBySchoolYear, type MajorAccomplishmentMetrics } from '@/lib/sbfp-major-accomplishments'
import { GRAPH_COLORS, cdpGraphData, milkProcurementRows, graphFormat, progressGraph, progressGraphRow, type ReportGraph, type ReportGraphRow } from '@/lib/sbfp-report-graphs'
import { toDateInputValue } from '@/lib/sbfp-raw-milk'

export function overallGraphs(stats: { totalContractAmt: number; totalPaid: number; totalRemainingPay: number; totalContractedL: number; totalDeliveredL: number; totalUndeliveredL: number; totalValueDelivered: number }): ReportGraph[] {
  return [progressGraph('Contract payment progress', 'PHP', [progressGraphRow('payment', 'All selected contracts', stats.totalContractAmt, stats.totalPaid, stats.totalRemainingPay)], true),
    { ...progressGraph('Milk delivery progress', 'L', [progressGraphRow('delivery', 'All selected contracts', stats.totalContractedL, stats.totalDeliveredL, stats.totalUndeliveredL)]),
      note: `Value of delivered milk (pro-rated contract): ${graphFormat(stats.totalValueDelivered, 'PHP')}. This is not the amount paid. Volume conversion follows the report's milk-type calculations.` }]
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
  { title: `Implementation status — ${measure === 'sdoCount' ? 'SDOs' : measure === 'contractAmt' ? 'contracted amount' : 'undelivered volume'}`, unit: measure === 'contractAmt' ? 'PHP' : measure === 'undeliveredL' ? 'L' : 'count',
    rows: buckets.map(row => ({ id: row.label, label: row.label, values: { value: row[measure] } })), series: [{ key: 'value', label: measure === 'sdoCount' ? 'Unique SDOs' : measure === 'contractAmt' ? 'Contracted amount' : 'Undelivered volume', color: '#6366f1' }],
    note: 'SDO counts use the whole-SDO hierarchy status, counting each SDO once. Financial and volume measures follow each contract’s own procurement status, matching the table.' }]
}
export function distributionGraphs(rows: Array<SbfpSenateMetrics & { label: string; beneficiaries: number; sdoCount: number }>, type: 'region' | 'center'): ReportGraph[] {
  const ordered = type === 'center' ? [...rows].sort((a, b) => b.contractedL - a.contractedL) : rows
  const rates = type === 'center' ? [...rows].sort((a, b) => a.pctDelivered - b.pctDelivered) : rows
  return [progressGraph(`Delivery volume by ${type}`, 'L', ordered.map(row => ({ ...progressGraphRow(row.label, row.label, row.contractedL, row.deliveredL, row.undeliveredL),
    details: { Beneficiaries: row.beneficiaries.toLocaleString(), SDOs: String(row.sdoCount), 'Contracted amount': graphFormat(row.contractAmt, 'PHP') } }))),
    { title: `Delivery versus disbursement rates by ${type}`, unit: '%', rows: rates.map(row => ({ id: row.label, label: row.label,
      values: { delivery: row.targetPacks > 0 ? row.pctDelivered : null, payment: row.contractAmt > 0 ? row.pctDisbursed : null },
      details: { 'Delivered / target packs': `${row.deliveredPacks.toLocaleString()} / ${row.targetPacks.toLocaleString()}`, 'Paid / contract': `${graphFormat(row.paidAmt, 'PHP')} / ${graphFormat(row.contractAmt, 'PHP')}` } })),
      series: [{ key: 'delivery', label: 'Delivery rate', color: GRAPH_COLORS.delivered }, { key: 'payment', label: 'Disbursement rate', color: GRAPH_COLORS.paid }], reference: 100,
      note: 'Delivery rate uses packs; disbursement rate uses payments divided by contracted amount. Rates are separate measures and are not added. Missing or zero denominators have no rate.' }]
}
export function contractGraphs(rows: Array<{ id: string; sdo: string; center: string; contractValue: number; contractedVolumeLiters: number; volumeDelivered: number; amountPaid: number }>): ReportGraph[] {
  const ordered = [...rows].sort((a, b) => b.contractValue - a.contractValue)
  const delivery: ReportGraphRow[] = [], payment: ReportGraphRow[] = []
  ordered.forEach(row => {
    const label = `${row.sdo} · ${row.center}`
    const sort = { contract: row.contractValue, paid: row.amountPaid, balance: row.contractValue - row.amountPaid }
    delivery.push({ ...progressGraphRow(row.id, label, row.contractedVolumeLiters, row.volumeDelivered), sort })
    payment.push({ ...progressGraphRow(row.id, label, row.contractValue, row.amountPaid), sort })
  })
  return [progressGraph('Delivery progress per contract', 'L', delivery, false, true), progressGraph('Payment progress per contract', 'PHP', payment, true, true)]
}
export function majorGraphs(live: Record<string, MajorAccomplishmentMetrics>, targets: MajorTargetsBySchoolYear, indicator: MajorIndicatorKey, selectedYear: string, national: boolean): ReportGraph[] {
  const years = [...(national ? HISTORICAL_SCHOOL_YEARS : []), ...Object.keys(live)]
  const metric = MAJOR_INDICATORS.find(item => item.key === indicator)!
  const unit = indicator === 'gross_income' ? 'PHP' : indicator === 'contracted_volume_liters' ? 'L' : indicator === 'milk_packs' ? 'packs' : 'count'
  const actual = (sy: string, key: MajorIndicatorKey) => (HISTORICAL_ACCOMPLISHMENTS[sy] ?? live[sy])?.[key] ?? null
  return [{ title: `Target versus accomplishment — ${metric.label}`, kind: 'columns', unit, rows: years.map(sy => ({ id: sy, label: sy, values: {
    target: national ? resolveTarget(targets, sy, indicator) ?? null : null, actual: actual(sy, indicator),
  }, details: { Scope: national ? 'National' : 'Assigned center; national targets not comparable', Source: HISTORICAL_ACCOMPLISHMENTS[sy] ? 'Official historical figures' : 'Live SBFP accomplishments through selected cutoff' } })),
    series: [{ key: 'target', label: 'Target', color: '#cbd5e1' }, { key: 'actual', label: 'Accomplishment', color: '#2563eb' }],
    note: 'Select one indicator to keep units separate. Historical school years use official national figures. Regional, status, month and search filters from other tabs do not apply to this accomplishments dataset.' },
  { title: `Target attainment — SY ${selectedYear}`, unit: '%', rows: MAJOR_INDICATORS.map(item => {
    const target = national ? resolveTarget(targets, selectedYear, item.key) : null
    const value = actual(selectedYear, item.key)
    return { id: item.key, label: item.label, values: { attainment: value != null && target != null && target > 0 ? value / target * 100 : null }, details: {
      Target: target == null ? 'Unavailable / scope mismatch' : String(target), Accomplishment: value == null ? 'Unavailable' : String(value),
    } }
  }), series: [{ key: 'attainment', label: 'Target attainment', color: '#2563eb' }], reference: 100,
    note: national ? '100% marks the target. Above-target attainment remains visible. Missing or zero targets have no percentage.' : 'National targets cannot be compared with assigned-center accomplishments; attainment is unavailable.' }]
}

export function milkGraphs(rows: ReturnType<typeof milkProcurementRows>): ReportGraph[] {
  const progress = rows.map(({ r, index, packsToDeliver, deliveredPacks, balance }) => progressGraphRow(r.id || `row-${index}`, `${r.sdo} · ${r.center || 'Unassigned center'}`, packsToDeliver, deliveredPacks, balance))
  return [progressGraph('Milk-pack fulfillment per contract', 'packs', progress, false, true),
    { title: 'Saved delivery schedule', kind: 'timeline', unit: 'count', filterable: true, series: [],
      rows: rows.map(({ r, status }, index) => ({ ...progress[index], start: toDateInputValue(r.delivery_start), end: toDateInputValue(r.delivery_end), status })),
      note: 'Saved procurement schedules are not actual delivery histories. Missing or reversed dates are listed separately.' }]
}

export type CdpGraphMeasure = 'packs' | 'beneficiaries' | 'coops' | 'rawMilkLiters' | 'contractAmount'
export function cdpGraphs(data: ReturnType<typeof cdpGraphData>, measure: CdpGraphMeasure): ReportGraph[] {
  const labels = { packs: 'Delivered packs', beneficiaries: 'Beneficiaries', coops: 'Cooperatives', rawMilkLiters: 'Raw milk used', contractAmount: 'Contracted amount' }
  return [{ title: `Cluster comparison — ${labels[measure]}`, unit: measure === 'contractAmount' ? 'PHP' : measure === 'rawMilkLiters' ? 'L' : measure === 'packs' ? 'packs' : 'count',
    rows: data.clusters.map(row => ({ id: row.cluster, label: row.cluster, values: { value: row[measure] } })), series: [{ key: 'value', label: labels[measure], color: '#2563eb' }],
    note: 'Cooperatives may participate in multiple clusters; cluster counts are not a national distinct-cooperative count. Unassigned regions remain visible.' },
  { title: 'Recorded monthly deliveries by cluster', kind: 'line', unit: 'packs', rows: data.trend,
    series: ['Luzon', 'Visayas', 'Mindanao', 'Unassigned'].map((key, index) => ({ key, label: key, color: ['#2563eb', '#15803d', '#9333ea', '#64748b'][index] })),
    note: 'Gaps indicate no explicit monthly entry or dated delivery in that calendar month. Cluster totals can also include legacy delivery-start fallback; those amounts are not invented as monthly observations.' }]
}
