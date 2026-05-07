/**
 * `@aihu/auth` — vitest test suite.
 *
 * Covers all acceptance criteria from the B3b spec:
 *   1.  decodeJwt — valid JWT, null for invalid
 *   2.  hasScope  — space-separated, scp array, scopes array, absent
 *   3.  createAuthPlugin().checkScope — positive, negative, malformed
 *   4.  createScopeSignal() — setScopes / clearScopes / hasScope
 *   5.  getScopeSignal — singleton, boolean result
 *   6.  requireAuth  — passes with JWT, 401 without
 *   7.  requireScope — passes with scope, 403 without, 401 without token
 */

import { describe, expect, it } from 'vitest'
import {
  clearCurrentScopes,
  createAuthPlugin,
  createScopeSignal,
  decodeJwt,
  getScopeSignal,
  hasScope,
  requireAuth,
  requireScope,
  setCurrentScopes,
} from '../src/index.ts'

// ─── Test-fixture helpers ─────────────────────────────────────────────────────

/**
 * Build a minimal, unsigned JWT (header.payload.signature) with the supplied
 * claims. No crypto — the signature segment is a placeholder so the decoder
 * is happy with 3-segment structure.
 */
function makeJwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${header}.${payload}.`
}

function makeRequest(jwt?: string, header = 'Authorization'): Request {
  const headers: Record<string, string> = {}
  if (jwt) headers[header] = `Bearer ${jwt}`
  return new Request('https://example.com/api', { headers })
}

const noop = (): Response => new Response('ok', { status: 200 })

// ─── 1. decodeJwt ────────────────────────────────────────────────────────────

describe('decodeJwt', () => {
  it('decodes a valid JWT and returns its claims', () => {
    const jwt = makeJwt({ sub: 'user-1', scope: 'read write' })
    const claims = decodeJwt(jwt)
    expect(claims).not.toBeNull()
    expect(claims?.sub).toBe('user-1')
    expect(claims?.scope).toBe('read write')
  })

  it('returns null for a plain string (not a JWT)', () => {
    expect(decodeJwt('not-a-jwt')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(decodeJwt('')).toBeNull()
  })

  it('strips a Bearer prefix before decoding', () => {
    const jwt = makeJwt({ sub: 'user-2', scope: 'admin' })
    const claims = decodeJwt(`Bearer ${jwt}`)
    expect(claims?.sub).toBe('user-2')
  })

  it('returns null when the payload segment is not valid JSON', () => {
    const badPayload = Buffer.from('not-json').toString('base64url')
    expect(decodeJwt(`header.${badPayload}.sig`)).toBeNull()
  })
})

// ─── 2. hasScope ─────────────────────────────────────────────────────────────

describe('hasScope', () => {
  it('matches a scope in a space-separated string (RFC 6749)', () => {
    expect(hasScope({ scope: 'read write admin' }, 'write')).toBe(true)
  })

  it('does not match a substring that is not a whole scope token', () => {
    expect(hasScope({ scope: 'readwrite' }, 'read')).toBe(false)
  })

  it('matches a scope in the scp array (Auth0 convention)', () => {
    expect(hasScope({ scp: ['openid', 'profile', 'email'] }, 'profile')).toBe(true)
  })

  it('matches a scope in the scopes array (Okta convention)', () => {
    expect(hasScope({ scopes: ['authenticated', 'user'] }, 'authenticated')).toBe(true)
  })

  it('returns false when the scope is absent from all claim fields', () => {
    expect(hasScope({ scope: 'read', scp: ['read'], scopes: ['read'] }, 'admin')).toBe(false)
  })

  it('returns false when claims object has no scope fields', () => {
    expect(hasScope({ sub: 'user-1' }, 'read')).toBe(false)
  })
})

// ─── 3. createAuthPlugin().checkScope ────────────────────────────────────────

describe('createAuthPlugin', () => {
  const plugin = createAuthPlugin()

  it('returns true for a JWT that contains the required scope', () => {
    const jwt = makeJwt({ sub: 'u1', scope: 'authenticated read' })
    expect(plugin.checkScope(jwt, 'authenticated')).toBe(true)
  })

  it('returns false for a JWT that is missing the required scope', () => {
    const jwt = makeJwt({ sub: 'u1', scope: 'read' })
    expect(plugin.checkScope(jwt, 'admin')).toBe(false)
  })

  it('returns false for a malformed JWT (no throw)', () => {
    expect(plugin.checkScope('not-a-jwt', 'authenticated')).toBe(false)
  })

  it('accepts a custom decodeJwt override', () => {
    const custom = createAuthPlugin({
      decodeJwt: () => ({ scope: 'injected' }),
    })
    expect(custom.checkScope('any-string', 'injected')).toBe(true)
  })

  it('works with scp array form', () => {
    const jwt = makeJwt({ sub: 'u2', scp: ['admin', 'read'] })
    expect(plugin.checkScope(jwt, 'admin')).toBe(true)
  })

  it('works with Bearer-prefixed token', () => {
    const jwt = makeJwt({ scope: 'authenticated' })
    expect(plugin.checkScope(`Bearer ${jwt}`, 'authenticated')).toBe(true)
  })
})

// ─── 4. createScopeSignal ────────────────────────────────────────────────────

describe('createScopeSignal', () => {
  it('returns false for a scope that has not been set', () => {
    clearCurrentScopes()
    const handle = createScopeSignal()
    expect(handle.hasScope('read')).toBe(false)
  })

  it('returns true after setScopes is called with the matching scope', () => {
    const handle = createScopeSignal()
    handle.setScopes(['read', 'write'])
    expect(handle.hasScope('read')).toBe(true)
    expect(handle.hasScope('admin')).toBe(false)
  })

  it('returns false after clearScopes is called', () => {
    const handle = createScopeSignal()
    handle.setScopes(['admin'])
    handle.clearScopes()
    expect(handle.hasScope('admin')).toBe(false)
  })
})

// ─── 5. getScopeSignal ───────────────────────────────────────────────────────

describe('getScopeSignal', () => {
  it('returns a function', () => {
    expect(typeof getScopeSignal('authenticated')).toBe('function')
  })

  it('returns false before setCurrentScopes is called', () => {
    clearCurrentScopes()
    const getter = getScopeSignal('authenticated')
    expect(getter()).toBe(false)
  })

  it('returns true after setCurrentScopes is called with the scope', () => {
    setCurrentScopes(['authenticated', 'read'])
    const getter = getScopeSignal('authenticated')
    expect(getter()).toBe(true)
  })

  it('returns false for a scope not in the current list', () => {
    setCurrentScopes(['read'])
    const getter = getScopeSignal('admin')
    expect(getter()).toBe(false)
  })

  it('updates reactively when scopes change', () => {
    clearCurrentScopes()
    const getter = getScopeSignal('editor')
    expect(getter()).toBe(false)
    setCurrentScopes(['editor'])
    expect(getter()).toBe(true)
    clearCurrentScopes()
    expect(getter()).toBe(false)
  })
})

// ─── 6. requireAuth ──────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('passes the request through to next() when Authorization header is present', async () => {
    const jwt = makeJwt({ sub: 'u1' })
    const req = makeRequest(jwt)
    const mw = requireAuth()
    const res = await mw(req, noop)
    expect(res.status).toBe(200)
  })

  it('returns 401 when no Authorization header is present', async () => {
    const req = new Request('https://example.com/api')
    const mw = requireAuth()
    const res = await mw(req, noop)
    expect(res.status).toBe(401)
  })

  it('uses a custom header when header option is provided', async () => {
    const jwt = makeJwt({ sub: 'u1' })
    const req = makeRequest(jwt, 'X-Auth-Token')
    const mw = requireAuth({ header: 'X-Auth-Token' })
    const res = await mw(req, noop)
    expect(res.status).toBe(200)
  })

  it('uses extractJwt override when provided', async () => {
    const req = new Request('https://example.com/api')
    const mw = requireAuth({ extractJwt: () => 'dummy-token' })
    const res = await mw(req, noop)
    expect(res.status).toBe(200)
  })
})

// ─── 7. requireScope ─────────────────────────────────────────────────────────

describe('requireScope', () => {
  it('passes through when JWT contains the required scope', async () => {
    const jwt = makeJwt({ scope: 'authenticated read' })
    const req = makeRequest(jwt)
    const mw = requireScope('authenticated')
    const res = await mw(req, noop)
    expect(res.status).toBe(200)
  })

  it('returns 403 when JWT is present but missing the required scope', async () => {
    const jwt = makeJwt({ scope: 'read' })
    const req = makeRequest(jwt)
    const mw = requireScope('admin')
    const res = await mw(req, noop)
    expect(res.status).toBe(403)
  })

  it('returns 401 when no token is present at all', async () => {
    const req = new Request('https://example.com/api')
    const mw = requireScope('admin')
    const res = await mw(req, noop)
    expect(res.status).toBe(401)
  })

  it('works with scp array scopes', async () => {
    const jwt = makeJwt({ scp: ['admin'] })
    const req = makeRequest(jwt)
    const mw = requireScope('admin')
    const res = await mw(req, noop)
    expect(res.status).toBe(200)
  })
})
