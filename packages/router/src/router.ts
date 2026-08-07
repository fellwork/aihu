// Browser-eligible router surface — NO server-only imports allowed here.
// The server-only `handle(req)` SSR path lives in `./server.ts` (exposed via
// the `@aihu/router/server` subpath) to keep this file's static + dynamic
// graph free of `@aihu/server`'s `node:module`-bearing native loader.
// See .context/fw-agent/bug2.5-node-module-leak/investigation.md.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteSegment =
  | { kind: 'static'; path: string }
  | { kind: 'param'; name: string }
  | { kind: 'catchall' }

/**
 * The second argument every plain route loader receives on the SSR path.
 *
 * ## Why the loader signature grew a parameter
 *
 * `loader(params)` could reach nothing but the matched params — not the
 * request, not the query string, and (the reason this exists) not the host
 * runtime's bindings. On Cloudflare Workers the KV namespaces, D1 databases,
 * R2 buckets and secrets arrive as `fetch`'s second argument and exist ONLY
 * per request; there is no module-scope handle a loader could have closed
 * over. So a loader on a Worker had no data source but the public internet.
 *
 * ## Why it is ALWAYS passed, even when there is no platform
 *
 * `createServerRouter.handle` supplies this object on every call, whether or
 * not the caller passed a platform. The alternative — omit the argument when
 * `platform === undefined` — would make `ctx.url` throw on some deployments
 * and not others, so a loader's contract would depend on whether the host
 * happened to have bindings. A loader written against `params` alone ignores
 * the extra argument and behaves exactly as before.
 *
 * ## Why `platform` is typed here rather than imported
 *
 * This file is browser-eligible and keeps zero `@aihu/server` imports (see the
 * header note) — the same reason the governed-fetch brand below is structural
 * rather than imported. `platform` is `@aihu/server`'s `PlatformContext`,
 * which is itself `unknown`, so the structural copy loses nothing.
 */
export type LoaderContext = {
  /** The request being served. Headers, method, cookies — previously unreachable. */
  readonly request: Request
  /** The parsed request URL. Query parameters, previously unreachable. */
  readonly url: URL
  /**
   * The host runtime's per-request ambient state, exactly as the adapter
   * passed it to `handle(request, platform)`. `undefined` when the caller
   * passed none (a hand-driven `handle(req)`, a Node host with no bindings).
   * Opaque by design — narrow it to your own platform's type at the edge of
   * your code:
   *
   * ```ts
   * export const loader = async (params, { platform }) => {
   *   const { env } = platform as { env: Env }
   *   return env.DB.prepare('select * from posts where slug = ?').bind(params.slug).first()
   * }
   * ```
   */
  readonly platform?: unknown
}

export type RouteModule = {
  default: unknown
  /**
   * The route's data loader. Either a plain server loader (the shipped,
   * ungoverned contract — called with the matched params and, since bindings
   * landed, a {@link LoaderContext}), or — GX Phase 4 (#466) — the
   * `defineGovernedFetch` escape hatch (structurally typed here so this
   * browser-eligible file keeps zero `@aihu/server` imports): a route-local
   * provider the generated loader gates. On a `data:`-declared route a PLAIN
   * loader is a C486 build error (one data source per route).
   */
  loader?:
    | ((params: Record<string, string>, ctx: LoaderContext) => Promise<unknown>)
    | { readonly _brand: 'DefinedGovernedFetch' }
}

/**
 * Per-route `<head>` metadata, threaded from the compiler's `.route.json`
 * sidecar (`head:` block). All fields optional. Consumed by the SSG prerender
 * and the client-nav head updater. `jsonld` is a raw JSON-LD object.
 */
export type RouteHead = {
  title?: string
  description?: string
  canonical?: string
  og?: {
    title?: string
    description?: string
    image?: string
    type?: string
    url?: string
  }
  twitter?: {
    card?: string
    title?: string
    description?: string
    image?: string
    site?: string
  }
  jsonld?: unknown
}

export type RouteDefinition = {
  pattern: string
  segments: RouteSegment[]
  module: () => Promise<RouteModule>
  // v0.6.3: fields from .route.json compiler sidecars
  name?: string
  middleware?: string[]
  ssr?: boolean
  layout?: string
  // B2: per-route <head> metadata from the .route.json `head:` block
  head?: RouteHead
  /** Normalized custom-element tags this route references; used for route-scoped registration (O1). */
  components?: readonly string[]
  /**
   * GX Phase 3 (#437-GX): the route's compiled `extract` policy from the
   * `.route.json` sidecar (`{ read, call }`, the Phase 1 fan-out). Values are
   * `unknown` — consumers normalize fail-closed (`deriveReadPolicy` in
   * `@aihu/server`). Drives the compliance-tier noindex signal in
   * `createServerRouter.handle` and the derived robots/discovery listings in
   * `@aihu-plugin/agent-readiness`. Absent on hand-built routes → the
   * resolved default (`read: 'agents'`, `call: 'anonymous'`) applies.
   */
  extract?: { readonly read?: unknown; readonly call?: unknown }
  /**
   * GX Phase 4 (#466): the route's compiled `data:` declaration from the
   * `.route.json` sidecar — `{ type, preview? }`, naming the governed
   * resource type (the provider key) and the fields renderable in the locked
   * state. Values are `unknown`: consumers normalize FAIL-CLOSED
   * (`normalizeGovernedData` in `@aihu/server` — malformed is a boot
   * refusal, never rounded to ungoverned). Presence makes the route governed:
   * `createServerRouter.handle` replaces the ungated `mod.loader` path with
   * the generated loader (70-governed-data-access §3).
   */
  data?: unknown
}

export type MatchResult = {
  route: RouteDefinition
  params: Record<string, string>
  /** The matched pathname, e.g. '/posts/hello' */
  pathname: string
}

