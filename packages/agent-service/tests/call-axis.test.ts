/**
 * #437-GX Phase 2 — the `call` axis enforced through the LIVE tool gate.
 *
 * These tests exercise `createAgentService().handleToolCall` end-to-end with
 * compiled-shape `AgentMetadata` carrying the Phase 1 `extract` member (the
 * agent-meta artifact of the fan-out), proving `runGate` consumes the
 * declaration: `call:` is a CEILING over per-member `expose:`/`$scope`, and a
 * surface with no declaration behaves byte-identically to before this phase.
 */

import { describe, expect, it } from 'vitest'
import { createAgentService } from '../src/index.ts'
import type { AuthPlugin, LiveBinding, VerifiedClaims } from '../src/types.ts'

// ─── Real HMAC-SHA-256 helpers (the #420 discipline) ─────────────────────────

const SECRET = 'call-axis-test-secret-with-32-bytes!!!!'
const WRONG_SECRET = 'this-is-not-the-secret-you-want-here!!'

async function hmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages,
  )
}

async function signJwt(claims: Record<string, unknown>, secret = SECRET): Promise<string> {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const input = `${header}.${payload}`
  const key = await hmacKey(secret, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input))
  return `${input}.${Buffer.from(sig).toString('base64url')}`
}

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

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeBinding(
  tag: string,
  scopeStr: string | null = null,
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
    rateLimit: () => null,
    dispose$: () => true,
    ran: () => ran,
  }
}

/**
 * Build a service over one tag whose compiled metadata carries the Phase 1
 * `extract` member (exactly the JSON shape `emit_manifest` renders).
 */
function serviceFor(
  tag: string,
  extract: unknown,
  opts?: { memberScope?: string | null; noAuth?: boolean },
) {
  const binding = makeBinding(tag, opts?.memberScope ?? null)
  const service = createAgentService({
    manifests: [
      {
        tag,
        actions: { greet: { returns: {} } },
        ...(extract === undefined ? {} : { extract }),
      },
    ],
    ...(opts?.noAuth ? {} : { authPlugin: realHmacAuthPlugin() }),
    getRegistry: () => new Map([[tag, [binding]]]),
  })
  return { service, binding }
}

type Envelope = { error?: string; code?: number; result?: unknown; authDiscoveryUrl?: string }

// ─── call:'none' — the closed surface ────────────────────────────────────────

describe("call:'none' — the agent surface is unavailable", () => {
  it('an exposed action on a closed surface → 404, shaped like an absent tag', async () => {
    const { service, binding } = serviceFor('x-closed', { read: 'all', call: 'none' })
    const out = (await service.handleToolCall('x-closed/greet', null)) as Envelope
    expect(out.code).toBe(404)
    expect(out.error).toBe('no live instance: x-closed')
    expect(binding.ran()).toBe(false)
  })

  it('a valid verified credential does NOT reopen a closed surface (404, not 200/403)', async () => {
    const { service, binding } = serviceFor('x-closed2', { read: 'all', call: 'none' })
    const jwt = await signJwt({ sub: 'agent-1', scope: 'everything' })
    const out = (await service.handleToolCall('x-closed2/greet', null, {
      userId: null,
      jwt,
    })) as Envelope
    expect(out.code).toBe(404)
    expect(binding.ran()).toBe(false)
  })
})

// ─── call:'verified' — every exposed member needs a principal ────────────────

describe("call:'verified' — needsPrincipal is forced for every member", () => {
  it('anonymous caller on an UNSCOPED member → 401 AUTH_REQUIRED', async () => {
    const { service, binding } = serviceFor('x-ver', { read: 'agents', call: 'verified' })
    const out = (await service.handleToolCall('x-ver/greet', null)) as Envelope
    expect(out.code).toBe(401)
    expect(out.error).toContain('AUTH_REQUIRED')
    expect(binding.ran()).toBe(false)
  })

  it('valid verified principal → dispatches', async () => {
    const { service, binding } = serviceFor('x-ver2', { read: 'agents', call: 'verified' })
    const jwt = await signJwt({ sub: 'agent-1' })
    const out = (await service.handleToolCall('x-ver2/greet', null, {
      userId: null,
      jwt,
    })) as Envelope
    expect(out.result).toEqual({ called: 'greet' })
    expect(binding.ran()).toBe(true)
  })

  it('forged credential → 401 AUTH_INVALID, never dispatched', async () => {
    const { service, binding } = serviceFor('x-ver3', { read: 'agents', call: 'verified' })
    const forged = await signJwt({ sub: 'mallory' }, WRONG_SECRET)
    const out = (await service.handleToolCall('x-ver3/greet', null, {
      userId: null,
      jwt: forged,
    })) as Envelope
    expect(out.code).toBe(401)
    expect(out.error).toContain('AUTH_INVALID')
    expect(binding.ran()).toBe(false)
  })

  it('no auth plugin wired + call:verified → 401 AUTH_MISSING (fail-closed)', async () => {
    const { service } = serviceFor('x-ver4', { read: 'agents', call: 'verified' }, { noAuth: true })
    const out = (await service.handleToolCall('x-ver4/greet', null)) as Envelope
    expect(out.code).toBe(401)
    expect(out.error).toContain('AUTH_MISSING')
  })
})

