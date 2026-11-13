import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

function elements(node) {
  if (!node || typeof node !== 'object') return []
  return [node, ...[node.props?.children].flat(Infinity).flatMap(elements)]
}

function database(tables, failTable) {
  const reads = []
  return { reads, from(table) {
    reads.push(table)
    let predicates = []
    const query = {
      select: () => query, order: () => query,
      eq: (key, value) => { predicates.push(row => row[key] === value); return query },
      neq: (key, value) => { predicates.push(row => row[key] !== value); return query },
      gte: (key, value) => { predicates.push(row => row[key] >= value); return query },
      lt: (key, value) => { predicates.push(row => row[key] < value); return query },
      in: (key, values) => { predicates.push(row => values.includes(row[key])); return query },
      or: () => query,
      range: async (from, to) => ({ data: (tables[table] || []).filter(row => predicates.every(p => p(row))).slice(from, to + 1),
        error: table === failTable ? { message: 'Read failed' } : null }),
    }
    return query
  } }
}

const defaults = () => ({
  sbfp_dropoff_points: [
    { id: 's1', year: 2026, center: 'CLSU', sbfp_data_id: 'p1', sdo: 'Aurora - PM', dropoff_name: 'Source School One', include_in_masterlist: true, milk_packs: 120, beneficiaries: 3, feeding_days: 40, province: 'Aurora', municipality: 'Baler', created_at: '2026-08-01T00:00:00Z' },
    { id: 's2', year: 2026, center: 'CLSU', sbfp_data_id: 'p1', sdo: 'Aurora - PM', dropoff_name: 'Source School Two', include_in_masterlist: true, milk_packs: 80, beneficiaries: 2, feeding_days: 40, created_at: '2026-09-01T00:00:00Z' },
    { id: 'excluded', year: 2026, center: 'CLSU', dropoff_name: 'Excluded School', include_in_masterlist: false },
  ],
  sbfp_data: [{ id: 'p1', year: 2026, center: 'CLSU', sdo: 'Aurora - PM', milk_type: 'PM', supplier_id: 'coop', cooperatives: { name: 'Source Cooperative' }, delivery_start: '2026-08-01', delivery_end: '2026-10-01' }],
  mfp_data: [
    { id: 'm1', year: 2026, funded_by: 'DepEd', center: 'CLSU', source_dropoff_id: 's1', elementary_school: 'Stale school name', milk_packs: 999, milk_cost: 300, service_fee: 10, total_funds_transferred: 310 },
    { id: 'legacy', year: 2026, funded_by: 'DepEd', center: 'CLSU', elementary_school: 'Unlinked import' },
    { id: 'old', year: 2025, funded_by: 'DepEd', center: 'CLSU', elementary_school: 'Historical school' },
    { id: 'dswd', year: 2026, funded_by: 'DSWD', center: 'CLSU', municipality: 'DSWD municipality' },
  ],
})

async function pageFixture(params = { year: '2026', funded_by: 'DepEd' }, options = {}) {
  const db = database(options.tables || defaults(), options.failTable)
  const DataTable = () => null
  const ExportMfpCsvButton = () => null
  const MfpAiAgent = () => null
  const { default: DataPage } = load('src/app/(app)/data/page.tsx', {
    '@/lib/supabase/server': { createClient: async () => db },
    '@/lib/auth-session': { getCurrentUser: async () => ({ user: { id: 'user' }, profile: options.profile === undefined ? { role: 'super_admin' } : options.profile }) },
    '@/components/DataFilters': { DataFilters: () => null },
    '@/components/DataTable': { DataTable },
    '@/components/ExportMfpCsvButton': { ExportMfpCsvButton },
    '@/components/MfpAiAgent': { MfpAiAgent },
  })
  const tree = await DataPage({ searchParams: Promise.resolve(params) })
  const nodes = elements(tree)
  return { nodes, db,
    table: nodes.find(node => node.type === DataTable),
    csv: nodes.find(node => node.type === ExportMfpCsvButton),
    ai: nodes.find(node => node.type === MfpAiAgent) }
}

