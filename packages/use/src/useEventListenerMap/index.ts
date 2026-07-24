/**
 * `useEventListenerMap` — bind multiple `{event: handler}` pairs to one
 * target with a SINGLE combined `stop()` (solid-primitives'
 * `createEventListenerMap` pattern). Built entirely on top of the existing
 * `useEventListener` — every per-event bind/rebind/cleanup rule (reactive
 * getter targets, SSR no-op, scope auto-cleanup) is inherited unchanged;
 * this file adds no new DOM-facing logic of its own.
 *
 * Naming note: the source pattern (solid-primitives) calls this
 * `createEventListenerMap`. Renamed to `useEventListenerMap` here — `use*`
 * is `@aihu/use`'s reserved prefix (`create*` is reserved for
 * `@aihu/primitives`' scope-less factories), and this composable fully
 * participates in `@aihu/use`'s scope/SSR conventions rather than being a
 * primitives-style scope-less factory.
 *
 * Reactive target: same contract as `useEventListener` — pass a getter
 * (e.g. a `$ref` getter or a signal read) and every entry in `map` rebinds
 * together when the target changes (old target's listeners removed, new
 * target's listeners added).
 */
import type { MaybeElementGetter } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'

/**
 * Bind every `{event: handler}` pair in `map` to `target`; returns a single
 * `stop()` that removes all of them (idempotent).
 *
 * Overloads (mirroring `useEventListener`): a `Window`/`Document`/
 * `HTMLElement` target types `map`'s handlers against the corresponding DOM
 * event map. The string-keyed fallback overload covers custom events and
 * union/getter targets.
 *
 * @param target  a static `Element`/`Window`/`Document`, or a getter for an
 *                element — getter targets rebind reactively (see
 *                `useEventListener`'s module doc).
 * @param map     `{ [event]: handler }` pairs to bind.
 * @param options standard `addEventListener` options, applied to every
 *                entry in `map`.
 */
export function useEventListenerMap<K extends keyof WindowEventMap>(
  target: Window,
  map: Partial<{ [E in K]: (event: WindowEventMap[E]) => void }>,
  options?: boolean | AddEventListenerOptions,
): () => void
export function useEventListenerMap<K extends keyof DocumentEventMap>(
  target: Document,
  map: Partial<{ [E in K]: (event: DocumentEventMap[E]) => void }>,
  options?: boolean | AddEventListenerOptions,
): () => void
export function useEventListenerMap<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | (() => HTMLElement | null | undefined),
  map: Partial<{ [E in K]: (event: HTMLElementEventMap[E]) => void }>,
  options?: boolean | AddEventListenerOptions,
): () => void
export function useEventListenerMap<E extends Event = Event>(
  target: MaybeElementGetter | Window | Document,
  map: Record<string, ((event: E) => void) | undefined>,
  options?: boolean | AddEventListenerOptions,
): () => void
export function useEventListenerMap(
  target: MaybeElementGetter | Window | Document,
  map: Record<string, ((event: Event) => void) | undefined>,
  options?: boolean | AddEventListenerOptions,
): () => void {
  // Runtime dispatch is identical across every overload (string event name +
  // handler); the overloads above exist purely so a caller's map literal is
  // type-checked against the right DOM event-map. Cast to the widest
  // (`Window`) overload signature for the single implementation call — this
  // has no runtime effect (useEventListener itself branches on
  // `typeof target === 'function'` / SSR, not on this static type).
  const stops: Array<() => void> = []
  for (const [event, handler] of Object.entries(map)) {
    if (handler === undefined) continue
    stops.push(useEventListener(target as Window, event, handler, options))
  }

  // NOTE: no separate `tryOnScopeDispose` call here — each `useEventListener`
  // call above already registered its OWN stop with the current scope (or
  // no-op'd if scopeless). Registering the combined stop AGAIN would just
  // double an already-idempotent no-op per entry in the scope's disposer
  // list; the aggregation below exists purely to give the caller ONE handle.
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    for (const stop of stops) stop()
  }
}
