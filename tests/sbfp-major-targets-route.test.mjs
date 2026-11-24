import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

const SBFP_DATA_NOT_NULL_COLS = [
  'year',
  'region',
  'sdo',
  'procurement_status',
  'packs_to_deliver',
  'milk_type',
  'delivery_schedule',
  'packs_delivered',
  'center',
]

function createMockEnv({
  user = { id: 'user-1' },
  primaryTableError = null,
  sbfpDataInsertError = null,
  sbfpDataUpdateError = null,
} = {}) {
  const sbfpDataRows = []
  const primaryRows = []
  const inserts = []
  const updates = []

  const admin = {
    from(table) {
      let filters = []
      const query = {
        select() {
          return query
        },
        eq(col, val) {
          filters.push(row => row[col] === val)
          return query
        },
        limit() {
          return query
        },
        maybeSingle() {
          if (table === 'sbfp_data') {
            const match = sbfpDataRows.find(row => filters.every(fn => fn(row))) || null
            return Promise.resolve({ data: match, error: null })
          }
          return Promise.resolve({ data: null, error: null })
        },
        upsert(payload) {
          if (table === 'sbfp_major_accomplishment_targets') {
            if (primaryTableError) return Promise.resolve({ error: primaryTableError })
            const idx = primaryRows.findIndex(r => r.school_year === payload.school_year)
            if (idx >= 0) primaryRows[idx] = { ...payload }
            else primaryRows.push({ ...payload })
            return Promise.resolve({ error: null })
          }
          return Promise.resolve({ error: null })
        },
        insert(payload) {
          inserts.push({ table, payload })
          if (table === 'sbfp_data') {
            if (sbfpDataInsertError) return Promise.resolve({ error: sbfpDataInsertError })
            for (const col of SBFP_DATA_NOT_NULL_COLS) {
              if (payload[col] == null) {
                return Promise.resolve({
                  error: { message: `null value in column "${col}" of relation "sbfp_data" violates not-null constraint` },
                })
              }
            }
            sbfpDataRows.push({ id: `fb-${sbfpDataRows.length + 1}`, ...payload })
            return Promise.resolve({ error: null })
          }
          return Promise.resolve({ error: null })
        },
        update(payload) {
          return {
            eq(col, val) {
              updates.push({ table, col, val, payload })
              if (table === 'sbfp_data') {
                if (sbfpDataUpdateError) return Promise.resolve({ error: sbfpDataUpdateError })
                const idx = sbfpDataRows.findIndex(r => r[col] === val)
                if (idx >= 0) sbfpDataRows[idx] = { ...sbfpDataRows[idx], ...payload }
              }
              return Promise.resolve({ error: null })
            },
          }
        },
        then(resolve, reject) {
          if (table === 'sbfp_major_accomplishment_targets') {
            if (primaryTableError) {
              return Promise.resolve({ data: null, error: primaryTableError }).then(resolve, reject)
            }
            return Promise.resolve({ data: primaryRows, error: null }).then(resolve, reject)
          }
          const rows = sbfpDataRows.filter(row => filters.every(fn => fn(row)))
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
        },
      }
      return query
    },
  }

  const route = load('src/app/api/sbfp/major-targets/route.ts', {
    '@/lib/supabase/server': {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
    },
    '@/lib/supabase/admin': {
      supabaseAdmin: admin,
    },
  })

  return { route, sbfpDataRows, inserts, updates }
}

test('PUT succeeds via sbfp_data fallback with all NOT NULL columns when sbfp_major_accomplishment_targets is missing', async () => {
  const missingTableErr = {
    code: 'PGRST205',
    message: "Could not find the table 'public.sbfp_major_accomplishment_targets' in the schema cache",
  }
  const { route, sbfpDataRows, inserts } = createMockEnv({ primaryTableError: missingTableErr })

  const putRes = await route.PUT(
    new Request('http://localhost/api/sbfp/major-targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolYear: '2026-2027', key: 'assisted_coops', value: 48 }),
    }),
  )
  assert.equal(putRes.status, 200)
  const putJson = await putRes.json()
  assert.equal(putJson.targets['2026-2027'].assisted_coops, 48)

  assert.equal(inserts.length, 1)
  const inserted = inserts[0].payload
  for (const col of SBFP_DATA_NOT_NULL_COLS) {
    assert.notEqual(inserted[col], undefined, `expected ${col} to be provided`)
    assert.notEqual(inserted[col], null, `expected ${col} to be non-null`)
  }
  assert.equal(inserted.include_in_report, false)
  assert.equal(sbfpDataRows.length, 1)

  const getRes = await route.GET()
  assert.equal(getRes.status, 200)
  const getJson = await getRes.json()
  assert.equal(getJson.targets['2026-2027'].assisted_coops, 48)
})

test('subsequent PUT updates existing fallback row without duplicating and supports clearing with null', async () => {
  const missingTableErr = {
    code: 'PGRST205',
    message: "Could not find the table 'public.sbfp_major_accomplishment_targets' in the schema cache",
  }
  const { route, sbfpDataRows, inserts, updates } = createMockEnv({ primaryTableError: missingTableErr })

  await route.PUT(
    new Request('http://localhost/api/sbfp/major-targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolYear: '2026-2027', key: 'assisted_coops', value: 48 }),
    }),
  )
  const updateRes = await route.PUT(
    new Request('http://localhost/api/sbfp/major-targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolYear: '2026-2027', key: 'milk_packs', value: 35000000 }),
    }),
  )
  assert.equal(updateRes.status, 200)
  assert.equal(inserts.length, 1)
  assert.equal(updates.length, 1)
  assert.ok(updates[0].payload.updated_at)
  assert.equal(sbfpDataRows.length, 1)

  const clearRes = await route.PUT(
    new Request('http://localhost/api/sbfp/major-targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolYear: '2026-2027', key: 'assisted_coops', value: null }),
    }),
  )
  assert.equal(clearRes.status, 200)
  const clearJson = await clearRes.json()
  assert.equal(clearJson.targets['2026-2027'].assisted_coops, undefined)
  assert.equal(clearJson.targets['2026-2027'].milk_packs, 35000000)
})

test('PUT returns 500 with both primary and fallback error messages when both fail', async () => {
  const { route } = createMockEnv({
    primaryTableError: { message: "Could not find the table 'public.sbfp_major_accomplishment_targets' in the schema cache" },
    sbfpDataInsertError: { message: 'permission denied for relation sbfp_data' },
  })

  const res = await route.PUT(
    new Request('http://localhost/api/sbfp/major-targets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schoolYear: '2026-2027', key: 'assisted_coops', value: 48 }),
    }),
  )
  assert.equal(res.status, 500)
  const json = await res.json()
  assert.match(json.error, /sbfp_major_accomplishment_targets/)
  assert.match(json.error, /fallback failed: permission denied for relation sbfp_data/)
})
