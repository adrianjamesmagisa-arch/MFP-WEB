import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const finance = load('src/lib/sbfp-dropoff-finance.ts')
const { buildMasterlistIdentity, syncDropoffToMasterlist } = load('src/lib/sbfp-dropoff-sync.ts')

test('rejects negative, malformed, excessive precision, and out-of-range money; preserves blank versus zero', () => {
  for (const value of [-1, '1.001', 'NaN', Infinity, true, {}, '1,000', '1e3', 1_000_000_000_000]) {
    assert.ok(finance.parseDropoffAmount(value).error, String(value))
  }
  assert.deepEqual(finance.parseDropoffAmount(null), { value: null, error: null })
  assert.deepEqual(finance.parseDropoffAmount(''), { value: null, error: null })
  assert.deepEqual(finance.parseDropoffAmount('0.00'), { value: 0, error: null })
  assert.deepEqual(finance.parseDropoffAmount('123456.78'), { value: 123456.78, error: null })
})

test('milk-only allocations match the SDO contract while shipping increases MFP funds', () => {
  const totals = finance.reconcileDropoffFinance([{ id: 'sdo1', contract_amount: 100000 }], [
    { sbfp_data_id: 'sdo1', contract_amount: 60000, service_fee: 3000 },
    { sbfp_data_id: 'sdo1', contract_amount: 40000, service_fee: 2000 },
  ])
  assert.equal(totals.status, 'Matched')
  assert.equal(totals.difference, 0)
  assert.equal(totals.total, 105000)
  assert.equal(totals.shipping, 5000)
})

test('separate contracts cannot cancel out each other’s over/underallocation', () => {
  const parents = [{ id: 'pm', contract_amount: 100 }, { id: 'sm', contract_amount: 100 }]
  const schools = [
    { sbfp_data_id: 'pm', contract_amount: 150, service_fee: 0 },
    { sbfp_data_id: 'sm', contract_amount: 50, service_fee: 0 },
  ]
  const all = finance.reconcileDropoffFinance(parents, schools)
  assert.equal(all.difference, 0)
  assert.equal(all.status, 'Overallocated')
  assert.equal(all.overallocatedContracts, 1)
  assert.equal(all.underallocatedContracts, 1)
  assert.equal(finance.reconcileDropoffFinance(parents, schools, 'sm').status, 'Underallocated')
  assert.equal(finance.reconcileDropoffFinance(parents, schools, 'pm').difference, -50)
})

test('missing amounts and unlinked schools cannot masquerade as a complete reconciliation', () => {
  const result = finance.reconcileDropoffFinance([{ id: 'p', contract_amount: 0 }], [
    { sbfp_data_id: 'p', contract_amount: null, service_fee: null },
    { sbfp_data_id: null, contract_amount: 99, service_fee: 10 },
    { sbfp_data_id: 'p', contract_amount: 99, service_fee: 10, include_in_masterlist: false },
  ])
  assert.equal(result.status, 'Incomplete')
  assert.equal(result.allocated, 0)
  assert.equal(result.schools, 1)
  assert.equal(result.unlinked, 1)
  assert.equal(result.missingMilk, 1)
  assert.equal(result.missingShipping, 1)
  assert.equal(finance.reconcileDropoffFinance([], []).status, 'Incomplete')
})

test('decimal reconciliation uses cents, including a one-cent allocation gap', () => {
  const p = [{ id: 'p', contract_amount: 0.3 }]
  const s = [{ sbfp_data_id: 'p', contract_amount: 0.1, service_fee: 0.1 }, { sbfp_data_id: 'p', contract_amount: 0.2, service_fee: 0.2 }]
  assert.equal(finance.reconcileDropoffFinance(p, s).total, 0.6)
  assert.equal(finance.reconcileDropoffFinance(p, s).status, 'Matched')
  assert.equal(finance.reconcileDropoffFinance([{ id: 'p', contract_amount: 0.31 }], s).difference, 0.01)
})

test('sync calculates school milk cost, preserves unknown shipping, and ignores manual/parent contract amounts', () => {
  const school = { id: 'school', sbfp_data_id: 'sdo', year: 2026, center: 'NHQ', sdo: 'Batanes - CM', dropoff_name: 'School', beneficiaries: 123, feeding_days: 1, milk_packs: 999 }
  const parent = { id: 'sdo', sdo: school.sdo, milk_type: 'CM', pack_unit_price: 12.5, contract_amount: 1000000 }
  const existing = { milk_cost: 80, service_fee: 20, total_funds_transferred: 100 }
  const unencoded = buildMasterlistIdentity(school, parent, existing)
  assert.equal(unencoded.milk_cost, 1537.5)
  assert.equal(Object.hasOwn(unencoded, 'service_fee'), false)
  assert.equal(unencoded.total_funds_transferred, null)
  const encoded = buildMasterlistIdentity({ ...school, beneficiaries: 0, contract_amount: 999, service_fee: 0 }, parent, existing)
  assert.equal(encoded.milk_cost, 0)
  assert.equal(encoded.service_fee, 0)
  assert.equal(encoded.total_funds_transferred, 0)
  assert.equal(encoded.milk_packs, 0)
  assert.equal(encoded.milk_type, 'CM')
  assert.deepEqual(finance.buildDropoffFinancialPatch({ ...school, contract_amount: 50.1 }, null), { milk_cost: null, total_funds_transferred: null })
})

