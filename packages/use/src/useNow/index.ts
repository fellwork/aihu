/**
 * `useNow` — reactive current `Date`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{now()}`, never bare `{now}`.
 *
 * Built directly on {@link useIntervalFn} / {@link useRafFn} — both already
 * register their own scope-dispose cleanup, so `useNow` needs no extra
 * `tryOnScopeDispose` call of its own.
 *
 * SSR (`isClient === false`): returns a static `now` getter of a single
 * `Date` snapshotted at call time — registers no timer/frame callback, the
 * isClient no-op invariant.
 */

import { signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'
import { useIntervalFn } from '../useIntervalFn/index.ts'
import { useRafFn } from '../useRafFn/index.ts'

export interface UseNowOptions {
  /** Update cadence: a millisecond interval (default `1000`), or
   * `'requestAnimationFrame'` to update on every frame. */
  interval?: 'requestAnimationFrame' | number
}

export interface UseNowReturn {
  /** Reactive getter — read as `{now()}` in templates (parens required). */
  readonly now: () => Date
}

/**
 * Track the current time as a reactive `Date`. Cleans up with the
 * surrounding effect scope (via the underlying `useIntervalFn`/`useRafFn`).
 */
export function useNow(options: UseNowOptions = {}): UseNowReturn {
  // Snapshot the option to a plain value up front (D8).
  const { interval = 1000 } = options

  // SSR: a single static Date snapshot, no signal, no timer.
  if (!isClient) {
    const initial = new Date()
    const now = (): Date => initial
    return { now }
  }

  const [now, setNow] = signal(new Date())

  if (interval === 'requestAnimationFrame') {
    useRafFn(() => setNow(new Date()))
  } else {
    useIntervalFn(() => setNow(new Date()), interval)
  }

  return { now }
}
