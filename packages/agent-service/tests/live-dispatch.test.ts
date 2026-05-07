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
