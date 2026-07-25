/**
 * `useFocusWithin` — whether focus currently lives inside a target element
 * (self or any descendant), via `focusin`/`focusout`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{focused()}`, never bare `{focused}`.
 *
 * **Shadow-DOM caveat (read before using across a shadow boundary):**
 * `focusin`/`focusout` bubble and cross shadow boundaries, but the
 * platform RETARGETS `event.target` to the shadow HOST at each boundary —
 * so a naive `event.target === el` check misidentifies which element
 * actually received focus. This composable reads `event.composedPath()[0]`
 * instead, which is the TRUE originally-focused node regardless of
 * retargeting.
 *
 * That said, containment is still checked with `Element.contains()`,
 * which is LIGHT-DOM ONLY — it does not walk into shadow trees the way the
 * composed tree does. Concretely: `useFocusWithin({ target: () => host })`
 * correctly reports focus moving in/out of light-DOM descendants of
 * `host` (including elements slotted INTO one of `host`'s own shadow
 * trees) but WILL NOT detect focus landing on an element that lives
 * inside `host`'s shadow tree without ever being a light-DOM child of
 * `host` (a plain internal shadow node, not slotted content) as "within".
 * `@aihu/primitives`' `composed-tree.ts` (`composedContains`) solves this
 * correctly — CORE `@aihu/use` cannot import it (signals-only), so this is
 * flagged rather than forced: a caller that needs full composed-tree
 * correctness for a shadow-heavy target should look to `@aihu/primitives`
 * instead of this composable.
 *
 * SSR (`isClient === false`): returns a static `focused` getter of `false`
 * and registers no listener — the isClient no-op invariant.
 */

import { effect, signal } from '@aihu/signals'
import {
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'

export interface UseFocusWithinOptions {
  /** Element to watch. Omitted/`null` watches nothing — the getter stays
   * `false` forever. A getter target rebinds reactively (see
   * `useEventListener`'s module doc for the general pattern). */
  target?: MaybeElementGetter
}

export interface UseFocusWithinReturn {
  /** Reactive getter — read as `{focused()}` in templates (parens
   * required). `true` while focus is on the target itself or any
   * (light-DOM-reachable) descendant — see module doc for the shadow-DOM
   * containment caveat. */
  readonly focused: () => boolean
}

/**
 * Track whether focus is currently inside `target` (itself or a
 * descendant). Cleans up with the surrounding effect scope; scopeless
 * callers keep the listeners for the page's lifetime.
 */
export function useFocusWithin(options: UseFocusWithinOptions = {}): UseFocusWithinReturn {
  const { target } = options

  // SSR: static getter, no signal, no listener.
  if (!isClient) {
    const focused = (): boolean => false
    return { focused }
  }

  const [focused, setFocused] = signal(false)

  // Reactive target: the effect tracks the getter; per-run onCleanup
  // removes the previous element's listeners before the re-run binds the
  // new one — mirrors useEventListener/useElementSize's rebind pattern.
  const disposeEffect = effect((onCleanup) => {
    const el = unrefElement(target)
    if (el == null) return

    const onFocusIn = (e: FocusEvent): void => {
      // See module doc: composedPath()[0] is the real focused node, not
      // the (possibly shadow-retargeted) `e.target`.
      const real = e.composedPath()[0]
      if (real instanceof Node && el.contains(real)) setFocused(true)
    }
    const onFocusOut = (e: FocusEvent): void => {
      // The element about to receive focus (or `null` if focus is
      // leaving the document entirely, e.g. to the browser chrome).
      const incoming = e.relatedTarget
      if (!(incoming instanceof Node) || !el.contains(incoming)) setFocused(false)
    }

    // `Element`'s `addEventListener` overloads are keyed off `ElementEventMap`,
    // which doesn't carry `focusin`/`focusout` (those live on
    // `HTMLElementEventMap`/`DocumentEventMap`, not the base `Element` map) —
    // cast to `EventListener`, same pattern as `useEventListener`.
    const focusInListener = onFocusIn as EventListener
    const focusOutListener = onFocusOut as EventListener
    el.addEventListener('focusin', focusInListener)
    el.addEventListener('focusout', focusOutListener)
    onCleanup(() => {
      el.removeEventListener('focusin', focusInListener)
      el.removeEventListener('focusout', focusOutListener)
    })
  })

  const stop = (): void => disposeEffect()
  tryOnScopeDispose(stop)

  return { focused }
}
