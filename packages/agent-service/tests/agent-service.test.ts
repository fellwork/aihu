import type { AgentMetadata } from '@aihu/agent'
import { describe, expect, it } from 'vitest'
import { createAgentService } from '../src/index.ts'
import type { AuthPlugin, LiveBinding, RateLimitPlugin } from '../src/types.ts'

/**
 * Plan 5.2 — unit tests for `@aihu/agent-service`.
 * AC-1: createAgentService() returns an AgentService with all required methods.
 * AC-2: getManifest() aggregates registered AgentMetadata entries.
 * AC-3: handleToolCall routes (stub response) for valid tool names.
 * AC-4: asMiddleware() returns a (req: Request) => Promise<Response | null> function.
 */

const sampleMeta: AgentMetadata = {
  tag: 'x-counter',
  describes: 'A counter widget',
  actions: {
    increment: { returns: { count: { type: 'number' } } },
    reset: { returns: {} },
  },
}

const sampleMeta2: AgentMetadata = {
  tag: 'x-search',
  describes: 'A search box',
  actions: {
    query: { returns: { results: { type: 'string' } } },
  },
}

// ── AC-1: Shape ──────────────────────────────────────────────────────────────

describe('createAgentService — shape', () => {
  it('returns an object with getManifest, handleToolCall, asMiddleware', () => {
    const svc = createAgentService()
    expect(typeof svc.getManifest).toBe('function')
    expect(typeof svc.handleToolCall).toBe('function')
    expect(typeof svc.asMiddleware).toBe('function')
  })

  it('works with no options (empty manifest)', () => {
    const svc = createAgentService()
    const manifest = svc.getManifest()
    expect(manifest).toEqual({ tools: [] })
  })

  it('works with explicit empty manifests array', () => {
    const svc = createAgentService({ manifests: [] })
    expect(svc.getManifest().tools).toHaveLength(0)
  })
})

// ── AC-2: getManifest ────────────────────────────────────────────────────────

describe('getManifest()', () => {
  it('returns a manifest with one tool entry per metadata', () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const manifest = svc.getManifest()
    expect(manifest.tools).toHaveLength(1)
  })

  it('tool entry has correct name and tag', () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const [tool] = svc.getManifest().tools
    expect(tool?.name).toBe('x-counter')
    expect(tool?.tag).toBe('x-counter')
  })

  it('tool entry includes actions from metadata', () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const [tool] = svc.getManifest().tools
    expect(Object.keys(tool?.actions ?? {})).toContain('increment')
    expect(Object.keys(tool?.actions ?? {})).toContain('reset')
  })

  it('aggregates multiple metadata entries into tools array', () => {
    const svc = createAgentService({ manifests: [sampleMeta, sampleMeta2] })
    const manifest = svc.getManifest()
    expect(manifest.tools).toHaveLength(2)
    const tags = manifest.tools.map((t) => t.tag)
    expect(tags).toContain('x-counter')
    expect(tags).toContain('x-search')
  })

  it('returns empty actions for metadata with no actions field', () => {
    const meta: AgentMetadata = { tag: 'x-bare' }
    const svc = createAgentService({ manifests: [meta] })
    const [tool] = svc.getManifest().tools
    expect(tool?.actions).toEqual({})
  })

  it('getManifest() returns the same reference on repeated calls', () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    expect(svc.getManifest()).toBe(svc.getManifest())
  })
})

// ── AC-3: handleToolCall ─────────────────────────────────────────────────────

describe('handleToolCall()', () => {
  // v0.3.0: the stub is replaced with live-dispatch. When no registry is
  // configured (no `getRegistry` option), handleToolCall returns 404 for
  // metadata-only entries (no live instance). The old stub behavior is
  // superseded by the live-dispatch tests in live-dispatch.test.ts.
  it('returns 404 for valid tag/action when no live registry (v0.3.0 behavior)', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const res = (await svc.handleToolCall('x-counter/increment', { amount: 1 })) as Record<
      string,
      unknown
    >
    // v0.3.0: returns 404 (no live instance) rather than the Plan 5.2 stub
    expect(typeof res.error).toBe('string')
    expect(typeof res.code).toBe('number')
    expect(res.code).toBe(404)
  })

  it('returns error for missing tag', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const res = (await svc.handleToolCall('x-missing/action', {})) as Record<string, unknown>
    expect(typeof res.error).toBe('string')
    expect(res.error).toContain('x-missing')
  })

  it('returns error for invalid toolName format (no slash)', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const res = (await svc.handleToolCall('badformat', {})) as Record<string, unknown>
    expect(typeof res.error).toBe('string')
  })

  it('returns error for unknown action on known tag', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const res = (await svc.handleToolCall('x-counter/fly', {})) as Record<string, unknown>
    expect(typeof res.error).toBe('string')
    // v0.3.0: 404 for no live instance (not no-action, since no live binding)
    expect(typeof res.error).toBe('string')
  })

  // v0.3.0: params are not echoed back (stub removed); live dispatch returns { result }
  // The old 'params are echoed back in stub result' test is superseded by live-dispatch.test.ts
  it('no stub flag in response (stub removed in v0.3.0)', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const res = (await svc.handleToolCall('x-counter/increment', { delta: 5 })) as Record<
      string,
      unknown
    >
    expect(res.stub).toBeUndefined()
  })
})

