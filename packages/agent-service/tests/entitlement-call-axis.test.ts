/**
 * GX Phase 4 (#466) — the call axis's live-entitlement stage (spec §4.6):
 * `runGate` gains one stage between the scope meet and the rate limit,
 * consulting an injected `EntitlementsHandle` (the same registry instance the
 * server router holds). This suite uses a FIXTURE handle so the package keeps
 * zero `@aihu/server` dependency; the cross-package one-registry-both-axes
 * probe lives in `packages/router/tests/governed-handle.test.ts` (G7b).
 *
 * Ladder (§4.3, tool envelope): deny → 403 ENTITLEMENT_DENIED; resolver
 * failure → 503 ENTITLEMENT_UNAVAILABLE + Retry-After. Absent handle ⇒
 * byte-identical behavior (the stage does not exist).
 */
import { describe, expect, it } from 'vitest'
import type {
  EntitledPrincipal,
  EntitlementMemo,
  EntitlementsHandle,
  EntitlementVerdict,
} from '../src/entitlements.ts'
import { createAgentService } from '../src/index.ts'
import type { AuthPlugin, LiveBinding, VerifiedClaims } from '../src/types.ts'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const CLAIMS: Record<string, VerifiedClaims> = {
  'member-token': { sub: 'member-1', scope: 'members' },
  'plain-token': { sub: 'plain-1' },
}

const authPlugin: AuthPlugin = {
  checkScope: (jwt, scope) => {
    const claims = CLAIMS[jwt]
    return typeof claims?.scope === 'string' && claims.scope.split(' ').includes(scope)
  },
  verify: async (jwt) => CLAIMS[jwt] ?? null,
}

function binding(scope: string | null): LiveBinding {
  return {
    rootId: 1,
    tag: 'gx-tool',
    getSignal: () => undefined,
    setSignal: () => {},
    callAction: async () => 'dispatched',
    scope: () => scope,
    rateLimit: () => null,
    dispose$: () => true,
  }
}

/** A memoizing fixture handle with a spyable resolver map. */
function fixtureHandle(
  verdicts: Record<string, EntitlementVerdict>,
): EntitlementsHandle & { consults: { scope: string; sub: string }[] } {
  const consults: { scope: string; sub: string }[] = []
  return {
    consults,
    createMemo(): EntitlementMemo {
      return { verdicts: new Map() }
    },
    check(scope: string, principal: EntitledPrincipal, memo?: EntitlementMemo) {
      const memoized = memo?.verdicts.get(scope)
      if (memoized) return memoized
      consults.push({ scope, sub: principal.sub })
      const p = Promise.resolve(verdicts[scope] ?? 'granted')
      memo?.verdicts.set(scope, p)
      return p
    },
  }
}

function service(entitlements?: EntitlementsHandle, memberScope: string | null = 'members') {
  return createAgentService({
    manifests: [
      {
        tag: 'gx-tool',
        actions: { run: { params: [] } },
        extract: { read: { scope: 'members' }, call: { scope: 'members' } },
      } as never,
    ],
    authPlugin,
    getRegistry: () => new Map([['gx-tool', [binding(memberScope)]]]),
    ...(entitlements ? { entitlements } : {}),
  })
}

const ctx = (jwt: string) => ({ userId: null, jwt })

// ─── The stage ───────────────────────────────────────────────────────────────

