/**
 * @scribe/router — isomorphic router middleware API (v0.7.1).
 *
 * These primitives are isomorphic (run in both browser and server) and are
 * intentionally separate from the server-only `@scribe/server` middleware, which
 * wraps the Fetch-API `Request`/`Response` cycle.
 *
 * Browser bundle impact: ~150–220 B — within the 1536 B budget.
 */

import type { RouteDefinition } from './router.ts'

// ---------------------------------------------------------------------------
// Context + Result types
// ---------------------------------------------------------------------------

export interface RouteMatchContext {
  url: URL
  params: Record<string, string>
  route: RouteDefinition
  signal: AbortSignal
  env?: Record<string, string>
}

export type RouterResult =
  | { kind: 'continue' }
  | { kind: 'redirect'; location: string; status?: number }
  | { kind: 'cancel'; status?: number; body?: string }

// ---------------------------------------------------------------------------
// RouterMiddleware type
// ---------------------------------------------------------------------------

export type RouterMiddleware = (
  ctx: RouteMatchContext,
  next: () => Promise<RouterResult>,
) => Promise<RouterResult>

// ---------------------------------------------------------------------------
// defineRouterMiddleware — identity factory for type inference
// ---------------------------------------------------------------------------

export function defineRouterMiddleware(fn: RouterMiddleware): RouterMiddleware {
  return fn
}

// ---------------------------------------------------------------------------
// composeRouterMiddleware — left-to-right chain
// ---------------------------------------------------------------------------

// Middleware composition stage order:
// before-handler (server, plugin-contributed)
//   → route-match (router, file-based)
//   → defineRouterMiddleware chain (isomorphic)
//   → route handler
//   → after-handler (server, plugin-contributed)
//   → on-error
export function composeRouterMiddleware(
  ...middlewares: RouterMiddleware[]
): RouterMiddleware {
  return async (ctx, next) => {
    const run = async (i: number): Promise<RouterResult> =>
      i < middlewares.length ? middlewares[i]!(ctx, () => run(i + 1)) : next()
    return run(0)
  }
}
