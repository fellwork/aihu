/**
 * `@aihu/auth` — server-side helpers: `getAuthState`.
 *
 * This module is intentionally server-only. It uses the Web Crypto API
 * (`crypto.subtle`) to verify JWT signatures, which is available in all
 * modern server runtimes (Bun, Node ≥ 20, Deno, Cloudflare Workers).
 *
 * Do NOT import this module into the browser entry point (`index.ts`).
 * Browser callers use the client helpers (`signIn`, `signOut`, `useCurrentUser`).
 */

import type { AuthConfig, AuthState, RequestContext, User } from './types.ts'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve optional AuthConfig fields to concrete defaults. */
function cookieName(config: AuthConfig): string {
  return config.cookieName ?? 'aihu_session'
}

/**
 * Parse a `Set-Cookie`-style header cookie string into a name→value map.
 * Only handles a single `Cookie:` header value (the request header format:
 * `name=value; name2=value2`).
 */
function parseCookies(cookieHeader: string): Map<string, string> {
  const map = new Map<string, string>()
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    const key = pair.slice(0, eq).trim()
    const val = pair.slice(eq + 1).trim()
    if (key) map.set(key, val)
  }
  return map
}

/**
 * Decode the base64url-encoded payload segment of a JWT.
 * Returns the parsed object, or null on any parse error.
 * No signature verification — used internally only after `verifyJwt`.
 */
function decodePayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const payload = parts[1]
  if (!payload) return null
  try {
    // base64url → base64 → string
    const base64 =
      payload.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (payload.length % 4)) % 4)
    // Use Buffer in Node/Bun; fall back to atob in Web environments.
    let decoded: string
    if (typeof Buffer !== 'undefined') {
      decoded = Buffer.from(payload, 'base64url').toString('utf8')
    } else {
      decoded = atob(base64)
    }
    const obj = JSON.parse(decoded) as unknown
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null
    return obj as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Derive an HMAC-SHA-256 `CryptoKey` from the raw secret string.
 * Uses `crypto.subtle.importKey` so no native module is needed.
 */
async function importHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/**
 * Decode base64url to a `Uint8Array`. Used for the JWT signature segment.
 *
 * Returns `Uint8Array` (a TypedArray) which is accepted as `BufferSource`
 * by all Web Crypto implementations. Using `Uint8Array` avoids the
 * `SharedArrayBuffer` incompatibility that can occur with `ArrayBuffer`
 * in environments where `Buffer.buffer` is a `SharedArrayBuffer` (e.g., Bun).
 *
 * Uses `Buffer.from` in Node/Bun (handles base64url natively). Falls back
 * to the `atob` + charCodeAt approach in browser/jsdom environments.
 */
function base64urlToUint8Array(s: string): Uint8Array<ArrayBuffer> {
  if (typeof Buffer !== 'undefined') {
    const buf = Buffer.from(s, 'base64url')
    // Allocate a fresh ArrayBuffer (never SharedArrayBuffer) and copy.
    // This avoids the TypeScript `Uint8Array<ArrayBufferLike>` → `BufferSource`
    // incompatibility caused by Buffer's pool sharing a SharedArrayBuffer.
    const ab = new ArrayBuffer(buf.length)
    const view = new Uint8Array(ab)
    buf.copy(view as unknown as Buffer)
    return view
  }
  const base64 = s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)
  const bin = atob(base64)
  const ab = new ArrayBuffer(bin.length)
  const bytes = new Uint8Array(ab)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/**
 * Verify an HMAC-SHA-256 signed JWT.
 *
 * Returns the decoded payload claims on success, or `null` on any failure
 * (malformed token, wrong secret, expired, etc.). Never throws.
 */
async function verifyJwt(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const [headerB64, payloadB64, sigB64] = parts as [string, string, string]

    const key = await importHmacKey(secret)
    const enc = new TextEncoder()
    const signingInput = `${headerB64}.${payloadB64}`
    const signature = base64urlToUint8Array(sigB64)
    const data = enc.encode(signingInput)

    const valid = await crypto.subtle.verify('HMAC', key, signature, data)
    if (!valid) return null

    return decodePayload(token)
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the session JWT from the request cookie, verify it with `jwtSecret`,
 * and return the current `AuthState`.
 *
 * - Returns `{ user: null, scopes: [] }` when the cookie is absent.
 * - Returns `{ user: null, scopes: [] }` when the JWT is invalid/expired.
 * - Never throws — all errors are caught internally.
 *
 * @example
 * // In a route handler:
 * const { user, scopes } = await getAuthState(req, config)
 * if (!user) return new Response('Unauthorized', { status: 401 })
 */
export async function getAuthState(ctx: RequestContext, config: AuthConfig): Promise<AuthState> {
  try {
    const cookieHeader = ctx.headers.get('cookie') ?? ''
    if (!cookieHeader) return { user: null, scopes: [] }

    const cookies = parseCookies(cookieHeader)
    const token = cookies.get(cookieName(config))
    if (!token) return { user: null, scopes: [] }

    const claims = await verifyJwt(token, config.jwtSecret)
    if (!claims) return { user: null, scopes: [] }

    // Extract user fields from JWT claims.
    // `sub` → user.id, `email` → user.email, scopes from `scope`/`scp`/`scopes`.
    const sub = typeof claims.sub === 'string' ? claims.sub : null
    if (!sub) return { user: null, scopes: [] }

    const scopes: string[] = []
    if (typeof claims.scope === 'string') {
      scopes.push(...claims.scope.split(' ').filter(Boolean))
    } else if (Array.isArray(claims.scp)) {
      scopes.push(...(claims.scp as string[]).filter((s) => typeof s === 'string'))
    } else if (Array.isArray(claims.scopes)) {
      scopes.push(...(claims.scopes as string[]).filter((s) => typeof s === 'string'))
    }

    const user: User = {
      id: sub,
      ...(typeof claims.email === 'string' ? { email: claims.email } : {}),
      scopes,
    }

    return { user, scopes }
  } catch {
    return { user: null, scopes: [] }
  }
}
