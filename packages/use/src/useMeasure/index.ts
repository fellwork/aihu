/**
 * `useMeasure` — full bounding-rect measurement of an element (`x`, `y`,
 * `width`, `height`, `top`, `right`, `bottom`, `left`), re-measured on every
 * resize via `ResizeObserver`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Complements {@link useElementSize} (width/height only) — reach for this
 * one when a layout needs the element's full box, e.g. positioning a
 * tooltip/popover against a target. Built on `useResizeObserver` (the
 * observers-batch primitive): this file adds no ResizeObserver wiring of
 * its own, only the derived 8-field getters and the `getBoundingClientRect`
 * read for the viewport-relative fields.
 *
 * `width`/`height` come from the `ResizeObserver` entry's box size (honors
 * `box`, matching `useElementSize`); `x`/`y`/`top`/`right`/`bottom`/`left`
 * come from `getBoundingClientRect()` on every resize, since a
 * `ResizeObserverEntry`'s `contentRect`/box-size fields are NOT reliably
 * viewport-relative across engines the way `getBoundingClientRect()` is.
 * Note this only re-measures position on a SIZE change (a `ResizeObserver`
 * firing) — a pure scroll/reposition with no size change (e.g. the page
 * scrolling under a fixed-size element) does not re-trigger a read. Compose
 * with `useEventListener(window, 'scroll', …)` if position-during-scroll
 * tracking is also needed; that's deliberately out of scope here to keep
 * this composable's one job (size-triggered full-rect measurement) narrow.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{width()}`, never bare `{width}`.
 *
 * SSR (`isClient === false`): returns static getters of the initial rect
 * (all `0` by default) and registers no observer — the isClient no-op
 * invariant.
 */

import { batch, signal } from '@aihu/signals'
import { isClient, type MaybeElementGetter } from '../shared/index.ts'
import { useResizeObserver } from '../useResizeObserver/index.ts'

export interface UseMeasureRect {
  x: number
  y: number
  width: number
  height: number
  top: number
  right: number
  bottom: number
  left: number
}

const ZERO_RECT: UseMeasureRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
}

export interface UseMeasureOptions {
  /** Element to observe. Omitted/`null` observes nothing — the getters
   * stay at `initialRect` and never update. A getter target rebinds
   * reactively (see `useResizeObserver`). */
  target?: MaybeElementGetter
  /** Rect before the first observation (and the permanent value under
   * SSR). Default all-`0`. Snapshotted at call time — later mutation of
   * the passed object has no effect. */
  initialRect?: Partial<UseMeasureRect>
  /** Which box `ResizeObserver` reports for `width`/`height`. Default
   * `'content-box'`. Does not affect `x`/`y`/`top`/`right`/`bottom`/`left`
   * — those always come from `getBoundingClientRect()` (see module doc). */
  box?: ResizeObserverBoxOptions
}

export interface UseMeasureReturn {
  /** Reactive getter — read as `{x()}` in templates (parens required).
   * Viewport-relative, from `getBoundingClientRect()`. */
  readonly x: () => number
  /** Reactive getter — viewport-relative `y`. */
  readonly y: () => number
  /** Reactive getter — box width (honors `box`). */
  readonly width: () => number
  /** Reactive getter — box height (honors `box`). */
  readonly height: () => number
  /** Reactive getter — viewport-relative `top`. */
  readonly top: () => number
  /** Reactive getter — viewport-relative `right`. */
  readonly right: () => number
  /** Reactive getter — viewport-relative `bottom`. */
  readonly bottom: () => number
  /** Reactive getter — viewport-relative `left`. */
  readonly left: () => number
}

/**
 * Track an element's full bounding rect. Cleans up with the surrounding
 * effect scope (via the underlying `useResizeObserver`); scopeless callers
 * keep the observer for the page's lifetime.
 */
export function useMeasure(options: UseMeasureOptions = {}): UseMeasureReturn {
  // Snapshot the initial rect to plain numbers up front so a post-call
  // mutation of the caller's object cannot diverge SSR vs client (D8).
  const ir: UseMeasureRect = { ...ZERO_RECT, ...options.initialRect }
  const { target, box = 'content-box' } = options

  // SSR: static getters of the initial rect, no signals, no observer.
  if (!isClient) {
    return {
      x: () => ir.x,
      y: () => ir.y,
      width: () => ir.width,
      height: () => ir.height,
      top: () => ir.top,
      right: () => ir.right,
      bottom: () => ir.bottom,
      left: () => ir.left,
    }
  }

  const [x, setX] = signal(ir.x)
  const [y, setY] = signal(ir.y)
  const [width, setWidth] = signal(ir.width)
  const [height, setHeight] = signal(ir.height)
  const [top, setTop] = signal(ir.top)
  const [right, setRight] = signal(ir.right)
  const [bottom, setBottom] = signal(ir.bottom)
  const [left, setLeft] = signal(ir.left)

  // `useResizeObserver` already registers ITS OWN `stop` with the current
  // scope (or no-ops if scopeless) — no separate `tryOnScopeDispose` call
  // needed here (same note as `useEventListenerMap`: this file adds no new
  // DOM-facing teardown of its own).
  useResizeObserver(
    target,
    (entries) => {
      const entry = entries[0]
      if (entry == null) return
      // `entry.target` is the actual observed element — reading the rect
      // off it rather than re-resolving `target` avoids any question of
      // which element a reactive getter target currently points to.
      const rect = entry.target.getBoundingClientRect()
      const boxSize = box === 'border-box' ? entry.borderBoxSize?.[0] : entry.contentBoxSize?.[0]
      // Batched: observers see ONE consistent 8-field update per resize,
      // never an intermediate half-written rect.
      batch(() => {
        setX(rect.x)
        setY(rect.y)
        setTop(rect.top)
        setRight(rect.right)
        setBottom(rect.bottom)
        setLeft(rect.left)
        if (boxSize != null) {
          setWidth(boxSize.inlineSize)
          setHeight(boxSize.blockSize)
        } else {
          // Fallback for engines that don't populate box-size arrays.
          setWidth(entry.contentRect.width)
          setHeight(entry.contentRect.height)
        }
      })
    },
    { box },
  )

  return { x, y, width, height, top, right, bottom, left }
}
