/**
 * `@aihu/auth` — client-side scope signal for `<$guard>` consumption.
 *
 * The compiler lowers `<$guard scope="authenticated">` to:
 *   `when(getScopeSignal('authenticated'), () => branch(...))`
 *
 * This module provides the reactive primitive that bridges an auth session
 * into the aihu reactive graph.
 */

import { signal } from '@aihu/signals'

export interface ScopeSignalHandle {
  /** Reactive getter — returns true when `scope` is active. */
  readonly hasScope: (scope: string) => boolean
  /** Set the current authenticated scopes (call after login). */
  setScopes(scopes: string[]): void
  /** Clear all scopes (call after logout). */
  clearScopes(): void
}

// ── Module-level singleton ────────────────────────────────────────────────────
//
// A single reactive signal tracks the active scopes for the current user.
// getScopeSignal() reads from this singleton. createScopeSignal() wires the
// public setCurrentScopes / clearCurrentScopes helpers to it.

const [_getScopes, _setScopes] = signal<string[]>([])

/**
 * Set the active scopes on the module-level singleton.
 * Call this after a successful login / token refresh.
 */
export function setCurrentScopes(scopes: string[]): void {
  _setScopes(scopes)
}

/**
 * Clear the active scopes on the module-level singleton.
 * Call this after logout.
 */
export function clearCurrentScopes(): void {
  _setScopes([])
}

/**
 * Return a reactive getter function that evaluates to `true` when `scope`
 * is present in the current scope list.
 *
 * The returned function is reactive: any `effect` or `computed` that calls
 * it will re-run when the scope list changes.
 *
 * Usage (compiler-generated):
 *   `when(getScopeSignal('authenticated'), () => branch(...))`
 */
export function getScopeSignal(scope: string): () => boolean {
  return () => _getScopes().includes(scope)
}

/**
 * Create a `ScopeSignalHandle` that exposes `setScopes`, `clearScopes`, and
 * `hasScope` — wired to the module-level singleton signal.
 *
 * Prefer `setCurrentScopes` / `clearCurrentScopes` for framework-level auth
 * integration. `createScopeSignal` is provided for component-local usage and
 * testing.
 */
export function createScopeSignal(): ScopeSignalHandle {
  return {
    hasScope(scope: string): boolean {
      return _getScopes().includes(scope)
    },
    setScopes(scopes: string[]): void {
      _setScopes(scopes)
    },
    clearScopes(): void {
      _setScopes([])
    },
  }
}
