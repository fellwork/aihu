/**
 * `@aihu/auth/server` — signature-verifying AuthPlugin factory (#420).
 *
 * `createVerifiedAuthPlugin` returns an `AuthPlugin` whose `verify(jwt)`
 * checks the token's HMAC-SHA-256 signature via `crypto.subtle`
 * (`verifyJwt`, the same primitive `getAuthState` uses) before returning
 * its claims. The agent-service gate derives BOTH the rate-limit key
 * (`sub`) and the scope decision from this single verified source — a
 * caller-supplied `userId` or a forged `scope` claim can no longer move a
 * caller into another bucket or past a `$scope` check.
 *
 * SERVER-ONLY on purpose: the factory takes the raw HMAC secret, which must
 * never reach a browser bundle. It is exported from `@aihu/auth/server`,
 * not the browser barrel. The decode-only `createAuthPlugin` (`plugin.ts`)
 * remains for legacy scope checks, but a plugin without `verify` cannot
 * serve scoped or rate-limited tools — the gate fails closed (401).
 */

import type { AuthPlugin, VerifiedClaims } from '@aihu/agent-service'
import { decodeJwt, hasScope } from './jwt.ts'
import { type VerifyJwtOptions, verifyJwt } from './server.ts'

export interface VerifiedAuthPluginOptions extends VerifyJwtOptions {
  /**
   * HMAC-SHA-256 secret used to verify JWT signatures — the same secret the
   * `auth()` routes sign with (`AuthConfig.jwtSecret`).
   */
  readonly jwtSecret: string
}

/** Strip an optional `Bearer ` prefix, mirroring `decodeJwt`'s handling. */
function stripBearer(jwt: string): string {
  return jwt.startsWith('Bearer ') ? jwt.slice(7) : jwt
}

/**
 * Create a signature-verifying `AuthPlugin` for `@aihu/agent-service`.
 *
 * - `verify(jwt)` — HMAC-verifies the token AND validates its registered
 *   claims (`exp` required by default, `nbf`, future-`iat` sanity, and
 *   `aud` when `options.audience` is set — see `VerifyJwtOptions`). Returns
 *   the claims, or `null` for any malformed/forged/expired/not-yet-valid/
 *   wrong-audience token. Never throws.
 * - `checkScope(jwt, scope)` — claim-membership check (`scope`/`scp`/
 *   `scopes`). The gate calls it only AFTER `verify` has authenticated the
 *   same token, so its decode reads verified claims.
 */
export function createVerifiedAuthPlugin(options: VerifiedAuthPluginOptions): AuthPlugin {
  const { jwtSecret } = options
  return {
    checkScope(jwt: string, scope: string): boolean {
      const claims = decodeJwt(jwt)
      if (claims === null) return false
      return hasScope(claims, scope)
    },
    async verify(jwt: string): Promise<VerifiedClaims | null> {
      if (typeof jwt !== 'string' || jwt === '') return null
      // `options` carries the claim-validation knobs (allowNoExpiry,
      // audience, clockSkewSec, now) alongside the secret.
      return (await verifyJwt(stripBearer(jwt), jwtSecret, options)) as VerifiedClaims | null
    },
  }
}
