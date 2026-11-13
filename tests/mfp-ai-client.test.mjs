import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const { ALL_MFP_ANALYSIS_COLUMNS } = load('src/lib/mfp-analysis-columns.ts')
function fixture() {
  let current
  const react = {
    useState(initial) { const store = current; const index = store.cursor++; if (!(index in store.values)) store.values[index] = typeof initial === 'function' ? initial() : initial
      return [store.values[index], next => { store.values[index] = typeof next === 'function' ? next(store.values[index]) : next }] },
    useRef(initial) { return react.useState(() => ({ current: initial }))[0] },
    useMemo: factory => factory(), useEffect() {},
  }
  const host = () => { const store = { cursor: 0, values: [] }; return (component, props) => { current = store; store.cursor = 0; return component(props) } }
  const scope = { filters: { year: '2026', funded_by: 'DepEd' }, version: 'a'.repeat(64), mode: 'filtered', selectedIds: new Set(),
    selectedColumns: new Set(ALL_MFP_ANALYSIS_COLUMNS), setMode(mode) { scope.mode = mode } }
  const { MfpAiAgent } = load('src/components/MfpAiAgent.tsx', { react, '@/components/MfpAnalysisScope': { useMfpAnalysisScope: () => scope } })
  const records = [{ id: 'a', year: 2026, funded_by: 'DepEd', center: 'CLSU', elementary_school: 'One' }, { id: 'b', year: 2026, funded_by: 'DepEd', center: 'CLSU', elementary_school: 'Two' }]
  const wrapper = host()
  let conversation = host()
  let previousKey
  const render = () => {
    const child = wrapper(MfpAiAgent, { records })
    if (child.key !== previousKey) { conversation = host(); previousKey = child.key }
    return conversation(child.type, child.props)
  }
  const open = () => { nodes(render()).find(node => node.type === 'button').props.onClick(); return render() }
  const send = text => {
    nodes(render()).find(node => node.type === 'textarea').props.onChange({ target: { value: text } })
    return nodes(render()).find(node => node.props?.['aria-label'] === 'Send analysis question').props.onClick()
  }
  return { scope, render, open, send }
}

test('the client sends only canonical filters/version/IDs and resets chat when analysis scope changes', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options) => { requests.push({ url, body: JSON.parse(options.body) }); return Response.json({ content: 'Verified answer', origin: 'computed', basis: 'Scoped calculation' }) }
  try {
    const f = fixture(); f.open()
    await f.send('How many schools are in this scope?')
    assert.equal(requests[0].url, '/api/ai/mfp')
    assert.deepEqual(requests[0].body.selectedIds, [])
    assert.equal(requests[0].body.scope, 'filtered')
    assert.equal(requests[0].body.context, undefined)
    assert.equal(requests[0].body.records, undefined)
    assert.ok(nodes(f.render()).some(node => node.props?.content === 'Verified answer'))
    f.scope.selectedIds = new Set(['a']); f.scope.mode = 'selected'
    assert.ok(!nodes(f.render()).some(node => node.props?.content === 'Verified answer'))
    await f.send('How many schools are in the selected rows?')
    assert.deepEqual(requests[1].body.selectedIds, ['a'])
    assert.equal(requests[1].body.scope, 'selected')
    assert.equal(requests[1].body.messages.length, 1)
  } finally { globalThis.fetch = originalFetch }
})

test('in-flight sends are single, Clear is disabled, and Cancel prevents a late answer', async () => {
  const originalFetch = globalThis.fetch
  let finish
  let calls = 0
  globalThis.fetch = () => { calls++; return new Promise(resolve => { finish = resolve }) }
  try {
    const f = fixture(); f.open()
    const pending = f.send('Explain this scope')
    const tree = nodes(f.render())
    assert.equal(tree.find(node => node.props?.title === 'Clear Conversation').props.disabled, true)
    await f.send('Another explanation')
    assert.equal(calls, 1)
    tree.find(node => node.type === 'button' && node.props.children === 'Cancel').props.onClick()
    finish(Response.json({ content: 'Late answer', origin: 'groq' }))
    await pending
    assert.ok(!nodes(f.render()).some(node => node.props?.content === 'Late answer'))
  } finally { globalThis.fetch = originalFetch }
})

