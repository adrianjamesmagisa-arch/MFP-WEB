import { test } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { load } from './helpers/load-typescript.mjs'

const { loadCenterActivityLog } = load('src/lib/center-activity.ts')
const recent = () => new Date(Date.now() - 15 * 60_000).toISOString()
const old = '2025-01-01T00:00:00.000Z'

function database(tables = {}, { errors = {}, cap = 1000, user = { id: 'user' }, role = 'super_admin' } = {}) {
  const reads = []
  return { reads, auth: { getUser: async () => ({ data: { user } }) }, from(table) {
    let selected = '*', filters = [], orders = [], start = 0, count = cap
    const query = {
      select(value) { selected = value; return query },
      eq(field, value) { filters.push(row => row[field] === value); return query },
      in(field, values) { filters.push(row => values.includes(row[field])); return query },
      gte(field, value) { filters.push(row => row[field] >= value); return query },
      gt(field, value) { filters.push(row => row[field] != null && new Date(row[field]) > new Date(value)); return query },
      not(field, operator, value) { assert.equal(operator, 'is'); assert.equal(value, null); filters.push(row => row[field] != null); return query },
      order(field, options = {}) { orders.push({ field, ...options }); return query },
      limit(value) { count = Math.min(value, cap); return query },
      range(from, to) { start = from; count = Math.min(to - from + 1, cap); return query },
      single() { return Promise.resolve({ data: { role }, error: null }) },
      then(resolve, reject) {
        reads.push({ table, selected, start, count, orders })
        let rows = (tables[table] || []).filter(row => filters.every(predicate => predicate(row)))
        rows = [...rows].sort((a, b) => {
          for (const { field, ascending = true, nullsFirst = false } of orders) {
            const av = a[field], bv = b[field]
            const comparison = av == null ? bv == null ? 0 : nullsFirst ? -1 : 1
              : bv == null ? nullsFirst ? 1 : -1 : String(av).localeCompare(String(bv)) * (ascending ? 1 : -1)
            if (comparison) return comparison
          }
          return 0
        }).slice(start, start + count)
        if (selected !== '*') rows = rows.map(row => Object.fromEntries(selected.split(',').map(field => [field.trim(), row[field.trim()]])))
        return Promise.resolve({ data: errors[table] ? null : rows, error: errors[table] || null }).then(resolve, reject)
      },
    }
    return query
  } }
}

async function renderCenters(db) {
  const { default: CentersPage } = load('src/app/(app)/centers/page.tsx', {
    '@/lib/supabase/server': { createClient: async () => db },
    'next/link': { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) },
    'next/navigation': { redirect: path => { throw new Error(`Redirect: ${path}`) } },
  })
  return renderToStaticMarkup(await CentersPage())
}

