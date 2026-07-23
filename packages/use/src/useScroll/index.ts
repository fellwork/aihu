/**
 * `useScroll` — reactive scroll position of an element or `window`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5). Position
 * only — no router coupling.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{x()}`, never bare `{x}`.
 *
 * SSR (`isClient === false`): returns static getters of the initial value
 * (or a safe default) and registers no listener — the isClient no-op
 * invariant.
 */

import { batch, signal } from '@aihu/signals'
import { defaultWindow, isClient, type MaybeElementGetter, unrefElement } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

export interface UseScrollOptions {
  /** Scroll container. OMITTED (`undefined`) defaults to `window`; an
   * explicit `null` means "nothing" and registers no listener (the
   * ratified null-vs-undefined rule for all sensors). Getter targets
   * rebind reactively (see {@link useEventListener}). */
  target?: MaybeElementGetter | Window
  /** Position before the first `scroll` event (and the permanent value
   * under SSR). Default `{ x: 0, y: 0 }`. Snapshotted at call time — later
   * mutation of the passed object has no effect. */
  initialValue?: { x: number; y: number }
}

export interface UseScrollReturn {
  /** Reactive x getter — read as `{x()}` in templates (parens required). */
  readonly x: () => number
  /** Reactive y getter — read as `{y()}` in templates (parens required). */
  readonly y: () => number
}

/**
 * Duck-typed `Window` check — `instanceof Window` is unreliable across
 * realms (jsdom's `window` fails it in tests), so detect the shape
 * (`document` + `scrollX`) instead of the class.
 */
function isWindowTarget(target: unknown): target is Window {
  return (
    typeof target === 'object' && target !== null && 'document' in target && 'scrollX' in target
  )
}

/**
 * Track the scroll position of `window` or an element. Cleans up with the
 * surrounding effect scope; scopeless callers keep the listener for the
 * page's lifetime (wrap in an `effectScope()` or use `useEventListener`
 * directly if teardown matters).
 */
export function useScroll(options: UseScrollOptions = {}): UseScrollReturn {
  // Snapshot the initial value to plain numbers up front so a post-call
  // mutation of the caller's object cannot diverge SSR vs client (D8).
  const { x: ix = 0, y: iy = 0 } = options.initialValue ?? {}
  // Destructuring default: ONLY an omitted/undefined target falls back to
  // window — an explicit `null` stays null and registers nothing (D1).
  const { target = defaultWindow } = options

  // SSR: static getters of the initial value, no signals, no listener.
  if (!isClient) {
    const x = (): number => ix
    const y = (): number => iy
    return { x, y }
  }

  const [x, setX] = signal(ix)
  const [y, setY] = signal(iy)

  const read = (): void => {
    // Batched: observers see ONE consistent (x, y) update per scroll,
    // never an intermediate half-written pair.
    batch(() => {
      if (isWindowTarget(target)) {
        setX(target.scrollX)
        setY(target.scrollY)
        return
      }
      const el = unrefElement(target)
      if (el == null) return
      setX(el.scrollLeft)
      setY(el.scrollTop)
    })
  }

  useEventListener(target as MaybeElementGetter | Window, 'scroll', read, { passive: true })

  return { x, y }
}
