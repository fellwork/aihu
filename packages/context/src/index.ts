/**
 * @aihu/context — zero-dependency, DOM-free context system.
 *
 * Provides a React-style context API suitable for both SSR (via
 * setSsrContextMap / clearSsrContextMap / runWithContext) and client-side
 * usage. No external imports; no DOM references.
 */

/**
 * Opaque token that identifies a context slot and carries its default value.
 */
export interface ContextToken<T> {
  readonly _id: symbol
  readonly _default: T | undefined
}

/**
 * Module-level active context map. Set by setSsrContextMap or runWithContext;
 * cleared by clearSsrContextMap. null means no map is active.
 */
let _activeContextMap: Map<symbol, unknown> | null = null

/**
 * Create a new context token. Optionally provide a default value that
 * inject() returns when no value has been provided for this token.
 */
export function createContext<T>(defaultValue?: T): ContextToken<T> {
  return {
    _id: Symbol('aihu.context'),
    _default: defaultValue,
  }
}

/**
 * Write a value for the given token into the active context map.
 * If no map is currently active, this is a no-op.
 */
export function provide<T>(token: ContextToken<T>, value: T): void {
  if (_activeContextMap === null) return
  _activeContextMap.set(token._id, value)
}

/**
 * Read a value for the given token from the active context map.
 * Returns token._default if the token has no entry or if no map is active.
 */
export function inject<T>(token: ContextToken<T>): T | undefined {
  if (_activeContextMap === null) return token._default
  if (_activeContextMap.has(token._id)) {
    return _activeContextMap.get(token._id) as T
  }
  return token._default
}

/**
 * Set the active context map (SSR entry point).
 * Replaces any previously active map.
 */
export function setSsrContextMap(map: Map<symbol, unknown>): void {
  _activeContextMap = map
}

/**
 * Clear the active context map (SSR teardown).
 */
export function clearSsrContextMap(): void {
  _activeContextMap = null
}

/**
 * Run fn() with the given map as the active context map, then restore
 * the previous state (null) in a finally block.
 *
 * This is the recommended SSR entry point: each request gets its own
 * Map; context leakage between requests is impossible.
 */
export function runWithContext<R>(map: Map<symbol, unknown>, fn: () => R): R {
  setSsrContextMap(map)
  try {
    return fn()
  } finally {
    clearSsrContextMap()
  }
}
