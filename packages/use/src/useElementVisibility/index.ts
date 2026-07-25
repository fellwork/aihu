/**
 * `useElementVisibility` — whether an element is intersecting its viewport
 * (or a custom root) via `IntersectionObserver`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{isVisible()}`, never bare `{isVisible}`.
 *
 * REFACTORED (Wave 1a review): this is now the consumer-shaped wrapper
 * built ON TOP OF the general {@link useIntersectionObserver} sensor
 * (mirrors the `useReducedMotion` -> `usePreferredReducedMotion`
 * precedent) — the raw observer construction, target-rebind effect, and
 * teardown all live in `useIntersectionObserver` exactly once; this file
 * only derives the single `isVisible()` getter from the entries it
 * receives (ignoring the pause/resume/stop controls the general sensor
 * exposes — this composable is always-on for as long as its target is
 * set).
 *
 * SSR (`isClient === false`): returns a static getter of `false` and
 * registers no observer — the isClient no-op invariant.
 */

import { signal } from '@aihu/signals'
import { isClient, type MaybeElementGetter } from '../shared/index.ts'
import {
  type UseIntersectionObserverOptions,
  useIntersectionObserver,
} from '../useIntersectionObserver/index.ts'

export interface UseElementVisibilityOptions {
  /** Element to observe. Omitted/`null` observes nothing — the getter stays
   * at its initial value forever. A getter target rebinds reactively. */
  target?: MaybeElementGetter
  /** Value before the first observation (and the permanent value under
   * SSR). Default `false`. */
  initialValue?: boolean
  /** `IntersectionObserver` root (`null`/omitted = viewport). */
  root?: MaybeElementGetter
  /** `IntersectionObserver` `rootMargin`. */
  rootMargin?: string
  /** `IntersectionObserver` `threshold`. */
  threshold?: number | number[]
}

export interface UseElementVisibilityReturn {
  /** Reactive visibility getter — read as `{isVisible()}` in templates
   * (parens required). */
  readonly isVisible: () => boolean
}

/**
 * Track whether an element currently intersects its root (the viewport by
 * default). Cleans up with the surrounding effect scope; scopeless callers
 * keep the observer for the page's lifetime (wrap in an `effectScope()` if
 * teardown matters).
 */
export function useElementVisibility(
  options: UseElementVisibilityOptions = {},
): UseElementVisibilityReturn {
  const { initialValue: iv = false } = options
  const { target, root, rootMargin, threshold } = options

  // SSR: static getter of the initial value, no signals, no observer.
  if (!isClient) {
    const isVisible = (): boolean => iv
    return { isVisible }
  }

  const [isVisible, setIsVisible] = signal(iv)

  // Built incrementally (not as an object literal with possibly-undefined
  // properties) — `exactOptionalPropertyTypes` rejects an explicit
  // `undefined` for `root`/`rootMargin`/`threshold` even though all three
  // are optional on `UseIntersectionObserverOptions`.
  const observerOptions: UseIntersectionObserverOptions = {}
  if (root !== undefined) observerOptions.root = root
  if (rootMargin !== undefined) observerOptions.rootMargin = rootMargin
  if (threshold !== undefined) observerOptions.threshold = threshold

  // `useIntersectionObserver` owns the target-rebind effect, the observer
  // instance, and teardown (registered with whatever scope is current
  // right now — the same one this composable would have registered with
  // itself). Only the last-entry -> boolean derivation lives here.
  useIntersectionObserver(
    target,
    (entries) => {
      const entry = entries[entries.length - 1]
      if (entry == null) return
      setIsVisible(entry.isIntersecting)
    },
    observerOptions,
  )

  return { isVisible }
}