function additionalSchoolFixture() {
  const tables = defaults()
  Object.assign(tables.sbfp_data[0], { sdo: 'Baybay City - PM', packs_to_deliver: 2000, packs_delivered: 1000 })
  Object.assign(tables.sbfp_dropoff_points[0], { sdo: 'Baybay City - PM', dropoff_name: 'Altavista ES', beneficiaries: 48, feeding_days: 25, service_fee: 2.15 })
  tables.sbfp_data.push({ ...tables.sbfp_data[0], id: 'p2', sdo: 'Baybay City Add 1 - PM',
    delivery_start: '2026-11-01', delivery_end: '2026-12-01', packs_to_deliver: 4000, packs_delivered: 500 })
  tables.sbfp_dropoff_points.push({ ...tables.sbfp_dropoff_points[0], id: 'add-school', sbfp_data_id: 'p2',
    sdo: 'Baybay City Add 1 - PM', dropoff_name: ' altavista   ES ', beneficiaries: 123, feeding_days: 30,
    municipality: 'N/A', service_fee: 3.25 })
  return tables
}

test('original and Add school entries combine consistently for the list, CSV, AI and source trace', async () => {
  const result = await pageFixture(undefined, { tables: additionalSchoolFixture() })
  const rows = result.table.props.records
  assert.equal(rows.length, 2)
  const combined = rows.find(row => row.source_dropoff_ids?.length === 2)
  assert.ok(combined)
  assert.equal(combined.beneficiaries, 48)
  assert.equal(combined.milk_packs, 48 * 25 + 123 * 30)
  assert.equal(combined.milk_cost, (48 * 25 + 123 * 30) * 25)
  assert.equal(combined.service_fee, 5.4)
  assert.equal(combined.total_funds_transferred, combined.milk_cost + 5.4)
  assert.equal(combined.feeding_days, null)
  assert.ok(combined.combined_fields.includes('feeding_days'))
  assert.equal(combined.municipality, 'Baler')
  assert.equal(combined.date_started, '2026-08-01')
  assert.equal(combined.date_completed, '2026-12-01')
  assert.equal(combined.mfp_link_status, 'missing')
  assert.equal(combined.missing_source_links, 1)
  assert.deepEqual(new Set(combined.source_dropoff_ids), new Set(['s1', 'add-school']))
  assert.deepEqual(new Set(combined.source_contracts.map(row => row.id)), new Set(['p1', 'p2']))
  assert.equal(combined.source_dropoff_id, null)
  assert.equal(combined.target_milk_packs_to_deliver, 6000)
  assert.equal(combined.total_milk_packs_delivered, 1500)
  assert.deepEqual(result.csv.props.records, rows)
  assert.deepEqual(result.ai.props.records, rows)
})

test('different milk types, SDOs, centers, and ordinary lots do not combine', async () => {
  for (const change of [
    tables => { tables.sbfp_data[1].milk_type = 'SM'; tables.sbfp_data[1].sdo = 'Baybay City Add 1 - SM' },
    tables => { tables.sbfp_data[1].milk_type = 'CM'; tables.sbfp_data[1].sdo = 'Baybay City Add 1 - CM'; tables.sbfp_data[1].pack_unit_price = 35 },
    tables => { tables.sbfp_data[1].sdo = 'Other City Add - PM' },
    tables => { tables.sbfp_data[1].center = 'VSU'; tables.sbfp_dropoff_points[3].center = 'VSU' },
    tables => { tables.sbfp_data[1].sdo = 'Baybay City Lot 1 - PM' },
  ]) {
    const tables = additionalSchoolFixture()
    change(tables)
    assert.equal((await pageFixture(undefined, { tables })).table.props.records.length, 3)
  }
})

test('original-only beneficiaries preserve zero and unknown counts regardless of row ordering', async () => {
  for (const beneficiaries of [0, null]) {
    const tables = additionalSchoolFixture()
    tables.sbfp_dropoff_points[0].beneficiaries = beneficiaries
    tables.mfp_data[0].id = 'z-original'
    const before = structuredClone(tables)
    const result = await pageFixture(undefined, { tables })
    const combined = result.table.props.records.find(row => row.source_dropoff_ids)
    assert.equal(combined.beneficiaries, beneficiaries)
    assert.equal(combined.source_dropoff_ids[0], 'add-school')
    assert.deepEqual(tables, before)
  }
})

