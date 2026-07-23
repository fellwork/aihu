/**
 * Shared substrate for `@aihu/use` composables — SSR guards, getter
 * unwrapping, and safe scope/mount registration
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §3/§5).
 *
 * The library's SSR-safety model is the **`isClient` no-op invariant**: a
 * composable creates NO effect, listener, or timer when `isClient === false`
 * — it returns static getters / no-op handles instead. That makes every
 * composable safe under the `__ssr` path (which runs the full setup body
 * server-side with zero DOM and bypasses the component scope) without any
 * platform SSR change.
 */

import { getCurrentScope, onScopeDispose } from '@aihu/signals'

/** `true` when a real DOM is available (browser / jsdom); `false` under SSR
 * (Node, Workers). Every composable gates its side effects on this. */
export const isClient = typeof window !== 'undefined' && typeof document !== 'undefined'

/** The global `window`, or `undefined` under SSR. */
export const defaultWindow: Window | undefined = isClient ? window : undefined

/** The global `document`, or `undefined` under SSR. */
export const defaultDocument: Document | undefined = isClient ? document : undefined

/** The global `navigator`, or `undefined` when unavailable (SSR; some
 * embedded runtimes lack it even with a DOM, hence the extra guard). */
export const defaultNavigator: Navigator | undefined =
  isClient && typeof navigator !== 'undefined' ? navigator : undefined

/**
 * A plain value or a zero-arg getter for one. Composable inputs accept this
 * so callers can pass either a constant or the read half of a signal tuple
 * (`const [count] = signal(0)` → pass `count`).
 *
 * Caveat (deliberate): a `T` that is ITSELF a function cannot be passed as a
 * plain value — `toValue` cannot tell it from a getter. Wrap it: `() => fn`.
 */
export type MaybeGetter<T> = T | (() => T)

/**
 * Unwrap a {@link MaybeGetter}: call it if it is a function, else return it
 * as-is.
 *
 * **No tuple detection — by design.** A `[get, set]` signal tuple is
 * structurally an array of functions and undiscriminable from a legitimate
 * array argument, so `toValue` never inspects arrays: a tuple passed here
 * comes back unchanged. Pass the READ half (`tuple[0]`), not the tuple.
 */
export function toValue<T>(v: MaybeGetter<T>): T {
  return typeof v === 'function' ? (v as () => T)() : v
}

/**
 * A composable element target: a static element, nothing, or a getter for
 * one (e.g. a `$ref` getter that flips `null` → element after mount, or a
 * signal read). Getter targets make the composable REACTIVE — it rebinds
 * when the getter's value changes.
 */
export type MaybeElementGetter = Element | null | undefined | (() => Element | null | undefined)

/** Resolve a {@link MaybeElementGetter} to its current element (or nothing). */
export function unrefElement(target: MaybeElementGetter): Element | null | undefined {
  return toValue(target)
}

/**
 * Register `fn` to run when the current effect scope stops — IF one is
 * active. Returns `true` when registered, `false` when there is no active
 * scope (scopeless caller: the composable's manual `stop()` handle is then
 * the only teardown path). This is the safe form of `onScopeDispose` for
 * library code: no dev warning, no reliance on a scope existing.
 *
 * Known growth caveat (D5, deferred): `onScopeDispose` returns no
 * deregistration handle, so a composable that is repeatedly created and
 * manually `stop()`ed inside one long-lived scope accumulates dead
 * (idempotent no-op) closures in the scope's disposer list until the scope
 * itself tears down. Bounded by call count, drained on stop; a future
 * signals enhancement (`onScopeDispose` returning a remover, matching the
 * effect-handle swap-remove) would eliminate it. Do not work around it here.
 */
export function tryOnScopeDispose(fn: () => void): boolean {
  if (getCurrentScope() !== undefined) {
    onScopeDispose(fn)
    return true
  }
  return false
}

/**
 * Run `fn` on the client; no-op under SSR.
 *
 * Interim stub (effect-scope plan §5): `@aihu/use` deliberately does not
 * depend on `@aihu/runtime`, so this cannot defer to the runtime's
 * `onMount`. On the client, component setup runs inside
 * `connectedCallback` — the host is already in the DOM — so running `fn`
 * immediately is correct for the composables in this landing. The
 * runtime-`onMount`-backed version (real post-mount timing, `$ref`s
 * populated) arrives with `useMounted`, the one entry that imports
 * `@aihu/runtime`.
 */
export function tryOnMounted(fn: () => void): void {
  if (isClient) fn()
}
