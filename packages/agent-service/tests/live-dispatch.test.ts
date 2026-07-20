/**
 * v0.3.0 live-dispatch tests for `@aihu/agent-service` — AC4–AC11, AC14.
 *
 * AC4: handleToolCall live dispatch returns real result, not stub.
 * AC5: Scope pass — JWT with claim → 200.
 * AC6: Scope fail — JWT without claim → 403.
 * AC7: Auth-absent fail-closed → 401 AUTH_MISSING.
 * AC8: Rate-limit → 429 after quota exhausted.
 * AC9: userId missing → 401.
 * AC10: No live instance → 404.
 * AC11: Undeclared action → 404.
 * AC14: Dispatch ordering invariant: 403 before 429.
 */

import { describe, expect, it } from 'vitest'
import { createAgentService } from '../src/index.ts'
import type { AuthPlugin, LiveBinding, RateLimitPlugin } from '../src/types.ts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal LiveBinding for testing. */
function makeLiveBinding(
  tag: string,
  scopeStr: string | null = null,
  rateLimitStr: string | null = null,
): LiveBinding {
  let locationValue = 'NYC'
  let disposeCount = 0

  return {
    rootId: 1,
    tag,
    getSignal(name: string): unknown {
      if (name === 'location') return locationValue
      if (name === 'forecast') return 'sunny'
      return undefined
    },
    setSignal(name: string, value: unknown): void {
      if (name === 'location') locationValue = value as string
    },
    async callAction(name: string, _args: unknown[]): Promise<unknown> {
      if (name === 'fetchForecast') return { weather: 'sunny', location: locationValue }
      throw new Error(`no action: ${name}`)
    },
    scope(): string | null {
      return scopeStr
    },
    rateLimit(): string | null {
      return rateLimitStr
    },
    dispose$(): boolean {
      if (disposeCount > 0) return false
      disposeCount++
      return true
    },
  }
}

/** Create a registry Map with one binding. */
function makeRegistry(tag: string, binding: LiveBinding): Map<string, LiveBinding[]> {
  return new Map([[tag, [binding]]])
}

// ─── AC10: No live instance ──────────────────────────────────────────────────

describe('AC10 — no live instance → 404', () => {
  it('returns 404 when no binding is in the registry', async () => {
    const registry = new Map<string, LiveBinding[]>()
    const svc = createAgentService({
      getRegistry: () => registry,
    })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      {
        userId: 'user-1',
      },
    )) as { error: string; code: number }
    expect(res.code).toBe(404)
    expect(res.error).toContain('weather-card')
  })

  it('returns 404 for empty binding array', async () => {
    const registry = new Map([['weather-card', [] as LiveBinding[]]])
    const svc = createAgentService({ getRegistry: () => registry })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      {
        userId: 'user-1',
      },
    )) as { error: string; code: number }
    expect(res.code).toBe(404)
  })
})

// ─── AC9: userId cardinality ─────────────────────────────────────────────────
// Per Amendment 3 §6.3: userId is required for auth-gated endpoints (those with
// $scope or $rate-limit). Un-scoped, un-rate-limited components allow anonymous.

describe('AC9 — userId missing → 401 for scoped components', () => {
  it('returns 401 when userId is null (scoped component)', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated') // has scope
    const registry = makeRegistry('weather-card', binding)
    const authPlugin = { checkScope: () => true }
    const svc = createAgentService({ getRegistry: () => registry, authPlugin })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      {
        userId: null,
      },
    )) as { error: string; code: number }
    expect(res.code).toBe(401)
    expect(res.error).toContain('userId')
  })

  it('returns 401 when userId is empty string (scoped component)', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const registry = makeRegistry('weather-card', binding)
    const authPlugin = { checkScope: () => true }
    const svc = createAgentService({ getRegistry: () => registry, authPlugin })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      {
        userId: '',
      },
    )) as { error: string; code: number }
    expect(res.code).toBe(401)
  })

  it('returns 401 when requestContext is omitted for scoped component', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const registry = makeRegistry('weather-card', binding)
    const authPlugin = { checkScope: () => true }
    const svc = createAgentService({ getRegistry: () => registry, authPlugin })
    const res = (await svc.handleToolCall('weather-card/fetchForecast', {})) as {
      error: string
      code: number
    }
    expect(res.code).toBe(401)
  })

  it('returns 401 when userId is missing for rate-limited component', async () => {
    const binding = makeLiveBinding('weather-card', null, '100/min')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({ getRegistry: () => registry })
    const res = (await svc.handleToolCall('weather-card/fetchForecast', {})) as {
      error: string
      code: number
    }
    expect(res.code).toBe(401)
  })
})

