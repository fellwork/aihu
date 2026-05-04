import type { Route } from './router.ts'
import { defineRoute } from './router.ts'
import type { HttpMethod } from './types.ts'

declare const __DEV__: boolean

export type ApiHandler = (
  req: Request,
  ctx: import('./types.ts').RouteContext,
) => Response | Promise<Response>

/**
 * The router enforces the method: a request to the matching pattern
 * with a non-matching method receives `405 Method Not Allowed` with
 * an `Allow` header listing all registered methods for that pattern.
 */
export function defineApiRoute(method: HttpMethod, pattern: string, handler: ApiHandler): Route {
  return defineRoute(pattern, (req, ctx) => {
    if (req.method !== method) {
      return methodNotAllowed([method])
    }
    return handler(req, ctx)
  })
}

export function json(data: unknown, status?: number): Response {
  return new Response(JSON.stringify(data), {
    status: status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function notFound(): Response {
  return new Response('Not Found', { status: 404 })
}

export function methodNotAllowed(allowed: ReadonlyArray<HttpMethod>): Response {
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: allowed.join(', ') },
  })
}

export function badRequest(message?: string): Response {
  return new Response(message ?? 'Bad Request', { status: 400 })
}

/**
 * SECURITY: In production (`__DEV__ === false`), the error message MUST NOT
 * appear in the response body. Return `{ "error": "internal server error" }`.
 * Only in development may the error message be exposed.
 */
export function serverError(err?: unknown): Response {
  const msg =
    typeof __DEV__ !== 'undefined' && __DEV__
      ? err instanceof Error
        ? err.message
        : String(err ?? 'Internal Server Error')
      : 'internal server error'
  return json({ error: msg }, 500)
}
