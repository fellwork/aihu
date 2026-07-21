/**
 * `@aihu/auth` — client-side helpers.
 *
 * `signIn`, `signOut`, `useCurrentUser`, `setCurrentScopes`, and
 * `clearCurrentScopes` are browser-safe. They use `fetch` (native browser
 * API) and `@aihu/signals` for reactivity.
 *
 * `useCurrentUser` returns a reactive getter — not the value itself —
 * consistent with the @aihu/signals `signal()` tuple. This makes it drop-in
 * compatible with `@aihu/magna`'s `getToken` pattern:
 *
 *   magna({ getToken: () => useCurrentUser()?.id ?? null })
 */

import { signal } from '@aihu/signals'
import {
  clearCurrentScopes as _clearScopeSignal,
  setCurrentScopes as _setScopeSignal,
} from './scope-signal.ts'
import type { User } from './types.ts'
import { AuthError } from './types.ts'

// ---------------------------------------------------------------------------
// Module-level reactive state (user)
// ---------------------------------------------------------------------------

const [_getUser, _setUser] = signal<User | null>(null)

// ---------------------------------------------------------------------------
// Reactive user getter (A07)
// ---------------------------------------------------------------------------

/**
 * Return a reactive getter for the currently signed-in `User`.
 *
 * The returned function is reactive: any `effect` or `computed` that calls it
 * will re-run when the user changes.
 *
 * Initial value is `null` (no user signed in).
 *
 * @example
 * const getUser = useCurrentUser()
 * getUser() // => null | User
 *
 * // Drop-in compatible with @aihu/magna getToken pattern:
 * magna({ getToken: () => useCurrentUser()?.id ?? null })
 */
export function useCurrentUser(): () => User | null {
  return _getUser
}

/**
 * Update the active scope list on both the user signal and the module-level
 * scope-signal singleton (used by `<guard>` lowering via `getScopeSignal`).
 *
 * Call after a successful login or token refresh that carries new scopes.
 */
export function setCurrentScopes(scopes: string[]): void {
  // Keep scope-signal singleton in sync (<guard> consumers read from it).
  _setScopeSignal(scopes)
}

/**
 * Reset both user and scope signals to `null` / `[]`.
 * Call after sign-out or when the session is invalidated.
 */
export function clearCurrentScopes(): void {
  _setUser(null)
  _clearScopeSignal()
}

// ---------------------------------------------------------------------------
// Sign-in helper (A05)
// ---------------------------------------------------------------------------

/**
 * Client-side sign-in. POSTs `token` to `signInPath` and parses the JSON
 * response as a `User`. Updates the reactive user signal on success.
 *
 * Throws `AuthError` on:
 *   - empty or non-string token
 *   - HTTP error response (4xx/5xx)
 *   - JSON parse failure
 *
 * @param token  The JWT to exchange for a session.
 * @param signInPath  The server endpoint (default: `/auth/sign-in`).
 */
export async function signIn(token: string, signInPath = '/auth/sign-in'): Promise<User> {
  if (typeof token !== 'string' || !token) {
    throw new AuthError('token must be a non-empty string')
  }

  let res: Response
  try {
    res = await fetch(signInPath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
  } catch (err) {
    throw new AuthError(
      `Network error during sign-in: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  if (!res.ok) {
    throw new AuthError(`Sign-in failed: ${res.statusText}`, res.status)
  }

  let user: User
  try {
    user = (await res.json()) as User
  } catch {
    throw new AuthError('Failed to parse sign-in response as JSON')
  }

  // Update reactive state.
  _setUser(user)
  if (Array.isArray(user.scopes)) {
    _setScopeSignal(user.scopes)
  }

  return user
}

// ---------------------------------------------------------------------------
// Sign-out helper (A06)
// ---------------------------------------------------------------------------

/**
 * Client-side sign-out. POSTs to `signOutPath`. Never throws — errors are
 * swallowed silently (arch-3 §2.4 spec). Always clears the reactive state.
 *
 * @param signOutPath  The server endpoint (default: `/auth/sign-out`).
 */
export async function signOut(signOutPath = '/auth/sign-out'): Promise<void> {
  try {
    await fetch(signOutPath, { method: 'POST' })
  } catch {
    // Swallow network errors per arch-3 §2.4 spec.
  }
  // Always clear reactive state, even on error.
  clearCurrentScopes()
}
