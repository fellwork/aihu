import { renderToString } from '@scribe/server'

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
}

export type MatchResult = {
  route: RouteDefinition
  params: Record<string, string>
}

export type Router = {
  match(pathname: string): MatchResult | null
  handle(req: Request): Promise<Response>
}

// ---------------------------------------------------------------------------
// Pattern matching
// ---------------------------------------------------------------------------

function matchRoute(def: RouteDefinition, pathname: string): Record<string, string> | null {
  const segs = def.segments
  // Catchall at root level
  if (segs.length === 1 && segs[0]!.kind === 'catchall') {
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
      if (params !== null) return { route, params }
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

    const body = loaderData !== undefined
      ? `${html}<script type="application/json" id="__scribe_loader__">${JSON.stringify(loaderData)}</script>`
      : html

    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  return { match, handle }
}