test('repeated sync updates the linked record instead of inserting a duplicate', async () => {
  const calls = []
  const db = { from: () => ({ update: payload => ({ eq: async (_, id) => { calls.push({ id, payload }); return { error: null } } }) }) }
  const school = { id: 'school', sbfp_data_id: 'sdo', year: 2026, center: 'NHQ', sdo: 'Batanes - CM', dropoff_name: 'School', beneficiaries: 123, feeding_days: 1, milk_packs: 999, contract_amount: 100, service_fee: 5 }
  for (let i = 0; i < 2; i++) {
    const result = await syncDropoffToMasterlist(db, school, { id: 'sdo', milk_type: 'CM', pack_unit_price: 10 }, { id: 'linked' })
    assert.equal(result.mfpId, 'linked')
  }
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.equal(call.id, 'linked')
    assert.equal(call.payload.total_funds_transferred, 1235)
  }
})

const schoolId = '12345678-1234-1234-1234-123456789012'
function endpointFixture({ user = { id: 'user' }, profile = { role: 'encoder', center: 'NHQ' }, center = 'NHQ', conflict = false, error = null, source = {}, mirror = { id: 'mfp' }, automaticSetup = true } = {}) {
  const writes = []
  const sourceRow = { id: schoolId, year: 2026, center, contract_amount: null, service_fee: null, contract_unit_price: 25, ...source }
  if (!automaticSetup) delete sourceRow.contract_unit_price
  const admin = { from: table => {
    let patch = null
    const query = {
      select: () => query, eq: () => query, is: () => query,
      update: values => { patch = values; writes.push(values); return query },
      maybeSingle: async () => patch
        ? { data: conflict ? null : { ...sourceRow, ...patch }, error }
        : { data: table === 'mfp_data' ? mirror : sourceRow, error: null },
    }
    return query
  } }
  const supabase = {
    auth: { getUser: async () => ({ data: { user } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile, error: null }) }) }) }),
  }
  const { POST } = load('src/app/api/sbfp/dropoff-finance/route.ts', {
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/supabase/admin': { supabaseAdmin: admin },
  })
  const send = async (overrides = {}) => POST(new Request('http://localhost/api/sbfp/dropoff-finance', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: schoolId, field: 'service_fee', value: 100, expectedValue: null, ...overrides }),
  }))
  return { send, writes }
}

test('financial endpoint rejects unauthenticated, viewer, missing-profile, and other-center writes', async () => {
  for (const [options, status] of [
    [{ user: null }, 401], [{ profile: null }, 403],
    [{ profile: { role: 'viewer', center: 'NHQ' } }, 403],
    [{ profile: { role: 'encoder', center: 'CLSU' } }, 403],
    [{ profile: { role: 'encoder', center: null } }, 403],
  ]) {
    const fixture = endpointFixture(options)
    assert.equal((await fixture.send()).status, status)
    assert.equal(fixture.writes.length, 0)
  }
})

test('financial endpoint permits assigned-center aliases and super admin, writing only the requested school field', async () => {
  for (const profile of [{ role: 'encoder', center: 'NHQGP (NIZ)' }, { role: 'super_admin', center: 'CLSU' }]) {
    const fixture = endpointFixture({ profile })
    const response = await fixture.send({ center: 'CLSU', total_funds_transferred: 999 })
    assert.equal(response.status, 200)
    assert.equal(fixture.writes.length, 1)
    assert.deepEqual(Object.keys(fixture.writes[0]).sort(), ['service_fee', 'updated_at'])
    assert.equal(fixture.writes[0].service_fee, 100)
  }
})

test('financial endpoint reports conflicts and database failures instead of success', async () => {
  assert.equal((await endpointFixture({ conflict: true }).send()).status, 409)
  assert.equal((await endpointFixture({ error: { message: 'trigger failed' } }).send()).status, 500)
  const fixture = endpointFixture({ source: { service_fee: 20 } })
  assert.equal((await fixture.send({ value: null, expectedValue: 20 })).status, 400)
  assert.equal(fixture.writes.length, 0)
  assert.equal((await endpointFixture().send({ field: 'center' })).status, 400)
  assert.equal((await endpointFixture().send({ field: 'contract_amount' })).status, 400)
  assert.equal((await endpointFixture().send({ value: -1 })).status, 400)
})

