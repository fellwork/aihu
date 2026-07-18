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
 *
 * This is the FLAT, SSR-oriented path — one map per request, no tree scoping.
 * Left unchanged so existing SSR consumers keep working.
 */
let _activeContextMap: Map<symbol, unknown> | null = null

/**
 * Client hierarchical path. During a component's setup the runtime installs that
 * component's `provides` object here — a plain object whose prototype chain IS
 * the ancestor context tree (each subtree that provides does `Object.create` of
 * its parent's object). `inject` becomes a single prototype-chain lookup, and an
 * ancestor's provide is visible to descendants but not to siblings.
 *
 * `_ownProvides` tracks whether the active object is THIS owner's own (already
 * `Object.create`d) or still a shared reference to the parent's — so the first
 * `provide()` allocates exactly once and hands the new object back to the runtime
 * to store on the instance for descendants to inherit.
 *
 * Null when not inside a client component setup (then the SSR map, or the token
 * default, applies) — so nothing changes for SSR or standalone use.
 */
let _activeProvides: Record<symbol, unknown> | null = null
let _ownProvides = false
let _onOwnProvides: ((own: Record<symbol, unknown>) => void) | null = null

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
 * Interned string-key → token map for `contextKey`. Module-global on purpose:
 * every component in the app must agree on the token for a given key.
 */
const _stringTokens = new Map<string, ContextToken<unknown>>()

/**
 * Intern a stable context token for a string key, so the compiler-lowered
 * `$context` provide/consume (which are string-keyed) resolve to one shared
 * token app-wide. Module-global, so every component agrees on the token for a
 * key.
 */
export function contextKey(key: string): ContextToken<unknown> {
  let t = _stringTokens.get(key)
  if (t === undefined) {
    t = createContext<unknown>()
    _stringTokens.set(key, t)
  }
  return t
}

/**
 * Write a value for the given token into the active context map.
 * If no map is currently active, this is a no-op.
 */
export function provide<T>(token: ContextToken<T>, value: T): void {
  // Client hierarchical path takes precedence when a component setup is active.
  if (_activeProvides !== null || _onOwnProvides !== null) {
    if (!_ownProvides) {
      // First provide by this owner: allocate its own object inheriting the
      // parent's, and hand it back so the runtime stores it on the instance for
      // descendants to inherit. `?? null` roots the chain when there is no parent.
      _activeProvides = Object.create(_activeProvides ?? null) as Record<symbol, unknown>
      _ownProvides = true
      _onOwnProvides?.(_activeProvides)
    }
    _activeProvides![token._id] = value
    return
  }
  if (_activeContextMap === null) return
  _activeContextMap.set(token._id, value)
}

/**
 * Read a value for the given token. On the client hierarchical path this is a
 * single prototype-chain lookup (an ancestor's provide is visible here). Falls
 * back to the flat SSR map, then the token default.
 */
export function inject<T>(token: ContextToken<T>): T | undefined {
  if (_activeProvides !== null) {
    return (token._id in _activeProvides ? _activeProvides[token._id] : token._default) as
      | T
      | undefined
  }
  if (_activeContextMap === null) return token._default
  if (_activeContextMap.has(token._id)) {
    return _activeContextMap.get(token._id) as T
  }
  return token._default
}

/**
 * @internal — runtime hook. Enter a component's context scope for the duration of
 * its setup: `parent` is the resolved ancestor `provides` object (or null at the
 * root), and `onOwn` is called with this owner's own object the first time it
 * `provide`s, so the runtime can store it on the instance for descendants.
 * Returns the previous scope for `_exitContext` to restore (setups nest).
 */
export function _enterContext(
  parent: Record<symbol, unknown> | null,
  onOwn: (own: Record<symbol, unknown>) => void,
): [Record<symbol, unknown> | null, boolean, ((own: Record<symbol, unknown>) => void) | null] {
  const prev: [
    Record<symbol, unknown> | null,
    boolean,
    ((own: Record<symbol, unknown>) => void) | null,
  ] = [_activeProvides, _ownProvides, _onOwnProvides]
  _activeProvides = parent
  _ownProvides = false
  _onOwnProvides = onOwn
  return prev
}

/** @internal — restore the scope captured by `_enterContext`. */
export function _exitContext(
  prev: [Record<symbol, unknown> | null, boolean, ((own: Record<symbol, unknown>) => void) | null],
): void {
  _activeProvides = prev[0]
  _ownProvides = prev[1]
  _onOwnProvides = prev[2]
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
