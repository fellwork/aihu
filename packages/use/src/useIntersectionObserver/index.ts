/**
 * `useIntersectionObserver` — the general `IntersectionObserver` wrapper:
 * observe a target element and run `callback` on every intersection change
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * This is the THIN sensor — {@link useElementVisibility} is the
 * consumer-shaped wrapper built on top of it (a single derived `isVisible()`
 * getter). Reach for `useIntersectionObserver` when the caller needs the raw
 * entries (intersection ratio, bounding rects, multiple thresholds) or
 * pause/resume control — do not duplicate `useElementVisibility`'s signal
 * bookkeeping here.
 *
 * Deliberate divergence from the "object of named getters" convention: only
 * `isActive` is a getter — `pause`/`resume`/`stop` are actions, mirroring
 * `useIntervalFn`'s shape.
 *
 * SSR (`isClient === false`): registers no observer and never invokes
 * `callback`; `isActive()` is `false`, `pause`/`resume`/`stop` are no-ops —
 * the `isClient` no-op invariant.
 */

import { effect, signal } from '@aihu/signals'
import {
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'

export interface UseIntersectionObserverOptions {
  /** `IntersectionObserver` root (`null`/omitted = viewport). Resolved once
   * per `resume()`, not tracked reactively — a mid-observation root change
   * is rare enough that a manual `pause()`/`resume()` covers it. */
  root?: MaybeElementGetter
  /** `IntersectionObserver` `rootMargin`. */
  rootMargin?: string
  /** `IntersectionObserver` `threshold`. */
  threshold?: number | number[]
  /** Start observing immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseIntersectionObserverReturn {
  /** Reactive getter — whether the observer is currently attached. Read as
   * `{isActive()}` in templates (parens required). `false` under SSR. */
  readonly isActive: () => boolean
  /** Disconnect the observer without tearing down the composable — a
   * subsequent `resume()` re-attaches it. No-op if already paused. */
  pause: () => void
  /** (Re)attach the observer. No-op if already active, or after the owning
   * effect scope is disposed / `stop()` has been called. */
  resume: () => void
  /** Permanently stop: disconnects and disposes the target-rebinding
   * effect. Idempotent. Unlike `pause()`, a stopped observer cannot be
   * `resume()`d. */
  stop: () => void
}

/**
 * Observe `target`'s intersection with its root (the viewport by default)
 * via `IntersectionObserver`, calling `callback` with every batch of
 * entries (mirrors the native `IntersectionObserverCallback` signature,
 * plus the observer instance). Cleans up with the surrounding effect scope;
 * scopeless callers keep the observer for the page's lifetime unless they
 * call the returned `stop()` themselves.
 */
export function useIntersectionObserver(
  target: MaybeElementGetter,
  callback: (entries: IntersectionObserverEntry[], observer: IntersectionObserver) => void,
  options: UseIntersectionObserverOptions = {},
): UseIntersectionObserverReturn {
  const { root, rootMargin, threshold, immediate = true } = options

  // SSR: static getter, no signal, no observer — callback never runs.
  if (!isClient) {
    const isActive = (): boolean => false
    return { isActive, pause: () => {}, resume: () => {}, stop: () => {} }
  }

  const [isActive, setIsActive] = signal(false)
  let stopped = false
  let disposeEffect: (() => void) | null = null

  const pause = (): void => {
    if (disposeEffect === null) return
    disposeEffect()
    disposeEffect = null
    setIsActive(false)
  }

  const resume = (): void => {
    // A still-referenced resume() must not re-attach once the composable
    // has been permanently stopped.
    if (stopped) return
    if (disposeEffect !== null) return
    // Reactive target: the effect tracks the getter; per-run onCleanup
    // disconnects the previous observer before the re-run observes the new
    // element — the observer follows the target ($ref null → element).
    // `isActive` is set FROM WITHIN the effect body (both branches), not
    // before it — it must reflect whether an observer is actually attached
    // right now, including a target that resolves to null on this run OR a
    // later re-run (e.g. a $ref going from element back to null), not just
    // "resume() was called".
    disposeEffect = effect((onCleanup) => {
      const el = unrefElement(target)
      if (el == null) {
        setIsActive(false)
        return
      }
      // Built incrementally — `exactOptionalPropertyTypes` rejects an
      // explicit `undefined` for `rootMargin`/`threshold` even though both
      // are optional on `IntersectionObserverInit`.
      const init: IntersectionObserverInit = { root: unrefElement(root) ?? null }
      if (rootMargin !== undefined) init.rootMargin = rootMargin
      if (threshold !== undefined) init.threshold = threshold
      const observer = new IntersectionObserver((entries) => callback(entries, observer), init)
      observer.observe(el)
      setIsActive(true)
      onCleanup(() => observer.disconnect())
    })
  }

  const stop = (): void => {
    if (stopped) return
    stopped = true
    pause()
  }
  tryOnScopeDispose(stop)

  if (immediate) resume()

  return { isActive, pause, resume, stop }
}
