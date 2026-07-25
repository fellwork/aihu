/**
 * `useInterval` — reactive tick counter, incremented every `interval` ms
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{counter()}`, never bare `{counter}`.
 *
 * Distinct from the shipped `useIntervalFn` (which invokes a caller-supplied
 * callback on each tick): `useInterval` owns its own counter state and
 * increments it itself, matching VueUse's `useInterval`. Built directly on
 * {@link useIntervalFn}, which already registers its own scope-dispose
 * cleanup, so `useInterval` needs no extra `tryOnScopeDispose` call of its
 * own.
 *
 * SSR (`isClient === false`): returns a static `counter` getter of `0`, a
 * no-op `reset`, and no-op `pause`/`resume` — registers no timer, the
 * `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'
import { useIntervalFn } from '../useIntervalFn/index.ts'

export interface UseIntervalOptions {
  /** Start ticking immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseIntervalReturn {
  /** Reactive getter — read as `{counter()}` in templates (parens
   * required). */
  readonly counter: () => number
  /** Reset the counter back to `0`. Does not pause/resume ticking. */
  reset: () => void
  /** Stop ticking. Idempotent. */
  pause: () => void
  /** (Re)start ticking. No-op if already running, or after the owning
   * effect scope is disposed. */
  resume: () => void
}

/**
 * A counter that increments by `1` every `interval` ms (default `1000`).
 * Cleans up with the surrounding effect scope (via the underlying
 * `useIntervalFn`).
 */
export function useInterval(
  interval: number = 1000,
  options: UseIntervalOptions = {},
): UseIntervalReturn {
  // Snapshot options to plain values up front (D8).
  const { immediate = true } = options

  // SSR: static getter, no signal, no timer.
  if (!isClient) {
    const counter = (): number => 0
    return { counter, reset: () => {}, pause: () => {}, resume: () => {} }
  }

  const [counter, setCounter] = signal(0)
  const reset = (): void => setCounter(0)

  const { pause, resume } = useIntervalFn(() => setCounter((c: number) => c + 1), interval, {
    immediate,
  })

  return { counter, reset, pause, resume }
}