test('filtering applies to each contract before combining and excluded additions disappear', async () => {
  const tables = additionalSchoolFixture()
  const november = await pageFixture({ year: '2026', funded_by: 'DepEd', date_started_year: '2026', date_started_month: '11' }, { tables })
  assert.equal(november.table.props.records.length, 1)
  assert.equal(november.table.props.records[0].beneficiaries, null)
  assert.equal(november.table.props.records[0].milk_packs, 123 * 30)
  assert.equal(november.table.props.records[0].source_dropoff_id, 'add-school')
  const baler = await pageFixture({ year: '2026', funded_by: 'DepEd', municipality: 'Baler' }, { tables })
  assert.equal(baler.table.props.records.length, 1)
  assert.equal(baler.table.props.records[0].beneficiaries, 48)
  tables.sbfp_dropoff_points[3].include_in_masterlist = false
  const excluded = await pageFixture(undefined, { tables })
  assert.equal(excluded.table.props.records.length, 2)
  assert.equal(excluded.table.props.records[0].beneficiaries, 48)
})

test('combined finances preserve unknown shipping and explicit zero without mutating source inputs', async () => {
  for (const shipping of [null, 0]) {
    const tables = additionalSchoolFixture()
    tables.sbfp_dropoff_points[3].service_fee = shipping
    const before = structuredClone(tables)
    const result = await pageFixture(undefined, { tables })
    const combined = result.table.props.records.find(row => row.source_dropoff_ids)
    assert.equal(combined.service_fee, shipping === null ? null : 2.15)
    assert.equal(combined.total_funds_transferred, shipping === null ? null : combined.milk_cost + 2.15)
    assert.deepEqual(tables, before)
  }
})

test('same-named schools with conflicting known locations remain separate', async () => {
  for (const [field, value] of [['municipality', 'Other municipality'], ['province', 'Other province'], ['region', 'VIII']]) {
    const tables = additionalSchoolFixture()
    if (field === 'region') tables.sbfp_dropoff_points[0].region = 'III'
    tables.sbfp_dropoff_points[3][field] = value
    assert.equal((await pageFixture(undefined, { tables })).table.props.records.length, 3)
  }
})

test('numbered additions combine without an original, but unknown milk and duplicate entries in one contract stay separate', async () => {
  const tables = additionalSchoolFixture()
  tables.sbfp_data.push({ ...tables.sbfp_data[1], id: 'p3', sdo: 'Baybay City add. 2 - PM' })
  tables.sbfp_dropoff_points.push({ ...tables.sbfp_dropoff_points[3], id: 'add-two', sbfp_data_id: 'p3', beneficiaries: 0, service_fee: 0 })
  let rows = (await pageFixture(undefined, { tables })).table.props.records
  assert.equal(rows.length, 2)
  assert.equal(rows.find(row => row.source_dropoff_ids).source_dropoff_ids.length, 3)
  tables.sbfp_dropoff_points[0].include_in_masterlist = false
  rows = (await pageFixture(undefined, { tables })).table.props.records
  assert.equal(rows.length, 2)
  assert.equal(rows.find(row => row.source_dropoff_ids).beneficiaries, null)
  assert.equal(rows.find(row => row.source_dropoff_ids).milk_packs, 123 * 30)
  tables.sbfp_dropoff_points[4].sbfp_data_id = 'p2'
  assert.equal((await pageFixture(undefined, { tables })).table.props.records.length, 3)
  const { combineAdditionalSchoolRows } = load('src/lib/mfp-school-aggregation.ts')
  const unknownRows = ['base', 'add'].map((id, index) => ({ id, year: 2026, center: 'CLSU', elementary_school: 'School',
    source_contract_id: id, source_contract_label: index ? 'Baybay City Add' : 'Baybay City', milk_type: null }))
  assert.equal(combineAdditionalSchoolRows(unknownRows).length, 2)
})

test('2026 DepEd lists eligible SBFP schools, removes unlinked imports, and retains schools missing an MFP mirror', async () => {
  const result = await pageFixture()
  const rows = result.table.props.records
  assert.deepEqual(rows.map(row => row.elementary_school).sort(), ['Source School One', 'Source School Two'])
  assert.equal(rows.find(row => row.source_dropoff_id === 's1').milk_packs, 120)
  const missing = rows.find(row => row.source_dropoff_id === 's2')
  assert.equal(missing.mfp_link_status, 'missing')
  assert.equal(missing.milk_cost, 2000)
  assert.equal(missing.total_funds_transferred, null)
  assert.deepEqual(result.csv.props.records, rows)
  assert.deepEqual(result.ai.props.records, rows)
  assert.equal(result.table.props.resyncDelivery, null)
  assert.equal(result.table.props.resyncProgram, null)
})

