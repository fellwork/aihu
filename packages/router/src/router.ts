import { renderToString } from '@aihu/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RouteSegment =
  | { kind: 'static'; path: string }
  | { kind: 'param'; name: string }
  | { kind: 'catchall' }

export type RouteModule = {
  default: unknown
  loader?: (params: Record<string, string>) => Promise<unknown>
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
  handle(req: Request): Promise<Response>
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
   * @internal — used by `<$link>` and `<$navigate>`.
   */
  runBeforeGuards(
    to: MatchResult,
    from: MatchResult | null,
  ): Promise<'continue' | 'cancel' | { redirect: string }>
  /**
   * Run the registered after-guard chain.
   * @internal — used by `<$router>`.
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
// createRouter
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

  async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    const result = match(url.pathname)
    if (!result) return new Response('Not Found', { status: 404 })

    const { route, params } = result
    const mod = await route.module()
    const loaderData = mod.loader ? await mod.loader(params) : undefined

    const component = mod.default as (() => unknown) | { toHtml(): string }
    const html = await renderToString(component)

    const body =
      loaderData !== undefined
        ? `${html}<script type="application/json" id="__aihu_loader__">${JSON.stringify(loaderData)}</script>`
        : html

    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
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
    handle,
    registerBeforeGuard,
    registerAfterGuard,
    runBeforeGuards,
    runAfterGuards,
  }
}
