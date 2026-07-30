/**
 * Effect scope — a capturable disposal owner for effects, computeds, child
 * scopes, and `onScopeDispose` callbacks
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §1).
 *
 * The scope owns DISPOSAL, and only disposal — it never carries context or
 * error propagation (aihu's three ownership trees are deliberately not
 * unified; see the plan's Ownership model). A scope stores dispose HANDLES —
 * never a back-pointer to a pooled Effect node — so pool-reuse correctness
 * (effect.ts spec-6.2-phase3.md §13.4 closure-local `disposed`) is untouched.
 */

/** @internal — true in dev/test; false in production. Deliberately has NO
 * `typeof process` prefix (unlike signal.ts/computed.ts): the rolldown
 * `define` map replaces `process.env.NODE_ENV` with `"production"`, folding
 * this to a literal `false` so the guarded warn branches (and their
 * strings) are fully DCE'd from dist — the `typeof` prefix defeats that
 * fold. Source consumers (vitest aliases) run in Node where `process`
 * always exists. */
const __DEV__ = process.env.NODE_ENV !== 'production'

export interface EffectScope {
  /** Run `fn` with this scope as the current scope. Returns `undefined`
   * WITHOUT executing `fn` when the scope is already stopped (Vue
   * semantics — anything created inside would be unowned and leak). */
  run<T>(fn: () => T): T | undefined
  /** Dispose everything the scope owns — effects, computeds, child scopes,
   * `onScopeDispose` callbacks — in LIFO (reverse-registration) order.
   * Idempotent; re-entrant calls (a cleanup stopping its own scope) and a
   * parent-cascade reaching an already-stopped child are no-ops. Every
   * disposer runs even if an earlier one throws; the first error is
   * rethrown after all have run. */
  stop(): void
  readonly active: boolean
}

/** @internal — one entry in a scope's disposer list. `i` is the entry's
 * live index (maintained by swap-remove); `s` back-points to the owning
 * scope so a manually-disposed effect/computed can remove its own entry in
 * O(1) instead of leaving a dead closure for the scope's lifetime (the
 * ratified scope-list-growth mitigation: back-pointer on the handle
 * wrapper, never on the pooled node). Field names are pre-shortened and
 * deliberately do NOT collide with scripts/mangle-dist.mjs: `.f`/`.s` are
 * the post-mangle forms of `.fn`/`.sub`; the mangler only rewrites the
 * long forms, so using the short forms directly in source is safe. */
export interface ScopeRec {
  /** @internal — owning scope */ s: EffectScopeImpl
  /** @internal — the disposer */ f: () => void
  /** @internal — live index in `s._l` */ i: number
}

/** @internal — the currently active scope (live binding). Mirrors
 * `currentObserver` in signal.ts: read directly via ESM live-binding
 * semantics; write via `_setCurrentScope`. NOT the public accessor —
 * that is `getCurrentScope()`. */
export let _currentScope: EffectScopeImpl | null = null

/** @internal — save/set/restore helper, parallel to `setCurrentObserver`. */
export function _setCurrentScope(next: EffectScopeImpl | null): EffectScopeImpl | null {
  const prev = _currentScope
  _currentScope = next
  return prev
}

/** @internal — append a disposer to `s`'s list, returning the swap-remove
 * record. Callers must have checked `s.active`. */
function scopeAppend(s: EffectScopeImpl, f: () => void): ScopeRec {
  const list = s._l
  const rec: ScopeRec = { s, f, i: list.length }
  list.push(rec)
  return rec
}

/** @internal — register `f` with the current scope when one is active.
 * Returns the removal record (for swap-remove on manual dispose), or
 * `null` when unowned: no scope current, or the current scope is stopped
 * (`runWithScope` against a scope that was stopped mid-await). */
export function _scopeAdd(f: () => void): ScopeRec | null {
  const s = _currentScope
  return s?.active ? scopeAppend(s, f) : null
}

/** @internal — swap-remove `rec` from its owning scope's list. No-op while
 * the scope is stopping/stopped: `stop()` clears `active` before draining,
 * so disposers invoked BY the drain (whose handles call back in here) never
 * mutate the list mid-iteration. */
export function _scopeRemove(rec: ScopeRec): void {
  const s = rec.s
  if (!s.active) return
  const list = s._l
  const last = list.pop() as ScopeRec
  if (last !== rec) {
    list[rec.i] = last
    last.i = rec.i
  }
}

/** @internal — implementation class. Exported for internal typing only
 * (effect.ts / computed.ts); not re-exported from index.ts. `active` is a
 * plain mutable field behind the interface's `readonly` view — the guard
 * flag and the public accessor are the same slot. */
export class EffectScopeImpl implements EffectScope {
  active = true
  /** @internal — disposer list; drained LIFO by stop(). */
  _l: ScopeRec[] = []
  /** @internal — this scope's own record in its parent's list (non-detached
   * child created under an active scope); swap-removed on manual stop so
   * churned child scopes don't grow the parent's list. */
  _p: ScopeRec | null = null