// ─── AC4: Live dispatch ──────────────────────────────────────────────────────

describe('AC4 — live dispatch returns real result', () => {
  it('callAction on mounted component returns real result', async () => {
    const binding = makeLiveBinding('weather-card')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({ getRegistry: () => registry })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      {
        userId: 'user-1',
      },
    )) as { result: { weather: string } }
    expect(res.result).toBeDefined()
    expect(res.result.weather).toBe('sunny')
  })

  it('getSignal returns signal value for read-only signals', async () => {
    const binding = makeLiveBinding('weather-card')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({ getRegistry: () => registry })
    // `location` is a read signal, not an action
    const res = (await svc.handleToolCall(
      'weather-card/location',
      {},
      {
        userId: 'user-1',
      },
    )) as { result: unknown }
    // Should return the signal value (NYC) since callAction will throw 'no action: location'
    expect(res.result).toBe('NYC')
  })

  it('result is NOT the stub { stub: true }', async () => {
    const binding = makeLiveBinding('weather-card')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({ getRegistry: () => registry })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      {
        userId: 'user-1',
      },
    )) as Record<string, unknown>
    expect(res.stub).toBeUndefined()
  })
})

// ─── AC11: Action allowlist ──────────────────────────────────────────────────

describe('AC11 — undeclared action → 404', () => {
  it('returns 404 for an action not exposed by the binding', async () => {
    const binding = makeLiveBinding('weather-card')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({ getRegistry: () => registry })
    const res = (await svc.handleToolCall(
      'weather-card/internalMethod',
      {},
      {
        userId: 'user-1',
      },
    )) as { error: string; code: number }
    expect(res.code).toBe(404)
    expect(res.error).toContain('internalMethod')
  })
})

// ─── AC11b: the gate itself must enforce, not the invoker ───────────────────
//
// AC11 above passes even with NO server-side allowlist, because
// `makeLiveBinding.callAction` throws `no action: …` and the handler maps that
// to a 404. It therefore asserts the INVOKER's rejection, not the gate's — the
// same inversion that let `typeof binding.callAction === 'function'` stand in
// for an allowlist check on the only branch that can succeed.
//
// These tests are constructed so the invoker WOULD succeed. Only a real
// server-side check can produce a 404.

describe('AC11b — server-side allowlist is load-bearing', () => {
  /** A binding whose callAction succeeds for ANY name. */
  function makePermissiveBinding(tag: string): LiveBinding {
    return {
      rootId: 1,
      tag,
      getSignal: () => 'readable',
      setSignal: () => {},
      callAction: async (name: string) => ({ called: name }),
      scope: () => null,
      rateLimit: () => null,
      dispose$: () => true,
    }
  }

  it('denies an action the metadata does not advertise, even though the binding would run it', async () => {
    const binding = makePermissiveBinding('weather-card')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({
      getRegistry: () => registry,
      manifests: [
        {
          tag: 'weather-card',
          actions: { fetchForecast: { returns: {} } },
          state: { forecast: 'The current forecast' },
        },
      ],
    })

    // Sanity: the binding really would have run it.
    await expect(binding.callAction('wipeDatabase', [])).resolves.toEqual({
      called: 'wipeDatabase',
    })

    const res = (await svc.handleToolCall('weather-card/wipeDatabase', {}, { userId: 'u1' })) as {
      error: string
      code: number
    }
    expect(res.code).toBe(404)
    expect(res.error).toContain('wipeDatabase')
  })

  it('allows an advertised action', async () => {
    const binding = makePermissiveBinding('weather-card')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({
      getRegistry: () => registry,
      manifests: [{ tag: 'weather-card', actions: { fetchForecast: { returns: {} } } }],
    })
    const res = (await svc.handleToolCall('weather-card/fetchForecast', {}, { userId: 'u1' })) as {
      result: unknown
    }
    expect(res.result).toBeDefined()
  })

  it('allows a readable state member (handleToolCall falls through to getSignal)', async () => {
    const binding = makePermissiveBinding('weather-card')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({
      getRegistry: () => registry,
      manifests: [
        {
          tag: 'weather-card',
          actions: { fetchForecast: { returns: {} } },
          state: { forecast: 'The current forecast' },
        },
      ],
    })
    const res = (await svc.handleToolCall('weather-card/forecast', {}, { userId: 'u1' })) as {
      result: unknown
    }
    expect(res.result).toBeDefined()
  })
})

