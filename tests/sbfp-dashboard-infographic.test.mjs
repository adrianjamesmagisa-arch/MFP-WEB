import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const {
  computeMilkComponentDashboard,
  formatAsOfDateLabel,
  formatCompactLiters,
  formatCompactPeso,
  regionSortKey,
  sumPaymentEntriesAsOf,
} = load('src/lib/sbfp-dashboard-infographic.ts')

test('formatAsOfDateLabel, compact liters, and compact peso formatters match infographic style', () => {
  assert.equal(formatAsOfDateLabel('2026-11-24'), 'AS OF NOVEMBER 24, 2026')
  assert.equal(formatCompactLiters(2_517_349.8, 3), '2.517M')
  assert.equal(formatCompactLiters(7_809_035.3, 1), '7.8M')
  assert.equal(formatCompactPeso(1_019_741_810), '\u20B11.0B')
  assert.equal(formatCompactPeso(349_403_024), '\u20B1349.4M')
  assert.equal(formatCompactPeso(850_000), '\u20B1850.0K')
})

test('sumPaymentEntriesAsOf includes entries on or before cutoff and undated entries', () => {
  const entries = [
    { date: '2026-10-15', amount: 5_000_000 },
    { date: '2026-11-24', amount: 3_000_000 },
    { date: '2026-12-01', amount: 4_000_000 },
    { amount: 500_000 },
  ]
  assert.equal(sumPaymentEntriesAsOf(entries, '2026-10-31'), 5_500_000)
  assert.equal(sumPaymentEntriesAsOf(entries, '2026-11-24'), 8_500_000)
  assert.equal(sumPaymentEntriesAsOf(entries, '2026-12-31'), 12_500_000)
})

test('computeMilkComponentDashboard evaluates cumulative packs, payments, and SDO statuses as of cutoff date', () => {
  const rows = [
    {
      id: 'r1',
      year: 2026,
      center: 'CLSU',
      region: 'III',
      sdo: 'Tarlac Province',
      procurement_status: 'Completed',
      include_in_report: true,
      milk_type: 'PM',
      packs_to_deliver: 100_000,
      contract_amount: 2_500_000,
      beneficiaries_pm: 5_000,
      delivery_start: '2026-08-01',
      delivery_snapshots: [
        { date: '2026-10-20', packs: 60_000 },
        { date: '2026-11-15', packs: 40_000 },
      ],
      payment_entries: [
        { date: '2026-10-25', amount: 1_000_000 },
        { date: '2026-11-20', amount: 1_500_000 },
      ],
    },
    {
      id: 'r2',
      year: 2026,
      center: 'MMSU',
      region: 'CAR',
      sdo: 'Abra',
      procurement_status: 'Awarded (For Delivery)',
      include_in_report: true,
      milk_type: 'SM',
      packs_to_deliver: 50_000,
      contract_amount: 1_500_000,
      beneficiaries_sm: 2_000,
    },
    {
      id: 'aux',
      year: 2026,
      center: 'CLSU',
      region: 'PPMP:fixtures',
      sdo: 'Printer',
      milk_type: '__PPMP__',
      packs_to_deliver: 999,
      contract_amount: 999,
    },
    {
      id: 'excluded',
      year: 2026,
      center: 'CLSU',
      region: 'III',
      sdo: 'Hidden SDO',
      procurement_status: 'For Preparation',
      include_in_report: false,
      packs_to_deliver: 50_000,
      contract_amount: 1_000_000,
    },
  ]

  // As of Oct 31: Tarlac finished 60,000 packs (Nov 15 delivery hasn't happened yet) -> Ongoing Delivery
  const oct = computeMilkComponentDashboard(rows, { dbYear: 2026, asOfIso: '2026-10-31' })
  assert.equal(oct.asOfLabel, 'AS OF OCTOBER 31, 2026')
  assert.equal(oct.statusCounts.completed, 0)
  assert.equal(oct.statusCounts.ongoingDelivery, 1)
  assert.equal(oct.statusCounts.forDelivery, 1)
  assert.equal(oct.totals.sdoCount, 2)
  assert.equal(oct.totals.deliveredPacks, 60_000)
  assert.equal(oct.totals.paidAmt, 1_000_000)
  assert.deepEqual(oct.regions.map(r => r.region), ['CAR', 'III'])

  // As of Nov 24: Tarlac has all 100,000 packs + 2,500,000 payment -> Completed
  const nov = computeMilkComponentDashboard(rows, { dbYear: 2026, asOfIso: '2026-11-24' })
  assert.equal(nov.statusCounts.completed, 1)
  assert.equal(nov.statusCounts.ongoingDelivery, 0)
  assert.equal(nov.totals.deliveredPacks, 100_000)
  assert.equal(nov.totals.paidAmt, 2_500_000)
  assert.equal(nov.totals.beneficiaries, 7_000)
  assert.equal(
    nov.regions.reduce((s, r) => s + r.deliveredPacks, 0),
    nov.totals.deliveredPacks,
  )
  assert.equal(
    nov.regions.reduce((s, r) => s + r.contractAmt, 0),
    nov.totals.contractAmt,
  )
  assert.ok(regionSortKey('CAR') < regionSortKey('III'))
  assert.ok(regionSortKey('III') < regionSortKey('CARAGA'))
})
