/**
 * `@aihu/auth` — JWT scope checks, ScopeSignal, client helpers, and server
 * plugin factory.
 *
 * Exports:
 *   auth            — plugin factory (registers routes + getAuthState)
 *   createAuthRoutes — server-side route handler factory
 *   getAuthState    — server-side JWT-cookie reader (async, never throws)
 *   signIn          — client-side POST to sign-in endpoint
 *   signOut         — client-side POST to sign-out endpoint (never throws)
 *   useCurrentUser  — reactive getter for the current User | null
 *   setCurrentScopes — update scope list on the module-level signal
 *   clearCurrentScopes — reset user + scopes to null / []
 *
 * Legacy v0.1.1 exports preserved for backwards compatibility:
 *   decodeJwt, hasScope, requireAuth, requireScope, createAuthPlugin,
 *   createScopeSignal, getScopeSignal
 *
 * @module
 */

// ── Client helpers (A05, A06, A07) ─────────────────────────────────────────
export {
  clearCurrentScopes,
  setCurrentScopes,
  signIn,
  signOut,
  useCurrentUser,
} from './client.ts'
// ── Legacy v0.1.1 API (preserved for backwards compatibility) ───────────────
export type { JwtClaims } from './jwt.ts'
export { decodeJwt, hasScope } from './jwt.ts'
export type { AuthMiddlewareOptions } from './middleware.ts'
export { requireAuth, requireScope } from './middleware.ts'
export type { AuthPluginOptions } from './plugin.ts'
export { createAuthPlugin } from './plugin.ts'
export type { ScopeSignalHandle } from './scope-signal.ts'
export { createScopeSignal, getScopeSignal } from './scope-signal.ts'
// ── Types (A08) ────────────────────────────────────────────────────────────
export type { AuthConfig, AuthState, RequestContext, RouteHandlers, User } from './types.ts'
export { AuthError } from './types.ts'
// ── Server-side exports (auth factory, createAuthRoutes, getAuthState) ──────
// Available via '@aihu/auth/server' — crypto.subtle is server-only.
