import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const { analyzeMfpColumns, answerMfpColumnQuestion, mfpColumnExplanationFacts } = load('src/lib/mfp-column-analytics.ts')
const { ALL_MFP_ANALYSIS_COLUMNS } = load('src/lib/mfp-analysis-columns.ts')
const contract = { id: 'same-contract', target: 5000, delivered: 2500 }
const rows = [
  { id: 'original', year: 2026, funded_by: 'DepEd', center: 'VSU', division: 'Baybay City - PM', elementary_school: 'Fixture ES',
    milk_packs: 1200, beneficiaries: 48, milk_cost: 30000, service_fee: null, total_funds_transferred: null,
    raw_milk_liters: 100, supplier_id: 'one', cooperatives: { name: 'One' }, source_contracts: [contract] },
  { id: 'addition', year: 2026, funded_by: 'DepEd', center: 'VSU', division: 'Baybay City Add 1 - PM', elementary_school: 'Fixture ES',
    milk_packs: 300, beneficiaries: null, milk_cost: 7500, service_fee: 0, total_funds_transferred: null,
    raw_milk_liters: 25, supplier_id: 'one', cooperatives: { name: 'One; Two' }, source_contracts: [contract] },
]

test('selected financial columns preserve unknown versus zero and exclude unselected measures', () => {
  const before = structuredClone(rows)
  const columns = ['milk_packs', 'milk_cost', 'service_fee', 'total_funds_transferred']
  const result = analyzeMfpColumns(rows, columns)
  assert.match(result, /1,500/)
  assert.match(result, /37,500/)
  assert.match(result, /0\.00.*1 missing/)
  assert.match(result, /Unavailable/)
  assert.doesNotMatch(result, /Beneficiaries|Raw Milk|Contract Target/)
  const facts = mfpColumnExplanationFacts(rows, columns)
  assert.deepEqual(Object.keys(facts.metrics), columns)
  assert.equal(facts.metrics.service_fee.value, 0)
  assert.equal(facts.metrics.total_funds_transferred.value, null)
  assert.deepEqual(rows, before)
})

test('school, original-only beneficiary and repeated contract counts keep the established definitions', () => {
  const columns = ['elementary_school', 'beneficiaries', 'target_milk_packs_to_deliver', 'total_milk_packs_delivered']
  const facts = mfpColumnExplanationFacts(rows, columns)
  assert.equal(facts.metrics.elementary_school.value, 1)
  assert.equal(facts.metrics.beneficiaries.value, 48)
  assert.equal(facts.metrics.beneficiaries.missing, 1)
  assert.equal(facts.metrics.target_milk_packs_to_deliver.value, 5000)
  assert.equal(facts.metrics.total_milk_packs_delivered.value, 2500)
  assert.match(analyzeMfpColumns(rows, columns), /50\.0%/)
  assert.match(analyzeMfpColumns(rows, columns), /not delivery allocations to selected schools/)
})

test('questions respect selected fields, reject narrower conditions and use quantities without peso formatting', () => {
  assert.match(answerMfpColumnQuestion(rows, 'Total beneficiaries', ['milk_cost']), /Select these analysis columns first/)
  assert.doesNotMatch(answerMfpColumnQuestion(rows, 'Total beneficiaries', ['milk_cost']), /48/)
  assert.match(answerMfpColumnQuestion(rows, 'Total column K', ['raw_milk_liters']), /125/)
  assert.doesNotMatch(answerMfpColumnQuestion(rows, 'Total raw milk', ALL_MFP_ANALYSIS_COLUMNS), /₱/)
  for (const question of ['How many schools in Bataan?', 'How many schools in 2025?', 'How many schools for DSWD?', 'Total milk cost above 1000']) {
    assert.equal(answerMfpColumnQuestion(rows, question, ALL_MFP_ANALYSIS_COLUMNS), null, question)
  }
})

test('selected comparisons and rankings contain only chosen measures and retain combined suppliers', () => {
  const comparisonRows = [...rows, { ...rows[0], id: 'other', center: 'CLSU', beneficiaries: 99, milk_packs: 1 }]
  const result = answerMfpColumnQuestion(comparisonRows, 'Top centers by beneficiaries', ['center', 'beneficiaries'])
  assert.ok(result.indexOf('| CLSU |') < result.indexOf('| VSU |'))
  assert.doesNotMatch(result, /Milk Cost|Milk Packs|37,500/)
  const supplierFacts = mfpColumnExplanationFacts(rows, ['supplier_id'])
  assert.equal(supplierFacts.groups[0].groupCount, 2)
  assert.match(analyzeMfpColumns(rows, ['supplier_id']), /One; Two/)
  assert.match(analyzeMfpColumns(rows, ['supplier_id']), /cannot be allocated to each supplier separately/)
  const many = Array.from({ length: 40 }, (_, index) => ({ ...rows[0], id: String(index), center: `Center ${index}` }))
  assert.match(analyzeMfpColumns(many, ['center', 'milk_cost']), /40 group\(s\) total\. Showing 5/)
  assert.match(analyzeMfpColumns(many, ['center', 'milk_cost']), /1,200,000/)
})

test('rankings use the explicit ranking measure even when another measure is mentioned first', () => {
  const comparisonRows = [
    { ...rows[0], id: 'a', center: 'A', milk_cost: 100, service_fee: 10 },
    { ...rows[0], id: 'b', center: 'B', milk_cost: 10, service_fee: 100 },
  ]
  const result = answerMfpColumnQuestion(comparisonRows, 'Show milk cost and rank centers by shipping fee', ['center', 'milk_cost', 'service_fee'])
  assert.match(result, /descending by Shipping/)
  assert.ok(result.indexOf('| B |') < result.indexOf('| A |'))
  const scoped = answerMfpColumnQuestion(comparisonRows, 'Top centers by column V in the selected rows', ['center', 'milk_cost', 'service_fee'])
  assert.ok(scoped.indexOf('| B |') < scoped.indexOf('| A |'))
})

test('row and column selection are independent across the full filtered row set', () => {
  const values = []
  let cursor = 0
  const { MfpAnalysisScope } = load('src/components/MfpAnalysisScope.tsx', { react: {
    createContext: () => ({ Provider: 'provider' }), useMemo: factory => factory(),
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next }] },
  } })
  const render = () => { cursor = 0; return MfpAnalysisScope({ filters: {}, version: 'v', rowIds: Array.from({ length: 1001 }, (_, index) => String(index)), children: null }).props.value }
  render().toggle('1000')
  render().clearColumns()
  render().toggleColumn('milk_cost')
  assert.deepEqual([...render().selectedIds], ['1000'])
  assert.deepEqual([...render().selectedColumns], ['milk_cost'])
  assert.equal(render().mode, 'selected')
  render().toggleAll()
  assert.equal(render().selectedIds.size, 1001)
  render().clear()
  assert.equal(render().selectedColumns.size, 1)
  render().allColumns()
  assert.equal(render().selectedColumns.size, ALL_MFP_ANALYSIS_COLUMNS.length)
})
