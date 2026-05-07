/**
 * `@aihu/auth` — lightweight JWT decoder.
 *
 * No crypto: parses the payload segment only (middle of `aaa.bbb.ccc`).
 * Verification of signature is out of scope; use a trusted JWT library or
 * your IdP's SDK when you need full signature verification.
 */

export interface JwtClaims {
  sub?: string
  /** Space-separated scope string (RFC 6749 §3.3). */
  scope?: string
  /** Array-form scopes (Auth0 convention). */
  scp?: string[]
  /** Array-form scopes (Okta convention). */
  scopes?: string[]
  [key: string]: unknown
}

/**
 * Decode the payload segment of a JWT without verifying its signature.
 * Returns `null` for any malformed input.
 *
 * Supports both browser (`atob`) and Node/Bun (`Buffer`) environments.
 * Handles `Bearer ` prefix automatically.
 */
export function decodeJwt(jwt: string): JwtClaims | null {
  if (typeof jwt !== 'string') return null

  // Strip optional Bearer prefix
  const token = jwt.startsWith('Bearer ') ? jwt.slice(7) : jwt

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const payload = parts[1]
  if (!payload) return null

  try {
    let decoded: string

    if (typeof Buffer !== 'undefined') {
      // Node / Bun — Buffer handles base64url natively
      decoded = Buffer.from(payload, 'base64url').toString('utf8')
    } else {
      // Browser — atob only supports standard base64; add padding + replace URL chars
      const base64 =
        payload.replace(/-/g, '+').replace(/_/g, '/') +
        '=='.slice(0, (4 - (payload.length % 4)) % 4)
      decoded = atob(base64)
    }

    const claims = JSON.parse(decoded) as unknown
    if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) return null

    return claims as JwtClaims
  } catch {
    return null
  }
}

/**
 * Return `true` when `claims` contains `scope` in any of the three
 * standard scope claim formats:
 *   1. `scope` — space-separated string (RFC 6749)
 *   2. `scp`   — string array (Auth0)
 *   3. `scopes` — string array (Okta)
 */
export function hasScope(claims: JwtClaims, scope: string): boolean {
  if (typeof claims.scope === 'string') {
    if (claims.scope.split(' ').includes(scope)) return true
  }
  if (Array.isArray(claims.scp)) {
    if (claims.scp.includes(scope)) return true
  }
  if (Array.isArray(claims.scopes)) {
    if (claims.scopes.includes(scope)) return true
  }
  return false
}
