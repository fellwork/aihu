import type { DefinedLoader, LoadedRouteContext } from './data.ts'
import { runLoader } from './data.ts'
import { composeMiddleware } from './middleware.ts'
import type { Middleware, RouteContext, RouteHandler } from './types.ts'

export interface Route {
  readonly pattern: string
  readonly handler: RouteHandler
  readonly middleware?: ReadonlyArray<Middleware>
}

export interface RouteOptions<T = never> {
  readonly loader?: DefinedLoader<T>
  readonly middleware?: ReadonlyArray<Middleware>
}

/** A route config object for use with `defineRoutes`. */
export interface RouteInput {
  readonly pattern: string
  readonly handler: RouteHandler
  readonly options?: RouteOptions<never>
}

/**
 * A subroute tuple for use with the prefix-group overload of `defineRoute`.
 * `[subpattern, handler]` or `[subpattern, handler, options]`.
 * The subpattern is concatenated onto the prefix: `'/api'` + `'/users'` → `'/api/users'`.
 */
export type SubrouteTuple =
  | readonly [string, RouteHandler]
  | readonly [string, RouteHandler, RouteOptions<never>]

/** Register a route without a loader. */
export function defineRoute(
  pattern: string,
  handler: RouteHandler,
  options?: RouteOptions<never>,
): Route
/** Register a route with a loader — handler receives `LoadedRouteContext<T>`. */
export function defineRoute<T>(
  pattern: string,
  handler: (req: Request, ctx: LoadedRouteContext<T>) => Response | Promise<Response>,
  options: RouteOptions<T>,
): Route
/**
 * Prefix-group overload — prepends `prefix` to every subroute pattern and
 * returns a `Route[]`. The prefix and subpattern are concatenated directly:
 * `defineRoute('/api', [['/users', handler]])` → pattern `'/api/users'`.
 */
export function defineRoute(prefix: string, subroutes: ReadonlyArray<SubrouteTuple>): Route[]
export function defineRoute<T = never>(
  pattern: string,
  handlerOrSubroutes:
    | RouteHandler
    | ((req: Request, ctx: LoadedRouteContext<T>) => Response | Promise<Response>)
    | ReadonlyArray<SubrouteTuple>,
  options?: RouteOptions<T>,
): Route | Route[] {
  if (Array.isArray(handlerOrSubroutes)) {
    return (handlerOrSubroutes as SubrouteTuple[]).map(([sub, handler, opts]) =>
      defineRoute(`${pattern}${sub}`, handler, opts),
    )
  }
  const handler = handlerOrSubroutes as
    | RouteHandler
    | ((req: Request, ctx: LoadedRouteContext<T>) => Response | Promise<Response>)
  const loader = options?.loader
  const finalHandler: RouteHandler = loader
    ? async (req, ctx) => {
        const loaderData = await runLoader(loader.fn, ctx)
        return (
          handler as (req: Request, ctx: LoadedRouteContext<T>) => Response | Promise<Response>
        )(req, { ...ctx, loaderData })
      }
    : (handler as RouteHandler)
  const result: Route = { pattern, handler: finalHandler }
  if (options?.middleware !== undefined) return { ...result, middleware: options.middleware }
  return result
}

/**
 * Register multiple routes in a single call. Each entry is a `RouteInput`
 * object with `pattern`, `handler`, and an optional `options`.
 *
 * For routes with a typed loader, use `defineRoute` (singular) which
 * preserves the per-route generic.
 */
export function defineRoutes(inputs: ReadonlyArray<RouteInput>): Route[] {
  return inputs.map(({ pattern, handler, options }) => defineRoute(pattern, handler, options))
}

/** Route manifest produced by the file-based routing Vite plugin at build time. */
export interface RouteManifest {
  readonly routes: ReadonlyArray<Route | ReadonlyArray<Route>>
  readonly layouts?: Readonly<Record<string, ReadonlyArray<string>>>
}

export interface RouterOptions {
  readonly middleware?: ReadonlyArray<Middleware>
  readonly notFound?: RouteHandler
  readonly env?: unknown
}

type RouteKind = 'static' | 'dynamic' | 'catchall'

function classifyRoute(pattern: string): RouteKind {
  if (pattern.endsWith('/*') || pattern === '*') return 'catchall'
  if (pattern.includes(':')) return 'dynamic'
  return 'static'
}

function matchRoute(pattern: string, pathname: string): Record<string, string> | null {
  const kind = classifyRoute(pattern)
  if (kind === 'static') return pattern === pathname ? {} : null
  if (kind === 'catchall') {
    const base = pattern.endsWith('/*') ? pattern.slice(0, -2) : ''
    if (base === '' || pathname === base || pathname.startsWith(`${base}/`)) {
      return { '*': base === '' ? pathname : pathname.slice(base.length + 1) }
    }
    return null
  }
  const patParts = pattern.split('/')
  const pathParts = pathname.split('/')
  if (patParts.length !== pathParts.length) return null
  const params: Record<string, string> = {}
  for (let i = 0; i < patParts.length; i++) {
    const seg = patParts[i] ?? ''
    const pathSeg = pathParts[i] ?? ''
    if (seg.startsWith(':')) params[seg.slice(1)] = decodeURIComponent(pathSeg)
    else if (seg !== pathSeg) return null
  }
  return params
}

/**
 * Create a fetch-API compatible request handler.
 * Matching order: static → dynamic → catch-all.
 * No match → calls `RouterOptions.notFound` or returns 404.
 */
export function createRequestRouter(
  manifest: RouteManifest,
  options?: RouterOptions,
): (req: Request) => Promise<Response> {
  const flat = (manifest.routes as ReadonlyArray<Route | ReadonlyArray<Route>>).flatMap((r) =>
    Array.isArray(r) ? (r as Route[]) : [r as Route],
  )
  const ordered = [
    ...flat.filter((r) => classifyRoute(r.pattern) === 'static'),
    ...flat.filter((r) => classifyRoute(r.pattern) === 'dynamic'),
    ...flat.filter((r) => classifyRoute(r.pattern) === 'catchall'),
  ]
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url)
    const pathname = url.pathname
    for (const route of ordered) {
      const params = matchRoute(route.pattern, pathname)
      if (params === null) continue
      const ctx: RouteContext = { params, url, env: options?.env }
      const finalHandler = (): Promise<Response> => Promise.resolve(route.handler(req, ctx))
      const allMws = [...(options?.middleware ?? []), ...(route.middleware ?? [])]
      if (allMws.length === 0) return finalHandler()
      return Promise.resolve(composeMiddleware(allMws)(req, finalHandler))
    }
    const notFoundCtx: RouteContext = { params: {}, url, env: options?.env }
    if (options?.notFound) return Promise.resolve(options.notFound(req, notFoundCtx))
    return new Response('Not Found', { status: 404 })
  }
}
