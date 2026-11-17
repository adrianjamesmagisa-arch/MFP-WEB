import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { load } from './helpers/load-typescript.mjs'

const graphs = load('src/lib/sbfp-report-graphs.ts')
const models = load('src/lib/sbfp-report-chart-models.ts')
const { summarizeCooperativePayments } = load('src/lib/cooperative-payments.ts')
const { emptySbfpSenateMetrics } = load('src/lib/sbfp-report-sync.ts')
const css = new Proxy({}, { get: (_, key) => String(key) })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) : [node.props?.children].flat(Infinity).map(text).join(' ')
function hooks(initial = {}) {
  const values = []
  let cursor = 0
  const react = { ...React,
    useState(value) { const index = cursor++; if (!(index in values)) values[index] = Object.hasOwn(initial, index) ? initial[index] : typeof value === 'function' ? value() : value
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next }] },
    useMemo: fn => fn(), useCallback: fn => fn, useEffect() {},
  }
  return { react, render(component, props) { cursor = 0; return component(props) } }
}

test('progress bars preserve exact balances, unavailable totals, overpayments and negative adjustments', () => {
  assert.equal(graphs.progressGraphRow('one', 'One', 100, 25).values.remaining, 75)
  const missing = graphs.progressGraphRow('missing', 'Missing', null, 25)
  assert.equal(missing.values.remaining, null)
  assert.equal(missing.values.unallocated, 25)
  assert.equal(missing.details.Rate, 'Unavailable')
  const over = graphs.progressGraphRow('over', 'Over', 100, 120, -20)
  assert.equal(over.values.applied, 100)
  assert.equal(over.values.excess, 20)
  assert.equal(over.values.remaining, 0)
  assert.equal(over.details.Remaining, '-20')
  assert.equal(over.details.Rate, '120.0%')
  assert.equal(graphs.progressGraphRow('refund', 'Refund', 100, -10).values.adjustment, -10)
  assert.equal(graphs.progressGraphRow('zero', 'Zero', 0, 0).details.Rate, 'Unavailable')
})

test('cooperative graph retains supplier identities, positive-payment membership and contract-level settlement status', () => {
  const records = [
    { id: 'a', supplier_id: 'one', cooperatives: { name: 'Same name' }, contract_amount: 100, payment_entries: [{ amount: 150 }] },
    { id: 'b', supplier_id: 'one', contract_amount: 100, payment_entries: [{ amount: 50 }] },
    { id: 'c', supplier_id: 'two', cooperatives: { name: 'Same name' }, contract_amount: 100, payment_entries: [{ amount: 10 }] },
    { id: 'd', supplier_id: 'three', contract_amount: 100, payment_entries: [] },
    { id: 'e', payment_entries: [{ amount: 20 }] },
  ]
  const summary = summarizeCooperativePayments(records)
  const pair = models.implementationGraphs(summary, [{ label: 'Completed', sdoCount: 2, contractAmt: 300, undeliveredL: 0 }], 'sdoCount')
  assert.equal(pair.length, 2)
  assert.deepEqual(pair[0].rows.map(row => row.id), ['one', 'two'])
  assert.equal(pair[0].rows[0].details['Payment status'], 'Partially paid')
  assert.match(pair[0].note, /20/)
  assert.equal(pair[1].rows[0].values.value, 2)
})

test('overall, distribution and contract graph pairs match source summaries and keep units and rows separate', () => {
  const pair = models.overallGraphs({ totalContractAmt: 100, totalPaid: 25, totalRemainingPay: 75, totalContractedL: 50, totalDeliveredL: 20, totalUndeliveredL: 30, totalValueDelivered: 40 })
  assert.equal(pair[0].unit, 'PHP'); assert.equal(pair[1].unit, 'L')
  assert.equal(pair[0].rows[0].values.applied, 25)
  assert.match(pair[1].note, /40/)
  const distribution = models.distributionGraphs([{ ...emptySbfpSenateMetrics(), label: 'VIII', beneficiaries: 10, sdoCount: 1 }], 'region')
  assert.equal(distribution[1].rows[0].values.delivery, null)
  assert.equal(distribution[1].rows[0].values.payment, null)
  const contracts = models.contractGraphs(['original', 'add'].map((id, index) => ({ id, sdo: index ? 'Baybay City Add 1 - PM' : 'Baybay City - PM', center: 'VSU', contractValue: index ? 50 : 100, contractedVolumeLiters: 20, volumeDelivered: 5, amountPaid: 25 })))
  assert.deepEqual(contracts[0].rows.map(row => row.id), contracts[1].rows.map(row => row.id))
  assert.equal(contracts[0].rows.length, 2)
  assert.match(contracts[1].rows[1].label, /Add 1/)
})

