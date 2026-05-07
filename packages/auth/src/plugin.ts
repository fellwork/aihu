/**
 * `@aihu/auth` — AuthPlugin implementation for `@aihu/agent-service`.
 *
 * Wire this into `createAgentService({ authPlugin: createAuthPlugin() })` to
 * enable scope-based access control on agent tool calls.
 */

import type { AuthPlugin } from '@aihu/agent-service'
import { decodeJwt, hasScope, type JwtClaims } from './jwt.ts'

export type { JwtClaims }

export interface AuthPluginOptions {
  /**
   * Override the JWT decode function (useful for testing or when you need
   * to inject claims from a pre-verified token). Defaults to `decodeJwt`.
   */
  decodeJwt?: (jwt: string) => JwtClaims | null
}

/**
 * Create an `AuthPlugin` compatible with `@aihu/agent-service`.
 *
 * `checkScope(jwt, scope)` decodes the JWT payload (no signature check)
 * and returns `true` when the required scope is present in any of the
 * standard claim locations (`scope`, `scp`, `scopes`).
 *
 * Returns `false` — never throws — for malformed or unsigned tokens.
 */
export function createAuthPlugin(options?: AuthPluginOptions): AuthPlugin {
  const decode = options?.decodeJwt ?? decodeJwt

  return {
    checkScope(jwt: string, scope: string): boolean {
      const claims = decode(jwt)
      if (claims === null) return false
      return hasScope(claims, scope)
    },
  }
}