// ─── AC5 + AC6: Scope enforcement ───────────────────────────────────────────

describe('AC5 + AC6 — scope enforcement', () => {
  const authPlugin: AuthPlugin = {
    checkScope(jwt: string, scope: string): boolean {
      // Simple: jwt contains the scope string
      return jwt.includes(scope)
    },
  }

  it('AC5: scope pass — JWT with authenticated claim → 200 result', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({ getRegistry: () => registry, authPlugin })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      { userId: 'user-1', jwt: 'token-authenticated-xyz' },
    )) as { result: unknown }
    expect(res.result).toBeDefined()
  })

  it('AC6: scope fail — JWT without claim → 403', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({ getRegistry: () => registry, authPlugin })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      { userId: 'user-1', jwt: 'token-no-scope' },
    )) as { error: string; code: number }
    expect(res.code).toBe(403)
    expect(res.error).toContain('SCOPE_DENIED')
  })
})

// ─── AC7: Auth-absent fail-closed ───────────────────────────────────────────

describe('AC7 — auth-absent fail-closed', () => {
  it('no authPlugin + $scope component → 401 AUTH_MISSING', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const registry = makeRegistry('weather-card', binding)
    // No authPlugin injected
    const svc = createAgentService({ getRegistry: () => registry })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      {
        userId: 'user-1',
        jwt: 'token-authenticated',
      },
    )) as { error: string; code: number }
    expect(res.code).toBe(401)
    expect(res.error).toContain('AUTH_MISSING')
  })

  it('no authPlugin + no scope → passes (only scope-guarded components fail-closed)', async () => {
    const binding = makeLiveBinding('weather-card', null) // no scope
    const registry = makeRegistry('weather-card', binding)
    const svc = createAgentService({ getRegistry: () => registry })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      {
        userId: 'user-1',
      },
    )) as { result: unknown }
    expect(res.result).toBeDefined()
  })
})

// ─── AC8: Rate-limit ─────────────────────────────────────────────────────────

describe('AC8 — rate-limit enforcement', () => {
  it('returns 429 after quota is exhausted', async () => {
    const binding = makeLiveBinding('weather-card', null, '2/min')
    const registry = makeRegistry('weather-card', binding)

    let callCount = 0
    const rateLimitPlugin: RateLimitPlugin = {
      checkRateLimit(_spec: string, _key: string): boolean {
        callCount++
        return callCount <= 2 // allow first 2, block on 3rd
      },
    }

    const svc = createAgentService({ getRegistry: () => registry, rateLimitPlugin })
    const ctx = { userId: 'user-1' }

    const r1 = await svc.handleToolCall('weather-card/fetchForecast', {}, ctx)
    const r2 = await svc.handleToolCall('weather-card/fetchForecast', {}, ctx)
    const r3 = (await svc.handleToolCall('weather-card/fetchForecast', {}, ctx)) as {
      error: string
      code: number
    }

    expect((r1 as { result: unknown }).result).toBeDefined()
    expect((r2 as { result: unknown }).result).toBeDefined()
    expect(r3.code).toBe(429)
    expect(r3.error).toContain('RATE_LIMITED')
  })

  it('rate-limit key uses userId:tag format', async () => {
    const binding = makeLiveBinding('weather-card', null, '100/min')
    const registry = makeRegistry('weather-card', binding)

    const usedKeys: string[] = []
    const rateLimitPlugin: RateLimitPlugin = {
      checkRateLimit(_spec: string, key: string): boolean {
        usedKeys.push(key)
        return true
      },
    }

    const svc = createAgentService({ getRegistry: () => registry, rateLimitPlugin })
    await svc.handleToolCall('weather-card/fetchForecast', {}, { userId: 'user-42' })
    expect(usedKeys[0]).toBe('user-42:weather-card')
  })
})

// ─── AC14: Dispatch ordering invariant ───────────────────────────────────────

