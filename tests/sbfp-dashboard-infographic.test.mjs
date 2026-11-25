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
  assert.equal(formatCompactLiters(2_493_102.8, 2), '2.49M')
  assert.equal(formatCompactLiters(7_977_128.3, 2), '7.97M')
  assert.equal(formatCompactLiters(1_140_000, 2), '1.14M')
  assert.equal(formatCompactPeso(1_019_741_810), '\u20B11.0B')
  assert.equal(formatCompactPeso(349_403_024), '\u20B1349.4M')
  assert.equal(formatCompactPeso(850_000), '\u20B1850.0K')
})

test('sumPaymentEntriesAsOf enforces strict cutoff across date formats and undated entries', () => {
  assert.equal(sumPaymentEntriesAsOf(null, '2026-10-31'), 0)
  assert.equal(sumPaymentEntriesAsOf([], '2026-10-31'), 0)

  const entries = [
    { date: 'Oct. 30, 2026', amount: 1_000_000 },
    { date: '2026-10-31', amount: 500_000 },
    { date: 'Nov. 15, 2026', amount: 250_000 },
    { amount: 100_000 },
    { date: 'unparseable-date', amount: 50_000 },
  ]

  // Exact cutoff date (2026-10-31) includes Oct 30, Oct 31, undated, and unparseable entries; excludes Nov 15
  assert.equal(sumPaymentEntriesAsOf(entries, '2026-10-31'), 1_650_000)
  // Later cutoff includes Nov 15 as well
  assert.equal(sumPaymentEntriesAsOf(entries, '2026-11-24'), 1_900_000)
  // Earlier cutoff excludes Oct 30 and later
  assert.equal(sumPaymentEntriesAsOf(entries, '2026-10-29'), 150_000)
})

test('computeMilkComponentDashboard evaluates cumulative packs, date-filtered payments, and SDO statuses as of cutoff date', () => {
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
    {
      id: 'r3',
      year: 2026,
      center: 'VSU',
      region: 'VIII',
      sdo: 'Leyte',
      procurement_status: 'Completed',
      include_in_report: true,
      milk_type: 'PM',
      packs_to_deliver: 10_000,
      packs_delivered: 10_000,
      contract_amount: 250_000,
      beneficiaries_pm: 500,
      delivery_start: '2026-09-01',
      delivery_end: '2026-12-15',
      payment_entries: [
        { date: '2026-12-05', amount: 250_000 },
      ],
    },
  ]

  // As of Oct 31 (past cutoff): Tarlac finished 60,000 packs & Leyte has future delivery_end -> Ongoing Delivery
  // Only payments on or before 2026-10-31 count
  const oct = computeMilkComponentDashboard(rows, { dbYear: 2026, asOfIso: '2026-10-31', todayIso: '2026-11-24' })
  assert.equal(oct.asOfLabel, 'AS OF OCTOBER 31, 2026')
  assert.equal(oct.statusCounts.completed, 0)
  assert.equal(oct.statusCounts.ongoingDelivery, 2)
  assert.equal(oct.statusCounts.forDelivery, 1)
  assert.equal(oct.totals.sdoCount, 3)
  assert.equal(oct.totals.deliveredPacks, 70_000)
  assert.equal(oct.totals.paidAmt, 1_000_000)
  const octReg3 = oct.regions.find(r => r.region === 'III')
  assert.equal(octReg3.paidAmt, 1_000_000)
  assert.equal(octReg3.pctDisbursed, 40)
  assert.deepEqual(oct.regions.map(r => r.region), ['CAR', 'III', 'VIII'])

  // As of Nov 24 (today): both Tarlac & Leyte count as Completed, and 2026-12-05 payment is still excluded
  const nov = computeMilkComponentDashboard(rows, { dbYear: 2026, asOfIso: '2026-11-24', todayIso: '2026-11-24' })
  assert.equal(nov.statusCounts.completed, 2)
  assert.equal(nov.statusCounts.ongoingDelivery, 0)
  assert.equal(nov.totals.deliveredPacks, 110_000)
  assert.equal(nov.totals.paidAmt, 2_500_000)
  assert.equal(nov.totals.beneficiaries, 7_500)
  assert.equal(
    nov.regions.reduce((s, r) => s + r.deliveredPacks, 0),
    nov.totals.deliveredPacks,
  )
  assert.equal(
    nov.regions.reduce((s, r) => s + r.contractAmt, 0),
    nov.totals.contractAmt,
  )

  // As of Dec 5: post-Nov-24 payment entry is included
  const dec = computeMilkComponentDashboard(rows, { dbYear: 2026, asOfIso: '2026-12-05', todayIso: '2026-11-24' })
  assert.equal(dec.totals.paidAmt, 2_750_000)

  // Saved snapshot override replaces statusCounts without changing deliveries or payments
  const withSnapshot = computeMilkComponentDashboard(rows, {
    dbYear: 2026,
    asOfIso: '2026-10-31',
    todayIso: '2026-11-24',
    statusCountsOverride: {
      completed: 1,
      ongoingDelivery: 1,
      forDelivery: 0,
      ongoingProcurement: 1,
      forPreparation: 0,
    },
  })
  assert.deepEqual(withSnapshot.statusCounts, {
    completed: 1,
    ongoingDelivery: 1,
    forDelivery: 0,
    ongoingProcurement: 1,
    forPreparation: 0,
  })
  assert.equal(withSnapshot.totals.deliveredPacks, 70_000)
  assert.equal(withSnapshot.totals.paidAmt, 1_000_000)
  assert.ok(regionSortKey('CAR') < regionSortKey('III'))
  assert.ok(regionSortKey('III') < regionSortKey('CARAGA'))
})