// ── AC-4: asMiddleware ───────────────────────────────────────────────────────

describe('asMiddleware()', () => {
  it('returns a function', () => {
    const svc = createAgentService()
    expect(typeof svc.asMiddleware()).toBe('function')
  })

  it('returns null for non-matching path', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/other', { method: 'POST' })
    const result = await mw(req)
    expect(result).toBeNull()
  })

  it('returns null for non-POST methods on matching path', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', { method: 'GET' })
    const result = await mw(req)
    expect(result).toBeNull()
  })

  it('handles valid POST to /__aihu/tools/call', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', {
      method: 'POST',
      body: JSON.stringify({ tool: 'x-counter/increment', params: {} }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    // G6f: metadata-only service has no live binding → handleToolCall returns a
    // 404 envelope, which asMiddleware now propagates as HTTP 404 (no longer a
    // spurious 200 double-wrap). The body is the bare envelope, not { result }.
    expect(res?.status).toBe(404)
    const body = (await res?.json()) as { error: string; code: number; result?: unknown }
    expect(body.code).toBe(404)
    expect(body.result).toBeUndefined()
  })

  it('returns non-null response for invalid JSON body', async () => {
    const svc = createAgentService()
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', {
      method: 'POST',
      body: 'not-json',
      headers: { 'content-type': 'application/json' },
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBeGreaterThanOrEqual(400)
  })

  it('returns non-null response when tool field is missing', async () => {
    const svc = createAgentService()
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', {
      method: 'POST',
      body: JSON.stringify({ params: {} }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await mw(req)
    expect(res).not.toBeNull()
    expect(res?.status).toBeGreaterThanOrEqual(400)
  })

  it('response content-type is application/json', async () => {
    const svc = createAgentService({ manifests: [sampleMeta] })
    const mw = svc.asMiddleware()
    const req = new Request('http://localhost/__aihu/tools/call', {
      method: 'POST',
      body: JSON.stringify({ tool: 'x-counter/increment', params: null }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await mw(req)
    expect(res?.headers.get('content-type')).toBe('application/json')
  })
})

// ── G6f: asMiddleware — live registry + auth ─────────────────────────────────

describe('asMiddleware — live registry + auth (G6f)', () => {
  /** Minimal LiveBinding factory (mirrors live-dispatch.test.ts). */
  function makeLiveBinding(
    tag: string,
    scopeStr: string | null = null,
    rateLimitStr: string | null = null,
  ): LiveBinding {
    return {
      rootId: 1,
      tag,
      getSignal: () => undefined,
      setSignal: () => {},
      async callAction(name: string): Promise<unknown> {
        if (name === 'fetchForecast') return { weather: 'sunny' }
        throw new Error(`no action: ${name}`)
      },
      scope: () => scopeStr,
      rateLimit: () => rateLimitStr,
      dispose$: () => true,
    }
  }

  function makeRegistry(tag: string, binding: LiveBinding): Map<string, LiveBinding[]> {
    return new Map([[tag, [binding]]])
  }

  const post = (body: unknown): Request =>
    new Request('http://localhost/__aihu/tools/call', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })

  const passAuth: AuthPlugin = { checkScope: () => true }

  // AC1: scoped binding + valid auth context (userId + jwt) + passing authPlugin
  //      → 200 with the REAL result, NOT double-wrapped.
  it('AC1: scoped tool with valid auth → 200 and bare { result }', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const svc = createAgentService({
      getRegistry: () => makeRegistry('weather-card', binding),
      authPlugin: passAuth,
      resolveAuth: () => ({ userId: 'u1', jwt: 'token-authenticated' }),
    })
    const res = await svc.asMiddleware()(post({ tool: 'weather-card/fetchForecast', params: {} }))
    expect(res?.status).toBe(200)
    const body = (await res?.json()) as { result?: { weather: string }; error?: unknown }
    // No double-wrap: body.result is the real value, not { error, code }.
    expect(body.result).toEqual({ weather: 'sunny' })
    expect(body.error).toBeUndefined()
  })

  // AC2: status propagation (no double-wrap). Each asserts res.status === code
  //      AND the JSON body is the bare envelope ({ code } at top level).
  it('AC2: missing jwt/userId on scoped tool → 401', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const svc = createAgentService({
      getRegistry: () => makeRegistry('weather-card', binding),
      authPlugin: passAuth,
      resolveAuth: () => ({ userId: null }),
    })
    const res = await svc.asMiddleware()(post({ tool: 'weather-card/fetchForecast', params: {} }))
    expect(res?.status).toBe(401)
    const body = (await res?.json()) as { code: number; result?: unknown }
    expect(body.code).toBe(401)
    expect(body.result).toBeUndefined()
  })

  it('AC2: insufficient scope → 403', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const failAuth: AuthPlugin = { checkScope: () => false }
    const svc = createAgentService({
      getRegistry: () => makeRegistry('weather-card', binding),
      authPlugin: failAuth,
      resolveAuth: () => ({ userId: 'u1', jwt: 'token-no-scope' }),
    })
    const res = await svc.asMiddleware()(post({ tool: 'weather-card/fetchForecast', params: {} }))
    expect(res?.status).toBe(403)
    const body = (await res?.json()) as { code: number }
    expect(body.code).toBe(403)
  })

  it('AC2: no live instance → 404', async () => {
    const svc = createAgentService({
      getRegistry: () => new Map<string, LiveBinding[]>(),
      resolveAuth: () => ({ userId: 'u1' }),
    })
    const res = await svc.asMiddleware()(post({ tool: 'weather-card/fetchForecast', params: {} }))
    expect(res?.status).toBe(404)
    const body = (await res?.json()) as { code: number }
    expect(body.code).toBe(404)
  })

  it('AC2: over rate-limit → 429', async () => {
    const binding = makeLiveBinding('weather-card', null, '1/min')
    const rateLimitPlugin: RateLimitPlugin = { checkRateLimit: () => false }
    const svc = createAgentService({
      getRegistry: () => makeRegistry('weather-card', binding),
      rateLimitPlugin,
      resolveAuth: () => ({ userId: 'u1' }),
    })
    const res = await svc.asMiddleware()(post({ tool: 'weather-card/fetchForecast', params: {} }))
    expect(res?.status).toBe(429)
    const body = (await res?.json()) as { code: number }
    expect(body.code).toBe(429)
  })

  // AC3: scoped binding, NO resolveAuth and NO authPlugin → fail-closed 401.
  // With no resolveAuth no RequestContext is built, so the userId-cardinality
  // gate (Amendment 3) fires first → 401 AUTH_REQUIRED. This is the correct
  // fail-closed outcome when @aihu/auth is not registered.
  it('AC3: scoped tool, no resolveAuth + no authPlugin → fail-closed 401', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const svc = createAgentService({
      getRegistry: () => makeRegistry('weather-card', binding),
    })
    const res = await svc.asMiddleware()(post({ tool: 'weather-card/fetchForecast', params: {} }))
    expect(res?.status).toBe(401)
    const body = (await res?.json()) as { error: string; code: number; result?: unknown }
    expect(body.code).toBe(401)
    expect(body.result).toBeUndefined()
  })

  // AC3 (AUTH_MISSING path): a userId IS resolved but @aihu/auth (authPlugin)
  // is NOT registered → the scope check fails closed with 401 AUTH_MISSING.
  it('AC3: scoped tool, userId resolved but no authPlugin → 401 AUTH_MISSING', async () => {
    const binding = makeLiveBinding('weather-card', 'authenticated')
    const svc = createAgentService({
      getRegistry: () => makeRegistry('weather-card', binding),
      resolveAuth: () => ({ userId: 'u1', jwt: 'token-authenticated' }),
    })
    const res = await svc.asMiddleware()(post({ tool: 'weather-card/fetchForecast', params: {} }))
    expect(res?.status).toBe(401)
    const body = (await res?.json()) as { error: string; code: number }
    expect(body.code).toBe(401)
    expect(body.error).toContain('AUTH_MISSING')
  })
})
