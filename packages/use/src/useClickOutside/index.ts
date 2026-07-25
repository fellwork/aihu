/**
 * `useClickOutside` (alias `onClickOutside`) — fire `handler` when a genuine
 * click starts AND ends outside `target` (and outside every element in
 * `ignore`), shadow-DOM-correct
 * (docs/plans/2026-07-24-use-categorical-parity.md §3 Elements;
 * docs/plans/2026-07-24-composed-tree-helper.md §6).
 *
 * **Why `pointerdown`/`pointerup`, not `click`.** A single `click` handler
 * cannot distinguish "the user pressed down inside `target` (e.g. to select
 * text) and dragged the pointer outside before releasing" from a genuine
 * outside click — both end with the same `click` event outside. Pairing
 * `pointerdown` and `pointerup` and requiring BOTH to be outside is the
 * standard fix (VueUse's `onClickOutside` does the same).
 *
 * **Hard constraint — booleans, not events (composed-tree design note §5c).**
 * `event.composedPath()` is only populated DURING that event's own dispatch;
 * the platform empties it once propagation finishes. `pointerup` always
 * fires strictly after `pointerdown`'s dispatch has completed, so if this
 * composable stored the `pointerdown` EVENT OBJECT and re-read its
 * `composedPath()` later (inside the `pointerup` handler), that read would
 * silently degrade to the broken `event.target` up-walk — precisely the bug
 * class the substrate's header warns about. Every hit test below runs
 * SYNCHRONOUSLY inside its own listener, against ITS OWN live event, and
 * only the resulting BOOLEAN crosses from `onPointerDown` to `onPointerUp`.
 *
 * **Hard constraint — `composedPath().includes(el)`, never `.contains()`.**
 * `event.target` is retargeted UP to the outermost shadow host, so both
 * `el.contains(target)` and a naive composed up-walk from `target` return
 * `false` for a click genuinely inside a nested shadow element. Hit-testing
 * goes through `isEventInside`/`isEventInsideAny`
 * (`../shared/composed-tree.ts`), which reads `composedPath()` instead.
 *
 * Return convention (ratified): unlike most `@aihu/use` composables this one
 * has no reactive state to expose — it mirrors `useEventListener`'s manual
 * `stop()` contract instead.
 *
 * SSR (`isClient === false`): registers nothing and returns a no-op `stop`.
 */

import { isEventInside, isEventInsideAny } from '../shared/composed-tree.ts'
import {
  defaultDocument,
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

const noop = (): void => {}

export interface UseClickOutsideOptions {
  /** Additional elements treated as "inside" — a trigger button, a
   * teleported panel, etc. Getter entries are re-resolved on every pointer
   * event (not cached), so a `$ref` that is `null` at dispatch time is
   * simply skipped that once. */
  ignore?: Iterable<MaybeElementGetter>
  /** `addEventListener` `capture` flag for both the `pointerdown` and
   * `pointerup` document listeners. Default `true` — capture-phase so an
   * inner `stopPropagation()` (e.g. a menu item's own click handler) cannot
   * hide the outside click from this composable. */
  capture?: boolean
}

/**
 * Call `handler` when a pointer gesture (`pointerdown` + matching
 * `pointerup`) both land outside `target` and outside every `ignore` entry.
 * Cleans up with the surrounding effect scope; scopeless callers keep the
 * listeners for the page's lifetime.
 *
 * @param target  the element clicks are measured against. `null`/`undefined`
 *                (or a getter currently resolving to one) means nothing is
 *                ever "inside" — every completed outside gesture fires.
 * @param handler called with the terminating `pointerup` event once both
 *                halves of the gesture are confirmed outside.
 */
export function useClickOutside(
  target: MaybeElementGetter,
  handler: (event: PointerEvent) => void,
  options: UseClickOutsideOptions = {},
): () => void {
  const { ignore = [], capture = true } = options

  // SSR: register nothing, no-op stop (the isClient invariant).
  if (!isClient || defaultDocument === undefined) return noop
  const doc = defaultDocument

  // The ONLY state carried from pointerdown to pointerup — a boolean, never
  // the event (see module doc). `null` means "no pointerdown is pending"
  // (e.g. pointerup fired without a matching pointerdown, or a previous
  // gesture already consumed it), which never fires the handler.
  let pointerDownWasOutside: boolean | null = null

  const isOutside = (event: PointerEvent): boolean => {
    const el = unrefElement(target)
    if (el != null && isEventInside(event, el)) return false
    if (isEventInsideAny(event, mapToElements(ignore))) return false
    return true
  }

  const onPointerDown = (event: PointerEvent): void => {
    // Computed synchronously against THIS event's own (still-live)
    // composedPath — stored as a boolean, immediately.
    pointerDownWasOutside = isOutside(event)
  }

  const onPointerUp = (event: PointerEvent): void => {
    const downWasOutside = pointerDownWasOutside
    pointerDownWasOutside = null
    if (downWasOutside !== true) return
    // Computed synchronously against THIS event's own (still-live)
    // composedPath — never reuses the pointerdown event.
    if (isOutside(event)) handler(event)
  }

  const stopDown = useEventListener<PointerEvent>(doc, 'pointerdown', onPointerDown, capture)
  const stopUp = useEventListener<PointerEvent>(doc, 'pointerup', onPointerUp, capture)

  const stop = (): void => {
    stopDown()
    stopUp()
  }
  tryOnScopeDispose(stop)
  return stop
}

/** Alias — VueUse names this composable `onClickOutside`; both names are
 * exported so callers can use either the house `useX` convention or the
 * upstream-familiar spelling. */
export const onClickOutside = useClickOutside

function* mapToElements(
  ignore: Iterable<MaybeElementGetter>,
): Generator<Element | null | undefined> {
  for (const entry of ignore) yield unrefElement(entry)
}
