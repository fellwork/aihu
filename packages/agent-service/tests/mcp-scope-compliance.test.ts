/**
 * G4 — MCP `$scope` enforcement compliance suite (regression guard for G6f).
 *
 * AC1: `$scope` enforcement THROUGH `asMiddleware` propagates the correct HTTP
 *      status: 401 (no-JWT), 403 (wrong-scope), 200 (valid). This is the exact
 *      behavior G6f fixed — the old middleware hardcoded `status: 200` and
 *      passed no `RequestContext`. The assertions read `res.status` off the real
 *      `Response`, not just the JSON body code.
 * AC2: The setSignal write path (`mount.ts:395-398`) is unreachable from any
 *      tool dispatch. `handleToolCall` only ever routes `callAction` / `getSignal`
 *      (read paths). A binding whose `setSignal` increments a spy is dispatched
 *      for BOTH an action name AND a writable-signal name, through both
 *      `handleToolCall` and `asMiddleware`; the spy must stay at 0.
 */

import { describe, expect, it } from 'vitest'
import { createAgentService } from '../src/index.ts'
import type { AuthPlugin, LiveBinding, RequestContext } from '../src/types.ts'

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a configurable `LiveBinding` exposing a `setSignalCalls` spy counter
 * (incremented inside `setSignal`), a working `callAction('fetchForecast')`,
 * a `getSignal('location')`, and a parameterizable `scope()`.
 *
 * Returns the binding plus the live spy counter object so tests can read
 * `setSignalCalls` after dispatch.
 */
function makeLiveBinding(tag: string, scopeStr: string | null = null) {
  const spy = { setSignalCalls: 0 }
  let locationValue = 'NYC'

  const binding: LiveBinding = {
    rootId: 1,
    tag,
    getSignal(name: string): unknown {
      if (name === 'location') return locationValue
      if (name === 'forecast') return 'sunny'
      return undefined
    },
    setSignal(name: string, value: unknown): void {
      // Spy: if tool dispatch ever reaches the write path, this fires.
      spy.setSignalCalls++
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
      return null
    },
    dispose$(): boolean {
      return true
    },
  }

  return { binding, spy }
}

/**
 * Auth plugin: JWT carries the scope iff the scope string is a substring.
 * #420: `verify` accepts any non-empty token as signed for `user-1` — the
 * scope decision below runs only after this verification step passes.
 */
const authPlugin: AuthPlugin = {
  checkScope(jwt: string, scope: string): boolean {
    return jwt.includes(scope)
  },
  verify: async (jwt: string) => (jwt.length > 0 ? { sub: 'user-1' } : null),
}

/**
 * Wire a service for the through-`asMiddleware` cases: a single scoped binding,
 * the substring `authPlugin`, and a `resolveAuth` that reads the `Authorization`
 * header off the `Request`. When the header is absent it yields `{ userId: null }`
 * (drives the 401 AUTH_REQUIRED branch); when present it yields `{ userId, jwt }`.
 */
function makeService(tag: string, scopeStr: string | null) {
  const { binding, spy } = makeLiveBinding(tag, scopeStr)
  const registry = new Map<string, LiveBinding[]>([[tag, [binding]]])
  const svc = createAgentService({
    getRegistry: () => registry,
    authPlugin,
    resolveAuth(req: Request): RequestContext {
      const header = req.headers.get('Authorization')
      if (!header) return { userId: null }
      const jwt = header.replace(/^Bearer\s+/i, '')
      return { userId: 'user-1', jwt }
    },
  })
  return { svc, binding, spy }
}

/** Build a POST Request to the tool-call route, optional Bearer auth header. */
function post(tool: string, authHeader?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (authHeader) headers.Authorization = `Bearer ${authHeader}`
  return new Request('http://localhost/__aihu/tools/call', {
    method: 'POST',
    headers,
    body: JSON.stringify({ tool, params: {} }),
  })
}

// ─── AC1: $scope enforcement through asMiddleware ────────────────────────────

describe('$scope enforcement through asMiddleware', () => {
  const TAG = 'weather-card'
  const TOOL = 'weather-card/fetchForecast'
  const SCOPE = 'authenticated'

  it('401 no-JWT: scoped tool with no Authorization header → status 401, code 401, AUTH_REQUIRED', async () => {
    const { svc } = makeService(TAG, SCOPE)
    const mw = svc.asMiddleware()
    // No Authorization header → resolveAuth yields { userId: null } → 401.
    const res = await mw(post(TOOL))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    const body = (await res!.json()) as { error: string; code: number }
    expect(body.code).toBe(401)
    expect(body.error).toContain('AUTH_REQUIRED')
  })

  it('403 wrong-scope: JWT lacking the required scope → status 403, code 403, SCOPE_DENIED', async () => {
    const { svc } = makeService(TAG, SCOPE)
    const mw = svc.asMiddleware()
    // JWT present (non-empty userId) but does not contain the scope claim.
    const res = await mw(post(TOOL, 'token-no-scope'))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(403)
    const body = (await res!.json()) as { error: string; code: number }
    expect(body.code).toBe(403)
    expect(body.error).toContain('SCOPE_DENIED')
  })

  it('200 valid: JWT containing the scope + non-empty userId → status 200, result defined, no error/code', async () => {
    const { svc } = makeService(TAG, SCOPE)
    const mw = svc.asMiddleware()
    const res = await mw(post(TOOL, 'token-authenticated-xyz'))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(200)
    const body = (await res!.json()) as { result?: unknown; error?: unknown; code?: unknown }
    expect(body.result).toBeDefined()
    expect(body.error).toBeUndefined()
    expect(body.code).toBeUndefined()
  })
})

// ─── AC2: setSignal write path unreachable from tool dispatch ────────────────

describe('setSignal write path unreachable from tool dispatch', () => {
  const TAG = 'weather-card'

  it('handleToolCall never invokes setSignal — for an action OR a writable signal', async () => {
    // Un-scoped binding so dispatch reaches Step 5 without auth gating.
    const { binding, spy } = makeLiveBinding(TAG, null)
    const registry = new Map<string, LiveBinding[]>([[TAG, [binding]]])
    const svc = createAgentService({ getRegistry: () => registry })

    // Dispatch the ACTION name `fetchForecast` → routes callAction.
    await svc.handleToolCall(`${TAG}/fetchForecast`, {}, { userId: 'user-1' })
    // Dispatch the writable SIGNAL name `location` → callAction throws
    // "no action: location" → falls back to getSignal (read), never setSignal.
    await svc.handleToolCall(`${TAG}/location`, { value: 'LA' }, { userId: 'user-1' })

    expect(spy.setSignalCalls).toBe(0)
  })

  it('asMiddleware never invokes setSignal — for an action OR a writable signal', async () => {
    const { binding, spy } = makeLiveBinding(TAG, null)
    const registry = new Map<string, LiveBinding[]>([[TAG, [binding]]])
    const svc = createAgentService({
      getRegistry: () => registry,
      resolveAuth: (): RequestContext => ({ userId: 'user-1' }),
    })
    const mw = svc.asMiddleware()

    await mw(post(`${TAG}/fetchForecast`, 'any'))
    await mw(post(`${TAG}/location`, 'any'))

    expect(spy.setSignalCalls).toBe(0)
  })
})
