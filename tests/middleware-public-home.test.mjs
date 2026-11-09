import { test } from 'node:test'
import assert from 'node:assert/strict'
import { load } from './helpers/load-typescript.mjs'

function fixture(user = null) {
  let authCalls = 0
  const { middleware } = load('src/middleware.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => {
      authCalls++
      return { data: { user } }
    } } }) },
  })
  return { authCalls: () => authCalls, request: path => middleware({
    url: `http://localhost${path}`, nextUrl: new URL(`http://localhost${path}`),
    cookies: { getAll: () => [], set: () => {} },
  }) }
}

test('the public landing page loads without an authentication request', async () => {
  for (const user of [null, { id: 'signed-in-user' }]) {
    const app = fixture(user)
    const response = await app.request('/')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('location'), null)
    assert.equal(app.authCalls(), 0)
  }
})

test('monitoring, records, and API routes still require authentication', async () => {
  const app = fixture()
  for (const path of ['/dashboard', '/data', '/sbfp/center/VSU', '/reports/sbfp-narrative', '/api/sbfp/sync-dropoff']) {
    const response = await app.request(path)
    assert.equal(response.status, 307)
    assert.equal(response.headers.get('location'), 'http://localhost/login')
  }
  assert.equal(app.authCalls(), 5)
})

test('existing signed-in navigation and login redirects are preserved', async () => {
  const signedIn = fixture({ id: 'user' })
  assert.equal((await signedIn.request('/dashboard')).status, 200)
  assert.equal((await signedIn.request('/login')).headers.get('location'), 'http://localhost/dashboard')
  assert.equal((await fixture().request('/login')).status, 200)
})