  constructor(detached: boolean) {
    if (!detached && _currentScope !== null && _currentScope.active) {
      // Register with the parent at creation so parent stop() cascades.
      this._p = scopeAppend(_currentScope, () => this.stop())
    }
  }

  run<T>(fn: () => T): T | undefined {
    if (!this.active) {
      if (__DEV__) console.warn('[aihu/signals] run() called on an inactive effect scope')
      return undefined
    }
    const prev = _currentScope
    _currentScope = this
    try {
      return fn()
    } finally {
      _currentScope = prev
    }
  }

  stop(): void {
    if (!this.active) return
    // Clear the flag FIRST: re-entrant stop() (a cleanup stopping its own
    // scope) and _scopeRemove callbacks from disposers running below are
    // both gated on `active` and become no-ops.
    this.active = false
    if (this._p !== null) {
      // Manual stop of a child: remove our entry from the parent's list
      // (no-op when the parent itself is mid-stop — its drain covers us,
      // and our second stop() via the parent's entry is an idempotent
      // no-op).
      _scopeRemove(this._p)
      this._p = null
    }
    // LIFO drain, collect-and-rethrow-first (ratified): every disposer
    // runs even if an earlier one throws; the first error is rethrown
    // after all have run.
    const list = this._l
    let thrown = false
    let firstErr: unknown
    for (let i = list.length - 1; i >= 0; i--) {
      try {
        ;(list[i] as ScopeRec).f()
      } catch (err) {
        if (!thrown) {
          thrown = true
          firstErr = err
        }
      }
    }
    list.length = 0
    if (thrown) throw firstErr
  }
}

/**
 * Create an effect scope: a disposal owner that collects every `effect()`,
 * `computed()`, child `effectScope()`, and `onScopeDispose()` registered
 * while it is current (via `run`/`runWithScope`), and disposes them all in
 * LIFO order on `stop()`.
 *
 * Non-detached scopes (the default) register with the scope current at
 * creation, so a parent `stop()` cascades to children. Pass `detached:
 * true` to opt out of the cascade — a detached scope is only stopped
 * explicitly.
 *
 * Ownership caveat (P0-1): the current scope is cleared for the duration
 * of every effect run — including a scoped effect's OWN first run (an
 * effect run may be a synchronously re-entered foreign effect at a write
 * site, and the two cases are indistinguishable). Anything created inside
 * an effect body is therefore unowned by this scope; the effect author
 * must dispose it, e.g. `onCleanup(innerDispose)`.
 */
export function effectScope(detached?: boolean): EffectScope {
  return new EffectScopeImpl(detached === true)
}

/**
 * The scope currently collecting registrations, or `undefined` when none
 * is active. Library code should check this before relying on
 * `onScopeDispose` (which silently no-ops without a scope in production).
 */
export function getCurrentScope(): EffectScope | undefined {
  return _currentScope ?? undefined
}

/**
 * Run `fn` with an explicit `scope` as the current scope — the async
 * re-entry primitive: capture `getCurrentScope()` before an `await`, then
 * `runWithScope(captured, ...)` after it to keep registering into the same
 * owner. Unlike `EffectScope.run`, `fn` always executes; registrations
 * made against an already-stopped scope are unowned (same as `run` on a
 * stopped scope).
 */
export function runWithScope<T>(scope: EffectScope, fn: () => T): T {
  const prev = _currentScope
  _currentScope = scope as EffectScopeImpl
  try {
    return fn()
  } finally {
    _currentScope = prev
  }
}

/**
 * Run `fn` with NO current scope — the explicit opt-out mirror of
 * `runWithScope`. Anything created inside `fn` (effects, computeds, child
 * scopes, `onScopeDispose`) is unowned and must be disposed manually.
 *
 * This is the primitive arbor uses so binding effects are never
 * scope-adopted (P0-2b): a child custom element upgrading synchronously
 * inside a parent's scoped `setup()`/`onMount` would otherwise register its
 * bindings into the PARENT component's scope — there is no `runEffect`
 * frame in that path, so the P0-1 save/clear does not cover it.
 */
export function runWithoutScope<T>(fn: () => T): T {
  const prev = _currentScope
  _currentScope = null
  try {
    return fn()
  } finally {
    _currentScope = prev
  }
}

/**
 * Register `fn` to run when the current scope is stopped. With no active
 * scope this is a no-op (dev builds warn); callers that need to know can
 * check `getCurrentScope()` first.
 */
export function onScopeDispose(fn: () => void): void {
  const s = _currentScope
  if (s?.active) scopeAppend(s, fn)
  else if (__DEV__)
    console.warn('[aihu/signals] onScopeDispose() called with no active effect scope')
}
