/**
 * `useDebounced` — derive a debounced signal from a reactive `source`
 * getter (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{value()}`, never bare `{value}`.
 *
 * SSR (`isClient === false`): returns a static getter of `source()` read
 * once at call time — registers no timer/effect, the isClient no-op
 * invariant.
 */

import { effect, signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseDebouncedReturn<T> {
  /** Reactive getter — read as `{value()}` in templates (parens required). */
  readonly value: () => T
}

/**
 * Track `source()`, but only propagate a new value after it has been stable
 * for `delay` ms (trailing edge). Cleans up with the surrounding effect
 * scope; scopeless callers keep tracking `source` for the page's lifetime.
 */
export function useDebounced<T>(source: () => T, delay: number = 200): UseDebouncedReturn<T> {
  // SSR: static getter of a single source() read, no signal, no timer.
  if (!isClient) {
    const initial = source()
    const value = (): T => initial
    return { value }
  }

  const [value, setValue] = signal(source())
  let handle: ReturnType<typeof setTimeout> | undefined
  // The effect's own creation run must not arm a debounce timer — it only
  // re-observes the value `signal()` was already seeded with above, and
  // scheduling there would fire a spurious trailing re-set of that same
  // value. Skipping it here means creation registers reactive tracking and
  // nothing else; the first REAL change arms the trailing edge normally.
  // (Same pattern as useThrottle's creation-run guard.)
  let isFirstRun = true

  const clearPending = (): void => {
    if (handle === undefined) return
    clearTimeout(handle)
    handle = undefined
  }

  // Tracks every signal `source` reads; each re-run replaces the pending
  // timer, so only the value that survives `delay` ms unchanged propagates.
  const disposeEffect = effect(() => {
    const next = source()
    if (isFirstRun) {
      isFirstRun = false
      return
    }
    clearPending()
    handle = setTimeout(() => {
      handle = undefined
      // Functional-updater form: `T` is generic and unconstrained, so a
      // bare `next` is ambiguous against `Write<T>`'s updater overload when
      // `T` could itself be a function — wrapping sidesteps that (signal.ts
      // `Write<T>` doc).
      setValue(() => next)
    }, delay)
  })

  const stop = (): void => {
    clearPending()
    disposeEffect()
  }
  tryOnScopeDispose(stop)

  return { value }
}
