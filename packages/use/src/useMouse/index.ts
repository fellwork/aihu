/**
 * `useMouse` — reactive mouse position: the reference SENSOR composable
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified — every `@aihu/use` composable follows it):
 * **an object of named getters**, signals under the hood.
 *
 * ## Reading composable getters in `.aihu` templates — parens required
 *
 * ```aihu
 * const { x, y } = useMouse()
 * ...
 * <span>{x()} / {y()}</span>   // ✓ reactive — getters are CALLED
 * <span>{x} / {y}</span>       // ✗ renders the getter's SOURCE TEXT
 * ```
 *
 * `state()`-declared names read bare only because the compiler knows them
 * (`SignalMap`); a destructured composable return is not in that map, so a
 * bare `{x}` lowers to `leaf(x)` — the leaf receives the getter FUNCTION
 * itself and the DOM renders its source text. This is the #1 DX gotcha —
 * imported-composable getters are read `{x()}` WITH PARENS, always.
 *
 * SSR (`isClient === false`): returns static getters of the initial value
 * and registers no listener — the no-op invariant.
 */

import { batch, signal } from '@aihu/signals'
import { defaultWindow, isClient, type MaybeElementGetter } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

/** Which coordinate pair to report. */
export type UseMouseCoordType = 'client' | 'page' | 'screen'

export interface UseMouseOptions {
  /** Position before the first `mousemove` (and the permanent value under
   * SSR). Default `{ x: 0, y: 0 }`. Snapshotted at call time — later
   * mutation of the passed object has no effect (keeps SSR and client
   * deterministic). */
  initialValue?: { x: number; y: number }
  /** Listen target. OMITTED (`undefined`) defaults to `window`; an explicit
   * `null` means "nothing" and registers no listener (the ratified
   * null-vs-undefined rule for all sensors). Getter targets rebind
   * reactively (see {@link useEventListener}). */
  target?: MaybeElementGetter | Window | Document
  /** Coordinate system: `clientX/Y` (default), `pageX/Y`, or `screenX/Y`. */
  type?: UseMouseCoordType
}

export interface UseMouseReturn {
  /** Reactive x getter — read as `{x()}` in templates (parens required). */
  readonly x: () => number
  /** Reactive y getter — read as `{y()}` in templates (parens required). */
  readonly y: () => number
}

/**
 * Track the mouse position. Cleans up with the surrounding effect scope;
 * scopeless callers keep the listener for the page's lifetime (wrap in an
 * `effectScope()` or use `useEventListener` directly if teardown matters).
 */
export function useMouse(options: UseMouseOptions = {}): UseMouseReturn {
  // Snapshot the initial value to plain numbers up front so a post-call
  // mutation of the caller's object cannot diverge SSR vs client (D8).
  const { x: ix = 0, y: iy = 0 } = options.initialValue ?? {}
  // Destructuring default: ONLY an omitted/undefined target falls back to
  // window — an explicit `null` stays null and registers nothing (D1, the
  // ratified null-vs-undefined rule; useEventListener's static-null path
  // handles it).
  const { type = 'client', target = defaultWindow } = options

  // SSR: static getters of the initial value, no signals, no listener.
  if (!isClient) {
    const x = (): number => ix
    const y = (): number => iy
    return { x, y }
  }

  const [x, setX] = signal(ix)
  const [y, setY] = signal(iy)
  useEventListener<MouseEvent>(target, 'mousemove', (e) => {
    // Batched: observers see ONE consistent (x, y) update per mousemove,
    // never an intermediate half-written pair.
    batch(() => {
      if (type === 'client') {
        setX(e.clientX)
        setY(e.clientY)
      } else if (type === 'page') {
        setX(e.pageX)
        setY(e.pageY)
      } else {
        setX(e.screenX)
        setY(e.screenY)
      }
    })
  })

  return { x, y }
}
