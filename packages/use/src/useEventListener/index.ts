/**
 * `useEventListener` — the foundational `@aihu/use` composable: attach a DOM
 * event listener with automatic cleanup and (for getter targets) reactive
 * rebinding (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Contract (every other listener-based composable builds on this):
 * - **Returns a manual `stop()`** — required for `@aihu/primitives`
 *   consumption and scopeless callers, which have no effect scope to lean
 *   on. `stop()` is idempotent.
 * - **Auto-cleans with the surrounding scope** via `tryOnScopeDispose`, so a
 *   component-scoped call needs no manual teardown.
 * - **Reactive target**: a getter target is tracked in an `effect` whose
 *   per-run `onCleanup` removes the old listener before the re-run adds the
 *   new one — the listener follows the target (e.g. a `$ref` flipping
 *   `null` → element, or a signal read). Caveat: a getter that reads NO
 *   signal (e.g. `() => document.getElementById('x')`) runs once and never
 *   rebinds — it looks reactive but isn't; only signal reads re-trigger it.
 * - **SSR-safe** (the `isClient` no-op invariant): with no DOM — or a static
 *   target that is null — nothing is registered and the returned `stop` is
 *   a no-op.
 */

import { effect } from '@aihu/signals'
import {
  isClient,
  type MaybeElementGetter,
  tryOnScopeDispose,
  unrefElement,
} from '../shared/index.ts'

const noop = (): void => {}

/**
 * Listen for `event` on `target`; returns a manual `stop()` that removes the
 * listener (and disposes the rebinding effect, for getter targets).
 *
 * Overloads (VueUse-mirroring): a `Window`/`Document`/`HTMLElement` target
 * with a known event name types the handler's event from the corresponding
 * DOM event map (`'mousemove'` → `MouseEvent`) — no manual generic or cast.
 * The string-fallback overload covers custom events and union/getter
 * targets (pass the event type explicitly: `useEventListener<MouseEvent>`).
 *
 * @param target  a static `Element`/`Window`/`Document`, or a getter for an
 *                element — getter targets rebind reactively (see module doc;
 *                a getter that reads no signal runs once and never rebinds).
 * @param event   the event type (e.g. `'mousemove'`).
 * @param handler the listener.
 * @param options standard `addEventListener` options.
 */
export function useEventListener<K extends keyof WindowEventMap>(
  target: Window,
  event: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): () => void
export function useEventListener<K extends keyof DocumentEventMap>(
  target: Document,
  event: K,
  handler: (event: DocumentEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): () => void
export function useEventListener<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | (() => HTMLElement | null | undefined),
  event: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
): () => void
export function useEventListener<E extends Event = Event>(
  target: MaybeElementGetter | Window | Document,
  event: string,
  handler: (event: E) => void,
  options?: boolean | AddEventListenerOptions,
): () => void
export function useEventListener(
  target: MaybeElementGetter | Window | Document,
  event: string,
  handler: (event: Event) => void,
  options?: boolean | AddEventListenerOptions,
): () => void {
  // SSR: register NOTHING, return a no-op stop (isClient invariant).
  if (!isClient) return noop

  const listener = handler as EventListener
  let stopped = false
  let disposeEffect: (() => void) | null = null
  let removeStatic: (() => void) | null = null

  if (typeof target === 'function') {
    // Reactive target: the effect tracks the getter; per-run onCleanup
    // removes the previous run's listener, so a target change rebinds
    // (old listener removed, new one added). A null resolution simply
    // registers nothing this run — the effect stays live and binds when
    // the getter later yields an element ($ref null → el).
    disposeEffect = effect((onCleanup) => {
      const el = unrefElement(target)
      if (el == null) return
      el.addEventListener(event, listener, options)
      onCleanup(() => el.removeEventListener(event, listener, options))
    })
  } else {
    // Static target: add/remove directly — no effect needed.
    if (target == null) return noop
    target.addEventListener(event, listener, options)
    removeStatic = () => target.removeEventListener(event, listener, options)
  }

  const stop = (): void => {
    if (stopped) return
    stopped = true
    if (disposeEffect !== null) {
      // Effect dispose drains pending per-run cleanups → removes the
      // currently-bound listener.
      disposeEffect()
      disposeEffect = null
    }
    if (removeStatic !== null) {
      removeStatic()
      removeStatic = null
    }
  }

  // Scope-owned auto-cleanup; no-ops (returns false) for scopeless callers,
  // whose contract is the returned stop().
  tryOnScopeDispose(stop)
  return stop
}
