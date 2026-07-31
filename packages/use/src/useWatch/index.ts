/**
 * `useWatch` — run a callback when a reactive `source` getter CHANGES
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5, Tier 0).
 *
 * Lazy by default (VueUse/Runed semantics): unlike `effect()`, the callback
 * does NOT run at creation — only on a subsequent change — unless
 * `immediate: true` is passed. This is the one place in `@aihu/use` where
 * "lazy by default" is the documented, intentional behavior; every sensor
 * composable in this package eagerly seeds its initial value instead.
 *
 * Return convention: `useWatch()` exposes no reactive VALUE of its own (it is
 * an effect-runner utility, not state) — it returns a bare `stop(): void`,
 * exactly like {@link import('../useEventListener/index.ts').useEventListener}.
 * This is NOT a violation of the object-of-named-getters convention; that
 * convention applies to composables that expose reactive state.
 *
 * SHALLOW-ONLY: `value`/`oldValue` are whatever `source()` returns, compared
 * and passed BY REFERENCE — no deep clone, no Proxy, no VueUse `deep: true`
 * analog. A source returning a mutated-in-place object will not be detected
 * as "changed" by anything in this module; `source` itself is responsible
 * for producing a new value when it should be considered a change.
 *
 * VALUE-CHANGE gate, not dependency-change: the underlying `effect()` re-runs
 * on every DEPENDENCY change, but `useWatch` only invokes `callback` when the
 * new value is not `Object.is`-equal to the previous one. This matters for
 * derived/boolean sources — `useWatch(() => count() > 5, cb)` does NOT fire
 * `cb` when `count` moves 6 -> 7, because the boolean result is unchanged.
 *
 * `callback` runs UNTRACKED (outside the watcher effect's own dependency
 * tracking): any signal it reads does not become a dependency of the
 * watcher, and a read-modify-write on an unrelated signal inside the
 * callback (`setOther(other() + 1)`) does not throw `SignalCircularError`.
 *
 * SSR (`isClient === false`): registers no effect and invokes NOTHING — not
 * even `immediate`. There is no reactive system running server-side to ever
 * notify a later change, so firing `immediate` here would be a one-shot call
 * with no matching client-side behavior to reconcile against (the isClient
 * no-op invariant). Returns a no-op `stop`.
 */

import { type Dispose, effect, untrack } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseWatchOptions {
  /** Invoke `callback` once synchronously at creation, with `oldValue` as
   * `undefined`. Default `false` — lazy: the callback only runs on a
   * subsequent CHANGE, never on creation. */
  immediate?: boolean
  /** Stop after the callback's first invocation (the immediate call if
   * `immediate: true`, otherwise the first real change). Default `false`. */
  once?: boolean
}

export type UseWatchCallback<T> = (
  value: T,
  oldValue: T | undefined,
  onCleanup: (fn: () => void) => void,
) => void

// `Dispose` is re-exported (not redeclared) — it is structurally identical
// to `@aihu/signals`' own, and two same-named type aliases across packages
// is exactly the drift this package tries not to create.
export type { Dispose }

/**
 * Invoke `callback` UNTRACKED (see module doc): signal reads/writes inside
 * it never become — or trip a circular-write error against — a dependency
 * of the watcher's own effect.
 *
 * `onCleanup` is the one exception: it must still register against the
 * watcher's REAL running effect, which requires the real `currentObserver`
 * (deliberately cleared for the untracked duration). So calls to it made
 * during the untracked callback are captured here, not forwarded live, and
 * replayed against the real `onCleanup` immediately after `untrack`
 * restores tracking — registration then sees the correct running effect.
 */
function runUseWatchCallback<T>(
  callback: UseWatchCallback<T>,
  value: T,
  oldValue: T | undefined,
  onCleanup: (fn: () => void) => void,
): void {
  const pendingCleanups: Array<() => void> = []
  untrack(() => callback(value, oldValue, (fn) => pendingCleanups.push(fn)))
  for (const fn of pendingCleanups) onCleanup(fn)
}

/**
 * Track `source()` and invoke `callback(value, oldValue, onCleanup)` on
 * every change (lazy by default — see module doc). `onCleanup` registers a
 * callback that runs before the NEXT invocation (or on `stop()`), mirroring
 * `effect()`'s per-run cleanup.
 *
 * Cleans up with the surrounding effect scope; scopeless callers keep
 * tracking `source` for the page's lifetime unless they call the returned
 * `stop()` themselves.
 */
export function useWatch<T>(
  source: () => T,
  callback: UseWatchCallback<T>,
  options: UseWatchOptions = {},
): Dispose {
  const { immediate = false, once = false } = options
  // SSR: no tracking, no invocation — not even `immediate` (module doc).
  if (!isClient) return () => {}

  let isFirstRun = true
  let prevValue: T | undefined
  // Deferred-stop flag: `stop` cannot be referenced from inside the effect
  // body during the FIRST (creation) run, because `effect()` has not yet
  // returned — its own dispose closure exists internally but nothing has
  // handed it to `disposeEffect` yet. The immediate+once combo is the only
  // path that could want to stop during that first run; it sets this flag
  // instead, and the flag is checked (`stop()` called for real) once
  // `effect()` has returned and `disposeEffect`/`stop` are both live. Every
  // OTHER `stop()` call (any later re-run) happens strictly after `useWatch()`
  // has returned to its caller, so no such deferral is needed there.
  let stopAfterCreate = false

  const disposeEffect = effect((onCleanup) => {
    const next = source()
    if (isFirstRun) {
      isFirstRun = false
      prevValue = next
      if (immediate) {
        runUseWatchCallback(callback, next, undefined, onCleanup)
        if (once) stopAfterCreate = true
      }
      return
    }
    // Value-equality gate: this effect body re-runs whenever any signal
    // `source()` reads changes — a DEPENDENCY change — but `useWatch`'s
    // contract (module doc) is to fire only on a source-VALUE change,
    // compared by reference (Object.is). A derived/boolean source (e.g.
    // `() => count() > 5`) can re-run this effect while `next` is
    // identical to the last observed value; skip the callback (and the
    // prevValue swap — there is nothing new to remember) in that case.
    if (Object.is(next, prevValue)) return
    const prev = prevValue
    prevValue = next
    runUseWatchCallback(callback, next, prev, onCleanup)
    if (once) stop()
  })

  let stopped = false
  const stop: Dispose = () => {
    if (stopped) return
    stopped = true
    disposeEffect()
  }

  if (stopAfterCreate) stop()
  tryOnScopeDispose(stop)
  return stop
}