// ─── call:{scope} — the surface scope, met with member $scope ────────────────

describe('call:{scope} — surface scope as a ceiling, met with member $scope', () => {
  it('principal carrying the surface scope → dispatches', async () => {
    const { service } = serviceFor('x-sc', { read: 'agents', call: { scope: 'tools:call' } })
    const jwt = await signJwt({ sub: 'agent-1', scope: 'tools:call' })
    const out = (await service.handleToolCall('x-sc/greet', null, {
      userId: null,
      jwt,
    })) as Envelope
    expect(out.result).toEqual({ called: 'greet' })
  })

  it('verified principal WITHOUT the surface scope → 403 naming it', async () => {
    const { service, binding } = serviceFor('x-sc2', {
      read: 'agents',
      call: { scope: 'tools:call' },
    })
    const jwt = await signJwt({ sub: 'agent-1', scope: 'other:scope' })
    const out = (await service.handleToolCall('x-sc2/greet', null, {
      userId: null,
      jwt,
    })) as Envelope
    expect(out.code).toBe(403)
    expect(out.error).toBe("SCOPE_DENIED: JWT lacks required scope 'tools:call'")
    expect(binding.ran()).toBe(false)
  })

  it('MEET with member $scope: surface scope alone is not enough', async () => {
    const { service } = serviceFor(
      'x-sc3',
      { read: 'agents', call: { scope: 'tools:call' } },
      { memberScope: 'reports:read' },
    )
    const onlySurface = await signJwt({ sub: 'a', scope: 'tools:call' })
    const out1 = (await service.handleToolCall('x-sc3/greet', null, {
      userId: null,
      jwt: onlySurface,
    })) as Envelope
    expect(out1.code).toBe(403)
    expect(out1.error).toContain("'reports:read'")

    const both = await signJwt({ sub: 'a', scope: 'tools:call reports:read' })
    const out2 = (await service.handleToolCall('x-sc3/greet', null, {
      userId: null,
      jwt: both,
    })) as Envelope
    expect(out2.result).toEqual({ called: 'greet' })
  })

  it('member $scope alone is not enough either (the ceiling is not a grant)', async () => {
    const { service } = serviceFor(
      'x-sc4',
      { read: 'agents', call: { scope: 'tools:call' } },
      { memberScope: 'reports:read' },
    )
    const onlyMember = await signJwt({ sub: 'a', scope: 'reports:read' })
    const out = (await service.handleToolCall('x-sc4/greet', null, {
      userId: null,
      jwt: onlyMember,
    })) as Envelope
    expect(out.code).toBe(403)
    expect(out.error).toContain("'tools:call'")
  })
})

// ─── Backward compatibility + fail-closed normalization ──────────────────────

describe('no declaration / malformed declaration', () => {
  it("metadata WITHOUT an extract member → today's behavior exactly (anonymous dispatch)", async () => {
    const { service, binding } = serviceFor('x-legacy', undefined)
    const out = (await service.handleToolCall('x-legacy/greet', null)) as Envelope
    expect(out.result).toEqual({ called: 'greet' })
    expect(binding.ran()).toBe(true)
  })

  it("declared default { read:'agents', call:'anonymous' } is byte-identical to no declaration", async () => {
    const { service, binding } = serviceFor('x-default', { read: 'agents', call: 'anonymous' })
    const out = (await service.handleToolCall('x-default/greet', null)) as Envelope
    expect(out.result).toEqual({ called: 'greet' })
    expect(binding.ran()).toBe(true)
  })

  it('a MALFORMED call value fails closed to an unavailable surface (404)', async () => {
    const { service, binding } = serviceFor('x-mal', { read: 'agents', call: 'everyone-welcome' })
    const out = (await service.handleToolCall('x-mal/greet', null)) as Envelope
    expect(out.code).toBe(404)
    expect(binding.ran()).toBe(false)
  })

  it('the ordering invariant holds: unknown action still 404s before the call-axis 401', async () => {
    const { service } = serviceFor('x-ord', { read: 'agents', call: 'verified' })
    const out = (await service.handleToolCall('x-ord/not-a-real-action', null)) as Envelope
    expect(out.code).toBe(404)
  })
})
