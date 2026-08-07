/**
 * Worker bindings reaching a page render — `handle(req, platform)`.
 *
 * ## The gap these close
 *
 * `ServerRouter.handle(req)` took a `Request` and nothing else. A Cloudflare
 * Worker's `fetch(request, env, ctx)` receives `env` — the KV namespaces, D1
 * databases, R2 buckets, Durable Object stubs and secrets — and those exist
 * ONLY per request: there is no module-scope handle a loader could have closed
 * over. So a route loader on a Worker had exactly one reachable data source,
 * the public internet, and a governed app's entitlement check could not consult
 * the subscriptions table it gates on.
 *
 * ## What is asserted, and what deliberately is not
 *
 * Every assertion below is on a value a REAL consumer receives — the argument
 * a loader, a provider, a resolver or a session resolver was actually called
 * with — not on an option object carrying a key. A spy on the internals would
 * pass against a `handle` that accepts `platform` and drops it, which is the
 * precise failure the previous `ServerEntryContext` docblock said it refused to
 * ship.
 *
 * The FOUR consumers are tested separately on purpose. They are four distinct
 * call sites in `server.ts` (plain loader, provider fetch, provider preview,
 * entitlement resolver) plus the session resolver in `@aihu/server`, and
 * threading a value into three of them is the kind of near-miss that is only
 * found in production — a paywall that works until the day the entitlement
 * resolver needs the same database the provider already has.
 */

import type { AuthPlugin, VerifiedClaims } from '@aihu/agent-service'
import type { GovernedRegistry } from '@aihu/server'
import { createGovernedRegistry } from '@aihu/server'
import { describe, expect, it, vi } from 'vitest'
import type { RouteDefinition } from '../src/index.ts'
import { createServerRouter } from '../src/server.ts'

/** The opaque value an adapter passes. Shaped like the Cloudflare adapter's. */
const PLATFORM = { env: { DB: 'D1-HANDLE', SECRET: 's3cr3t' }, ctx: { waitUntil: () => {} } }

function seg(pattern: string): RouteDefinition['segments'] {
  return pattern
    .split('/')
    .filter(Boolean)
    .map((p) =>
      p.startsWith(':')
        ? { kind: 'param' as const, name: p.slice(1) }
        : { kind: 'static' as const, path: p },
    )
}

// ---------------------------------------------------------------------------
// Plain loaders
// ---------------------------------------------------------------------------

describe('plain route loaders receive the platform', () => {
  /** A route whose loader records the arguments it was called with. */
  function loaderRoute() {
    const loader = vi.fn(async () => ({ ok: true }))
    const routes: RouteDefinition[] = [
      {
        pattern: '/p',
        segments: seg('/p'),
        module: () => Promise.resolve({ default: { toHtml: () => '<div>page</div>' }, loader }),
      },
    ]
    return { loader, router: createServerRouter(routes) }
  }

  it('hands the adapter-supplied value through unread', async () => {
    const { loader, router } = loaderRoute()
    await router.handle(new Request('http://localhost/p'), PLATFORM)
    // The SAME object identity, not a copy: the framework must not clone a
    // value that carries live Durable Object stubs and D1 handles.
    expect(loader.mock.calls[0]?.[1]?.platform).toBe(PLATFORM)
  })

  it('also hands over the request and its parsed URL', async () => {
    // Previously a loader could see the matched params and nothing else — no
    // headers, no method, no query string.
    const { loader, router } = loaderRoute()
    await router.handle(new Request('http://localhost/p?q=hello'), PLATFORM)
    const ctx = loader.mock.calls[0]?.[1]
    expect(ctx?.url.searchParams.get('q')).toBe('hello')
    expect(ctx?.request).toBeInstanceOf(Request)
  })

  it('still passes the context object when the caller supplied NO platform', async () => {
    // The alternative — omit the argument when there is no platform — would
    // make `ctx.url` work on a Worker and throw on a bare `handle(req)`, so a
    // loader's contract would depend on its host. The context is always there;
    // only `platform` is absent.
    const { loader, router } = loaderRoute()
    await router.handle(new Request('http://localhost/p'))
    const ctx = loader.mock.calls[0]?.[1]
    expect(ctx?.url.pathname).toBe('/p')
    expect(ctx?.platform).toBeUndefined()
    // Absent as a KEY, not merely undefined — so a loader that must fail closed
    // without bindings can ask `'platform' in ctx` and get a truthful answer.
    expect('platform' in (ctx as object)).toBe(false)
  })

  it('still calls the loader with params FIRST — the shipped positional contract', async () => {
    const { loader } = loaderRoute()
    const routes: RouteDefinition[] = [
      {
        pattern: '/u/:id',
        segments: seg('/u/:id'),
        module: () => Promise.resolve({ default: { toHtml: () => '<div>u</div>' }, loader }),
      },
    ]
    await createServerRouter(routes).handle(new Request('http://localhost/u/42'), PLATFORM)
    expect(loader.mock.calls[0]?.[0]).toEqual({ id: '42' })
  })
})

// ---------------------------------------------------------------------------
// The G7j guarantee: no platform ⇒ byte-identical
// ---------------------------------------------------------------------------