/**
 * Navigation guard `next` callback (RFC-A5-015).
 *
 * - `next()` — proceed with navigation.
 * - `next(false)` — cancel navigation.
 * - `next('/some-path')` — redirect to a different path.
 */
export type NextFn = (decision?: void | false | string) => void

/** Before-navigation guard. RFC-A5-015. */
export type BeforeGuard = (
  to: MatchResult,
  from: MatchResult | null,
  next: NextFn,
) => void | Promise<void>

/** After-navigation callback. RFC-A5-016. */
export type AfterGuard = (to: MatchResult, from: MatchResult | null) => void

export type Router = {
  match(pathname: string): MatchResult | null
  /**
   * Register a guard that runs before each navigation. Multiple guards run
   * in registration order. The first `next(false)` cancels navigation; the
   * first `next('/x')` redirects. Returns a dispose fn.
   */
  registerBeforeGuard(fn: BeforeGuard): () => void
  /**
   * Register a callback that runs after each navigation completes (after the
   * outlet has updated). Returns a dispose fn.
   */
  registerAfterGuard(fn: AfterGuard): () => void
  /**
   * Run the registered before-guard chain. Returns the final navigation
   * decision: 'continue', 'cancel', or { redirect: string }.
   * @internal — used by `<a>` and `<navigate>`.
   */
  runBeforeGuards(
    to: MatchResult,
    from: MatchResult | null,
  ): Promise<'continue' | 'cancel' | { redirect: string }>
  /**
   * Run the registered after-guard chain.
   * @internal — used by `<router>`.
   */
  runAfterGuards(to: MatchResult, from: MatchResult | null): void
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

function matchRoute(def: RouteDefinition, pathname: string): Record<string, string> | null {
  const segs = def.segments
  // Catchall at root level
  if (segs.length === 1 && segs[0]?.kind === 'catchall') {
    return { '*': pathname.slice(1) }
  }

  const pathParts = pathname.split('/').filter((p) => p !== '')

  // Find index of catchall segment (if any)
  const catchallIdx = segs.findIndex((s) => s.kind === 'catchall')

  if (catchallIdx === -1) {
    // No catchall: lengths must match
    if (segs.length !== pathParts.length) return null
    const params: Record<string, string> = {}
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!
      const part = pathParts[i] ?? ''
      if (seg.kind === 'static') {
        if (seg.path !== part) return null
      } else if (seg.kind === 'param') {
        params[seg.name] = decodeURIComponent(part)
      }
    }
    return params
  }

  // Has catchall: prefix segments before catchall must match
  if (pathParts.length < catchallIdx) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < catchallIdx; i++) {
    const seg = segs[i]!
    const part = pathParts[i] ?? ''
    if (seg.kind === 'static') {
      if (seg.path !== part) return null
    } else if (seg.kind === 'param') {
      params[seg.name] = decodeURIComponent(part)
    }
  }
  params['*'] = pathParts.slice(catchallIdx).join('/')
  return params
}

function routeKind(def: RouteDefinition): 0 | 1 | 2 {
  if (def.segments.some((s) => s.kind === 'catchall')) return 2
  if (def.segments.some((s) => s.kind === 'param')) return 1
  return 0
}

// ---------------------------------------------------------------------------
// createRouter — browser-safe. Server-side request handling lives in
// `@aihu/router/server` (`createServerRouter`).
// ---------------------------------------------------------------------------

export function createRouter(routes: RouteDefinition[]): Router {
  // Order: static → param → catchall
  const ordered = [
    ...routes.filter((r) => routeKind(r) === 0),
    ...routes.filter((r) => routeKind(r) === 1),
    ...routes.filter((r) => routeKind(r) === 2),
  ]

  function match(pathname: string): MatchResult | null {
    for (const route of ordered) {
      const params = matchRoute(route, pathname)
      if (params !== null) return { route, params, pathname }
    }
    return null
  }

  // ─── Guard chain (RFC-A5-015 / RFC-A5-016) ────────────────────────────────
  const beforeGuards: BeforeGuard[] = []
  const afterGuards: AfterGuard[] = []

  function registerBeforeGuard(fn: BeforeGuard): () => void {
    beforeGuards.push(fn)
    return () => {
      const i = beforeGuards.indexOf(fn)
      if (i >= 0) beforeGuards.splice(i, 1)
    }
  }

  function registerAfterGuard(fn: AfterGuard): () => void {
    afterGuards.push(fn)
    return () => {
      const i = afterGuards.indexOf(fn)
      if (i >= 0) afterGuards.splice(i, 1)
    }
  }

  async function runBeforeGuards(
    to: MatchResult,
    from: MatchResult | null,
  ): Promise<'continue' | 'cancel' | { redirect: string }> {
    for (const guard of beforeGuards.slice()) {
      let decided = false
      let decision: 'continue' | 'cancel' | { redirect: string } = 'continue'
      const next: NextFn = (d) => {
        if (decided) return
        decided = true
        if (d === false) decision = 'cancel'
        else if (typeof d === 'string') decision = { redirect: d }
        else decision = 'continue'
      }
      await guard(to, from, next)
      if (!decided) {
        // Guard never called next — treat as continue (defensive).
        continue
      }
      if (decision !== 'continue') return decision
    }
    return 'continue'
  }

  function runAfterGuards(to: MatchResult, from: MatchResult | null): void {
    for (const guard of afterGuards.slice()) {
      try {
        guard(to, from)
      } catch (e) {
        // Don't let one bad after-guard kill the rest
        console.error('[aihu/router] afterNavigate guard threw:', e)
      }
    }
  }

  return {
    match,
    registerBeforeGuard,
    registerAfterGuard,
    runBeforeGuards,
    runAfterGuards,
  }
}