test('historical DepEd and other programs keep their records; mixed filters replace only 2026 DepEd', async () => {
  for (const [params, expectedId] of [
    [{ year: '2025', funded_by: 'DepEd' }, 'old'],
    [{ year: '2026', funded_by: 'DSWD' }, 'dswd'],
  ]) {
    const result = await pageFixture(params)
    assert.deepEqual(result.table.props.records.map(row => row.id), [expectedId])
    assert.equal(result.db.reads.includes('sbfp_dropoff_points'), false)
  }
  const mixed = await pageFixture({ year: '2025,2026', funded_by: 'DepEd,DSWD' })
  assert.deepEqual(mixed.table.props.records.map(row => row.id).sort(), ['dswd', 'm1', 'old', 'sbfp-school:s2'])
  const all = await pageFixture({ year: '__ALL_YEARS__' })
  assert.deepEqual(all.table.props.records.map(row => row.id).sort(), ['dswd', 'm1', 'old', 'sbfp-school:s2'])
})

test('search, SDO, geography, delivery dates, supplier and input dates use resolved source values', async () => {
  const search = await pageFixture({ year: '2026', funded_by: 'DepEd', search: 'source school two' })
  assert.deepEqual(search.table.props.records.map(row => row.source_dropoff_id), ['s2'])
  const geography = await pageFixture({ year: '2026', funded_by: 'DepEd', province: 'Aurora', municipality: 'Baler', division: 'Aurora' })
  assert.deepEqual(geography.table.props.records.map(row => row.source_dropoff_id), ['s1'])
  const delivered = await pageFixture({ year: '2026', funded_by: 'DepEd', date_started_year: '2026', date_started_month: '08', supplier: 'coop' })
  assert.equal(delivered.table.props.records.length, 2)
  const otherMonth = await pageFixture({ year: '2026', funded_by: 'DepEd', date_completed_year: '2026', date_completed_month: '11' })
  assert.equal(otherMonth.table.props.records.length, 0)
  const input = await pageFixture({ year: '2026', funded_by: 'DepEd', input_year: '2026', input_month: '09' })
  assert.deepEqual(input.table.props.records.map(row => row.source_dropoff_id), ['s2'])
})

test('school year filters both source and stored records by June-through-April starts and keeps CSV and AI aligned', async () => {
  const tables = defaults()
  tables.sbfp_dropoff_points = []
  tables.sbfp_data = []
  tables.mfp_data = []
  const dates = ['2026-05-31', '2026-06-01', '2027-01-01', '2027-04-30', '2027-05-01', null]
  dates.forEach((date, index) => {
    tables.sbfp_data.push({ id: `p${index}`, year: 2026, center: 'CLSU', sdo: `Division ${index} - PM`, milk_type: 'PM', delivery_start: date })
    tables.sbfp_dropoff_points.push({ id: `s${index}`, year: 2026, center: 'CLSU', sbfp_data_id: `p${index}`,
      dropoff_name: `School ${index}`, include_in_masterlist: true, beneficiaries: 2, feeding_days: 10 })
    tables.mfp_data.push({ id: `stored${index}`, year: date?.startsWith('2027') ? 2027 : 2026,
      funded_by: 'DSWD', center: 'CLSU', date_started: date })
  })
  const result = await pageFixture({ school_year: '2026-2027' }, { tables, profile: { role: 'encoder', center: 'CLSU' } })
  const rows = result.table.props.records
  assert.deepEqual(rows.map(row => row.id).sort(), ['sbfp-school:s1', 'sbfp-school:s2', 'sbfp-school:s3', 'stored1', 'stored2', 'stored3'])
  assert.deepEqual(result.csv.props.records, rows)
  assert.deepEqual(result.ai.props.records, rows)
  assert.equal(result.ai.props.activeFilters.school_year, '2026-2027')
  assert.ok(result.table.key.startsWith('2026-2027:'))
  // With no school year selected, missing dates and May entries remain available.
  assert.equal((await pageFixture({}, { tables })).table.props.records.length, 12)
})