describe('handle(req) with no platform is byte-identical', () => {
  it('produces the same response bytes with and without a platform', async () => {
    // `handle(req)` is existing public API. A loader that ignores its second
    // argument — which every loader written before this did — must produce the
    // same document either way.
    const make = () =>
      createServerRouter([
        {
          pattern: '/p',
          segments: seg('/p'),
          module: () =>
            Promise.resolve({
              default: { toHtml: () => '<div>page</div>' },
              loader: async (params: Record<string, string>) => ({ params }),
            }),
        },
      ])
    const bare = await make().handle(new Request('http://localhost/p'))
    const withPlatform = await make().handle(new Request('http://localhost/p'), PLATFORM)
    expect(await bare.text()).toBe(await withPlatform.text())
    expect(bare.status).toBe(withPlatform.status)
  })
})

// ---------------------------------------------------------------------------
// The governed path — providers, the live resolver, the session resolver
// ---------------------------------------------------------------------------

const tokens = new Map<string, VerifiedClaims>([
  ['member-token', { sub: 'member-1', scope: 'members' }],
])

const authPlugin: AuthPlugin = {
  checkScope: (jwt, scope) => {
    const claims = tokens.get(jwt)
    if (!claims) return false
    return (typeof claims.scope === 'string' ? claims.scope.split(' ') : []).includes(scope)
  },
  verify: async (jwt) => tokens.get(jwt) ?? null,
}

interface GovFixture {
  fetch: ReturnType<typeof vi.fn>
  preview: ReturnType<typeof vi.fn>
  resolve: ReturnType<typeof vi.fn>
  resolveSession: ReturnType<typeof vi.fn>
  registry: GovernedRegistry
  router: ReturnType<typeof createServerRouter>
}

function governedFixture(entitled = true): GovFixture {
  const fetch = vi.fn(async () => ({ headword: 'λόγος', senses: 'SECRET' }))
  const preview = vi.fn(async () => ({ headword: 'λόγος' }))
  const resolve = vi.fn(async () => entitled)
  const resolveSession = vi.fn(() => null)
  const registry = createGovernedRegistry()
    .provider('LexiconEntry', { fetch, preview })
    .entitlement('members', { resolve, timeoutMs: 200 })
  const routes: RouteDefinition[] = [
    {
      pattern: '/lex/:slug',
      segments: seg('/lex/:slug'),
      module: () => Promise.resolve({ default: { toHtml: () => '<div>lex</div>' } }),
      extract: { read: { scope: 'members' }, call: { scope: 'members' } },
      data: { type: 'LexiconEntry', preview: ['headword'] },
    },
  ]
  const router = createServerRouter(routes, {
    governed: registry,
    auth: { authPlugin, resolveSession },
  })
  return { fetch, preview, resolve, resolveSession, registry, router }
}

function req(path: string, jwt?: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : {},
  })
}

describe('the governed path reaches the platform at every stage', () => {
  it('the PROVIDER fetch receives it — the data-source access', async () => {
    // Without this a `data:` route on a Worker cannot read its own database,
    // which makes the whole governed surface undeployable there.
    const fx = governedFixture()
    await fx.router.handle(req('/lex/logos', 'member-token'), PLATFORM)
    expect(fx.fetch).toHaveBeenCalledOnce()
    expect(fx.fetch.mock.calls[0]?.[0]?.platform).toBe(PLATFORM)
  })

  it('the PREVIEW fetch receives it — the locked state reads a source too', async () => {
    // The withheld render's preview is a separate access, not a redaction, so
    // it needs the same bindings. Omitting it here would leave the locked state
    // as the one surface that cannot reach a database.
    const fx = governedFixture()
    const res = await fx.router.handle(req('/lex/logos'), PLATFORM) // anonymous
    expect(res.status).toBe(401)
    expect(fx.preview).toHaveBeenCalledOnce()
    expect(fx.preview.mock.calls[0]?.[0]?.platform).toBe(PLATFORM)
    // And the governed fetch did NOT run — the gate still holds.
    expect(fx.fetch).not.toHaveBeenCalled()
  })

  it('the LIVE ENTITLEMENT resolver receives it', async () => {
    // The named second consumer: a real paywall check is a KV get or a D1
    // select. Before this it had no way to reach either.
    const fx = governedFixture()
    await fx.router.handle(req('/lex/logos', 'member-token'), PLATFORM)
    expect(fx.resolve).toHaveBeenCalledOnce()
    expect(fx.resolve.mock.calls[0]?.[0]?.platform).toBe(PLATFORM)
  })

  it('the SESSION resolver receives it — a cookie lookup is a store read', async () => {
    const fx = governedFixture()
    await fx.router.handle(req('/lex/logos', 'member-token'), PLATFORM)
    expect(fx.resolveSession).toHaveBeenCalled()
    expect(fx.resolveSession.mock.calls[0]?.[1]).toBe(PLATFORM)
  })

  it('the E3 data endpoint threads it too — one contract across transports', async () => {
    // The spec's claim is that `/__aihu/data/*` and SSR run the SAME generated
    // loader and reach byte-equal decisions. That cannot hold if one transport
    // can read the database and the other cannot.
    const fx = governedFixture()
    await fx.router.handle(req('/__aihu/data/lex/logos', 'member-token'), PLATFORM)
    expect(fx.fetch.mock.calls[0]?.[0]?.platform).toBe(PLATFORM)
    expect(fx.resolve.mock.calls[0]?.[0]?.platform).toBe(PLATFORM)
  })

  it('omits the key entirely when no platform was supplied', async () => {
    const fx = governedFixture()
    await fx.router.handle(req('/lex/logos', 'member-token'))
    const ctx = fx.fetch.mock.calls[0]?.[0] as object
    expect('platform' in ctx).toBe(false)
    const rctx = fx.resolve.mock.calls[0]?.[0] as object
    expect('platform' in rctx).toBe(false)
  })
})
