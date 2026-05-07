/**
 * `@aihu/auth` — JWT scope checks, ScopeSignal, and server middleware.
 *
 * @module
 */

// JWT decode utilities
export { decodeJwt, hasScope } from './jwt.ts'
export type { JwtClaims } from './jwt.ts'

// AuthPlugin for @aihu/agent-service
export { createAuthPlugin } from './plugin.ts'
export type { AuthPluginOptions } from './plugin.ts'

// Client-side ScopeSignal for <$guard> compiler lowering
export {
  clearCurrentScopes,
  createScopeSignal,
  getScopeSignal,
  setCurrentScopes,
} from './scope-signal.ts'
export type { ScopeSignalHandle } from './scope-signal.ts'

// Server middleware factories
export { requireAuth, requireScope } from './middleware.ts'
export type { AuthMiddlewareOptions } from './middleware.ts'