test('school-year filtering happens before original/Add aggregation', async () => {
  const tables = additionalSchoolFixture()
  tables.sbfp_data[1].delivery_start = '2027-05-01'
  let rows = (await pageFixture({ school_year: '2026-2027', funded_by: 'DepEd' }, { tables })).table.props.records
  assert.equal(rows.find(row => row.source_dropoff_id === 's1').milk_packs, 48 * 25)
  tables.sbfp_data[0].delivery_start = '2026-05-31'
  tables.sbfp_data[1].delivery_start = '2027-04-30'
  rows = (await pageFixture({ school_year: '2026-2027', funded_by: 'DepEd' }, { tables })).table.props.records
  assert.equal(rows.length, 1)
  assert.equal(rows[0].beneficiaries, null)
  assert.equal(rows[0].milk_packs, 123 * 30)
})

test('encoder scope is enforced before lookup, including NHQ aliases; missing profiles fail closed', async () => {
  const tables = defaults()
  tables.sbfp_dropoff_points.push({ id: 'nhq-school', year: 2026, center: 'NHQ', sdo: 'Batanes - CM',
    dropoff_name: 'NHQ school', milk_packs: 25, include_in_masterlist: true })
  tables.mfp_data.push({ id: 'nhq-mfp', year: 2026, center: 'NHQGP (NIZ)', funded_by: 'DepEd', source_dropoff_id: 'nhq-school' })
  const encoder = await pageFixture({ year: '2026', funded_by: 'DepEd', center: 'NHQ' }, { tables, profile: { role: 'encoder', center: 'CLSU' } })
  assert.deepEqual(new Set(encoder.table.props.records.map(row => row.center)), new Set(['CLSU']))
  const alias = await pageFixture({ year: '2026', funded_by: 'DepEd' }, { tables, profile: { role: 'encoder', center: 'NIZ' } })
  assert.deepEqual(alias.table.props.records.map(row => row.id), ['nhq-mfp'])
  const scopedAdmin = await pageFixture({ year: '2026', funded_by: 'DepEd', center: 'NHQGP (NIZ)' }, { tables })
  assert.deepEqual(scopedAdmin.table.props.records.map(row => row.id), ['nhq-mfp'])
  for (const profile of [null, { role: 'encoder', center: '' }]) {
    const denied = await pageFixture({ year: '2026', funded_by: 'DepEd' }, { profile })
    assert.equal(denied.table, undefined)
    assert.equal(denied.db.reads.length, 0)
    assert.ok(denied.nodes.some(node => node.props?.role === 'alert'))
  }
})

test('source read failure cannot fall back to imports or a misleading zero count', async () => {
  const original = console.error
  console.error = () => {}
  try {
    const failed = await pageFixture(undefined, { failTable: 'sbfp_dropoff_points' })
    assert.equal(failed.table, undefined)
    assert.equal(failed.csv, undefined)
    assert.ok(failed.nodes.some(node => node.props?.role === 'alert'))
  } finally { console.error = original }
})

test('all source pages are read, with one display row per school and no required financial migration', async () => {
  const tables = defaults()
  tables.sbfp_dropoff_points = Array.from({ length: 1001 }, (_, index) => ({
    id: `school-${index}`, year: 2026, center: 'CLSU', sdo: 'Aurora - PM',
    dropoff_name: `School ${index}`, beneficiaries: index, feeding_days: 1, milk_packs: 999, include_in_masterlist: true,
  }))
  const result = await pageFixture(undefined, { tables })
  assert.equal(result.table.props.records.length, 1001)
  assert.equal(new Set(result.table.props.records.map(row => row.id)).size, 1001)
  assert.equal(result.table.props.records[1000].milk_packs, 1000)
  assert.equal(result.table.props.records[1000].service_fee, null)
})

