/**
 * `usePerformanceObserver` — subscribe to performance entries (`mark`,
 * `measure`, `navigation`, `paint`, `resource`, ...) via `PerformanceObserver`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Guarded by feature detection: `PerformanceObserver` is unsupported in a
 * handful of embedded/older runtimes, so this checks
 * `typeof PerformanceObserver !== 'undefined'` before constructing one —
 * the same "never crash on an unsupported API" contract as `useSupported`'s
 * predicates.
 *
 * Deliberate divergence from the "object of named getters" convention: like
 * `useEventListener`, the only meaningful output is a teardown handle — this
 * returns `{ stop }`.
 *
 * SSR (`isClient === false`): registers no observer and never invokes
 * `callback`; `stop()` is a no-op — the `isClient` no-op invariant. The same
 * no-op path also covers the unsupported-API case (no window at all implies
 * no `PerformanceObserver` either).
 */

import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UsePerformanceObserverReturn {
  /** Disconnect the observer. Idempotent; also a no-op when
   * `PerformanceObserver` was never supported/constructed. */
  stop: () => void
}

/**
 * Observe performance entries matching `options` (the native
 * `PerformanceObserverInit` — set `entryTypes` or `type`), calling
 * `callback` with every batch (mirrors the native
 * `PerformanceObserverCallback` signature). Cleans up with the surrounding
 * effect scope; scopeless callers keep the observer for the page's lifetime
 * unless they call the returned `stop()` themselves.
 */
export function usePerformanceObserver(
  callback: PerformanceObserverCallback,
  options: PerformanceObserverInit,
): UsePerformanceObserverReturn {
  // SSR, or an environment lacking PerformanceObserver: register nothing,
  // callback never runs, stop is a no-op.
  if (!isClient || typeof PerformanceObserver === 'undefined') {
    return { stop: () => {} }
  }

  const observer = new PerformanceObserver(callback)
  observer.observe(options)

  let stopped = false
  const stop = (): void => {
    if (stopped) return
    stopped = true
    observer.disconnect()
  }
  tryOnScopeDispose(stop)

  return { stop }
}
