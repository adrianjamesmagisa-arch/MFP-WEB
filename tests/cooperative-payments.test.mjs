import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const { summarizeCooperativePayments, cooperativePaymentsCsv } = load('src/lib/cooperative-payments.ts')
const contract = (overrides = {}) => ({ id: 'one', supplier_id: 'coop-one', cooperatives: { name: 'First Cooperative' },
  center: 'VSU', sdo: 'Baybay City - PM', contract_amount: 100, payment_entries: [{ date: '2026-10-01', amount: 25 }], ...overrides })

test('counts each cooperative once across centers, SDOs, lots, and additional contracts', () => {
  const summary = summarizeCooperativePayments([
    contract(), contract({ id: 'two', sdo: 'Baybay City Add 1 - PM', payment_entries: [{ amount: 75 }] }),
    contract({ id: 'three', center: 'CLSU', sdo: 'Aurora - SM', payment_entries: [] }),
  ])
  assert.equal(summary.paidCount, 1)
  assert.equal(summary.rows[0].contracts.length, 3)
  assert.equal(summary.rows[0].sdoCount, 2)
  assert.deepEqual(summary.rows[0].centers, ['CLSU', 'VSU'])
  assert.equal(summary.rows[0].paid, 100)
  assert.equal(summary.rows[0].contractAmount, 300)
  assert.equal(summary.rows[0].balance, 200)
  assert.equal(summary.rows[0].status, 'Partially paid')
})

test('payment entries, not procurement completion or payment status text, determine who received money', () => {
  const summary = summarizeCooperativePayments([
    contract({ id: 'completed', supplier_id: 'unpaid', procurement_status: 'Completed', status_of_payment: 'Paid', payment_entries: [] }),
    contract({ id: 'prep', procurement_status: 'For Preparation', payment_entries: [{ amount: 100 }] }),
    contract({ id: 'zero', supplier_id: 'zero', payment_entries: [{ amount: 0 }] }),
  ])
  assert.equal(summary.paidCount, 1)
  assert.equal(summary.rows[0].id, 'coop-one')
  assert.equal(summary.fullyPaidCount, 1)
  assert.equal(summary.totalPaid, 100)
})

test('fully paid requires every selected contract to be settled without cross-contract cancellation', () => {
  const summary = summarizeCooperativePayments([
    contract({ payment_entries: [{ amount: 150 }] }),
    contract({ id: 'two', payment_entries: [{ amount: 50 }] }),
  ])
  assert.equal(summary.rows[0].balance, 0)
  assert.equal(summary.rows[0].status, 'Partially paid')
  assert.equal(summary.partiallyPaidCount, 1)
  const full = summarizeCooperativePayments([
    contract({ payment_entries: [{ amount: 150 }] }), contract({ id: 'two', payment_entries: [{ amount: 100 }] }),
  ])
  assert.equal(full.fullyPaidCount, 1)
  assert.equal(full.rows[0].balance, -50)
})

test('unknown contract amounts and unassigned payments stay visible without inventing a cooperative', () => {
  const summary = summarizeCooperativePayments([
    contract({ contract_amount: null }), contract({ id: 'missing', supplier_id: null, payment_entries: [{ amount: 10 }] }),
  ])
  assert.equal(summary.paidCount, 1)
  assert.equal(summary.unknownContractCount, 1)
  assert.equal(summary.rows[0].contractAmount, null)
  assert.equal(summary.rows[0].balance, null)
  assert.equal(summary.unassignedCount, 1)
  assert.equal(summary.unassignedPaid, 10)
  assert.equal(summary.totalPaid, 35)
})

test('supplier IDs keep identically named cooperatives distinct; missing names do not discard paid cooperatives', () => {
  const summary = summarizeCooperativePayments([
    contract(), contract({ id: 'two', supplier_id: 'other' }),
    contract({ id: 'three', supplier_id: 'unnamed', cooperatives: null }),
  ])
  assert.equal(summary.paidCount, 3)
  assert.ok(summary.rows.some(row => row.name === 'Cooperative name unavailable'))
})

test('cents, refunds, filtered input and empty selections are handled without mutating source records', () => {
  const records = [contract({ contract_amount: 0.3, payment_entries: [{ amount: 0.1 }, { amount: 0.2 }] }),
    contract({ id: 'refund', supplier_id: 'refund', payment_entries: [{ amount: 5 }, { amount: -5 }] })]
  const before = structuredClone(records)
  const summary = summarizeCooperativePayments(records)
  assert.equal(summary.totalPaid, 0.3)
  assert.equal(summary.rows[0].balance, 0)
  assert.equal(summary.paidCount, 1)
  assert.equal(summarizeCooperativePayments(records.slice(1)).paidCount, 0)
  assert.equal(summarizeCooperativePayments([]).totalPaid, 0)
  assert.deepEqual(records, before)
})

test('CSV exports the same paid cooperative names and values, escapes cells, and preserves unknown balances', () => {
  const summary = summarizeCooperativePayments([contract({ cooperatives: { name: '=SUM(1,2) "Coop"' }, contract_amount: null })])
  const csv = cooperativePaymentsCsv(summary)
  assert.match(csv, /Cooperative/)
  assert.match(csv, /'=SUM\(1,2\) ""Coop""/)
  assert.match(csv, /"25","","Contract amount missing"/)
  assert.equal(csv.split('\r\n').length, 2)
})

test('payment section renders cooperative names, totals, missing assignments and an accessible empty state', () => {
  const { CooperativePaymentSummary } = load('src/components/CooperativePaymentSummary.tsx', {
    './CooperativePaymentSummary.module.css': new Proxy({}, { get: (_, key) => key }),
  })
  const nodes = node => !node || typeof node !== 'object' ? [] :
    [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
  const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node) :
    [node.props?.children].flat(Infinity).map(text).join(' ')
  const summary = summarizeCooperativePayments([contract(), contract({ id: 'unassigned', supplier_id: null })])
  const tree = CooperativePaymentSummary({ summary, year: '2026' })
  assert.match(text(tree), /First Cooperative/)
  assert.match(text(tree), /Partially paid/)
  assert.match(text(tree), /₱25/)
  assert.ok(nodes(tree).some(node => node.props?.role === 'status' && text(node).includes('no assigned cooperative')))
  assert.ok(nodes(tree).some(node => node.type === 'details'))
  assert.ok(nodes(tree).some(node => node.props?.role === 'region' && node.props.tabIndex === 0))
  const empty = CooperativePaymentSummary({ summary: summarizeCooperativePayments([]), year: '2026' })
  assert.match(text(empty), /No cooperatives with recorded payments/)
  assert.equal(nodes(empty).find(node => node.type === 'button').props.disabled, true)
})
