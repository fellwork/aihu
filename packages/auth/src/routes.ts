/**
 * `@aihu/auth` — `createAuthRoutes` factory.
 *
 * Returns three `RouteHandler`-compatible functions (sign-in, sign-out,
 * session refresh) that can be wired into `@aihu/router` or any Fetch-API
 * router.
 *
 * The `RouteHandler` shape matches `@aihu/server`'s type:
 *   `(req: Request, ctx: RouteContext) => Response | Promise<Response>`
 */

import type { RouteHandler } from '@aihu/server'
import { verifyJwt } from './server.ts'
import type { AuthConfig, RouteHandlers } from './types.ts'
import { AuthError } from './types.ts'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function resolveCookieName(config: AuthConfig): string {
  return config.cookieName ?? 'aihu_session'
}

function resolveMaxAge(config: AuthConfig): number {
  return config.maxAge ?? 86400
}

function cookieHeader(name: string, value: string, maxAge: number): string {
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`
}

function clearCookieHeader(name: string): string {
  return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

/**
 * Create `RouteHandler` objects for the three auth endpoints.
 *
 * @example
 * // aihu.config.ts (or route setup)
 * import { createAuthRoutes } from '@aihu/auth'
 * const { signIn, signOut, refresh } = createAuthRoutes({
 *   jwtSecret: process.env.JWT_SECRET!,
 * })
 * // Register with your router:
 * router.post('/auth/sign-in', signIn)
 * router.post('/auth/sign-out', signOut)
 * router.post('/auth/refresh', refresh)
 */
export function createAuthRoutes(config: AuthConfig): RouteHandlers {
  const name = resolveCookieName(config)
  const maxAge = resolveMaxAge(config)

  /**
   * Shared body of the two cookie-setting routes (sign-in, refresh).
   *
   * Reads `{ token }` from the JSON body, VERIFIES it (HMAC signature plus
   * the registered-claim validation from `verifyJwt`: `exp` required by
   * default, `nbf`, `aud` when `config.audience` is set), and only then sets
   * the session cookie. An unverifiable token is rejected with 401 and NO
   * `Set-Cookie` header — an unverified credential is never persisted.
   *
   * Fails closed when `config.jwtSecret` is empty: 500, no cookie.
   */
  const verifyAndCookie: RouteHandler = async (req) => {
    try {
      let body: unknown
      try {
        body = await req.json()
      } catch {
        return jsonError('Invalid JSON body', 400)
      }

      if (typeof body !== 'object' || body === null) {
        return jsonError('Expected JSON object body', 400)
      }

      const { token } = body as Record<string, unknown>
      if (typeof token !== 'string' || !token) {
        return jsonError('Missing or invalid token field', 400)
      }

      // No trust root configured → nothing can be verified. Fail closed.
      if (typeof config.jwtSecret !== 'string' || config.jwtSecret === '') {
        return jsonError('Auth is not configured', 500)
      }

      // `AuthConfig` structurally satisfies `VerifyJwtOptions` (audience,
      // allowNoExpiry, clockSkewSec) — same trust root as `getAuthState`
      // and `createVerifiedAuthPlugin`.
      const claims = await verifyJwt(token, config.jwtSecret, config)
      if (claims === null) {
        return jsonError('Invalid token', 401)
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader(name, token, maxAge),
        },
      })
    } catch {
      return jsonError('Internal server error', 500)
    }
  }

  /**
   * POST /auth/sign-in
   *
   * Expects JSON body: `{ token: string }` — a JWT issued by your identity
   * provider and signed with `config.jwtSecret`.
   * The token is verified (signature + registered claims) BEFORE it is
   * cookied; an invalid/unverifiable token gets 401 and no cookie.
   * On success: sets `Set-Cookie` with the session JWT and returns
   * `{ ok: true }` with a 200 response.
   */
  const signIn: RouteHandler = verifyAndCookie

  /**
   * POST /auth/sign-out
   *
   * Clears the session cookie. Always returns 200.
   */
  const signOut: RouteHandler = (_req) => {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': clearCookieHeader(name),
      },
    })
  }

  /**
   * POST /auth/refresh
   *
   * Expects JSON body: `{ token: string }`.
   * The replacement token is verified (signature + registered claims) BEFORE
   * it replaces the existing session cookie; an invalid token gets 401 and
   * the cookie is left untouched.
   * On success: returns `{ ok: true }` with an updated `Set-Cookie` header.
   */
  const refresh: RouteHandler = verifyAndCookie

  return { signIn, signOut, refresh }
}

// Re-export AuthError so consumers can instanceof-check without importing types.ts directly.
export { AuthError }
