import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const {
  computeMilkComponentDashboard,
  formatAsOfDateLabel,
  formatCompactLiters,
  formatCompactPeso,
  regionSortKey,
} = load('src/lib/sbfp-dashboard-infographic.ts')

test('formatAsOfDateLabel, compact liters, and compact peso formatters match infographic style', () => {
  assert.equal(formatAsOfDateLabel('2026-11-24'), 'AS OF NOVEMBER 24, 2026')
  assert.equal(formatCompactLiters(2_517_349.8, 3), '2.517M')
  assert.equal(formatCompactLiters(7_809_035.3, 1), '7.8M')
  assert.equal(formatCompactPeso(1_019_741_810), '\u20B11.0B')
  assert.equal(formatCompactPeso(349_403_024), '\u20B1349.4M')
  assert.equal(formatCompactPeso(850_000), '\u20B1850.0K')
})

test('computeMilkComponentDashboard evaluates cumulative packs, Tab 2 payments, and SDO statuses as of cutoff date', () => {
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
    },
  ]

  // As of Oct 31 (past cutoff): Tarlac finished 60,000 packs & Leyte has future delivery_end -> Ongoing Delivery
  // Payments match Tab 2 (all recorded payment entries on selected contracts, regardless of entry date)
  const oct = computeMilkComponentDashboard(rows, { dbYear: 2026, asOfIso: '2026-10-31', todayIso: '2026-11-24' })
  assert.equal(oct.asOfLabel, 'AS OF OCTOBER 31, 2026')
  assert.equal(oct.statusCounts.completed, 0)
  assert.equal(oct.statusCounts.ongoingDelivery, 2)
  assert.equal(oct.statusCounts.forDelivery, 1)
  assert.equal(oct.totals.sdoCount, 3)
  assert.equal(oct.totals.deliveredPacks, 70_000)
  assert.equal(oct.totals.paidAmt, 2_500_000)
  assert.deepEqual(oct.regions.map(r => r.region), ['CAR', 'III', 'VIII'])

  // As of Nov 24 (today): both Tarlac & Leyte count as Completed matching SBFP Report Tab 2
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
  assert.ok(regionSortKey('CAR') < regionSortKey('III'))
  assert.ok(regionSortKey('III') < regionSortKey('CARAGA'))
})