describe('AC14 — error ordering: 404 → 401 → 403 → 429', () => {
  it('rate-limited call with invalid scope → 403 not 429 (scope check before rate-limit)', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated', '1/min')
    const registry = makeRegistry('weather-card', binding)

    let rateLimitCalled = false
    const rateLimitPlugin: RateLimitPlugin = {
      checkRateLimit(): boolean {
        rateLimitCalled = true
        return false // would return 429
      },
    }
    const authPlugin: AuthPlugin = {
      checkScope(): boolean {
        return false // invalid scope → 403
      },
    }

    const svc = createAgentService({ getRegistry: () => registry, authPlugin, rateLimitPlugin })
    const res = (await svc.handleToolCall(
      'weather-card/fetchForecast',
      {},
      { userId: 'user-1', jwt: 'no-scope-token' },
    )) as { error: string; code: number }

    // Must be 403 (scope fail), NOT 429 (rate-limit)
    expect(res.code).toBe(403)
    // Rate-limit must NOT have been called (ordering invariant)
    expect(rateLimitCalled).toBe(false)
  })

  it('no live instance → 404 before userId check', async () => {
    const registry = new Map<string, LiveBinding[]>() // empty
    const svc = createAgentService({ getRegistry: () => registry })
    // No userId — but 404 must come first
    const res = (await svc.handleToolCall('weather-card/fetchForecast', {})) as {
      error: string
      code: number
    }
    expect(res.code).toBe(404)
  })
})

// ─── Backward compat: existing tests still pass ──────────────────────────────

describe('backward compat — Plan 5.2 behavior preserved', () => {
  it('createAgentService() with no options still returns a valid service', () => {
    const svc = createAgentService()
    expect(typeof svc.getManifest).toBe('function')
    expect(typeof svc.handleToolCall).toBe('function')
    expect(typeof svc.asMiddleware).toBe('function')
  })

  it('getManifest() still aggregates metadata', () => {
    const svc = createAgentService({
      manifests: [{ tag: 'x-counter', describes: 'A counter' }],
    })
    expect(svc.getManifest().tools).toHaveLength(1)
  })
})

// ─── GO1: rate limiting fails CLOSED ─────────────────────────────────────────
//
// Thesis §3: "capability, authority, and rate are declared per-member and
// enforced by the server", and the named failure mode "a declared control that
// silently no-ops when its plugin is absent".
//
// The gate used to read `if (rateLimitSpec !== null && rateLimitPlugin)`, so
// declaring `$rate-limit` and omitting the plugin made the whole branch
// unreachable and the call dispatched, silently unlimited.
//
// ANTI-AC11 CONSTRUCTION: every binding below is PERMISSIVE — its `callAction`
// succeeds for any name. `makeLiveBinding` throws `no action: …` for anything
// but `fetchForecast`, which the handler maps to a 404, so a test built on it
// can pass with NO server-side check at all by asserting the INVOKER's
// rejection. These assert the GATE's own envelope code (429 / 401), and pair
// every denial with a proof that the action did not run.
//
// BIDIRECTIONAL by construction: the `describe` blocks are under-enforcement
// (declared control must DENY when unenforceable) and over-enforcement
// (undeclared control must still DISPATCH). A fix that only satisfied the first
// would turn the gate into "deny everything" and is caught by the second.

/**
 * A binding whose `callAction` succeeds for ANY name and records that it ran.
 * If the gate lets a call through, `ran` flips — so "did the gate deny" is
 * answered by observed behaviour, not by a return shape alone.
 */
