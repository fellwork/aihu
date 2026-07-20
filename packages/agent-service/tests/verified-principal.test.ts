/**
 * #420 (GO1a) — rate-limit keys and scope checks derive from a
 * signature-VERIFIED JWT principal.
 *
 * The attack this regression-proofs: rate-limit keys were
 * `${context.userId}:${tag}` with `userId` caller-supplied over MCP and never
 * cross-checked against the JWT `sub`, so a caller reset its own quota by
 * rotating `userId`. The same trust hole existed on the scope path — claims
 * were consulted without a signature check, so a forged `scope` claim
 * bypassed `$scope`.
 *
 * These tests inject an `AuthPlugin` whose `verify` does REAL HMAC-SHA-256
 * signature verification (Web Crypto — the same algorithm and observable
 * contract as `@aihu/auth/server`'s `verifyJwt`), so "forged" below means a
 * cryptographically forged signature, not a stub's opinion.
 */

import { describe, expect, it } from 'vitest'
import { createAgentService } from '../src/index.ts'
import type { AuthPlugin, LiveBinding, RateLimitPlugin, VerifiedClaims } from '../src/types.ts'

// ─── Real HMAC-SHA-256 JWT helpers ───────────────────────────────────────────

const SECRET = 'verified-principal-test-secret-32-bytes!'
const WRONG_SECRET = 'a-completely-different-secret-entirely!!'

async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  )
}

/** Sign a JWT with HMAC-SHA-256. */
async function signJwt(claims: Record<string, unknown>, secret = SECRET): Promise<string> {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const input = `${header}.${payload}`
  const key = await hmacKey(secret, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
  return `${input}.${Buffer.from(sig).toString('base64url')}`
}

/**
 * An `AuthPlugin` whose `verify` performs REAL signature verification against
 * `SECRET`, and whose `checkScope` reads the standard `scope` claim. Decode
 * in `checkScope` is safe by construction: the gate only calls it after
 * `verify` authenticated the same token.
 */
function realHmacAuthPlugin(): AuthPlugin {
  const decode = (jwt: string): Record<string, unknown> | null => {
    const parts = jwt.split('.')
    if (parts.length !== 3 || !parts[1]) return null
    try {
      const obj = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as unknown
      return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
        ? (obj as Record<string, unknown>)
        : null
    } catch {
      return null
    }
  }
  return {
    checkScope(jwt: string, scope: string): boolean {
      const claims = decode(jwt)
      if (!claims || typeof claims.scope !== 'string') return false
      return claims.scope.split(' ').includes(scope)
    },
    async verify(jwt: string): Promise<VerifiedClaims | null> {
      try {
        const parts = jwt.split('.')
        if (parts.length !== 3) return null
        const [h, p, s] = parts as [string, string, string]
        const key = await hmacKey(SECRET, ['verify'])
        const sigBytes = Buffer.from(s, 'base64url')
        const sig = new Uint8Array(new ArrayBuffer(sigBytes.length))
        sigBytes.copy(sig as unknown as Buffer)
        const ok = await crypto.subtle.verify(
          'HMAC',
          key,
          sig,
          new TextEncoder().encode(`${h}.${p}`),
        )
        if (!ok) return null
        return decode(jwt) as VerifiedClaims | null
      } catch {
        return null
      }
    },
  }
}

// ─── Binding / registry fixtures ─────────────────────────────────────────────

/** A permissive binding that records whether it ever ran. */
function makeBinding(
  tag: string,
  scopeStr: string | null,
  rateLimitStr: string | null,
): LiveBinding & { ran(): boolean } {
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
    scope: () => scopeStr,
    rateLimit: () => rateLimitStr,
    dispose$: () => true,
    ran: () => ran,
  }
}

function registryOf(tag: string, binding: LiveBinding): Map<string, LiveBinding[]> {
  return new Map([[tag, [binding]]])
}

/** A rate-limit plugin that records every key it was consulted with. */
function recordingRateLimiter(allow = true): RateLimitPlugin & { keys: string[] } {
  const keys: string[] = []
  return {
    keys,
    checkRateLimit(_spec: string, key: string): boolean {
      keys.push(key)
      return allow
    },
  }
}

// ─── Attack regression: rotating caller userId no longer rotates the bucket ──