test('projection matches IDs, preserves encoded zeros and does not borrow another program’s data', () => {
  const { projectSbfpSchools } = load('src/lib/mfp-sbfp-source.ts')
  const schools = defaults().sbfp_dropoff_points
  const withMoney = schools.map(row => ({ ...row, contract_amount: 0, service_fee: 5 }))
  const projected = projectSbfpSchools(withMoney, defaults().sbfp_data, [
    { id: 'wrong-program', year: 2026, center: 'CLSU', funded_by: 'DSWD', source_dropoff_id: 's1', price: 999 },
    { id: 'same-name', year: 2026, center: 'CLSU', funded_by: 'DepEd', elementary_school: 'Source School Two', price: 999 },
  ])
  assert.equal(projected.length, 2)
  assert.equal(projected[0].mfp_link_status, 'missing')
  assert.equal(projected[0].price, null)
  assert.equal(projected[0].milk_cost, 3000)
  assert.equal(projected[0].total_funds_transferred, 3005)
  assert.throws(() => projectSbfpSchools(schools, [], [
    { id: 'a', source_dropoff_id: 's1' }, { id: 'b', source_dropoff_id: 's1' },
  ]), /Multiple MFP/)
})

test('CSV contains the same two schools and an explicit link status, leaving unknown money blank', async () => {
  const { table } = await pageFixture()
  const { ExportMfpCsvButton } = load('src/components/ExportMfpCsvButton.tsx')
  let captured
  const priorDocument = globalThis.document
  const priorCreate = URL.createObjectURL
  const priorRevoke = URL.revokeObjectURL
  globalThis.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } }
  URL.createObjectURL = blob => { captured = blob; return 'blob:test' }
  URL.revokeObjectURL = () => {}
  try {
    ExportMfpCsvButton({ records: table.props.records }).props.onClick()
    const csv = await captured.text()
    const lines = csv.trimEnd().split('\r\n')
    assert.equal(lines.length, 3)
    assert.match(lines[0], /MFP Link Status/)
    assert.match(csv, /Source School Two/)
    assert.match(csv, /Not yet linked/)
    assert.doesNotMatch(csv, /Unlinked import/)
    const headers = lines[0].split(',')
    const missing = lines.find(line => line.includes('Source School Two')).split(',')
    assert.equal(missing[headers.indexOf('Milk Cost')], '2000')
    assert.equal(missing[headers.indexOf('Total Funds')], '')
    const combinedResult = await pageFixture(undefined, { tables: additionalSchoolFixture() })
    ExportMfpCsvButton({ records: combinedResult.table.props.records }).props.onClick()
    const combinedCsv = await captured.text()
    const combinedLines = combinedCsv.trimEnd().split('\r\n')
    assert.equal(combinedLines.length, 3)
    const combinedHeaders = combinedLines[0].split(',')
    const combinedValues = combinedLines.find(line => line.includes('Altavista ES')).split(',')
    assert.equal(combinedValues[combinedHeaders.indexOf('Beneficiaries')], '48')
    assert.equal(combinedValues[combinedHeaders.indexOf('Milk Packs')], '4890')
    assert.equal(combinedValues[combinedHeaders.indexOf('Feeding Days')], 'Multiple')
    assert.match(combinedValues[combinedHeaders.indexOf('Source Contracts')], /Baybay City Add 1 - PM/)
  } finally {
    globalThis.document = priorDocument
    URL.createObjectURL = priorCreate
    URL.revokeObjectURL = priorRevoke
  }
})

