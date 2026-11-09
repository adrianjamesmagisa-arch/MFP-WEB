import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const names = load('src/lib/sbfp-dropoff-sync.ts')
const { normalizeProgramProcurementRows } = load('src/lib/program-spreadsheet-report.ts')
const finance = load('src/lib/sbfp-dropoff-finance.ts')

test('additional contract labels preserve their identity and canonical milk suffix', () => {
  assert.equal(names.composeSdoWithMilkType('Bataan add - pm', 'PM'), 'Bataan Add - PM')
  assert.equal(names.composeSdoWithMilkType('Bataan add. 2 - CM', 'CM'), 'Bataan Add 2 - CM')
  assert.equal(names.composeSdoWithMilkType('Bataan Add 3', 'SM'), 'Bataan Add 3 - SM')
  assert.equal(names.sdoEncoderDisplayName('Bataan Add 2 - PM'), 'Bataan Add 2')
})

test('original, lots, and additional contracts count as one geographic SDO per center', () => {
  const labels = ['Bataan - PM', 'Bataan Lot 1 - PM', 'Bataan 2 - SM', 'Bataan Add - PM', 'Bataan ADD. 2 - CM']
  assert.deepEqual([...new Set(labels.map(sdo => names.uniqueSdoCountKey(sdo, 'CLSU')))], ['clsu|bataan'])
  assert.notEqual(names.uniqueSdoCountKey(labels[0], 'CLSU'), names.uniqueSdoCountKey(labels[0], 'LCSF'))
  assert.equal(names.baseSdoName('Addison - PM'), 'Addison')
  assert.equal(names.baseSdoName('Add Town - PM'), 'Add Town')
})

const ordered = ['Bataan - PM', 'Bataan Lot 1 - PM', 'Bataan Lot 2 - PM', 'Bataan Add - PM', 'Bataan Add 1 - PM', 'Bataan Add 2 - PM', 'Bataan Add 10 - PM']

test('encoder and school contract options sort additions numerically after existing lots', () => {
  const rows = [...ordered].reverse().map((sdo, index) => ({ id: sdo, sdo, beneficiaries_pm: index * 100, amount: index * 1000 }))
  const sorted = names.sortSbfpEncoderRows([...rows, { id: 'new', sdo: 'New SDO - PM' }])
  assert.deepEqual(sorted.map(row => row.id), [...ordered, 'new'])
  assert.ok(names.compareSdoContractVariants('Calapan City 1 - PM', 'Calapan City 2 - PM') < 0)
})

test('reports preserve separate financial and delivery rows while grouping and sorting the SDO', () => {
  const procs = [...ordered].reverse().map((label, index) => ({ id: label, label, center: 'CLSU', year: 2026,
    milk_type: 'PM', contract_amount: index + 100, packs_delivered: index, region: label === ordered[0] ? 'III' : '' }))
  const rows = normalizeProgramProcurementRows(procs, [])
  assert.deepEqual(rows.map(row => row.id), ordered)
  for (const row of rows) {
    const source = procs.find(proc => proc.id === row.id)
    assert.equal(row.contract_amount, source.contract_amount)
    assert.equal(row.packs_delivered, source.packs_delivered)
    assert.equal(row.region, 'III')
  }
})

test('exact school-parent IDs cannot fall back to matching another contract name', () => {
  const children = [
    { id: 'original', sbfp_data_id: 'base', sdo: 'Bataan - PM' },
    { id: 'addition', sbfp_data_id: 'add', sdo: 'Bataan Add 1 - PM' },
    { id: 'stale-name', sbfp_data_id: 'other-add', sdo: 'Bataan Add 1 - PM' },
    { id: 'legacy-add', sdo: 'Bataan add. 1 - pm' },
    { id: 'legacy-base', sdo: 'Bataan - PM' },
    { id: 'legacy-lot', sdo: 'Bataan Lot 1 - PM' },
  ]
  assert.deepEqual(names.filterDropoffsForProcurementRows(children, [{ id: 'add', sdo: 'Bataan Add 1 - PM' }]).map(row => row.id),
    ['addition', 'legacy-add'])
  assert.deepEqual(names.filterDropoffsForProcurementRows(children, [{ id: 'base', sdo: 'Bataan - PM' }]).map(row => row.id),
    ['original', 'legacy-base'])
})

test('an additional school uses only its own parent contract price', () => {
  const school = { sbfp_data_id: 'add', milk_packs: 100, year: 2026, center: 'CLSU' }
  const parent = { id: 'add', sdo: 'Bataan Add - CM', milk_type: 'CM', pack_unit_price: 35, year: 2026, center: 'CLSU' }
  assert.equal(finance.calculateSchoolContract(school, parent).contractAmount, 3500)
  assert.equal(finance.calculateSchoolContract(school, { ...parent, id: 'base', pack_unit_price: 20 }).contractAmount, null)
})

test('renaming an additional contract updates only its schools and linked MFP records', async () => {
  const schools = ['base', 'add'].map(id => ({ id: `school-${id}`, sbfp_data_id: id, sdo: 'Bataan - CM',
    year: 2026, center: 'CLSU', dropoff_name: 'Same school', beneficiaries: 10, feeding_days: 2 }))
  const mirrors = schools.map(row => ({ id: `mfp-${row.id}`, source_dropoff_id: row.id, milk_cost: 1 }))
  const db = { from: table => {
    let patch = null
    const filters = []
    const rows = table === 'sbfp_dropoff_points' ? schools : mirrors
    const matching = () => rows.filter(row => filters.every(([field, value]) => row[field] === value))
    const query = {
      select: () => query,
      update: value => { patch = value; return query },
      eq: (field, value) => { filters.push([field, value]); return query },
      maybeSingle: async () => ({ data: matching()[0] || null, error: null }),
      then: resolve => {
        const selected = matching()
        if (patch) selected.forEach(row => Object.assign(row, patch))
        return Promise.resolve({ data: selected, error: null }).then(resolve)
      },
    }
    return query
  } }
  assert.deepEqual(await names.cascadeSdoRename(db, 'add', 'Bataan Add 2 - CM',
    { id: 'add', milk_type: 'CM', pack_unit_price: 35 }), { error: null, updated: 1 })
  assert.equal(schools[0].sdo, 'Bataan - CM')
  assert.equal(schools[1].sdo, 'Bataan Add 2 - CM')
  assert.equal(mirrors[0].milk_cost, 1)
  assert.equal(mirrors[1].milk_cost, 700)
  assert.equal(mirrors[1].division, 'Bataan')
  assert.equal(mirrors[1].source_dropoff_id, 'school-add')
})
