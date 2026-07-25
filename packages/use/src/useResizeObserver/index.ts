/**
 * `useResizeObserver` — the general `ResizeObserver` wrapper: observe a
 * target element and run `callback` on every resize
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * This is the THIN sensor — {@link useElementSize} is the consumer-shaped
 * wrapper built on top of it (derived `width()`/`height()` getters). Reach
 * for `useResizeObserver` when the caller needs the raw entries (e.g. a
 * `devicePixelContentBoxSize`, multiple boxes, or side effects beyond
 * tracking width/height) — do not duplicate `useElementSize`'s signal
 * bookkeeping here.
 *
 * Deliberate divergence from the "object of named getters" convention: like
 * `useEventListener`, this composable's only meaningful output is a
 * teardown handle — it returns `{ stop }`, not a getter.
 *
 * SSR (`isClient === false`): registers no observer and never invokes
 * `callback`; `stop()` is a no-op — the `isClient` no-op invariant.
 */

import { effect } from '@aihu/signals'
import {
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'

export interface UseResizeObserverOptions {
  /** Which box(es) `ResizeObserver` reports. Default `'content-box'`. */
  box?: ResizeObserverBoxOptions
}

export interface UseResizeObserverReturn {
  /** Disconnect the observer (and dispose the target-rebinding effect).
   * Idempotent. */
  stop: () => void
}

/**
 * Observe `target`'s box size via `ResizeObserver`, calling `callback` with
 * every batch of entries (mirrors the native `ResizeObserverCallback`
 * signature, plus the observer instance for advanced use — e.g. re-reading
 * `observe`/`unobserve` on other elements from inside the callback).
 * Cleans up with the surrounding effect scope; scopeless callers keep the
 * observer for the page's lifetime unless they call the returned `stop()`
 * themselves.
 */
export function useResizeObserver(
  target: MaybeElementGetter,
  callback: (entries: ResizeObserverEntry[], observer: ResizeObserver) => void,
  options: UseResizeObserverOptions = {},
): UseResizeObserverReturn {
  const { box = 'content-box' } = options

  // SSR: register nothing, callback never runs, stop is a no-op.
  if (!isClient) {
    return { stop: () => {} }
  }

  let stopped = false

  // Reactive target: the effect tracks the getter; per-run onCleanup
  // disconnects the previous observer before the re-run observes the new
  // element — the observer follows the target ($ref null → element).
  const disposeEffect = effect((onCleanup) => {
    const el = unrefElement(target)
    if (el == null) return
    const observer = new ResizeObserver((entries) => callback(entries, observer))
    observer.observe(el, { box })
    onCleanup(() => observer.disconnect())
  })

  const stop = (): void => {
    if (stopped) return
    stopped = true
    disposeEffect()
  }
  tryOnScopeDispose(stop)

  return { stop }
}
