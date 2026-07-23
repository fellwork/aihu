/**
 * `usePrevious` — track the previous value of a reactive source
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Deliberate divergence from the "object of named getters" convention: this
 * composable returns a single BARE getter (there is only one output value),
 * not `{ previous }` — mirrors how a signal's read half is a bare function.
 *
 * Reading the getter in `.aihu` templates still needs parens: `{previous()}`,
 * never bare `{previous}` (same rule as every other composable getter — see
 * useMouse's module doc for the full explanation).
 *
 * SSR (`isClient === false`): returns a static getter of `undefined` and
 * registers no effect — the `isClient` no-op invariant. `source` is never
 * even called under SSR (nothing to compare it against yet).
 */

import { effect, signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

/** Reactive getter — read as `{previous()}` in templates (parens required). */
export type UsePreviousReturn<T> = () => T | undefined

/**
 * Track the value `source` held BEFORE its most recent change. The initial
 * previous value is `undefined` (there is no "before" the first read).
 *
 * @param source a reactive getter/accessor (e.g. a signal's read half, or
 *               any `() => T` that reads a signal).
 */
export function usePrevious<T>(source: () => T): UsePreviousReturn<T> {
  // SSR: static undefined, no effect, source not called.
  if (!isClient) {
    const previous = (): T | undefined => undefined
    return previous
  }

  const [previous, setPrevious] = signal<T | undefined>(undefined)
  let last: T
  let hasValue = false

  const stop = effect(() => {
    const current = source()
    // Updater form: `last` is a generic `T`, which the compiler cannot
    // statically prove excludes a function type — the same reason
    // `Signal<() => X>` callers must write `setX(() => () => X)` (see
    // signal.ts's `Write<T>` doc). The updater form sidesteps that.
    if (hasValue && !Object.is(current, last)) setPrevious(() => last)
    last = current
    hasValue = true
  })
  tryOnScopeDispose(stop)

  return previous
}
