/**
 * `useThrottle` — derive a throttled signal from a reactive `source` getter
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
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

export interface UseThrottleReturn<T> {
  /** Reactive getter — read as `{value()}` in templates (parens required). */
  readonly value: () => T
}

/**
 * Track `source()`, updating at most once per `delay` ms: the first change
 * in a window propagates immediately (leading edge), and any change that
 * arrives before the window elapses is flushed once at the window's end
 * (trailing edge) — no update is ever dropped.
 *
 * Cleans up with the surrounding effect scope; scopeless callers keep
 * tracking `source` for the page's lifetime.
 */
export function useThrottle<T>(source: () => T, delay: number = 200): UseThrottleReturn<T> {
  // SSR: static getter of a single source() read, no signal, no timer.
  if (!isClient) {
    const initial = source()
    const value = (): T => initial
    return { value }
  }

  const [value, setValue] = signal(source())
  let handle: ReturnType<typeof setTimeout> | undefined
  let lastRun = 0
  let pending: { next: T } | undefined
  // The effect's own creation run must not consume the leading-edge slot —
  // it only re-observes the value `signal()` was already seeded with above.
  // Skipping it here means the first REAL change (even one arriving within
  // `delay` ms of creation) still gets the immediate leading-edge path.
  let isFirstRun = true

  const flush = (): void => {
    handle = undefined
    lastRun = Date.now()
    if (pending !== undefined) {
      const { next } = pending
      pending = undefined
      // Functional-updater form — see useDebounced for why a bare `next`
      // is ambiguous against `Write<T>` for a generic, unconstrained `T`.
      setValue(() => next)
    }
  }

  // Tracks every signal `source` reads. Within a still-open window the
  // latest value is stashed as `pending` and flushed once the window ends;
  // a change once the window has elapsed applies immediately and opens the
  // next window.
  const disposeEffect = effect(() => {
    const next = source()
    if (isFirstRun) {
      isFirstRun = false
      return
    }
    const now = Date.now()
    const elapsed = now - lastRun
    if (elapsed >= delay) {
      lastRun = now
      // Functional-updater form — see the note in flush() above.
      setValue(() => next)
    } else {
      pending = { next }
      if (handle === undefined) {
        handle = setTimeout(flush, delay - elapsed)
      }
    }
  })

  const stop = (): void => {
    if (handle !== undefined) {
      clearTimeout(handle)
      handle = undefined
    }
    disposeEffect()
  }
  tryOnScopeDispose(stop)

  return { value }
}