describe('#420 attack regression — caller-supplied userId cannot reset the quota', () => {
  it('same JWT with two rotated userId values lands in the SAME bucket, keyed by sub', async () => {
    const binding = makeBinding('quota-card', null, '2/min')
    const limiter = recordingRateLimiter()
    const svc = createAgentService({
      getRegistry: () => registryOf('quota-card', binding),
      authPlugin: realHmacAuthPlugin(),
      rateLimitPlugin: limiter,
    })
    const jwt = await signJwt({ sub: 'real-principal' })

    // The attack: rotate userId per call, keeping the same credential.
    await svc.handleToolCall('quota-card/refresh', [], { userId: 'rotated-a', jwt })
    await svc.handleToolCall('quota-card/refresh', [], { userId: 'rotated-b', jwt })

    expect(limiter.keys).toEqual(['real-principal:quota-card', 'real-principal:quota-card'])
    // The caller-supplied identities never reached the limiter at all.
    expect(limiter.keys.join()).not.toContain('rotated-a')
    expect(limiter.keys.join()).not.toContain('rotated-b')
  })

  it('an unverifiable JWT on a rate-limited tool → 401, and the limiter is never consulted', async () => {
    const binding = makeBinding('quota-card', null, '2/min')
    const limiter = recordingRateLimiter()
    const svc = createAgentService({
      getRegistry: () => registryOf('quota-card', binding),
      authPlugin: realHmacAuthPlugin(),
      rateLimitPlugin: limiter,
    })
    const res = (await svc.handleToolCall('quota-card/refresh', [], {
      userId: 'whoever',
      jwt: 'not.a.jwt-at-all',
    })) as { code: number; error: string }
    expect(res.code).toBe(401)
    expect(limiter.keys).toHaveLength(0)
    expect(binding.ran()).toBe(false)
  })
})

// ─── Forged-signature JWT rejected on BOTH paths ─────────────────────────────

describe('#420 — forged-signature JWT is rejected on both gated paths', () => {
  it('rate-limit path: token signed with the wrong secret → 401, no bucket consumed', async () => {
    const binding = makeBinding('quota-card', null, '10/min')
    const limiter = recordingRateLimiter()
    const svc = createAgentService({
      getRegistry: () => registryOf('quota-card', binding),
      authPlugin: realHmacAuthPlugin(),
      rateLimitPlugin: limiter,
    })
    const forged = await signJwt({ sub: 'impostor' }, WRONG_SECRET)
    const res = (await svc.handleToolCall('quota-card/refresh', [], {
      userId: 'impostor',
      jwt: forged,
    })) as { code: number; error: string }
    expect(res.code).toBe(401)
    expect(res.error).toContain('AUTH_INVALID')
    expect(limiter.keys).toHaveLength(0)
    expect(binding.ran()).toBe(false)
  })

  it('scope path: forged token carrying the required scope claim → 401, not 200', async () => {
    // Pre-#420, the scope check decoded claims without a signature check, so
    // this forged `scope: admin` claim would have PASSED the gate.
    const binding = makeBinding('admin-card', 'admin', null)
    const svc = createAgentService({
      getRegistry: () => registryOf('admin-card', binding),
      authPlugin: realHmacAuthPlugin(),
    })
    const forged = await signJwt({ sub: 'impostor', scope: 'admin' }, WRONG_SECRET)
    const res = (await svc.handleToolCall('admin-card/wipe', [], {
      userId: 'impostor',
      jwt: forged,
    })) as { code: number; error: string }
    expect(res.code).toBe(401)
    expect(binding.ran()).toBe(false)
  })

  it('genuinely signed token with the scope claim passes (the check discriminates)', async () => {
    const binding = makeBinding('admin-card', 'admin', null)
    const svc = createAgentService({
      getRegistry: () => registryOf('admin-card', binding),
      authPlugin: realHmacAuthPlugin(),
    })
    const genuine = await signJwt({ sub: 'real-admin', scope: 'admin' })
    const res = (await svc.handleToolCall('admin-card/wipe', [], {
      userId: 'real-admin',
      jwt: genuine,
    })) as { result?: unknown; code?: number }
    expect(res.code).toBeUndefined()
    expect(binding.ran()).toBe(true)
  })
})

// ─── Malformed JWT → verify null → 401, never falls through ──────────────────

