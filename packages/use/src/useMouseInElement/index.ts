/**
 * `useMouseInElement` — mouse position relative to a target element, plus
 * whether the pointer is currently over it, shadow-DOM correct
 * (docs/plans/2026-07-24-use-categorical-parity.md §3 Elements;
 * docs/plans/2026-07-24-composed-tree-helper.md §6).
 *
 * **Why `isOutside` is NOT pure bounding-box geometry.** The naive approach
 * (`elementX < 0 || elementY < 0 || elementX > width || elementY > height`)
 * only tells you the pointer is over the element's on-screen BOX — it says
 * nothing about whether the actual node under the pointer is really `el`'s
 * (composed) content versus, say, an overlapping sibling drawn on top.
 * `isOutside` is instead driven by {@link isEventInside} — the real
 * `composedPath()` hit test — computed SYNCHRONOUSLY inside the `pointermove`
 * listener, per the substrate's hard constraint (composedPath is only valid
 * DURING dispatch; a deferred read degrades silently back to the broken
 * `event.target` answer). `elementX`/`elementY`/etc. remain plain
 * `getBoundingClientRect()` geometry — that part has no shadow-DOM
 * correctness issue.
 *
 * **`scroll`/`resize` invalidation.** Between pointer moves, a resize or
 * scroll can move the element (or the viewport) without generating a
 * `pointermove`. This composable re-derives `elementX`/`elementY`/
 * `elementPositionX`/`elementPositionY`/`elementWidth`/`elementHeight` (and a
 * GEOMETRIC `isOutside` fallback — no pointer event is available to hit-test
 * against here) from the last known raw `x`/`y` on `scroll`/`resize`. The
 * `isEventInside`-driven `isOutside` is always re-asserted on the next real
 * `pointermove`, so this fallback only covers the gap between events.
 *
 * **Not covered (documented non-goal, matches the design note):**
 * `elementsFromPoint`-based occlusion/z-index awareness does not pierce
 * shadow roots on any engine — that needs its own design, tracked
 * separately, and is out of scope here.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{elementX()}`, never bare `{elementX}`.
 *
 * SSR (`isClient === false`): returns static getters of all-`0`/`isOutside:
 * true` and registers no listener — the `isClient` no-op invariant.
 */

import { batch, effect, signal } from '@aihu/signals'
import { isEventInside } from '../shared/composed-tree.ts'
import {
  defaultWindow,
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'

export interface UseMouseInElementOptions {
  /** Element to measure against. Omitted/`null` (or a getter currently
   * resolving to one) means nothing is ever "inside" — `isOutside()` stays
   * `true` and the element-relative getters stay `0`. A getter target
   * rebinds reactively (see `useEventListener`'s module doc). */
  target?: MaybeElementGetter
}

export interface UseMouseInElementReturn {
  /** Reactive getter — raw viewport `clientX`. */
  readonly x: () => number
  /** Reactive getter — raw viewport `clientY`. */
  readonly y: () => number
  /** Reactive getter — `x()` relative to the target's left edge. */
  readonly elementX: () => number
  /** Reactive getter — `y()` relative to the target's top edge. */
  readonly elementY: () => number
  /** Reactive getter — the target's left edge, document-relative
   * (`rect.left + scrollX`). */
  readonly elementPositionX: () => number
  /** Reactive getter — the target's top edge, document-relative
   * (`rect.top + scrollY`). */
  readonly elementPositionY: () => number
  /** Reactive getter — the target's current `getBoundingClientRect().width`. */
  readonly elementWidth: () => number
  /** Reactive getter — the target's current `getBoundingClientRect().height`. */
  readonly elementHeight: () => number
  /** Reactive getter — `true` when the pointer is NOT currently over the
   * target's composed subtree (see module doc for how this is computed). */
  readonly isOutside: () => boolean
}

/**
 * Track the mouse position relative to `target`. Cleans up with the
 * surrounding effect scope; scopeless callers keep the listeners for the
 * page's lifetime.
 */
export function useMouseInElement(options: UseMouseInElementOptions = {}): UseMouseInElementReturn {
  const { target } = options

  // SSR: static getters, no signals, no listener.
  if (!isClient || defaultWindow === undefined) {
    const zero = (): number => 0
    return {
      x: zero,
      y: zero,
      elementX: zero,
      elementY: zero,
      elementPositionX: zero,
      elementPositionY: zero,
      elementWidth: zero,
      elementHeight: zero,
      isOutside: () => true,
    }
  }

  const win = defaultWindow

  const [x, setX] = signal(0)
  const [y, setY] = signal(0)
  const [elementX, setElementX] = signal(0)
  const [elementY, setElementY] = signal(0)
  const [elementPositionX, setElementPositionX] = signal(0)
  const [elementPositionY, setElementPositionY] = signal(0)
  const [elementWidth, setElementWidth] = signal(0)
  const [elementHeight, setElementHeight] = signal(0)
  const [isOutside, setIsOutside] = signal(true)

  // Last known raw position, for the scroll/resize re-derivation path
  // (no pointer event is available there to hit-test against).
  let lastX = 0
  let lastY = 0

  /** Re-derive every element-relative getter from `(px, py)` against `el`'s
   * CURRENT rect. `outsideFromEvent`, when provided, is the precise
   * composedPath-based answer (only available from inside a live pointer
   * event); omitted, `isOutside` falls back to bounding-box geometry. */
  const deriveFromElement = (
    el: Element,
    px: number,
    py: number,
    outsideFromEvent?: boolean,
  ): void => {
    const rect = el.getBoundingClientRect()
    const relX = px - rect.left
    const relY = py - rect.top
    batch(() => {
      setElementX(relX)
      setElementY(relY)
      setElementPositionX(rect.left + win.scrollX)
      setElementPositionY(rect.top + win.scrollY)
      setElementWidth(rect.width)
      setElementHeight(rect.height)
      setIsOutside(
        outsideFromEvent ?? (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height),
      )
    })
  }

  const disposeEffect = effect((onCleanup) => {
    const el = unrefElement(target)

    const onPointerMove = (e: PointerEvent): void => {
      lastX = e.clientX
      lastY = e.clientY
      batch(() => {
        setX(lastX)
        setY(lastY)
        if (el != null) {
          // Read synchronously against THIS event's own live composedPath —
          // never deferred (see module doc).
          deriveFromElement(el, lastX, lastY, !isEventInside(e, el))
        }
      })
    }
    const onReflow = (): void => {
      if (el != null) deriveFromElement(el, lastX, lastY)
    }

    win.addEventListener('pointermove', onPointerMove)
    win.addEventListener('scroll', onReflow, { passive: true, capture: true })
    win.addEventListener('resize', onReflow)
    onCleanup(() => {
      win.removeEventListener('pointermove', onPointerMove)
      win.removeEventListener('scroll', onReflow, true)
      win.removeEventListener('resize', onReflow)
    })
  })

  const stop = (): void => disposeEffect()
  tryOnScopeDispose(stop)

  return {
    x,
    y,
    elementX,
    elementY,
    elementPositionX,
    elementPositionY,
    elementWidth,
    elementHeight,
    isOutside,
  }
}
