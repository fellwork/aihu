/**
 * `@aihu/css-engine/runtime/progressive` — runtime fallbacks for the
 * `@supports`-gated progressive features (`anchor:`, `popover:`).
 *
 * This is the **separate** browser sub-export from `cn` (Plan 3 Risk #4
 * size-split): merging the two would blow `cn`'s 1 KB budget. This module
 * carries the heavier positioning code under its own 3 KB row.
 *
 * It is a tiny hand-written floating-ui-style positioning shim — NOT the npm
 * `@floating-ui/dom` package. aihu's thesis is dependency-free / tiny bundles,
 * so the shim is ~2 KB of vanilla DOM math, SHARED by `anchorFallback` and
 * `popoverFallback`. Only loaded when native CSS anchor positioning / the
 * Popover API is unsupported (the engine emits a
 * `/* aihu:progressive-fallback ... *​/` marker the consumer wires to these).
 */

/** Where to place the floating element relative to its anchor. */
export type Placement = 'top' | 'bottom' | 'left' | 'right'

export interface PositionOptions {
  /** Preferred side. Default `'bottom'`. */
  placement?: Placement
  /** Gap between anchor and floating element, in px. Default `4`. */
  offset?: number
  /** Flip to the opposite side if it would overflow the viewport. Default `true`. */
  flip?: boolean
}

const OPPOSITE: Record<Placement, Placement> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
}

/** Compute `{ x, y }` for `floating` placed against `anchor` at `placement`. */
function computeXY(
  anchor: DOMRect,
  floating: { width: number; height: number },
  placement: Placement,
  offset: number,
): { x: number; y: number } {
  switch (placement) {
    case 'top':
      return {
        x: anchor.left + (anchor.width - floating.width) / 2,
        y: anchor.top - floating.height - offset,
      }
    case 'bottom':
      return {
        x: anchor.left + (anchor.width - floating.width) / 2,
        y: anchor.bottom + offset,
      }
    case 'left':
      return {
        x: anchor.left - floating.width - offset,
        y: anchor.top + (anchor.height - floating.height) / 2,
      }
    case 'right':
      return {
        x: anchor.right + offset,
        y: anchor.top + (anchor.height - floating.height) / 2,
      }
  }
}

/** True if a rect at (x, y) with size would overflow the viewport. */
function overflows(x: number, y: number, w: number, h: number): boolean {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return x < 0 || y < 0 || x + w > vw || y + h > vh
}

/**
 * Position `floating` against `anchor` and apply `position: fixed; left/top`.
 * The shared core for both fallbacks. Returns the resolved placement.
 */
export function position(
  anchor: Element,
  floating: HTMLElement,
  opts: PositionOptions = {},
): Placement {
  const placement = opts.placement ?? 'bottom'
  const offset = opts.offset ?? 4
  const flip = opts.flip ?? true

  const aRect = anchor.getBoundingClientRect()
  const fRect = { width: floating.offsetWidth, height: floating.offsetHeight }

  let resolved = placement
  let { x, y } = computeXY(aRect, fRect, resolved, offset)

  // Viewport-collision flip to the opposite side if the preferred one overflows.
  if (flip && overflows(x, y, fRect.width, fRect.height)) {
    const alt = OPPOSITE[resolved]
    const altXY = computeXY(aRect, fRect, alt, offset)
    if (!overflows(altXY.x, altXY.y, fRect.width, fRect.height)) {
      resolved = alt
      x = altXY.x
      y = altXY.y
    }
  }

  floating.style.position = 'fixed'
  floating.style.left = `${Math.round(x)}px`
  floating.style.top = `${Math.round(y)}px`
  return resolved
}

/**
 * Fallback for the `anchor:` feature: position `floating` against `anchor`
 * with JS when native CSS anchor positioning is unsupported. Re-positions on
 * scroll/resize; returns a cleanup function that removes the listeners.
 */
export function anchorFallback(
  anchor: Element,
  floating: HTMLElement,
  opts: PositionOptions = {},
): () => void {
  const update = () => {
    position(anchor, floating, opts)
  }
  update()
  window.addEventListener('scroll', update, { passive: true, capture: true })
  window.addEventListener('resize', update, { passive: true })
  return () => {
    window.removeEventListener('scroll', update, { capture: true } as EventListenerOptions)
    window.removeEventListener('resize', update)
  }
}

/**
 * Portal `el` to a top-layer-emulating container appended to `<body>` with a
 * high z-index. Returns a restore function that moves `el` back to its original
 * parent and removes the container. Used by `popoverFallback` when the native
 * Popover API (and its real top layer) is unavailable.
 */
export function portal(el: HTMLElement): () => void {
  const originalParent = el.parentNode
  const originalNext = el.nextSibling
  const layer = document.createElement('div')
  layer.style.position = 'fixed'
  layer.style.left = '0'
  layer.style.top = '0'
  layer.style.zIndex = '2147483647'
  document.body.appendChild(layer)
  layer.appendChild(el)
  return () => {
    if (originalParent) {
      originalParent.insertBefore(el, originalNext)
    } else {
      el.remove()
    }
    layer.remove()
  }
}

/**
 * Fallback for the `popover:` feature: emulate the Popover API's top layer by
 * portaling `panel` out of the normal flow and positioning it against `anchor`
 * with the SHARED positioning shim (`position`, also used by `anchorFallback`).
 * Returns a cleanup function that tears down the portal + listeners.
 */
export function popoverFallback(
  anchor: Element,
  panel: HTMLElement,
  opts: PositionOptions = {},
): () => void {
  const restore = portal(panel)
  const update = () => {
    position(anchor, panel, opts)
  }
  update()
  window.addEventListener('scroll', update, { passive: true, capture: true })
  window.addEventListener('resize', update, { passive: true })
  return () => {
    window.removeEventListener('scroll', update, { capture: true } as EventListenerOptions)
    window.removeEventListener('resize', update)
    restore()
  }
}
