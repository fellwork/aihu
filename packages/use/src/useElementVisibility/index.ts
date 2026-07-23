/**
 * `useElementVisibility` — whether an element is intersecting its viewport
 * (or a custom root) via `IntersectionObserver`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{isVisible()}`, never bare `{isVisible}`.
 *
 * SSR (`isClient === false`): returns a static getter of `false` and
 * registers no observer — the isClient no-op invariant.
 */

import { effect, signal } from '@aihu/signals'
import {
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'

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

  let stopped = false
  let observer: IntersectionObserver | null = null

  // Reactive target: the effect tracks the getter; per-run onCleanup
  // disconnects the previous observer before the re-run observes the new
  // element — the observer follows the target ($ref null → element).
  const disposeEffect = effect((onCleanup) => {
    const el = unrefElement(target)
    if (el == null) return
    // Built incrementally (not as an object literal with possibly-undefined
    // properties) — `exactOptionalPropertyTypes` rejects an explicit
    // `undefined` for `rootMargin`/`threshold` even though both are
    // optional on `IntersectionObserverInit`.
    const init: IntersectionObserverInit = { root: unrefElement(root) ?? null }
    if (rootMargin !== undefined) init.rootMargin = rootMargin
    if (threshold !== undefined) init.threshold = threshold
    observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1]
      if (entry == null) return
      setIsVisible(entry.isIntersecting)
    }, init)
    observer.observe(el)
    onCleanup(() => {
      observer?.disconnect()
      observer = null
    })
  })

  const stop = (): void => {
    if (stopped) return
    stopped = true
    disposeEffect()
  }
  tryOnScopeDispose(stop)

  return { isVisible }
}
