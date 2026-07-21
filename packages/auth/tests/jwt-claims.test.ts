/**
 * Registered-claim validation in `verifyJwt` / `createVerifiedAuthPlugin`.
 *
 * `verifyJwt` validates `exp` (required by default), `nbf`, a future-`iat`
 * sanity bound, and `aud` (when an audience is configured) AFTER the HMAC
 * signature check. Every test here pins the clock via the injected `now`
 * option — no wall-clock flakiness.
 *
 * The last describe exercises the full agent-service gate: an expired token
 * makes `verify` return null, which the gate maps to 401 `AUTH_INVALID`
 * (fail-closed), never to a dispatch.
 */

import type { LiveBinding } from '@aihu/agent-service'
import { createAgentService } from '@aihu/agent-service'
import { describe, expect, it } from 'vitest'
import { createVerifiedAuthPlugin, verifyJwt } from '../src/server-index.ts'

const SECRET = 'jwt-claims-test-secret-32-bytes-long!!!!'
const WRONG_SECRET = 'not-the-signing-secret-at-all-nope!!!!!!'

/** Pinned clock: all tests reason relative to this instant. */
const NOW_MS = 1_700_000_000_000
const NOW_SEC = Math.floor(NOW_MS / 1000)
const clock = { now: () => NOW_MS }

/** Build an HMAC-SHA-256 signed JWT with EXACTLY the supplied claims. */
async function signJwt(claims: Record<string, unknown>, secret = SECRET): Promise<string> {
  const enc = new TextEncoder()
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signingInput = `${header}.${payload}`
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput))
  return `${signingInput}.${Buffer.from(sigBuf).toString('base64url')}`
}

// ─── exp (expiry) ────────────────────────────────────────────────────────────

describe('verifyJwt — exp validation', () => {
  it('rejects an expired token (exp in the past, beyond the 60s default leeway)', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC - 120 })
    expect(await verifyJwt(jwt, SECRET, clock)).toBeNull()
  })

  it('accepts a token within the clock-skew leeway of expiry', async () => {
    // 30s past exp < 60s default leeway → still accepted (drift tolerance).
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC - 30 })
    const claims = await verifyJwt(jwt, SECRET, clock)
    expect(claims?.sub).toBe('u')
  })

  it('rejects the same 30s-past-exp token when leeway is 0 (leeway is what saves it)', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC - 30 })
    expect(await verifyJwt(jwt, SECRET, { ...clock, clockSkewSec: 0 })).toBeNull()
  })

  it('accepts a token with a future exp', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600 })
    expect((await verifyJwt(jwt, SECRET, clock))?.sub).toBe('u')
  })

  it('rejects a token with NO exp by default (no expiry = not acceptable)', async () => {
    const jwt = await signJwt({ sub: 'u' })
    expect(await verifyJwt(jwt, SECRET, clock)).toBeNull()
  })

  it('accepts a token with NO exp only when allowNoExpiry: true', async () => {
    const jwt = await signJwt({ sub: 'u' })
    const claims = await verifyJwt(jwt, SECRET, { ...clock, allowNoExpiry: true })
    expect(claims?.sub).toBe('u')
  })

  it('rejects a non-numeric exp even with allowNoExpiry (malformed, not "no expiry")', async () => {
    const jwt = await signJwt({ sub: 'u', exp: 'never' })
    expect(await verifyJwt(jwt, SECRET, { ...clock, allowNoExpiry: true })).toBeNull()
  })
})

// ─── nbf (not-before) ────────────────────────────────────────────────────────

describe('verifyJwt — nbf validation', () => {
  it('rejects a token whose nbf is in the future (beyond leeway)', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, nbf: NOW_SEC + 300 })
    expect(await verifyJwt(jwt, SECRET, clock)).toBeNull()
  })

  it('accepts a token whose nbf is in the past', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, nbf: NOW_SEC - 300 })
    expect((await verifyJwt(jwt, SECRET, clock))?.sub).toBe('u')
  })

  it('accepts a token whose nbf is within the leeway window', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, nbf: NOW_SEC + 30 })
    expect((await verifyJwt(jwt, SECRET, clock))?.sub).toBe('u')
  })
})

// ─── iat sanity ──────────────────────────────────────────────────────────────

describe('verifyJwt — iat sanity', () => {
  it('rejects a wildly future iat (issuer clock cannot be trusted)', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 7200, iat: NOW_SEC + 3600 })
    expect(await verifyJwt(jwt, SECRET, clock)).toBeNull()
  })

  it('accepts a normal past iat', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, iat: NOW_SEC - 10 })
    expect((await verifyJwt(jwt, SECRET, clock))?.sub).toBe('u')
  })
})

// ─── aud (audience) ──────────────────────────────────────────────────────────

