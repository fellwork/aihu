/**
 * `useElementSize` — reactive content size of an element via
 * `ResizeObserver` (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{width()}`, never bare `{width}`.
 *
 * REFACTORED (Wave 1a review): this is now the consumer-shaped wrapper
 * built ON TOP OF the general {@link useResizeObserver} sensor (mirrors the
 * `useReducedMotion` -> `usePreferredReducedMotion` precedent) — the raw
 * observer construction, target-rebind effect, and teardown all live in
 * `useResizeObserver` exactly once; this file only derives `width()`/
 * `height()` from the entries it receives.
 *
 * SSR (`isClient === false`): returns static getters of the initial size
 * (or a safe default) and registers no observer — the isClient no-op
 * invariant.
 */

import { batch, signal } from '@aihu/signals'
import { isClient, type MaybeElementGetter } from '../shared/index.ts'
import { useResizeObserver } from '../useResizeObserver/index.ts'

export interface UseElementSizeOptions {
  /** Element to observe. Omitted/`null` observes nothing — the getters stay
   * at `initialSize` and never update. A getter target rebinds reactively
   * (the observer moves to the new element when the getter's tracked signal
   * changes), mirroring {@link useElementSize}'s sibling sensors. */
  target?: MaybeElementGetter
  /** Size before the first observation (and the permanent value under
   * SSR). Default `{ width: 0, height: 0 }`. Snapshotted at call time —
   * later mutation of the passed object has no effect. */
  initialSize?: { width: number; height: number }
  /** Which box `ResizeObserver` reports. Default `'content-box'`. */
  box?: ResizeObserverBoxOptions
}

export interface UseElementSizeReturn {
  /** Reactive width getter — read as `{width()}` in templates (parens
   * required). */
  readonly width: () => number
  /** Reactive height getter — read as `{height()}` in templates (parens
   * required). */
  readonly height: () => number
}

/**
 * Track an element's content (or border) box size. Cleans up with the
 * surrounding effect scope; scopeless callers keep the observer for the
 * page's lifetime (wrap in an `effectScope()` if teardown matters).
 */
export function useElementSize(options: UseElementSizeOptions = {}): UseElementSizeReturn {
  // Snapshot the initial size to plain numbers up front so a post-call
  // mutation of the caller's object cannot diverge SSR vs client (D8).
  const { width: iw = 0, height: ih = 0 } = options.initialSize ?? {}
  const { target, box = 'content-box' } = options

  // SSR: static getters of the initial size, no signals, no observer.
  if (!isClient) {
    const width = (): number => iw
    const height = (): number => ih
    return { width, height }
  }

  const [width, setWidth] = signal(iw)
  const [height, setHeight] = signal(ih)

  // `useResizeObserver` owns the target-rebind effect, the observer
  // instance, and teardown (registered with whatever scope is current
  // right now — the same one this composable would have registered with
  // itself). Only the box-size derivation lives here.
  useResizeObserver(
    target,
    (entries) => {
      const entry = entries[0]
      if (entry == null) return
      // Batched: observers see ONE consistent (width, height) update per
      // resize, never an intermediate half-written pair.
      batch(() => {
        const boxSize = box === 'border-box' ? entry.borderBoxSize : entry.contentBoxSize
        const size = boxSize?.[0]
        if (size != null) {
          setWidth(size.inlineSize)
          setHeight(size.blockSize)
        } else {
          // Fallback for engines that don't populate box-size arrays.
          setWidth(entry.contentRect.width)
          setHeight(entry.contentRect.height)
        }
      })
    },
    { box },
  )

  return { width, height }
}