test('source school rows edit through SBFP and Select All uses only independently editable MFP rows', async () => {
  const { table } = await pageFixture()
  let selection
  const Link = () => null
  const hooks = {
    useEffect: () => {}, useMemo: factory => factory(), useRef: value => ({ current: value }),
    useState: initial => {
      const value = typeof initial === 'function' ? initial() : initial
      return [value, next => { if (value instanceof Set) selection = typeof next === 'function' ? next(value) : next }]
    },
  }
  const { DataTable } = load('src/components/DataTable.tsx', {
    '@/components/MfpAnalysisScope': { useMfpAnalysisScope: () => null },
    react: hooks, 'next/link': { default: Link }, 'next/navigation': { useRouter: () => ({}) },
    '@/lib/supabase/client': { createClient: () => ({ from: () => { throw new Error('Unexpected database operation') } }) },
    '@/components/loading/AsyncFeedback': { useAsyncTask: () => async task => task() },
  })
  const tree = DataTable({ records: [...table.props.records, { id: 'dswd', year: 2026, funded_by: 'DSWD', center: 'CLSU' }], userRole: 'super_admin' })
  const nodes = elements(tree)
  const missingCells = nodes.filter(node => node.props?.id === 'sbfp-school:s2' && node.props?.field)
  assert.ok(missingCells.length > 0)
  assert.ok(missingCells.every(node => node.props.readOnly))
  assert.ok(nodes.filter(node => node.props?.id === 'm1' && node.props?.field).every(node => node.props.readOnly))
  assert.equal(nodes.some(node => String(node.props?.href || '').includes('sbfp-school:')), false)
  assert.equal(nodes.some(node => node.props?.href === '/data/m1/edit'), false)
  assert.ok(nodes.some(node => node.props?.href === '/sbfp/center/CLSU?sy=2026-2027#dropoff-points'))
  const headerCheckbox = nodes.find(node => node.type === 'input' && node.props?.type === 'checkbox')
  headerCheckbox.props.onChange()
  assert.deepEqual([...selection], ['dswd'])
  const combinedTables = additionalSchoolFixture()
  combinedTables.sbfp_data[0].batch = '1'
  combinedTables.sbfp_data[1].batch = '2'
  const combinedResult = await pageFixture(undefined, { tables: combinedTables })
  const combinedRows = combinedResult.table.props.records
  const combined = combinedRows.find(row => row.source_dropoff_ids)
  const combinedNodes = elements(DataTable({ records: combinedRows, userRole: 'super_admin' }))
  const combinedCells = combinedNodes.filter(node => node.props?.id === combined.id && node.props?.field)
  assert.ok(combinedCells.every(node => node.props.readOnly))
  for (const field of ['feeding_days', 'batch']) {
    const cell = combinedCells.find(node => node.props.field === field)
    assert.equal(cell.props.mixed, true)
    assert.ok(elements(cell.type(cell.props)).some(node => [node.props?.children].flat().includes('Multiple')))
  }
  const schoolCell = combinedCells.find(node => node.props.field === 'elementary_school')
  assert.ok(elements(schoolCell.props.render(schoolCell.props.value)).some(node => node.type === 'details'))
  assert.ok(combinedNodes.some(node => node.type === 'td' && node.props?.title?.startsWith('Target milk packs') && node.props.children === '6,000'))
})

test('shared analytics counts contract deliveries once even when another school references the contract', async () => {
  const result = await pageFixture(undefined, { tables: additionalSchoolFixture() })
  const { summarizeMfpRows } = load('src/lib/mfp-analytics.ts')
  const summary = summarizeMfpRows(result.table.props.records)
  assert.equal(summary.target.value, 6000)
  assert.equal(summary.delivered.value, 1500)
  assert.equal(summary.metrics.milk_packs.value, 4970)
  assert.equal(summary.metrics.beneficiaries.value, 50)
})

test('orphan schools with unknown milk type keep milk-dependent formulations and missing metadata blank', () => {
  const { projectSbfpSchools } = load('src/lib/mfp-sbfp-source.ts')
  const [orphan] = projectSbfpSchools([{ id: 'orphan', year: 2026, center: 'CLSU', sdo: 'Aurora',
    dropoff_name: 'Orphan school', beneficiaries: 4, feeding_days: 25, milk_packs: 999, include_in_masterlist: true }], [], [])
  assert.equal(orphan.milk_packs, 100)
  assert.equal(orphan.feeding_days,25)
  assert.equal(orphan.beneficiaries,4)
  for (const field of ['milk_type', 'total_volume_requirements', 'raw_milk_liters', 'whole_milk_kg', 'skimmed_milk_kg', 'sugar']) {
    assert.equal(orphan[field], null, field)
  }
})

test('shared analytics distinguishes unknown total funds from an explicitly encoded zero', () => {
  const { summarizeMfpRows } = load('src/lib/mfp-analytics.ts')
  const summary = summarizeMfpRows([
    { id: 'unknown', mfp_link_status: 'missing', milk_cost: 100, total_funds_transferred: null },
    { id: 'known-zero', mfp_link_status: 'linked', milk_cost: 50, total_funds_transferred: 0 },
  ])
  assert.deepEqual(summary.metrics.total_funds_transferred, { value: 0, known: 1, missing: 1 })
  assert.equal(summary.metrics.milk_cost.value, 150)
})