test('procurement table and chart share cutoff-year calculations without borrowing January from the wrong year', () => {
  const rows = [{ id: 'p', sdo: 'Division - PM', delivery_start: '2026-08-01', delivery_end: '2027-04-30', packs_to_deliver: 100,
    delivery_snapshots: [{ date: '2026-01-15', packs: 99 }, { date: '2026-08-15', packs: 30 }, { date: '2027-01-15', packs: 20 }] }]
  const getView = () => ({ packs_to_deliver: 100, delivered_packs: 50 })
  const december = graphs.milkProcurementRows(rows, getView, 2026, '12', 2026)
  assert.equal(december[0].deliveredPacks, 30)
  assert.equal(graphs.milkProcurementRows(rows, getView, 2026, '1', 2027)[0].deliveredPacks, 50)
  assert.equal(graphs.milkProcurementRows(rows, getView, 2026, '1', 2026)[0].deliveredPacks, 0)
  const pair = models.milkGraphs(december)
  assert.equal(pair[0].rows[0].values.applied, december[0].deliveredPacks)
  assert.equal(pair[1].rows[0].start, '2026-08-01')
  assert.equal(pair[1].kind, 'timeline')
})

test('procurement keeps absent packs unavailable even when the normalized view supplies zero defaults', () => {
  const missing = graphs.milkProcurementRows([{ id: 'missing' }], () => ({ packs_to_deliver: 0, delivered_packs: 0 }), 2026, 'ALL')[0]
  assert.equal(missing.packsToDeliver, null)
  assert.equal(missing.deliveredPacks, null)
  assert.equal(missing.balance, null)
  assert.match(missing.packLabel, /Unavailable/)
  const zero = graphs.milkProcurementRows([{ id: 'zero', packs_to_deliver: 0, packs_delivered: 0 }], () => ({ packs_to_deliver: 0, delivered_packs: 0 }), 2026, 'ALL')[0]
  assert.equal(zero.packsToDeliver, 0)
  assert.equal(zero.deliveredPacks, 0)
  assert.equal(zero.balance, 0)
  const knownTarget = graphs.milkProcurementRows([{ id: 'target', packs_to_deliver: 100 }], () => ({ packs_to_deliver: 100, delivered_packs: 0 }), 2026, 'ALL')[0]
  assert.equal(knownTarget.deliveredPacks, null)
  assert.equal(knownTarget.balance, null)
})

test('CDP graph data retains unassigned regions and explicit zero months without inventing missing observations', () => {
  const data = graphs.cdpGraphData([
    { id: 'one', region: 'III', monthly_packs_delivered: { 8: 10, 9: 0 }, contract_amount: 250, supplier_id: 'same' },
    { id: 'two', region: 'VIII', monthly_packs_delivered: { 8: 20 }, supplier_id: 'same' },
    { id: 'unknown', region: 'not mapped', monthly_packs_delivered: { 8: 5 } },
  ], 2026, 8, 10)
  assert.equal(data.clusters.find(row => row.cluster === 'Unassigned').packs, 5)
  assert.equal(data.trend[1].values.Luzon, 0)
  assert.equal(data.trend[1].values.Visayas, null)
  assert.equal(data.trend[2].values.Luzon, null)
  assert.equal(data.clusters.reduce((sum, row) => sum + row.packs, 0), 35)
  assert.equal(models.cdpGraphs(data, 'contractAmount')[0].unit, 'PHP')
  const wrongYear = graphs.cdpGraphData([{ region: 'III', delivery_snapshots: [{ date: '2027-08-01', packs: 10 }] }], 2026, 8, 8)
  assert.equal(wrongYear.trend[0].values.Luzon, null)
})