function cardText(html, center = 'USF') {
  const href = `/centers/${encodeURIComponent(center)}`
  const card = html.split(`<a href="${href}"`)[1]?.split('</a>')[0]
  assert.ok(card, `${center} card exists`)
  return card.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

test('USF card agrees with the timeline for SBFP edits, seeded and historical MFP edits, school edits, and explicit logs', async () => {
  const at = recent()
  for (const tables of [
    { sbfp_data: [{ id: 'sdo', center: 'USF', sdo: 'Tagbilaran City - PM', created_at: old, updated_at: at }] },
    { mfp_data: [{ id: 'seed', center: 'USF', year: 2026, created_at: '2026-10-15T12:00:00+00:00', updated_at: at }] },
    { mfp_data: [{ id: 'historic', center: 'USF', year: 2025, created_at: old, updated_at: at }] },
    { sbfp_dropoff_points: [{ id: 'school', center: 'USF', dropoff_name: 'Fixture School', created_at: old, updated_at: at }] },
    { mfp_center_activity: [{ id: 'log', center: 'USF', action: 'updated', source: 'sbfp_data', source_id: 'sdo', created_at: at, summary: 'Updated procurement' }] },
  ]) {
    const db = database(tables)
    const timeline = await loadCenterActivityLog(db, 'USF', { limit: 500 })
    assert.equal(timeline.events[0].at, at)
    const card = cardText(await renderCenters(db))
    assert.match(card, /Active recently/)
    assert.doesNotMatch(card, /Never|No activity found|Unavailable|Inactive/)
    assert.match(card, /15 minutes ago/)
  }
})

test('recently updated older rows and centers beyond a global API cap remain visible', async () => {
  const at = recent()
  const rows = Array.from({ length: 1100 }, (_, index) => ({ id: `new-${index}`, center: 'USF', year: 2026,
    created_at: '2026-10-01T00:00:00.000Z', updated_at: '2026-10-01T00:00:00.000Z' }))
  const db = database({ mfp_data: [...rows, { id: 'old', center: 'USF', year: 2025, created_at: old, updated_at: at },
    { id: 'niz', center: 'NHQ', year: 2025, created_at: old, updated_at: at }] })
  assert.equal((await loadCenterActivityLog(db, 'USF', { limit: 500 })).events[0].at, at)
  const html = await renderCenters(db)
  assert.match(cardText(html), /15 minutes ago/)
  assert.match(cardText(html, 'NHQGP (NIZ)'), /15 minutes ago/)
  assert.ok(db.reads.filter(read => read.table !== 'profiles').every(read => read.count <= 1000))
})

test('empty history and failed reads have distinct states; permission errors are not a missing migration', async () => {
  assert.match(cardText(await renderCenters(database())), /Inactive.*No activity found/)
  const error = { code: '42501', message: 'permission denied for table mfp_center_activity' }
  const db = database({}, { errors: { mfp_center_activity: error } })
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    const timeline = await loadCenterActivityLog(db, 'USF')
    assert.equal(timeline.logReady, true)
    assert.equal(timeline.hasReadErrors, true)
    const card = cardText(await renderCenters(db))
    assert.match(card, /Activity unavailable.*Unavailable/)
    assert.doesNotMatch(card, /Inactive|Never|No activity found/)
  } finally { console.warn = originalWarn }
})

test('an absent optional log table preserves timestamp history while operational failures are marked incomplete', async () => {
  const at = recent()
  const tables = { sbfp_data: [{ id: 'sdo', center: 'USF', created_at: old, updated_at: at }] }
  const missing = database(tables, { errors: { mfp_center_activity: { code: 'PGRST205', message: 'table missing in schema cache' } } })
  assert.equal((await loadCenterActivityLog(missing, 'USF')).logReady, false)
  assert.match(cardText(await renderCenters(missing)), /Active recently/)
  const failed = database(tables, { errors: { mfp_data: { code: 'XX000', message: 'Read failed' } } })
  const originalWarn = console.warn
  console.warn = () => {}
  try {
    const html = await renderCenters(failed)
    assert.match(cardText(html), /Activity incomplete.*Last known activity:.*15 minutes ago/)
  } finally { console.warn = originalWarn }
})

test('center overview retains authentication and encoder restrictions', async () => {
  await assert.rejects(renderCenters(database({}, { user: null })), /Redirect: \/login/)
  await assert.rejects(renderCenters(database({}, { role: 'encoder' })), /Redirect: \/dashboard/)
})

test('latest activity remains exact when short creation-time updates fill the first update page', async () => {
  const at = Date.now() - 15 * 60_000
  const created = new Date(at).toISOString()
  const sameAsCreation = Array.from({ length: 60 }, (_, index) => ({ id: `seed-${index}`, center: 'USF',
    created_at: created, updated_at: new Date(at + 1000).toISOString() }))
  const actualEdit = new Date(at + 500).toISOString()
  const db = database({ sbfp_data: [...sameAsCreation, { id: 'old', center: 'USF', created_at: old, updated_at: actualEdit }] })
  const { loadCenterActivitySummaries } = load('src/lib/center-activity.ts')
  assert.equal((await loadCenterActivitySummaries(db, ['USF'])).USF.at, actualEdit)
  assert.equal((await loadCenterActivityLog(db, 'USF', { limit: 500 })).events[0].at, actualEdit)
  assert.ok(db.reads.some(read => read.start >= 50))
})
