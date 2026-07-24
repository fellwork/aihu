/**
 * `useTimestamp` — reactive current epoch-ms timestamp
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{timestamp()}`, never bare `{timestamp}`.
 *
 * Distinct from the shipped `useNow` (which returns a `Date`): this returns
 * the raw `number` (`Date.now()`), matching VueUse's `useTimestamp`. Built
 * directly on {@link useIntervalFn} / {@link useRafFn} — both already
 * register their own scope-dispose cleanup, so `useTimestamp` needs no
 * extra `tryOnScopeDispose` call of its own.
 *
 * SSR (`isClient === false`): returns a static `timestamp` getter of a
 * single `Date.now()` snapshot taken at call time, and no-op
 * `pause`/`resume` — registers no timer/frame callback, the `isClient`
 * no-op invariant.
 */

import { signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'
import { useIntervalFn } from '../useIntervalFn/index.ts'
import { useRafFn } from '../useRafFn/index.ts'

export interface UseTimestampOptions {
  /** Update cadence: a millisecond interval (default `1000`), or
   * `'requestAnimationFrame'` to update on every frame. */
  interval?: 'requestAnimationFrame' | number
  /** Start updating immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseTimestampReturn {
  /** Reactive getter — read as `{timestamp()}` in templates (parens
   * required). */
  readonly timestamp: () => number
  /** Stop updating. Idempotent. */
  pause: () => void
  /** (Re)start updating. No-op if already running, or after the owning
   * effect scope is disposed. */
  resume: () => void
}

/**
 * Track the current epoch-ms timestamp (`Date.now()`). Cleans up with the
 * surrounding effect scope (via the underlying `useIntervalFn`/`useRafFn`).
 */
export function useTimestamp(options: UseTimestampOptions = {}): UseTimestampReturn {
  // Snapshot options to plain values up front (D8).
  const { interval = 1000, immediate = true } = options

  // SSR: a single static Date.now() snapshot, no signal, no timer.
  if (!isClient) {
    const initial = Date.now()
    const timestamp = (): number => initial
    return { timestamp, pause: () => {}, resume: () => {} }
  }

  const [timestamp, setTimestamp] = signal(Date.now())

  const controls =
    interval === 'requestAnimationFrame'
      ? useRafFn(() => setTimestamp(Date.now()), { immediate })
      : useIntervalFn(() => setTimestamp(Date.now()), interval, { immediate })

  return { timestamp, pause: controls.pause, resume: controls.resume }
}