test('accomplishment graphs keep national targets away from center-only data and retain above-target attainment', () => {
  const actual = { milk_packs: 120, beneficiaries: 20, assisted_coops: 1, gross_income: 100, contracted_volume_liters: 10, sdo_count: 2 }
  const targets = { '2026-2027': { milk_packs: 100, beneficiaries: 0 } }
  const national = models.majorGraphs({ '2026-2027': actual }, targets, 'milk_packs', '2026-2027', true)
  assert.equal(national[0].unit, 'packs')
  assert.equal(national[0].kind, 'columns')
  assert.equal(national[1].rows[0].values.attainment, 120)
  assert.equal(national[1].rows[1].values.attainment, null)
  const center = models.majorGraphs({ '2026-2027': actual }, targets, 'gross_income', '2026-2027', false)
  assert.equal(center[0].unit, 'PHP')
  assert.equal(center[0].rows.length, 1)
  assert.equal(center[0].rows[0].values.target, null)
  assert.ok(center[1].rows.every(row => row.values.attainment === null))
})

test('graph layout replaces tables, exposes underlying data, and filters paired contracts consistently', () => {
  const host = hooks()
  const { SbfpReportGraphView } = load('src/components/SbfpReportGraphs.tsx', { react: host.react, './SbfpReportGraphs.module.css': css })
  const pair = models.contractGraphs(['a', 'b'].map((id, index) => ({ id, sdo: `School ${id}`, center: 'VSU', contractValue: 100 - index, contractedVolumeLiters: 20, volumeDelivered: 5, amountPaid: 25 })))
  const props = { enabled: false, graphs: pair, scope: 'Fixture scope', children: React.createElement('table', { id: 'underlying' }) }
  assert.ok(nodes(host.render(SbfpReportGraphView, props)).some(node => node.type === 'table'))
  props.enabled = true
  let tree = nodes(host.render(SbfpReportGraphView, props))
  assert.ok(!tree.some(node => node.type === 'table'))
  const input = tree.find(node => node.type === 'input')
  input.props.onChange({ target: { value: 'School b' } })
  tree = nodes(host.render(SbfpReportGraphView, props))
  const cards = tree.filter(node => node.type?.name === 'GraphCard')
  assert.equal(cards.length, 2)
  assert.deepEqual(cards.map(node => node.props.rows.map(row => row.id)), [['b'], ['b']])
  tree.find(node => node.type === 'button' && text(node).includes('View underlying data')).props.onClick()
  assert.ok(nodes(host.render(SbfpReportGraphView, props)).some(node => node.type === 'table'))
})

test('the actual SBFP report keeps one global graph mode across tabs 1–8 and leaves masterlist and progress report outside it', () => {
  const host = hooks({ 0: [], 1: false, 2: '2026' })
  const { default: Report } = load('src/app/(app)/reports/sbfp-narrative/page.tsx', {
    react: host.react,
    '@/lib/supabase/client': { createClient: () => ({ from() { throw new Error('Graph navigation must not mutate the database') } }) },
    '@/components/SbfpAiAgent': { SbfpAiAgent: () => null },
    './CooperativePaymentSummary.module.css': css, './SbfpReportGraphs.module.css': css,
  })
  const render = () => nodes(host.render(Report))
  render().find(node => node.type?.name === 'SbfpGraphModeToggle').props.onChange(true)
  for (let tab = 1; tab <= 8; tab++) {
    render().find(node => node.type === 'button' && text(node).trim().startsWith(`${tab}.`)).props.onClick()
    const wrapper = render().find(node => node.type?.name === 'SbfpReportGraphView')
    assert.ok(wrapper, `Tab ${tab}`)
    assert.equal(wrapper.props.enabled, true)
    assert.equal(wrapper.props.graphs.length, 2, `Tab ${tab}`)
  }
  render().find(node => node.type?.name === 'SbfpGraphModeToggle').props.onChange(false)
  assert.equal(render().find(node => node.type?.name === 'SbfpReportGraphView').props.enabled, false)
  render().find(node => node.type === 'button' && text(node).includes('SDO Masterlist')).props.onClick()
  assert.ok(!render().some(node => node.type?.name === 'SbfpReportGraphView'))
})
