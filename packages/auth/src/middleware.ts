/**
 * `@aihu/auth` — Fetch-API-compatible server middleware factories.
 *
 * Follows the same `(req, next) => Response | Promise<Response>` middleware
 * shape used by `asMiddleware` in `@aihu/agent-service`.
 */

import { decodeJwt, hasScope } from './jwt.ts'

export interface AuthMiddlewareOptions {
  /**
   * The HTTP header to read the JWT from.
   * Defaults to `'Authorization'` (expects `Bearer <token>` format).
   */
  header?: string
  /**
   * Custom JWT extractor. When provided, `header` is ignored.
   * Return `null` to signal "no token present".
   */
  extractJwt?: (req: Request) => string | null
}

type Next = () => Response | Promise<Response>
type Middleware = (req: Request, next: Next) => Response | Promise<Response>

function defaultExtract(req: Request, header: string): string | null {
  const raw = req.headers.get(header)
  if (!raw) return null
  // Accept both raw token and "Bearer <token>" format
  return raw.startsWith('Bearer ') ? raw : raw
}

function getToken(req: Request, options: AuthMiddlewareOptions | undefined): string | null {
  if (options?.extractJwt) return options.extractJwt(req)
  return defaultExtract(req, options?.header ?? 'Authorization')
}

/**
 * Middleware that rejects requests without any JWT in the configured header.
 *
 * - No token → `401 Unauthorized`
 * - Token present (any value) → passes to `next`
 *
 * Note: this does not verify the token signature or claims. For scope
 * enforcement use `requireScope`.
 */
export function requireAuth(options?: AuthMiddlewareOptions): Middleware {
  return (req: Request, next: Next): Response | Promise<Response> => {
    const token = getToken(req, options)
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Missing authorization token' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }
    return next()
  }
}

/**
 * Middleware that rejects requests where the JWT does not carry the required
 * scope claim.
 *
 * - No token → `401 Unauthorized`
 * - Token present but missing scope → `403 Forbidden`
 * - Token present and scope matches → passes to `next`
 */
export function requireScope(scope: string, options?: AuthMiddlewareOptions): Middleware {
  return (req: Request, next: Next): Response | Promise<Response> => {
    const token = getToken(req, options)
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Missing authorization token' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const claims = decodeJwt(token)
    if (!claims || !hasScope(claims, scope)) {
      return new Response(
        JSON.stringify({ error: 'FORBIDDEN', message: `Missing required scope: ${scope}` }),
        {
          status: 403,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    return next()
  }
}