test('shipping endpoint requires the automatic-finance setup, not only the old manual columns', async () => {
  const oldSetup = endpointFixture({ automaticSetup: false })
  assert.equal((await oldSetup.send()).status, 503)
  assert.equal(oldSetup.writes.length, 0)
  assert.equal((await endpointFixture({ source: { contract_unit_price: null } }).send()).status, 200)
})

test('financial save explicitly warns about missing MFP links without inserting records', async () => {
  const fixture = endpointFixture({ mirror: null })
  const response = await fixture.send()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.match(body.warning, /no linked MFP Data record/)
  assert.equal(body.dropoff.service_fee, 100)
  assert.equal(fixture.writes.length, 1)
  const excluded = endpointFixture({ mirror: null, source: { include_in_masterlist: false } })
  assert.equal((await (await excluded.send()).json()).warning, null)
})

test('school loader paginates and falls back only for missing columns, surfacing unrelated failures', async () => {
  const { loadSbfpDropoffs } = load('src/lib/sbfp-dropoff-load.ts')
  const makeDb = probeError => {
    const selected = []
    return { selected, from: () => {
      const query = {
        select: columns => { selected.push(columns); return query },
        limit: async () => ({ error: probeError }),
        eq: () => query, order: () => query,
        range: async (from, to) => ({
          data: from >= 1001 ? [] : Array.from({ length: Math.min(to + 1, 1001) - from }, (_, i) => ({ id: `school-${from + i}` })), error: null,
        }),
      }
      return query
    } }
  }
  const ready = makeDb(null)
  const result = await loadSbfpDropoffs(ready, 'NHQ', 2026)
  assert.equal(result.data.length, 1001)
  assert.equal(result.financeReady, true)
  const missing = makeDb({ code: '42703', message: 'missing column' })
  assert.equal((await loadSbfpDropoffs(missing, 'NHQ', 2026)).financeReady, false)
  assert.equal(missing.selected.at(-1).includes('contract_amount'), false)
  const denied = makeDb({ code: '42501', message: 'permission denied' })
  assert.equal((await loadSbfpDropoffs(denied, 'NHQ', 2026)).error.message, 'permission denied')
  assert.equal(denied.selected.length, 1)
})