describe('runGate step 3b — live entitlement (spec §4.6)', () => {
  it('granted verdict dispatches; the met set is consulted once per scope (deduped)', async () => {
    const handle = fixtureHandle({ members: 'granted' })
    const out = (await service(handle).handleToolCall(
      'gx-tool/run',
      null,
      ctx('member-token'),
    )) as {
      result?: unknown
    }
    expect(out.result).toBe('dispatched')
    // surface scope ∧ member scope are the SAME scope — one consult, not two.
    expect(handle.consults).toEqual([{ scope: 'members', sub: 'member-1' }])
  })

  it('denied → 403 ENTITLEMENT_DENIED (after the static meet passed)', async () => {
    const handle = fixtureHandle({ members: 'denied' })
    const out = (await service(handle).handleToolCall(
      'gx-tool/run',
      null,
      ctx('member-token'),
    )) as {
      code?: number
      error?: string
    }
    expect(out.code).toBe(403)
    expect(out.error).toMatch(/^ENTITLEMENT_DENIED/)
  })

  it('unavailable → 503 ENTITLEMENT_UNAVAILABLE + retryAfter (an outage is not a verdict)', async () => {
    const handle = fixtureHandle({ members: 'unavailable' })
    const out = (await service(handle).handleToolCall(
      'gx-tool/run',
      null,
      ctx('member-token'),
    )) as {
      code?: number
      error?: string
      retryAfter?: number
    }
    expect(out.code).toBe(503)
    expect(out.error).toMatch(/^ENTITLEMENT_UNAVAILABLE/)
    expect(out.retryAfter).toBe(30)
  })

  it('the static meet still runs FIRST: a token without the scope 403s with zero consults (G7f)', async () => {
    const handle = fixtureHandle({ members: 'granted' })
    const out = (await service(handle).handleToolCall('gx-tool/run', null, ctx('plain-token'))) as {
      code?: number
      error?: string
    }
    expect(out.code).toBe(403)
    expect(out.error).toMatch(/SCOPE_DENIED/)
    expect(handle.consults).toEqual([]) // the live layer never runs pre-meet
  })

  it('a shared RequestContext.entitlementMemo dedupes across calls in one request (§4.4 L1)', async () => {
    const handle = fixtureHandle({ members: 'granted' })
    const svc = service(handle)
    const memo = handle.createMemo()
    await svc.handleToolCall('gx-tool/run', null, { ...ctx('member-token'), entitlementMemo: memo })
    await svc.handleToolCall('gx-tool/run', null, { ...ctx('member-token'), entitlementMemo: memo })
    expect(handle.consults).toHaveLength(1)
  })

  it('an unscoped surface+member never consults the handle at all', async () => {
    const handle = fixtureHandle({ members: 'denied' }) // would deny if consulted
    const svc = createAgentService({
      manifests: [{ tag: 'gx-tool', actions: { run: { params: [] } } } as never],
      authPlugin,
      getRegistry: () => new Map([['gx-tool', [binding(null)]]]),
      entitlements: handle,
    })
    const out = (await svc.handleToolCall('gx-tool/run', null)) as { result?: unknown }
    expect(out.result).toBe('dispatched')
    expect(handle.consults).toEqual([])
  })

  it('ABSENT handle ⇒ byte-identical: the scoped call dispatches on token scopes alone', async () => {
    const out = (await service(undefined).handleToolCall(
      'gx-tool/run',
      null,
      ctx('member-token'),
    )) as { result?: unknown }
    expect(out.result).toBe('dispatched')
  })
})

describe('asMiddleware — the 503 envelope surfaces Retry-After', () => {
  it('maps retryAfter onto the HTTP header', async () => {
    const handle = fixtureHandle({ members: 'unavailable' })
    const svc = createAgentService({
      manifests: [
        {
          tag: 'gx-tool',
          actions: { run: { params: [] } },
          extract: { read: { scope: 'members' }, call: { scope: 'members' } },
        } as never,
      ],
      authPlugin,
      getRegistry: () => new Map([['gx-tool', [binding('members')]]]),
      entitlements: handle,
      resolveAuth: (req) => ({
        userId: null,
        jwt: req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? null,
      }),
    })
    const mw = svc.asMiddleware()
    const res = await mw(
      new Request('http://localhost/__aihu/tools/call', {
        method: 'POST',
        headers: { Authorization: 'Bearer member-token' },
        body: JSON.stringify({ tool: 'gx-tool/run', params: null }),
      }),
    )
    expect(res?.status).toBe(503)
    expect(res?.headers.get('Retry-After')).toBe('30')
  })
})
