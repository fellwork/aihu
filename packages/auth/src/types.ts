/**
 * `@aihu/auth` — shared type definitions.
 *
 * `User`, `AuthState`, `AuthConfig`, and `RouteHandlers` are the public
 * type surface consumed by both the client-side helpers and the server-side
 * `getAuthState` / `createAuthRoutes` factories.
 */

import type { RouteHandler } from '@aihu/server'

// ---------------------------------------------------------------------------
// Core domain types (A08)
// ---------------------------------------------------------------------------

/**
 * Authenticated user record.
 * `id` is always present; `email` is optional (not all IdPs provide it).
 * `scopes` mirrors the active authorisation grants for this session.
 */
export interface User {
  readonly id: string
  readonly email?: string
  readonly scopes: string[]
}

/**
 * Result of `getAuthState`. Present on the server `RequestContext`; returned
 * directly from the helper in tests and server-side code.
 */
export interface AuthState {
  readonly user: User | null
  readonly scopes: string[]
}

/**
 * Configuration for the `auth()` plugin factory and for `createAuthRoutes`.
 * All path and cookie fields are optional with secure defaults.
 */
export interface AuthConfig {
  /** HMAC-SHA-256 secret for JWT signing/verification. */
  readonly jwtSecret: string
  /** Path for the sign-in endpoint. Default: `/auth/sign-in`. */
  readonly signInPath?: string
  /** Path for the sign-out endpoint. Default: `/auth/sign-out`. */
  readonly signOutPath?: string
  /** Path for the token-refresh endpoint. Default: `/auth/refresh`. */
  readonly refreshPath?: string
  /** Cookie name that stores the session JWT. Default: `aihu_session`. */
  readonly cookieName?: string
  /** Cookie max-age in seconds. Default: `86400` (24 hours). */
  readonly maxAge?: number
  /**
   * Accept session JWTs that carry no `exp` claim. Default `false` —
   * `getAuthState` rejects non-expiring tokens (see `VerifyJwtOptions`).
   */
  readonly allowNoExpiry?: boolean
  /**
   * Expected `aud` for session JWTs. When set, tokens whose `aud` claim does
   * not include this value are rejected. When unset, `aud` is not checked.
   */
  readonly audience?: string
  /** Clock-skew leeway in seconds for `exp`/`nbf` validation. Default 60. */
  readonly clockSkewSec?: number
}

/**
 * The three `RouteHandler` objects returned by `createAuthRoutes`.
 * Compatible with `@aihu/server`'s `RouteHandler` type, which is the same
 * shape used by `@aihu/seo`'s route factories.
 */
export interface RouteHandlers {
  readonly signIn: RouteHandler
  readonly signOut: RouteHandler
  readonly refresh: RouteHandler
}

/**
 * Resolved configuration with all optional fields filled in.
 * @internal
 */
export interface ResolvedAuthConfig {
  readonly jwtSecret: string
  readonly signInPath: string
  readonly signOutPath: string
  readonly refreshPath: string
  readonly cookieName: string
  readonly maxAge: number
}

/**
 * Minimal request context passed to `getAuthState`. Mirrors the
 * `RouteContext` shape from `@aihu/server` but accepts anything that
 * has a `.request` or is itself a `Request`-like object.
 *
 * In practice callers pass the raw `Request` object from the route handler.
 */
export type RequestContext = Request

/**
 * Custom error class for auth operation failures.
 * Thrown by client-side `signIn` on HTTP errors or parse failures.
 */
export class AuthError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
