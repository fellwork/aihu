/**
 * `useWindowSize` — reactive `window.innerWidth` / `innerHeight`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{width()}`, never bare `{width}`.
 *
 * SSR (`isClient === false`): returns static getters of the initial value
 * (or a safe default) and registers no listener — the isClient no-op
 * invariant.
 */

import { batch, signal } from '@aihu/signals'
import { defaultWindow, isClient } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

export interface UseWindowSizeOptions {
  /** Width before the first `resize` event (and the permanent value under
   * SSR). Default `0`. */
  initialWidth?: number
  /** Height before the first `resize` event (and the permanent value under
   * SSR). Default `0`. */
  initialHeight?: number
}

export interface UseWindowSizeReturn {
  /** Reactive width getter — read as `{width()}` in templates (parens
   * required). */
  readonly width: () => number
  /** Reactive height getter — read as `{height()}` in templates (parens
   * required). */
  readonly height: () => number
}

/**
 * Track the browser window's inner size. Cleans up with the surrounding
 * effect scope; scopeless callers keep the listener for the page's
 * lifetime (wrap in an `effectScope()` or use `useEventListener` directly
 * if teardown matters).
 */
export function useWindowSize(options: UseWindowSizeOptions = {}): UseWindowSizeReturn {
  const { initialWidth = 0, initialHeight = 0 } = options

  // SSR: static getters of the initial value, no signals, no listener.
  if (!isClient) {
    const width = (): number => initialWidth
    const height = (): number => initialHeight
    return { width, height }
  }

  const win = defaultWindow as Window
  const [width, setWidth] = signal(win.innerWidth)
  const [height, setHeight] = signal(win.innerHeight)

  useEventListener(win, 'resize', () => {
    // Batched: observers see ONE consistent (width, height) update per
    // resize, never an intermediate half-written pair.
    batch(() => {
      setWidth(win.innerWidth)
      setHeight(win.innerHeight)
    })
  })

  return { width, height }
}
