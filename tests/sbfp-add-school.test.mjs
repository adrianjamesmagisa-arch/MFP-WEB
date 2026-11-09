import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate)
    if (result) return result
  }
  return null
}

test('Add school keeps the chosen SDO, reports a failed insert, and clears the error after a successful retry', async () => {
  const slots = []
  let cursor = 0
  const hooks = {
    useState(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef(initial) {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useMemo: factory => factory(), useEffect() {},
  }
  const attempts = []
  let fail = true
  const db = { from: () => ({ insert: payload => ({ select: () => ({ maybeSingle: async () => {
    attempts.push(payload)
    if (fail) return { data: null, error: { message: 'relation "profiles" does not exist' } }
    return { data: { ...payload, id: 'new-school' }, error: null }
  } }) }) }) }
  const { SbfpDropoffTable } = load('src/components/SbfpDropoffTable.tsx', {
    react: hooks,
    '@/lib/supabase/client': { createClient: () => db },
    '@/lib/center-activity': { logCenterActivity: async () => {} },
  })
  const render = () => {
    cursor = 0
    return SbfpDropoffTable({ center: 'LCSF', year: 2026, initialRows: [], editable: true,
      sdoOptions: [{ id: 'first', sdo: 'Another SDO', milk_type: 'SM' },
        { id: 'bais', sdo: 'Bais City', milk_type: 'PM', feeding_days: 25 }] })
  }
  const add = () => find(render(), node => node.type === 'button' && [node.props.children].flat(Infinity).includes('Add school'))
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { headers: { 'Content-Type': 'application/json' } })
  try {
    find(render(), node => node.type === 'select').props.onChange({ target: { value: 'bais' } })
    await add().props.onClick()
    assert.equal(attempts[0].sbfp_data_id,'bais')
    assert.equal(attempts[0].milk_packs,0)
    assert.ok(find(render(), node => [node.props?.children].flat(Infinity).includes('relation "profiles" does not exist')))
    assert.equal(add().props.disabled,false)
    fail = false
    await add().props.onClick()
    assert.equal(attempts[1].dropoff_name,'New school')
    assert.equal(attempts[1].sbfp_data_id,'bais')
    assert.ok(find(render(), node => node.props?.['data-row-id'] === 'new-school'))
    assert.equal(find(render(), node => [node.props?.children].flat(Infinity).includes('relation "profiles" does not exist')),null)
  } finally {
    globalThis.fetch = originalFetch
  }
})
