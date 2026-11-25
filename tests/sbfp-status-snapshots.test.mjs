import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const {
  NATIONAL_SNAPSHOT_CENTER,
  breakdownToDashboardCounts,
  breakdownToTab2Counts,
  computePerCenterStatusSnapshots,
  resolveStatusSnapshotForDate,
  summarizeSnapshotsForModal,
  todayManilaIso,
} = load('src/lib/sbfp-status-snapshots.ts')

test('todayManilaIso converts UTC instant to Asia/Manila YYYY-MM-DD', () => {
  // 2026-11-24T17:30:00Z is 2026-11-25 01:30 in Asia/Manila (UTC+8)
  const sample = new Date('2026-11-24T17:30:00Z')
  assert.equal(todayManilaIso(sample), '2026-11-25')
})

test('computePerCenterStatusSnapshots groups by center and applies hierarchy deduplication', () => {
  const rows = [
    // CLSU SDO 1: two rows where PM is For Preparation and SM is Completed -> counts once as For Preparation
    {
      id: '1',
      year: 2026,
      center: 'CLSU',
      sdo: 'Tarlac Province - PM',
      procurement_status: 'For Preparation',
      include_in_report: true,
    },
    {
      id: '2',
      year: 2026,
      center: 'CLSU',
      sdo: 'Tarlac Province - SM',
      procurement_status: 'Completed',
      include_in_report: true,
    },
    // CLSU SDO 2: Ongoing (For Award)
    {
      id: '3',
      year: 2026,
      center: 'CLSU',
      sdo: 'Nueva Ecija - PM',
      procurement_status: 'Ongoing (For Award)',
      include_in_report: true,
    },
    // NHQ alias -> NHQGP (NIZ), Completed
    {
      id: '4',
      year: 2026,
      center: 'NHQ',
      sdo: 'Cebu Province - PM',
      procurement_status: 'Completed',
      include_in_report: true,
    },
    // Excluded & aux rows ignored
    {
      id: '5',
      year: 2026,
      center: 'CLSU',
      sdo: 'Hidden - PM',
      procurement_status: 'Completed',
      include_in_report: false,
    },
    {
      id: '6',
      year: 2026,
      center: 'CLSU',
      region: 'PPMP:fixtures',
      milk_type: '__PPMP__',
      sdo: 'Printer',
      procurement_status: 'Completed',
    },
  ]

  const snapshots = computePerCenterStatusSnapshots(rows, 2026, '2026-11-25')
  assert.equal(snapshots.length, 2)

  const clsu = snapshots.find(s => s.center === 'CLSU')
  assert.ok(clsu)
  assert.equal(clsu.for_preparation, 1)
  assert.equal(clsu.ongoing_for_award, 1)
  assert.equal(clsu.completed, 0)
  assert.equal(clsu.sdo_count, 2)
  assert.equal(clsu.source, 'auto')

  const nhq = snapshots.find(s => s.center === 'NHQGP (NIZ)')
  assert.ok(nhq)
  assert.equal(nhq.completed, 1)
  assert.equal(nhq.sdo_count, 1)
})