describe('#420 — malformed JWT never falls through to caller claims', () => {
  for (const [label, jwt] of [
    ['two-segment token', 'aaaa.bbbb'],
    ['garbage payload', `${Buffer.from('x').toString('base64url')}.!!!.sig`],
    ['plain string', 'not-a-token'],
  ] as const) {
    it(`${label} → 401`, async () => {
      const binding = makeBinding('quota-card', null, '10/min')
      const limiter = recordingRateLimiter()
      const svc = createAgentService({
        getRegistry: () => registryOf('quota-card', binding),
        authPlugin: realHmacAuthPlugin(),
        rateLimitPlugin: limiter,
      })
      const res = (await svc.handleToolCall('quota-card/refresh', [], {
        userId: 'fallback-identity-that-must-be-ignored',
        jwt,
      })) as { code: number }
      expect(res.code).toBe(401)
      expect(limiter.keys).toHaveLength(0)
      expect(binding.ran()).toBe(false)
    })
  }
})

// ─── Async gate ordering: verification completes before any consult ──────────

describe('#420 — verification completes before limit/scope consult', () => {
  it('checkRateLimit and checkScope observe a fully resolved verification', async () => {
    const events: string[] = []
    const binding = makeBinding('ordered-card', 'member', '10/min')
    const authPlugin: AuthPlugin = {
      checkScope(): boolean {
        events.push('scope-consult')
        return true
      },
      async verify(): Promise<VerifiedClaims | null> {
        events.push('verify-start')
        // Yield through real async boundaries — a gate that consults limits
        // "in parallel" with verification would interleave here.
        await new Promise((r) => setTimeout(r, 10))
        events.push('verify-end')
        return { sub: 'ordered-user' }
      },
    }
    const rateLimitPlugin: RateLimitPlugin = {
      checkRateLimit(): boolean {
        events.push('rate-consult')
        return true
      },
    }
    const svc = createAgentService({
      getRegistry: () => registryOf('ordered-card', binding),
      authPlugin,
      rateLimitPlugin,
    })
    const res = (await svc.handleToolCall('ordered-card/go', [], {
      userId: 'x',
      jwt: 'anything',
    })) as { code?: number }
    expect(res.code).toBeUndefined()
    expect(events).toEqual(['verify-start', 'verify-end', 'scope-consult', 'rate-consult'])
  })
})

// ─── Anonymous caller + auth discovery URL ───────────────────────────────────

describe('#420 — 401 is actionable: discovery URL in the refusal body', () => {
  const DISCOVERY = 'https://example.dev/.well-known/oauth-protected-resource'

  it('anonymous caller on a rate-limited tool → 401 carrying authDiscoveryUrl', async () => {
    const binding = makeBinding('quota-card', null, '10/min')
    const svc = createAgentService({
      getRegistry: () => registryOf('quota-card', binding),
      authPlugin: realHmacAuthPlugin(),
      rateLimitPlugin: recordingRateLimiter(),
      authDiscoveryUrl: DISCOVERY,
    })
    const res = (await svc.handleToolCall('quota-card/refresh', [])) as {
      code: number
      error: string
      authDiscoveryUrl?: string
    }
    expect(res.code).toBe(401)
    expect(res.authDiscoveryUrl).toBe(DISCOVERY)
  })

  it('the discovery URL is absent when not configured, and never on a 403', async () => {
    const binding = makeBinding('admin-card', 'admin', null)
    const svc = createAgentService({
      getRegistry: () => registryOf('admin-card', binding),
      authPlugin: realHmacAuthPlugin(),
      authDiscoveryUrl: DISCOVERY,
    })
    // Unconfigured service → no field.
    const bare = createAgentService({
      getRegistry: () => registryOf('admin-card', binding),
      authPlugin: realHmacAuthPlugin(),
    })
    const anon = (await bare.handleToolCall('admin-card/wipe', [])) as {
      code: number
      authDiscoveryUrl?: string
    }
    expect(anon.code).toBe(401)
    expect(anon.authDiscoveryUrl).toBeUndefined()

    // Verified-but-unscoped → 403, which is not a credential problem: no URL.
    const noScope = await signJwt({ sub: 'user-1', scope: 'basic' })
    const denied = (await svc.handleToolCall('admin-card/wipe', [], {
      userId: 'user-1',
      jwt: noScope,
    })) as { code: number; authDiscoveryUrl?: string }
    expect(denied.code).toBe(403)
    expect(denied.authDiscoveryUrl).toBeUndefined()
  })
})
