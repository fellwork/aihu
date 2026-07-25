/**
 * `@aihu/signals/lifecycle` — the DOM-free OWNERSHIP CONTRACT between
 * `@aihu/runtime` (the custom-element lifecycle driver) and `@aihu/use`
 * (the composable consumer). See
 * docs/plans/2026-07-24-lifecycle-ownership-dx.md §6.
 *
 * This module is NOT a lifecycle implementation — it carries no DOM, no
 * rAF, no custom-element code, not even a `signal()` call. It is metadata
 * hung off the thing that already owns: the `EffectScope`. `@aihu/runtime`
 * attaches a `LifecycleHost` to a component's root scope at `_build()`
 * time; anything running with that scope current (or able to re-enter it)
 * can then ask "what kind of owner is this?" via `getLifecycleHost()`.
 *
 * Resolves via the PUBLIC `getCurrentScope()` only — touches no signals
 * internals (`_currentScope`, `EffectScopeImpl`, mangled fields, etc.).
 *
 * Zero bytes in `@aihu/signals/dist/index.js`: this is a SEPARATE rolldown
 * entry (`dist/lifecycle.js`, its own `.size-limit.json` row). `index.ts`
 * must never import this file.
 */
import { type EffectScope, getCurrentScope } from './scope.ts'

/**
 * What a component runtime offers to code owned by its scope. DOM-free by
 * construction: booleans and callbacks only. `@aihu/runtime` supplies the
 * actual driver (the rAF-coalesced commit queue, the per-connection
 * `connected` signal) — this interface is only the shape of the contract.
 */
export interface LifecycleHost {
  /** Liveness of THIS connection; latches `false` at disconnect and never
   * re-arms. A reconnect gets a fresh setup with a fresh host. */
  readonly connected: () => boolean
  /** Post-layout, pre-paint, once per connection; the entry is skipped if
   * the connection has already ended by the time the frame fires. A
   * returned teardown is registered into the owning scope. Valid whenever
   * this scope is current — i.e. during setup OR inside an `onMount`
   * body — which is deliberately a WIDER window than the bare
   * `@aihu/runtime` `onCommit` export's setup-only gate: this method is
   * reached through `getCurrentScope()`, not that export's internal
   * setup-only pointer, so calling it from `onMount` is legal. */
  onCommit(fn: () => void | (() => void)): void
}

const hosts = new WeakMap<EffectScope, LifecycleHost>()

/**
 * @internal — called by `@aihu/runtime` at `_build()` time, right after the
 * component's root scope is created and registered. Not part of the public
 * surface; nothing outside `@aihu/runtime` should call this.
 */
export function _attachLifecycleHost(scope: EffectScope, host: LifecycleHost): void {
  hosts.set(scope, host)
}

/**
 * The lifecycle host owning the current scope, or `undefined` when there is
 * none — a scopeless caller, non-component code, or inside an `effect()`
 * body where the current scope is deliberately cleared (signals P0-1).
 * Graceful degradation is uniform with the rest of the library: no current
 * scope means "you own it yourself."
 */
export function getLifecycleHost(): LifecycleHost | undefined {
  const s = getCurrentScope()
  return s === undefined ? undefined : hosts.get(s)
}
