import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const { summarizeMfpRows, answerMfpQuestion } = load('src/lib/mfp-analytics.ts')
const school = (id, extra = {}) => ({ id, year: 2026, center: 'VSU', funded_by: 'DepEd', division: 'Baybay City',
  elementary_school: 'Altavista ES', milk_type: 'PM', beneficiaries: 48, milk_packs: 1200,
  milk_cost: 30000, service_fee: null, total_funds_transferred: null,
  source_contracts: [{ id: 'contract', label: 'Baybay City - PM', target: 10000, delivered: 5000 }], ...extra })

test('2,283 rows are fully counted without confusing schools, contract variants and milk types', () => {
  const rows = Array.from({ length: 2283 }, (_, index) => school(String(index), { elementary_school: `School ${Math.floor(index / 3)}`,
    division: `Baybay City${index % 3 ? ' Add 1' : ''} - ${index % 2 ? 'SM' : 'PM'}`, milk_type: index % 2 ? 'SM' : 'PM' }))
  const summary = summarizeMfpRows(rows)
  assert.equal(summary.rows, 2283)
  assert.equal(summary.schools.count, 761)
  assert.equal(summary.target.value, 10000)
  assert.equal(summary.delivered.value, 5000)
  assert.equal(summary.completion, 50)
  assert.match(answerMfpQuestion(rows, 'how many elementary schools are participating in the selected rows'), /761 participating schools/)
})

test('school identity respects centers, SDOs, known geography, years, exclusions and missing names', () => {
  const rows = [school('a', { municipality: 'A' }), school('b', { municipality: 'B' }), school('ambiguous'),
    school('other-center', { center: 'CLSU' }), school('other-sdo', { division: 'Leyte' }),
    school('other-year', { year: 2025 }), school('missing', { elementary_school: 'N/A' }), school('not-deped', { funded_by: 'DSWD' })]
  const summary = summarizeMfpRows(rows)
  assert.equal(summary.schools.count, 5)
  assert.equal(summary.schools.ambiguousRows, 1)
  assert.equal(summary.schools.missingNames, 1)
  assert.equal(summary.schools.unit, 'school-year participations')
  assert.match(answerMfpQuestion(rows, 'How many schools are in this scope?'), /exact unique-school count is unresolved/)
})

test('polite school-count questions accept the reported selected-row wording', () => {
  const rows = [school('original'), school('add'), school('other', { elementary_school: 'Other ES' })]
  for (const question of ['please check how many schools participating into the selected rows',
    'Please tell me how many schools are participating in the selected rows?',
    'Can you check how many elementary schools are participating in these records?',
    'Could you please tell me how many schools are participating?',
    'Kindly check how many schools are participating in the filtered rows']) {
    assert.match(answerMfpQuestion(rows, question) ?? '', /2 participating schools/, question)
  }
  for (const question of ['Please check how many schools in Bataan?',
    'Can you tell me how many DSWD schools are participating in the selected rows?',
    'Please check how many schools with zero deliveries into the selected rows',
    'Please check how many schools in 2025?',
    'Please check how many schools in Bataan into the selected rows']) {
    assert.equal(answerMfpQuestion(rows, question), null, question)
  }
})

test('unknown finances and beneficiaries remain missing while encoded zero is included', () => {
  const summary = summarizeMfpRows([school('original', { beneficiaries: 48 }), school('addition-only', { beneficiaries: null, service_fee: 0, total_funds_transferred: 0 })])
  assert.deepEqual(summary.metrics.service_fee, { value: 0, known: 1, missing: 1 })
  assert.deepEqual(summary.metrics.total_funds_transferred, { value: 0, known: 1, missing: 1 })
  assert.equal(summary.metrics.beneficiaries.value, 48)
  assert.equal(summary.metrics.beneficiaries.missing, 1)
  assert.equal(summarizeMfpRows([school('unknown')]).metrics.total_funds_transferred.value, null)
})

test('a narrower or conditional question never receives the whole-scope count or total', () => {
  for (const question of ['How many schools in Bataan?', 'How many schools have zero deliveries?',
    'Total beneficiaries for CSU', 'How many schools in 2025?', 'Total funds above 100000',
    'How many schools for DSWD?', 'How many DSWD schools are participating?', 'Total milk cost for DepEd', 'Total funds for DSWD',
    'How many schools with zero or delayed deliveries?', 'How many records delivered?']) {
    assert.equal(answerMfpQuestion([school('a')], question), null, question)
  }
  assert.match(answerMfpQuestion([school('a')], 'Total milk cost'), /30,000/)
  assert.match(answerMfpQuestion([school('a')], 'Total milk packs delivered vs target & completion rate'), /50.0%/)
})

test('rankings sort and display the requested measure instead of silently sorting packs or funds', () => {
  const rows = [school('packs', { center: 'Pack leader', milk_packs: 9000, beneficiaries: 1, service_fee: 0, total_funds_transferred: 90000 }),
    school('benef', { center: 'Beneficiary leader', milk_packs: 1, beneficiaries: 99, service_fee: 800, total_funds_transferred: 1000 })]
  for (const question of ['Top centers by beneficiaries', 'Top centers by shipping fee', 'Top centers by beneficiaries in the filtered rows']) {
    const result = answerMfpQuestion(rows, question)
    assert.ok(result.indexOf('| Beneficiary leader |') < result.indexOf('| Pack leader |'), question)
  }
  assert.match(answerMfpQuestion(rows, 'Top centers by beneficiaries'), /beneficiaries \|/)
  assert.equal(answerMfpQuestion(rows, 'Top centers by cooperatives'), null)
  assert.equal(answerMfpQuestion(rows, 'Largest centers by cooperatives'), null)
  assert.equal(answerMfpQuestion(rows, 'Most schools by center'), null)
  const targetRows = [school('a', { center: 'School packs leader', milk_packs: 100, source_contracts: [{ id: 'a', target: 10, delivered: 0 }] }),
    school('b', { center: 'Contract target leader', milk_packs: 10, source_contracts: [{ id: 'b', target: 100, delivered: 0 }] })]
  const targetAnswer = answerMfpQuestion(targetRows, 'Top centers by target milk packs in selected records')
  assert.ok(targetAnswer.indexOf('| Contract target leader |') < targetAnswer.indexOf('| School packs leader |'))
})

test('center breakdowns use all rows, retain missing values and report omitted groups', () => {
  const rows = Array.from({ length: 41 }, (_, index) => school(String(index), { center: `Center ${index}` }))
  const answer = answerMfpQuestion(rows, 'Break down milk packs and funds by Center and Region')
  assert.match(answer, /41 group\(s\) total/)
  assert.match(answer, /Showing 30/)
  assert.match(answer, /Unavailable/)
})
