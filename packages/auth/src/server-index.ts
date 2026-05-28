/**
 * `@aihu/auth/server` — server-only exports.
 *
 * Import via `@aihu/auth/server` (never from a browser bundle).
 * Requires `crypto.subtle` (Web Crypto) available in the server runtime.
 *
 * @module
 */

export { auth } from './auth-plugin.ts'
export { createAuthRoutes } from './routes.ts'
export { getAuthState } from './server.ts'
export type { AuthConfig, AuthState, RequestContext, RouteHandlers, User } from './types.ts'
export { AuthError } from './types.ts'