function makePermissiveRateBinding(
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

describe('GO1 under-enforcement — a declared control with its plugin ABSENT must deny', () => {
  it('$rate-limit declared + rateLimitPlugin absent → 429 RATE_LIMIT_MISSING, action never runs', async () => {
    // Sanity, on a throwaway twin: the invoker itself would happily have run
    // this action, so any denial below can only have come from the gate.
    const twin = makePermissiveRateBinding('weather-card', null, '10/min')
    await expect(twin.callAction('fetchForecast', [])).resolves.toEqual({
      called: 'fetchForecast',
    })

    const binding = makePermissiveRateBinding('weather-card', null, '10/min')
    // No rateLimitPlugin. Pre-GO1 this dispatched, silently unlimited.
    const svc = createAgentService({ getRegistry: () => makeRegistry('weather-card', binding) })

    const res = (await svc.handleToolCall('weather-card/fetchForecast', [], {
      userId: 'user-1',
    })) as { error: string; code: number }

    expect(res.code).toBe(429)
    expect(res.error).toContain('RATE_LIMIT_MISSING')
    // The control did not merely report a denial — it prevented execution.
    expect(binding.ran()).toBe(false)
  })

  it('$scope declared + authPlugin absent → 401 AUTH_MISSING (the posture GO1 mirrors)', async () => {
    const binding = makePermissiveRateBinding('weather-card', 'admin', null)
    const svc = createAgentService({ getRegistry: () => makeRegistry('weather-card', binding) })

    const res = (await svc.handleToolCall('weather-card/fetchForecast', [], {
      userId: 'user-1',
      jwt: 'j',
    })) as { error: string; code: number }

    expect(res.code).toBe(401)
    expect(res.error).toContain('AUTH_MISSING')
    expect(binding.ran()).toBe(false)
  })

  it('the two absent-plugin denials are DISTINCT codes, not one blanket rule', async () => {
    const rateOnly = makePermissiveRateBinding('weather-card', null, '10/min')
    const scopeOnly = makePermissiveRateBinding('weather-card', 'admin', null)

    const rateRes = (await createAgentService({
      getRegistry: () => makeRegistry('weather-card', rateOnly),
    }).handleToolCall('weather-card/fetchForecast', [], { userId: 'u1' })) as { code: number }
    const scopeRes = (await createAgentService({
      getRegistry: () => makeRegistry('weather-card', scopeOnly),
    }).handleToolCall('weather-card/fetchForecast', [], { userId: 'u1', jwt: 'j' })) as {
      code: number
    }

    // Each declaration is enforced on its own terms. Identical codes would mean
    // the gate collapsed both controls into a single "declared ⇒ deny" rule.
    expect(rateRes.code).toBe(429)
    expect(scopeRes.code).toBe(401)
    expect(rateRes.code).not.toBe(scopeRes.code)
  })
})

describe('GO1 over-enforcement — a control that is NOT declared must still dispatch', () => {
  it('no $rate-limit, no plugin → dispatches normally', async () => {
    const binding = makePermissiveRateBinding('weather-card', null, null)
    const svc = createAgentService({ getRegistry: () => makeRegistry('weather-card', binding) })

    const res = (await svc.handleToolCall('weather-card/fetchForecast', [], {
      userId: 'user-1',
    })) as { result: unknown; code?: number }

    expect(res.code).toBeUndefined()
    expect(res.result).toEqual({ called: 'fetchForecast' })
    expect(binding.ran()).toBe(true)
  })

  it('no $rate-limit and no $scope and NO request context at all → still dispatches', async () => {
    // The unscoped/unlimited path must stay reachable by adapters that carry no
    // auth context (a2a/acp, v0.3.0 back-compat). Requiring a userId here would
    // be over-enforcement of a control nobody declared.
    const binding = makePermissiveRateBinding('weather-card', null, null)
    const svc = createAgentService({ getRegistry: () => makeRegistry('weather-card', binding) })

    const res = (await svc.handleToolCall('weather-card/fetchForecast', [])) as {
      result: unknown
      code?: number
    }

    expect(res.code).toBeUndefined()
    expect(binding.ran()).toBe(true)
  })

  it('$rate-limit declared WITH a permissive plugin → dispatches (declared ≠ denied)', async () => {
    const binding = makePermissiveRateBinding('weather-card', null, '10/min')
    const rateLimitPlugin: RateLimitPlugin = { checkRateLimit: () => true }
    const svc = createAgentService({
      getRegistry: () => makeRegistry('weather-card', binding),
      rateLimitPlugin,
    })

    const res = (await svc.handleToolCall('weather-card/fetchForecast', [], {
      userId: 'user-1',
    })) as { result: unknown; code?: number }

    expect(res.code).toBeUndefined()
    expect(binding.ran()).toBe(true)
  })

  it('fail-closed did not displace the ordering invariant: 403 still beats 429', async () => {
    // A scoped + rate-limited component with NEITHER plugin must report the
    // scope failure (401), not the rate-limit one — Step 3 precedes Step 4.
    const binding = makePermissiveRateBinding('weather-card', 'admin', '10/min')
    const svc = createAgentService({ getRegistry: () => makeRegistry('weather-card', binding) })

    const res = (await svc.handleToolCall('weather-card/fetchForecast', [], {
      userId: 'u1',
      jwt: 'j',
    })) as { code: number; error: string }

    expect(res.code).toBe(401)
    expect(res.error).toContain('AUTH_MISSING')
  })
})
