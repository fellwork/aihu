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
export type { VerifyJwtOptions } from './server.ts'
export { getAuthState, verifyJwt } from './server.ts'
export type { AuthConfig, AuthState, RequestContext, RouteHandlers, User } from './types.ts'
export { AuthError } from './types.ts'
export type { VerifiedAuthPluginOptions } from './verified-plugin.ts'
export { createVerifiedAuthPlugin } from './verified-plugin.ts'
