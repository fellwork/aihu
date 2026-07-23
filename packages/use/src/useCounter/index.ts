/**
 * `useCounter` — a reactive numeric counter clamped to an optional
 * `[min, max]` range (docs/plans/2026-07-22-effect-scope-and-composables.md
 * §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{count()}`, never bare `{count}`.
 *
 * SSR (`isClient === false`): returns a static getter of the (clamped)
 * initial value and no-op mutators — no signal is created, matching the
 * `isClient` no-op invariant (there is no listener/timer/observer here
 * either way; the SSR branch exists only to skip the signal allocation).
 */

import { signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'

export interface UseCounterOptions {
  /** Starting value. Default `0`. Clamped to `[min, max]` at call time. */
  initial?: number
  /** Inclusive lower bound. Default `-Infinity` (no lower bound). */
  min?: number
  /** Inclusive upper bound. Default `Infinity` (no upper bound). */
  max?: number
}

export interface UseCounterReturn {
  /** Reactive getter — read as `{count()}` in templates (parens required). */
  readonly count: () => number
  /** Increment by `delta` (default `1`), clamped to `max`. */
  readonly inc: (delta?: number) => void
  /** Decrement by `delta` (default `1`), clamped to `min`. */
  readonly dec: (delta?: number) => void
  /** Set to an explicit value, clamped to `[min, max]`. */
  readonly set: (value: number) => void
  /** Reset back to the (clamped) initial value. */
  readonly reset: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * A numeric counter with increment/decrement/set/reset, clamped to an
 * optional `[min, max]` range.
 */
export function useCounter(options: UseCounterOptions = {}): UseCounterReturn {
  // Snapshot options to plain values up front so a post-call mutation of the
  // caller's object cannot diverge SSR vs client (D8).
  const { initial = 0, min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = options
  const clampedInitial = clamp(initial, min, max)

  // SSR: static getter of the initial value, no signal, no-op mutators.
  if (!isClient) {
    const count = (): number => clampedInitial
    return { count, inc: () => {}, dec: () => {}, set: () => {}, reset: () => {} }
  }

  const [count, setCount] = signal(clampedInitial)

  const set = (value: number): void => {
    setCount(clamp(value, min, max))
  }
  const inc = (delta = 1): void => {
    setCount((prev: number) => clamp(prev + delta, min, max))
  }
  const dec = (delta = 1): void => {
    setCount((prev: number) => clamp(prev - delta, min, max))
  }
  const reset = (): void => {
    setCount(clampedInitial)
  }

  return { count, inc, dec, set, reset }
}