test('an overlapping failed beneficiary save does not revert a confirmed shipping save or its live KPI', async () => {
  // Run the real event handlers with a minimal hook host and controlled request order.
  const slots = []
  let cursor = 0
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useMemo: factory => factory(), useEffect: () => {},
  }
  let finishMilkSave
  const milkSave = new Promise(resolve => { finishMilkSave = resolve })
  const db = { from: () => ({ update: () => ({ eq: () => milkSave }) }) }
  const { SbfpDropoffTable } = load('src/components/SbfpDropoffTable.tsx', {
    react: hooks,
    '@/lib/supabase/client': { createClient: () => db },
    '@/lib/center-activity': { logCenterActivity: async () => {} },
  })
  const school = { id: schoolId, year: 2026, center: 'NHQ', sdo: 'Batanes - CM', sbfp_data_id: 'sdo',
    dropoff_name: 'School', beneficiaries: 2, feeding_days: 5, milk_packs: 10, contract_amount: null, service_fee: 0 }
  let parentPrice = 10
  const render = () => {
    cursor = 0
    return SbfpDropoffTable({ center: 'NHQ', year: 2026, initialRows: [school], editable: true,
      financeReady: true, sdoOptions: [{ id: 'sdo', sdo: school.sdo, milk_type: 'CM', pack_unit_price: parentPrice, contract_amount: 100 }] })
  }
  const find = (element, predicate) => {
    if (!element || typeof element !== 'object') return null
    if (predicate(element)) return element
    const children = element.props?.children
    for (const child of Array.isArray(children) ? children.flat(Infinity) : [children]) {
      const result = find(child, predicate)
      if (result) return result
    }
    return null
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ dropoff: { ...school, service_fee: 100 } }), {
    headers: { 'Content-Type': 'application/json' },
  })
  try {
    const beneficiaryCell = find(render(), node => node.props?.title === 'Enter beneficiaries; milk packs calculate automatically')
    const pendingMilk = beneficiaryCell.props.onCommit(4)
    const moneyCell = find(render(), node => node.key === 'service_fee')
    await moneyCell.props.onCommit(100)
    finishMilkSave({ error: { message: 'milk save failed' } })
    await pendingMilk
    const kpis = find(render(), node => node.type?.name === 'SbfpDropoffFinanceKpis')
    assert.equal(kpis.props.schools[0].service_fee, 100)
    assert.equal(kpis.props.schools[0].milk_packs, 10)
    assert.equal(kpis.props.schools[0].contract_amount, 100)
    assert.equal(finance.reconcileDropoffFinance(kpis.props.parents, kpis.props.schools).status, 'Matched')
    // Typing beneficiaries previews packs/cost before blur; cancelling restores them.
    const packsInput = find(render(), node => node.props?.title === 'Enter beneficiaries; milk packs calculate automatically')
    packsInput.props.onDraft('6')
    assert.equal(find(render(), node => node.type?.name === 'SbfpDropoffFinanceKpis').props.schools[0].contract_amount, 300)
    packsInput.props.onDraft(null)
    parentPrice = 12.5
    const changed = find(render(), node => node.type?.name === 'SbfpDropoffFinanceKpis')
    assert.equal(changed.props.schools[0].contract_amount, 125)
    assert.equal(changed.props.schools[0].service_fee, 100)
    assert.equal(find(render(), node => node.key === 'contract_amount'), null)
    const calculatedPacks = find(render(), node => node.type === 'td' && node.props?.title === 'Automatically calculated: beneficiaries × feeding days')
    assert.equal(calculatedPacks.props.onCommit,undefined)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('school cost uses the exact parent price and rounds decimal CM prices to cents', () => {
  const school = { sbfp_data_id: 'sdo', year: 2026, center: 'NHQ', milk_packs: 2125 }
  assert.equal(finance.calculateSchoolContract(school, { id: 'sdo', milk_type: 'SM', pack_unit_price: 99 }).contractAmount, 63750)
  assert.equal(finance.calculateSchoolContract(school, { id: 'sdo', milk_type: 'PM', pack_unit_price: 99 }).contractAmount, 53125)
  for (const [packs, price, expected] of [[1, 1.005, 1.01], [3, 0.335, 1.01], [100, 0.1, 10], [0, 25, 0]]) {
    assert.equal(finance.calculateSchoolContract({ ...school, milk_packs: packs }, { id: 'sdo', milk_type: 'CM', pack_unit_price: price }).contractAmount, expected)
  }
  assert.equal(finance.calculateSchoolContract(school, { id: 'sdo', sdo: 'Batanes - CM', pack_unit_price: 20 }).contractAmount, 42500)
})

test('missing prices, parents, wrong scope, invalid packs and excessive amounts stay unknown', () => {
  const school = { sbfp_data_id: 'sdo', year: 2026, center: 'NHQ', milk_packs: 20, contract_amount: 999 }
  for (const parent of [null, { id: 'other', milk_type: 'PM' }, { id: 'sdo', milk_type: 'CM' },
    { id: 'sdo', milk_type: 'CM', pack_unit_price: -1 }, { id: 'sdo' },
    { id: 'sdo', milk_type: 'PM', year: 2025 }, { id: 'sdo', milk_type: 'PM', center: 'CLSU' }]) {
    assert.equal(finance.calculateSchoolContract(school, parent).contractAmount, null)
  }
  for (const milk_packs of [null, -1, 1.5, 2147483648]) {
    assert.equal(finance.calculateSchoolContract({ ...school, milk_packs }, { id: 'sdo', milk_type: 'PM' }).contractAmount, null)
  }
  assert.equal(finance.calculateSchoolContract(school, { id: 'sdo', milk_type: 'CM', pack_unit_price: 999999999999 }).contractAmount, null)
  assert.equal(finance.calculateSchoolContract(school, { id: 'sdo', milk_type: 'PM', center: 'NHQGP (NIZ)' }).contractAmount, 500)
})

test('pack, price and SDO changes recalculate milk cost independently of shipping', () => {
  const school = { sbfp_data_id: 'sdo', beneficiaries: 10, feeding_days: 1, milk_packs: 999, service_fee: 5, contract_amount: 999 }
  const parent = { id: 'sdo', milk_type: 'CM', pack_unit_price: 12.5 }
  assert.deepEqual(finance.buildDropoffFinancialPatch(school, parent), { milk_cost: 125, service_fee: 5, total_funds_transferred: 130 })
  assert.equal(finance.buildDropoffFinancialPatch({ ...school, beneficiaries: 20 }, parent).total_funds_transferred, 255)
  assert.equal(finance.buildDropoffFinancialPatch(school, { ...parent, pack_unit_price: 15 }).total_funds_transferred, 155)
  assert.equal(finance.buildDropoffFinancialPatch({ ...school, sbfp_data_id: 'pm' }, { id: 'pm', milk_type: 'PM' }).total_funds_transferred, 255)
  assert.equal(finance.buildDropoffFinancialPatch({ ...school, service_fee: null }, parent).total_funds_transferred, null)
})