test('resolveStatusSnapshotForDate handles exact match, carry-forward, national backfill precedence, and center scoping', () => {
  const rows = [
    // Nov 20 national backfill
    {
      snapshot_date: '2026-11-20',
      year: 2026,
      center: NATIONAL_SNAPSHOT_CENTER,
      for_preparation: 22,
      ongoing_procurement: 11,
      ongoing_for_award: 3,
      for_delivery: 12,
      ongoing_delivery: 16,
      completed: 29,
      failed: 0,
      sdo_count: 93,
      source: 'backfill',
    },
    // Nov 20 center row that should be overridden on national view by __ALL__
    {
      snapshot_date: '2026-11-20',
      year: 2026,
      center: 'CLSU',
      for_preparation: 1,
      ongoing_procurement: 0,
      ongoing_for_award: 0,
      for_delivery: 0,
      ongoing_delivery: 0,
      completed: 4,
      failed: 0,
      sdo_count: 5,
      source: 'auto',
    },
    // Nov 25 auto rows across two centers
    {
      snapshot_date: '2026-11-25',
      year: 2026,
      center: 'CLSU',
      for_preparation: 0,
      ongoing_procurement: 1,
      ongoing_for_award: 0,
      for_delivery: 0,
      ongoing_delivery: 0,
      completed: 5,
      failed: 0,
      sdo_count: 6,
      source: 'auto',
    },
    {
      snapshot_date: '2026-11-25',
      year: 2026,
      center: 'VSU',
      for_preparation: 2,
      ongoing_procurement: 0,
      ongoing_for_award: 1,
      for_delivery: 1,
      ongoing_delivery: 3,
      completed: 4,
      failed: 0,
      sdo_count: 11,
      source: 'auto',
    },
  ]

  // Before first snapshot -> null
  assert.equal(
    resolveStatusSnapshotForDate(rows, { year: 2026, asOfIso: '2026-11-19' }),
    null,
  )

  // Exact backfill on Nov 20 -> national override takes precedence over CLSU row
  const nov20 = resolveStatusSnapshotForDate(rows, { year: 2026, asOfIso: '2026-11-20' })
  assert.ok(nov20)
  assert.equal(nov20.isExactDate, true)
  assert.equal(nov20.snapshotDate, '2026-11-20')
  assert.equal(nov20.source, 'backfill')
  assert.equal(nov20.dashboardCounts.completed, 29)
  assert.equal(nov20.dashboardCounts.ongoingProcurement, 14) // 11 + 3
  assert.equal(nov20.tab2Counts['Ongoing Procurement'], 11)
  assert.equal(nov20.tab2Counts['Ongoing (For Award)'], 3)
  assert.equal(nov20.breakdown.sdoCount, 93)

  // Carry-forward on Nov 22 (no snapshot captured on Nov 22 -> uses Nov 20)
  const nov22 = resolveStatusSnapshotForDate(rows, { year: 2026, asOfIso: '2026-11-22' })
  assert.ok(nov22)
  assert.equal(nov22.isExactDate, false)
  assert.equal(nov22.snapshotDate, '2026-11-20')
  assert.equal(nov22.breakdown.completed, 29)

  // Nov 26 carries forward summed auto centers from Nov 25
  const nov26 = resolveStatusSnapshotForDate(rows, { year: 2026, asOfIso: '2026-11-26' })
  assert.ok(nov26)
  assert.equal(nov26.isExactDate, false)
  assert.equal(nov26.snapshotDate, '2026-11-25')
  assert.equal(nov26.breakdown.completed, 9)
  assert.equal(nov26.breakdown.sdoCount, 17)
  assert.deepEqual(breakdownToDashboardCounts(nov26.breakdown), {
    completed: 9,
    ongoingDelivery: 3,
    forDelivery: 1,
    ongoingProcurement: 2,
    forPreparation: 2,
  })
  assert.equal(breakdownToTab2Counts(nov26.breakdown)['Ongoing (For Award)'], 1)

  // Center-scoped resolution ignores __ALL__ backfill row on Nov 20
  const clsuNov22 = resolveStatusSnapshotForDate(rows, {
    year: 2026,
    asOfIso: '2026-11-22',
    center: 'CLSU',
  })
  assert.ok(clsuNov22)
  assert.equal(clsuNov22.snapshotDate, '2026-11-20')
  assert.equal(clsuNov22.breakdown.completed, 4)
  assert.equal(clsuNov22.breakdown.sdoCount, 5)

  // Summarize modal entries
  const modalList = summarizeSnapshotsForModal(rows, 2026)
  assert.equal(modalList.length, 2)
  assert.equal(modalList[0].snapshotDate, '2026-11-25')
  assert.equal(modalList[0].center, 'ALL_CENTERS_SUM')
  assert.equal(modalList[1].snapshotDate, '2026-11-20')
  assert.equal(modalList[1].center, NATIONAL_SNAPSHOT_CENTER)
})
