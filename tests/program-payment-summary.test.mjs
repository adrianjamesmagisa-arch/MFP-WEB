import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from './helpers/load-typescript.mjs'

const { normalizeProgramProcurementRows, PROGRAM_REPORT_META } = load('src/lib/program-spreadsheet-report.ts')
const { summarizeCooperativePayments, cooperativePaymentsCsv } = load('src/lib/cooperative-payments.ts')
const css = new Proxy({}, { get: (_, key) => String(key) })
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const text = node => node == null || typeof node === 'boolean' ? '' : typeof node !== 'object' ? String(node)
  : [node.props?.children].flat(Infinity).map(text).join(' ')
const programs = ['dswd', 'lgu', 'lds', 'others']

function fixtureRows(program) {
  return normalizeProgramProcurementRows([
    { id: 'full', program, year: 2026, label: 'Area One - PM', center: 'CSU', region: 'II', supplier_id: 'one',
      cooperatives: { name: `${program} Cooperative One` }, include_in_report: true, procurement_status: 'Completed',
      contract_amount: 100, packs_to_deliver: 4, payment_entries: [{ date: '2026-01-10', amount: 100 }] },
    { id: 'partial', program, year: 2026, label: 'Area Two - PM', center: 'USF', region: 'VII', supplier_id: 'two',
      cooperatives: [{ name: `${program} Cooperative Two` }], include_in_report: true, procurement_status: 'Awarded (Ongoing Delivery)',
      contract_amount: 100, packs_to_deliver: 4, payment_entries: [{ date: '2026-01-10', amount: 25 }] },
    { id: 'unassigned', program, year: 2026, label: 'Area Three - PM', center: 'USF', region: 'VII',
      include_in_report: true, contract_amount: 100, packs_to_deliver: 4, payment_entries: [{ date: '2026-01-10', amount: 10 }] },
    { id: 'excluded', program, year: 2026, label: 'Area Four - PM', center: 'USF', region: 'VII', supplier_id: 'excluded',
      cooperatives: { name: 'Excluded Cooperative' }, include_in_report: false, contract_amount: 100,
      payment_entries: [{ date: '2026-01-10', amount: 100 }] },
  ], [])
}

function reportFixture(programId) {
  const values = []
  let cursor = 0
  const react = { ...React,
    useState(initial) {
      const index = cursor++
      if (!(index in values)) values[index] = index === 0 ? fixtureRows(programId) : index === 1 ? false : typeof initial === 'function' ? initial() : initial
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next }]
    },
    useMemo: factory => factory(), useCallback: callback => callback, useEffect() {},
  }
  const { ProgramSpreadsheetReport } = load('src/components/ProgramSpreadsheetReport.tsx', {
    react,
    '@/lib/supabase/client': { createClient: () => ({ from() { throw new Error('Rendering payment summaries must not write data') } }) },
    '@/components/SbfpAiAgent': { SbfpAiAgent: () => null },
    './CooperativePaymentSummary.module.css': css,
  })
  return () => { cursor = 0; return ProgramSpreadsheetReport({ programId }) }
}

test('all program reports show the same filtered cooperative payment panel as SBFP', () => {
  for (const program of programs) {
    const render = reportFixture(program)
    const buttons = nodes(render()).filter(node => node.type === 'button')
    const status = buttons.find(node => text(node).includes('2. Payment and Implementation Status'))
    assert.ok(status)
    status.props.onClick()
    const secondary = nodes(render()).find(node => node.type?.name === 'ProgramSpreadsheetSecondaryTabs')
    assert.ok(secondary)
    assert.equal(secondary.props.cooperativePayments.paidCount, 2)
    assert.equal(secondary.props.cooperativePayments.fullyPaidCount, 1)
    assert.equal(secondary.props.cooperativePayments.partiallyPaidCount, 1)
    assert.equal(secondary.props.cooperativePayments.totalPaid, secondary.props.stats.totalPaid)
    assert.equal(secondary.props.cooperativePayments.totalPaid, 135)
    const html = renderToStaticMarkup(React.createElement(secondary.type, secondary.props))
    assert.match(html, /Cooperatives that received payment/, program)
    assert.match(html, new RegExp(`${program} Cooperative One`))
    assert.match(html, /Fully paid/)
    assert.match(html, /Partially paid/)
    assert.doesNotMatch(html, /Excluded Cooperative/)
    assert.match(html, /no assigned cooperative/)
    assert.match(html, /135/)
    assert.match(html, new RegExp(`>${PROGRAM_REPORT_META[program].entityPlural}<`))

    const center = nodes(render()).find(node => node.type === 'select' && text(node).includes('All Centers'))
    center.props.onChange({ target: { value: 'CSU' } })
    const selected = nodes(render()).find(node => node.type?.name === 'ProgramSpreadsheetSecondaryTabs')
    assert.equal(selected.props.cooperativePayments.paidCount, 1)
    assert.equal(selected.props.cooperativePayments.totalPaid, 100)
    const selectedHtml = renderToStaticMarkup(React.createElement(selected.type, selected.props))
    assert.match(selectedHtml, new RegExp(`${program} Cooperative One`))
    assert.doesNotMatch(selectedHtml, new RegExp(`${program} Cooperative Two`))
    assert.doesNotMatch(selectedHtml, /no assigned cooperative/)
  }
})

test('payment CSV headers and download filenames use the report program while SBFP defaults stay unchanged', () => {
  const { CooperativePaymentSummary } = load('src/components/CooperativePaymentSummary.tsx', { './CooperativePaymentSummary.module.css': css })
  const originalDocument = globalThis.document
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL
  let anchor
  globalThis.document = { createElement: () => (anchor = { click() {}, remove() {} }), body: { appendChild() {} } }
  URL.createObjectURL = () => 'blob:fixture'
  URL.revokeObjectURL = () => {}
  try {
    for (const program of programs) {
      const meta = PROGRAM_REPORT_META[program]
      assert.ok(meta, `${program} has report metadata`)
      const summary = summarizeCooperativePayments(fixtureRows(program).filter(row => row.include_in_report))
      const csv = cooperativePaymentsCsv(summary, meta)
      assert.ok(csv.includes(`"${meta.entityPlural}"`))
      const tree = CooperativePaymentSummary({ summary, year: '2026', programId: program,
        entitySingular: meta.entitySingular, entityPlural: meta.entityPlural })
      nodes(tree).find(node => node.type === 'button').props.onClick()
      assert.equal(anchor.download, `${program}_cooperative_payments_2026.csv`)
    }
    const summary = summarizeCooperativePayments(fixtureRows('lds'))
    nodes(CooperativePaymentSummary({ summary, year: '2026' })).find(node => node.type === 'button').props.onClick()
    assert.equal(anchor.download, 'sbfp_cooperative_payments_2026.csv')
    assert.match(cooperativePaymentsCsv(summary), /"SDOs"/)
  } finally { globalThis.document = originalDocument; URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke }
})

test('Others has a report entry point using the shared program report', () => {
  const { default: OthersReport } = load('src/app/(app)/reports/others-narrative/page.tsx', {
    '@/components/ProgramSpreadsheetReport': { ProgramSpreadsheetReport: () => null },
  })
  assert.equal(OthersReport().props.programId, 'others')
  const others = reportFixture('others')()
  assert.ok(!nodes(others).some(node => node.type === 'button' && text(node).includes('Major Accomplishments')))
})