describe('verifyJwt — aud validation', () => {
  const AUD = 'api://fellwork'

  it('rejects an aud mismatch when an audience is configured (string form)', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, aud: 'api://other' })
    expect(await verifyJwt(jwt, SECRET, { ...clock, audience: AUD })).toBeNull()
  })

  it('accepts a matching aud (string form)', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, aud: AUD })
    expect((await verifyJwt(jwt, SECRET, { ...clock, audience: AUD }))?.sub).toBe('u')
  })

  it('accepts when the aud ARRAY includes the configured audience', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, aud: ['api://other', AUD] })
    expect((await verifyJwt(jwt, SECRET, { ...clock, audience: AUD }))?.sub).toBe('u')
  })

  it('rejects when the aud array does NOT include the configured audience', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, aud: ['api://other'] })
    expect(await verifyJwt(jwt, SECRET, { ...clock, audience: AUD })).toBeNull()
  })

  it('rejects a token with NO aud when an audience is configured', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600 })
    expect(await verifyJwt(jwt, SECRET, { ...clock, audience: AUD })).toBeNull()
  })

  it('ignores aud entirely when no audience is configured', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, aud: 'api://whatever' })
    expect((await verifyJwt(jwt, SECRET, clock))?.sub).toBe('u')
  })
})

// ─── signature regression ────────────────────────────────────────────────────

describe('verifyJwt — signature check still gates everything (#420 regression)', () => {
  it('rejects a wrong-secret token even when every claim is temporally valid', async () => {
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, nbf: NOW_SEC - 10 }, WRONG_SECRET)
    expect(await verifyJwt(jwt, SECRET, clock)).toBeNull()
  })
})

// ─── createVerifiedAuthPlugin pass-through ───────────────────────────────────

describe('createVerifiedAuthPlugin — claim options flow into verify()', () => {
  it('an expired token yields null from verify()', async () => {
    const plugin = createVerifiedAuthPlugin({ jwtSecret: SECRET, ...clock })
    const jwt = await signJwt({ sub: 'u', exp: NOW_SEC - 120 })
    expect(await plugin.verify!(jwt)).toBeNull()
  })

  it('allowNoExpiry: true admits a no-exp token through the plugin', async () => {
    const plugin = createVerifiedAuthPlugin({ jwtSecret: SECRET, allowNoExpiry: true, ...clock })
    const jwt = await signJwt({ sub: 'u' })
    expect((await plugin.verify!(jwt))?.sub).toBe('u')
  })

  it('a configured audience is enforced through the plugin', async () => {
    const plugin = createVerifiedAuthPlugin({ jwtSecret: SECRET, audience: 'api://a', ...clock })
    const wrong = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, aud: 'api://b' })
    const right = await signJwt({ sub: 'u', exp: NOW_SEC + 3600, aud: 'api://a' })
    expect(await plugin.verify!(wrong)).toBeNull()
    expect((await plugin.verify!(right))?.sub).toBe('u')
  })
})

// ─── Gate integration: expired token → 401 AUTH_INVALID, fail-closed ─────────

/** Minimal live binding that records whether it ever dispatched. */
function makeBinding(tag: string, rateLimitStr: string | null): LiveBinding & { ran(): boolean } {
  let ran = false
  return {
    rootId: 1,
    tag,
    getSignal: () => undefined,
    setSignal: () => {},
    async callAction(name: string): Promise<unknown> {
      ran = true
      return { called: name }
    },
    scope: () => null,
    rateLimit: () => rateLimitStr,
    dispose$: () => true,
    ran: () => ran,
  }
}

describe('agent-service gate — expired token is refused with 401 AUTH_INVALID', () => {
  function makeService(binding: LiveBinding) {
    return createAgentService({
      getRegistry: () => new Map([[binding.tag, [binding]]]),
      authPlugin: createVerifiedAuthPlugin({ jwtSecret: SECRET, ...clock }),
      rateLimitPlugin: { checkRateLimit: () => true },
    })
  }

  it('expired token → verify null → gate 401 AUTH_INVALID, action never runs', async () => {
    const binding = makeBinding('quota-card', '10/min')
    const svc = makeService(binding)
    const expired = await signJwt({ sub: 'replayer', exp: NOW_SEC - 120 })
    const res = (await svc.handleToolCall('quota-card/refresh', [], {
      userId: 'replayer',
      jwt: expired,
    })) as { code: number; error: string }
    expect(res.code).toBe(401)
    expect(res.error).toContain('AUTH_INVALID')
    expect(binding.ran()).toBe(false)
  })

  it('fresh token from the same signer still dispatches (the check discriminates)', async () => {
    const binding = makeBinding('quota-card', '10/min')
    const svc = makeService(binding)
    const fresh = await signJwt({ sub: 'member', exp: NOW_SEC + 3600 })
    const res = (await svc.handleToolCall('quota-card/refresh', [], {
      userId: 'member',
      jwt: fresh,
    })) as { code?: number; result?: unknown }
    expect(res.code).toBeUndefined()
    expect(binding.ran()).toBe(true)
  })
})
