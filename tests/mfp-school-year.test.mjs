import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const { mfpSchoolYearIntervals } = load('src/lib/mfp-list-filters.ts')
const { matchesSourceFilters } = load('src/lib/mfp-sbfp-source.ts')

test('school-year bounds exclude May and include leap days and the entire April 30 date', () => {
  assert.deepEqual(mfpSchoolYearIntervals('2026-2027'), [{ start: '2026-06-01', end: '2027-05-01' }])
  for (const [date_started, expected] of [['2026-05-31', false], ['2026-06-01', true], ['2027-04-30', true], ['2027-05-01', false], [null, false]]) {
    assert.equal(matchesSourceFilters({ date_started }, { school_year: '2026-2027' }, [2026]), expected)
  }
  assert.equal(matchesSourceFilters({ date_started: '2024-02-29' }, { school_year: '2023-2024' }, [2023]), true)
  assert.equal(matchesSourceFilters({ date_started: '2027-07-01' }, { school_year: '2025-2026,2027-2028' }, [2025]), true)
  assert.equal(matchesSourceFilters({ date_started: '2026-07-01' }, { school_year: '2025-2026,2027-2028' }, [2025]), false)
  assert.equal(mfpSchoolYearIntervals('2026-2027,2026-2027').length, 1)
  for (const value of ['2026', '2026-2028', '2027-2026', '2026-2027,', '0000-0001', ['2026-2027'], '2026-2027'.repeat(30)]) {
    assert.throws(() => mfpSchoolYearIntervals(value))
  }
})

const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : node && typeof node === 'object' ? [node.props?.children].flat(Infinity).map(text).join('') : ''

test('School Year is a draft filter, replaces calendar Year, and clears without removing search', () => {
  let cursor = 0
  const state = []
  const pushes = []
  let params = new URLSearchParams('year=2026&center=CLSU&search=School')
  const { DataFilters } = load('src/components/DataFilters.tsx', {
    react: {
      useState(initial) { const index = cursor++; if (!(index in state)) state[index] = initial
        return [state[index], next => { state[index] = typeof next === 'function' ? next(state[index]) : next }] },
      useRef: () => ({ current: null }), useEffect() {}, useCallback: fn => fn,
    },
    'next/navigation': { useRouter: () => ({ push: url => pushes.push(url) }), useSearchParams: () => params },
  })
  const render = () => { cursor = 0; return nodes(DataFilters({ filterOptions: { year: ['2026', '2027'] } })) }
  const button = label => render().find(node => node.type === 'button' && text(node).startsWith(label))
  const toggle = label => render().find(node => node.type === 'label' && text(node) === label).props.children[0].props.onChange()
  button('Filters').props.onClick()
  button('School Year').props.onClick()
  toggle('2026-2027')
  assert.equal(pushes.length, 0)
  assert.ok(render().some(node => node.type === 'p' && text(node).includes('June 1')))
  button('Search').props.onClick()
  params = new URLSearchParams(pushes[0].split('?')[1])
  assert.equal(params.get('school_year'), '2026-2027')
  assert.equal(params.has('year'), false)
  assert.equal(params.get('center'), 'CLSU')
  button('Filters').props.onClick()
  button('Year').props.onClick()
  toggle('2027')
  button('Search').props.onClick()
  params = new URLSearchParams(pushes[1].split('?')[1])
  assert.equal(params.has('school_year'), false)
  assert.equal(params.get('year'), '2027')
  button('Filters').props.onClick()
  button('Remove Filters').props.onClick()
  params = new URLSearchParams(pushes[2].split('?')[1])
  assert.equal(params.get('search'), 'School')
  assert.equal(params.has('year'), false)
  assert.equal(params.has('school_year'), false)
})
