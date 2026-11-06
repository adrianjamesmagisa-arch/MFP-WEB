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

test('sync preserves unencoded money, honors zero, and does not repeat the parent contract', () => {
  const school = { id: 'school', year: 2026, center: 'NHQ', sdo: 'Batanes - CM', dropoff_name: 'School', milk_packs: 123 }
  const parent = { id: 'sdo', sdo: school.sdo, contract_amount: 1000000 }
  const existing = { milk_cost: 80, service_fee: 20, total_funds_transferred: 100 }
  const unencoded = buildMasterlistIdentity(school, parent, existing)
  assert.equal(Object.hasOwn(unencoded, 'milk_cost'), false)
  assert.equal(Object.hasOwn(unencoded, 'service_fee'), false)
  assert.equal(Object.hasOwn(unencoded, 'total_funds_transferred'), false)
  const encoded = buildMasterlistIdentity({ ...school, contract_amount: 0, service_fee: 0 }, parent, existing)
  assert.equal(encoded.milk_cost, 0)
  assert.equal(encoded.service_fee, 0)
  assert.equal(encoded.total_funds_transferred, 0)
  assert.equal(encoded.milk_packs, 123)
  assert.equal(encoded.milk_type, 'CM')
  assert.deepEqual(finance.buildDropoffFinancialPatch({ contract_amount: 50.1 }, existing), { milk_cost: 50.1, total_funds_transferred: 70.1 })
})

test('repeated sync updates the linked record instead of inserting a duplicate', async () => {
  const calls = []
  const db = { from: () => ({ update: payload => ({ eq: async (_, id) => { calls.push({ id, payload }); return { error: null } } }) }) }
  const school = { id: 'school', year: 2026, center: 'NHQ', sdo: 'Batanes - CM', dropoff_name: 'School', milk_packs: 123, contract_amount: 100, service_fee: 5 }
  for (let i = 0; i < 2; i++) {
    const result = await syncDropoffToMasterlist(db, school, null, { id: 'linked' })
    assert.equal(result.mfpId, 'linked')
  }
  assert.equal(calls.length, 2)
  for (const call of calls) {
    assert.equal(call.id, 'linked')
    assert.equal(call.payload.total_funds_transferred, 105)
  }
})

const schoolId = '12345678-1234-1234-1234-123456789012'
function endpointFixture({ user = { id: 'user' }, profile = { role: 'encoder', center: 'NHQ' }, center = 'NHQ', conflict = false, error = null, source = {}, mirror = { id: 'mfp' } } = {}) {
  const writes = []
  const sourceRow = { id: schoolId, year: 2026, center, contract_amount: null, service_fee: null, ...source }
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
    body: JSON.stringify({ id: schoolId, field: 'contract_amount', value: 100, expectedValue: null, ...overrides }),
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
    assert.deepEqual(Object.keys(fixture.writes[0]).sort(), ['contract_amount', 'updated_at'])
    assert.equal(fixture.writes[0].contract_amount, 100)
  }
})

test('financial endpoint reports conflicts and database failures instead of success', async () => {
  assert.equal((await endpointFixture({ conflict: true }).send()).status, 409)
  assert.equal((await endpointFixture({ error: { message: 'trigger failed' } }).send()).status, 500)
  const fixture = endpointFixture({ source: { contract_amount: 20 } })
  assert.equal((await fixture.send({ value: null, expectedValue: 20 })).status, 400)
  assert.equal(fixture.writes.length, 0)
  assert.equal((await endpointFixture().send({ field: 'center' })).status, 400)
  assert.equal((await endpointFixture().send({ value: -1 })).status, 400)
})

test('financial save explicitly warns about missing MFP links without inserting records', async () => {
  const fixture = endpointFixture({ mirror: null })
  const response = await fixture.send()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.match(body.warning, /no linked MFP Data record/)
  assert.equal(body.dropoff.contract_amount, 100)
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

test('an overlapping failed milk-pack save does not revert a confirmed financial save or its live KPI', async () => {
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
    dropoff_name: 'School', milk_packs: 10, contract_amount: null, service_fee: 0 }
  const render = () => {
    cursor = 0
    return SbfpDropoffTable({ center: 'NHQ', year: 2026, initialRows: [school], editable: true,
      financeReady: true, sdoOptions: [{ id: 'sdo', sdo: school.sdo, contract_amount: 100 }] })
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
  globalThis.fetch = async () => new Response(JSON.stringify({ dropoff: { ...school, contract_amount: 100 } }), {
    headers: { 'Content-Type': 'application/json' },
  })
  try {
    const milkCell = find(render(), node => node.props?.title === 'Enter the milk-pack count; volume and formulations update from this number')
    const pendingMilk = milkCell.props.onCommit(20)
    const moneyCell = find(render(), node => node.key === 'contract_amount')
    await moneyCell.props.onCommit(100)
    finishMilkSave({ error: { message: 'milk save failed' } })
    await pendingMilk
    const kpis = find(render(), node => node.type?.name === 'SbfpDropoffFinanceKpis')
    assert.equal(kpis.props.schools[0].contract_amount, 100)
    assert.equal(kpis.props.schools[0].milk_packs, 10)
    assert.equal(finance.reconcileDropoffFinance(kpis.props.parents, kpis.props.schools).status, 'Matched')
  } finally {
    globalThis.fetch = originalFetch
  }
})