test('a request for selected rows cannot silently analyze the full filtered scope', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = () => { throw new Error('Should not call the endpoint with mismatched scope') }
  try {
    const f = fixture(); f.open(); await f.send('How many schools in the selected rows?')
    assert.ok(nodes(f.render()).some(node => node.props?.role === 'alert'))
  } finally { globalThis.fetch = originalFetch }
})

test('column focus travels with requests, resets the conversation, and requires an explicit action', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return Response.json({ content: 'Scoped calculation', origin: 'computed' }) }
  try {
    const f = fixture(); f.open()
    f.scope.selectedColumns = new Set(['milk_packs', 'milk_cost'])
    assert.equal(requests.length, 0)
    await f.send('Total milk cost')
    assert.deepEqual(requests[0].columns, ['milk_packs', 'milk_cost'])
    f.scope.selectedColumns = new Set(['beneficiaries'])
    assert.ok(!nodes(f.render()).some(node => node.props?.content === 'Scoped calculation'))
    nodes(f.render()).find(node => node.type === 'button' && node.props.children === 'Analyze selected columns').props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(requests[1].action, 'columns')
    assert.deepEqual(requests[1].columns, ['beneficiaries'])
    assert.equal(requests[1].scope, 'filtered')
    assert.equal(requests[1].messages.length, 1)
    f.scope.selectedColumns = new Set()
    await f.send('Total milk packs')
    assert.equal(requests.length, 2)
    assert.ok(nodes(f.render()).some(node => node.props?.role === 'alert'))
  } finally { globalThis.fetch = originalFetch }
})

test('large computed column reports remain visible but are bounded in follow-up requests', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  const report = 'Calculated comparison row\n'.repeat(1000)
  globalThis.fetch = async (_url, options) => { requests.push(JSON.parse(options.body)); return Response.json({ content: report, origin: 'computed' }) }
  try {
    const f = fixture(); f.open()
    await f.send('Summarize this scope')
    assert.ok(nodes(f.render()).some(node => node.props?.content === report))
    await f.send('Explain these figures')
    const history = requests[1].messages.find(message => message.role === 'assistant')
    assert.ok(history.content.length < 6000)
    assert.match(history.content, /Earlier response abbreviated/)
  } finally { globalThis.fetch = originalFetch }
})

test('viewers can select source-school records for analysis while every source cell remains read-only', () => {
  const changes = []
  const analysis = { selectedIds: new Set(), toggle: id => changes.push(id), toggleAll: () => changes.push('all'), clear() {} }
  const { DataTable } = load('src/components/DataTable.tsx', {
    react: { useEffect() {}, useMemo: factory => factory(), useRef: value => ({ current: value }), useState: value => [typeof value === 'function' ? value() : value, () => {}] },
    'next/navigation': { useRouter: () => ({}) },
    '@/lib/supabase/client': { createClient: () => ({ from: () => { throw new Error('Analysis must not write data') } }) },
    '@/components/loading/AsyncFeedback': { useAsyncTask: () => async task => task() },
    '@/components/MfpAnalysisScope': { useMfpAnalysisScope: () => analysis },
  })
  const tree = nodes(DataTable({ records: [{ id: 'school', year: 2026, center: 'CLSU', elementary_school: 'Source School', mfp_link_status: 'linked' }], readOnly: true, userRole: 'viewer' }))
  const cells = tree.filter(node => node.props?.field)
  assert.ok(cells.length > 0 && cells.every(node => node.props.readOnly))
  const schoolCell = cells.find(node => node.props.field === 'elementary_school')
  const checkbox = nodes(schoolCell.props.render('Source School')).find(node => node.type === 'input')
  assert.ok(!checkbox.props.disabled)
  checkbox.props.onChange()
  tree.find(node => node.props?.['aria-label'] === 'Select all filtered records for analysis').props.onChange()
  assert.deepEqual(changes, ['school', 'all'])
})
