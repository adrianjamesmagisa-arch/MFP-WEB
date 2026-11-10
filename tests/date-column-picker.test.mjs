import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
function hooksHarness() {
  let current
  let nextId = 0
  const hooks = {
    useState(initial) {
      const store = current
      const index = store.cursor++
      if (!(index in store.slots)) store.slots[index] = typeof initial === 'function' ? initial() : initial
      return [store.slots[index], next => { store.slots[index] = typeof next === 'function' ? next(store.slots[index]) : next }]
    },
    useRef(initial) { return hooks.useState(() => ({ current: initial }))[0] },
    useId() { return hooks.useState(() => `test-date-${nextId++}`)[0] },
    useEffect() {}, useMemo: factory => factory(), useCallback: callback => callback,
  }
  const host = () => {
    const store = { slots: [], cursor: 0 }
    return { render(component, props) { current = store; store.cursor = 0; return component(props) } }
  }
  return { hooks, host }
}

function pickerFixture(props = {}) {
  const { hooks, host } = hooksHarness()
  let portal
  const { DateColumnPicker } = load('src/components/DateColumnPicker.tsx', {
    react: hooks, 'react-dom': { createPortal: child => { portal = child; return child } },
    './DateColumnPicker.module.css': new Proxy({}, { get: (_, key) => key }),
  })
  const calls = []
  const wrapper = host()
  let dialogHost
  const properties = { title: 'Add delivered-as-of date', children: 'Add date', existingDates: [],
    onConfirm: async date => { calls.push(date) }, ...props }
  const renderWrapper = () => { portal = null; return wrapper.render(DateColumnPicker, properties) }
  const render = () => dialogHost.render(portal.type, portal.props)
  return { calls,
    open() { const button = nodes(renderWrapper()).find(node => node.type === 'button'); button.props.onClick(); renderWrapper(); dialogHost = host(); return render() },
    change(value) { nodes(render()).find(node => node.type === 'input').props.onChange({ target: { value } }); return render() },
    submit: () => nodes(render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} }),
    cancel() { nodes(render()).find(node => node.type === 'button' && node.props.children === 'Cancel').props.onClick() },
    escape() { nodes(render()).find(node => node.type === 'dialog').props.onCancel({ preventDefault() {} }) },
    isOpen() { renderWrapper(); return !!portal }, render,
  }
}

// The portal target is mocked; no browser or database is involved in event replays.
async function withDocument(run) {
  const original = globalThis.document
  globalThis.document = { body: {} }
  try { await run() } finally { globalThis.document = original }
}

test('month/year navigation and blur never commit; only explicit confirmation commits once', async () => withDocument(async () => {
  const picker = pickerFixture()
  const opened = picker.open()
  assert.equal(nodes(opened).find(node => node.type === 'input').props.value, '')
  for (const date of ['2026-11-10', '2026-10-10', '2025-10-10', '2025-10-25']) picker.change(date)
  assert.equal(nodes(picker.render()).find(node => node.type === 'input').props.onBlur, undefined)
  assert.deepEqual(picker.calls, [])
  await picker.submit()
  assert.deepEqual(picker.calls, ['2025-10-25'])
  assert.equal(picker.isOpen(), false)
}))

test('Cancel and Escape discard drafts and reopening starts blank', async () => withDocument(async () => {
  for (const action of ['cancel', 'escape']) {
    const picker = pickerFixture()
    picker.open(); picker.change('2026-10-20'); picker[action]()
    assert.equal(picker.isOpen(), false)
    assert.deepEqual(picker.calls, [])
    const reopened = picker.open()
    assert.equal(nodes(reopened).find(node => node.type === 'input').props.value, '')
  }
}))

test('invalid and duplicate dates remain drafts with clear errors', async () => withDocument(async () => {
  const picker = pickerFixture({ existingDates: ['Oct. 20, 2026'] })
  picker.open()
  for (const date of ['', '2026-02-30', '2026-10-20']) {
    picker.change(date); await picker.submit()
    assert.deepEqual(picker.calls, [])
    assert.ok(nodes(picker.render()).some(node => node.props?.role === 'alert'))
  }
  picker.change('2026-10-21'); await picker.submit()
  assert.deepEqual(picker.calls, ['2026-10-21'])
}))

test('save failure keeps the draft, and double submission cannot commit twice', async () => withDocument(async () => {
  let resolve
  let calls = 0
  const picker = pickerFixture({ onConfirm: () => { calls++; return new Promise(done => { resolve = done }) } })
  picker.open(); picker.change('2026-10-20')
  const pending = picker.submit()
  await picker.submit()
  assert.equal(calls, 1)
  picker.escape()
  assert.equal(picker.isOpen(), true)
  resolve(); await pending
  assert.equal(picker.isOpen(), false)
  const failed = pickerFixture({ onConfirm: async () => { throw new Error('Save failed') } })
  failed.open(); failed.change('2026-10-20'); await failed.submit()
  assert.equal(failed.isOpen(), true)
  assert.ok(nodes(failed.render()).some(node => node.props?.role === 'alert' && node.props.children === 'Save failed'))
}))

test('existing delivery date renaming stays a draft until Save date', async () => withDocument(async () => {
  const picker = pickerFixture({ title: 'Rename delivery date', confirmLabel: 'Save date', initialDate: '2026-10-20', existingDates: ['Oct. 20, 2026'] })
  picker.open(); picker.change('2026-09-20')
  assert.deepEqual(picker.calls, [])
  await picker.submit()
  assert.deepEqual(picker.calls, ['2026-09-20'])
}))

test('SBFP, DSWD, LDS and LGU add dates only through confirmed picker callbacks', async () => withDocument(async () => {
  for (const program of ['sbfp', 'dswd', 'lds', 'lgu']) {
    const { hooks, host } = hooksHarness()
    const Picker = () => null
    const mocks = { react: hooks, '@/components/DateColumnPicker': { DateColumnPicker: Picker },
      '@/lib/supabase/client': { createClient: () => ({ from: () => { throw new Error('Unexpected database write') } }) },
      '@/components/loading/AsyncFeedback': { useAsyncTask: () => async task => task() } }
    const loadedTable = load(program === 'sbfp' ? 'src/components/SbfpCenterTable.tsx' : 'src/components/ProgramProcurementTable.tsx', mocks)
    const component = program === 'sbfp' ? loadedTable.SbfpCenterTable : loadedTable.ProgramProcurementTable
    const properties = program === 'sbfp' ? { center: 'VSU', year: 2026, initialRecords: [], userRole: 'encoder', allowAdd: true } :
      { programId: program, center: 'VSU', year: 2026, initialRows: [], editable: true, areaColumnLabel: 'SDO' }
    const table = host()
    const renderTable = () => table.render(component, properties)
    assert.equal(nodes(renderTable()).filter(node => node.type === 'input' && node.props.type === 'date').length, 0)
    for (const title of ['Add delivered-as-of date', 'Add payment date']) {
      const getPicker = () => nodes(renderTable()).find(node => node.type === Picker && node.props.title === title)
      const picker = pickerFixture(getPicker().props)
      picker.open(); picker.change('2026-11-10'); picker.change('2026-10-25')
      assert.deepEqual(getPicker().props.existingDates, [])
      picker.cancel()
      assert.deepEqual(getPicker().props.existingDates, [])
      picker.open(); picker.change('2026-10-25'); await picker.submit()
      assert.deepEqual(getPicker().props.existingDates, ['Oct. 25, 2026'])
    }
  }
}))
