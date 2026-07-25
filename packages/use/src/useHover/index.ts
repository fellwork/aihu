/**
 * `useHover` — reactive "is the pointer currently over `target`?", shadow-DOM
 * correct via `pointerover`/`pointerout` hit-testing
 * (docs/plans/2026-07-24-use-categorical-parity.md §3 Elements;
 * docs/plans/2026-07-24-composed-tree-helper.md §6).
 *
 * **Why `pointerover`/`pointerout`, not `pointerenter`/`pointerleave`.**
 * `pointerenter`/`pointerleave` never bubble, so a `document`-level listener
 * would never see them; binding directly to `target` works for a plain
 * light-DOM element but not a `target` that lives inside (or projects
 * across) a shadow boundary the way this composable is required to handle.
 * `pointerover`/`pointerout` bubble AND cross shadow boundaries, at the cost
 * of firing on every descendant transition — hence the `relatedTarget`
 * containment check below, which suppresses the redundant fires between two
 * descendants of the same `target`.
 *
 * **Hit-testing goes through `isEventInside`, never `.contains()`.**
 * `event.target` is retargeted UP to the outermost shadow host, so
 * `target.contains(event.target)` returns `false` for a pointer event that
 * genuinely originated inside a nested shadow child of `target`. Every hit
 * test below reads `event.composedPath()` (via `../shared/composed-tree.ts`)
 * SYNCHRONOUSLY inside its own listener — never stashed for later.
 *
 * **`relatedTarget` containment.** `relatedTarget` is a real, already-
 * resolved `Node` (not something this composable re-derives from a
 * composedPath), so containment against it uses `composedContains` — the
 * up-walk is the documented correct tool for "a node I already have", per
 * that function's own docs. This only degrades if `relatedTarget` itself
 * crossed a DIFFERENT shadow boundary than `target` on the same move (a
 * documented, accepted limitation — not reachable via `composedPath()`).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{isHovering()}`, never bare `{isHovering}`.
 *
 * SSR (`isClient === false`): returns a static `false` getter and registers
 * no listener — the `isClient` no-op invariant.
 */

import { effect, signal } from '@aihu/signals'
import { composedContains, isEventInside } from '../shared/composed-tree.ts'
import {
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'

export interface UseHoverOptions {
  /** Element to watch. Omitted/`null` watches nothing — the getter stays
   * `false` forever. A getter target rebinds reactively (see
   * `useEventListener`'s module doc for the general pattern). */
  target?: MaybeElementGetter
  /** Milliseconds to wait before flipping to `true` after the pointer
   * enters. Default `0` (synchronous). A pending enter is cancelled if the
   * pointer leaves first. */
  delayEnter?: number
  /** Milliseconds to wait before flipping to `false` after the pointer
   * leaves. Default `0` (synchronous). A pending leave is cancelled if the
   * pointer re-enters first. */
  delayLeave?: number
}

export interface UseHoverReturn {
  /** Reactive getter — read as `{isHovering()}` in templates (parens
   * required). */
  readonly isHovering: () => boolean
}

/** Was `relatedTarget` already inside `el`'s composed subtree? `null`/a
 * non-`Node` (e.g. the pointer arrived from outside the document, or
 * `relatedTarget` is unavailable) is never "inside". */
function relatedWasInside(el: Element, relatedTarget: EventTarget | null): boolean {
  return relatedTarget instanceof Node && composedContains(el, relatedTarget)
}

/**
 * Track whether the pointer is currently over `target` (itself or any
 * composed descendant, across shadow boundaries). Cleans up with the
 * surrounding effect scope; scopeless callers keep the listener for the
 * page's lifetime.
 */
export function useHover(options: UseHoverOptions = {}): UseHoverReturn {
  const { target, delayEnter = 0, delayLeave = 0 } = options

  // SSR: static getter, no signal, no listener.
  if (!isClient) {
    const isHovering = (): boolean => false
    return { isHovering }
  }

  const [isHovering, setIsHovering] = signal(false)

  const disposeEffect = effect((onCleanup) => {
    const el = unrefElement(target)
    if (el == null) return

    let enterTimer: ReturnType<typeof setTimeout> | undefined
    let leaveTimer: ReturnType<typeof setTimeout> | undefined
    const clearPending = (): void => {
      if (enterTimer !== undefined) {
        clearTimeout(enterTimer)
        enterTimer = undefined
      }
      if (leaveTimer !== undefined) {
        clearTimeout(leaveTimer)
        leaveTimer = undefined
      }
    }

    const onPointerOver = (e: PointerEvent): void => {
      // Read synchronously against THIS event's own live composedPath.
      if (!isEventInside(e, el)) return
      if (relatedWasInside(el, e.relatedTarget)) return // descendant-to-descendant move
      clearPending()
      if (delayEnter > 0) enterTimer = setTimeout(() => setIsHovering(true), delayEnter)
      else setIsHovering(true)
    }
    const onPointerOut = (e: PointerEvent): void => {
      if (!isEventInside(e, el)) return
      if (relatedWasInside(el, e.relatedTarget)) return // descendant-to-descendant move
      clearPending()
      if (delayLeave > 0) leaveTimer = setTimeout(() => setIsHovering(false), delayLeave)
      else setIsHovering(false)
    }

    const overListener = onPointerOver as EventListener
    const outListener = onPointerOut as EventListener
    el.addEventListener('pointerover', overListener)
    el.addEventListener('pointerout', outListener)
    onCleanup(() => {
      el.removeEventListener('pointerover', overListener)
      el.removeEventListener('pointerout', outListener)
      clearPending()
      setIsHovering(false)
    })
  })

  const stop = (): void => disposeEffect()
  tryOnScopeDispose(stop)

  return { isHovering }
}
