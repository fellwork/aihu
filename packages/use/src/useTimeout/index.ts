/**
 * `useTimeout` — reactive boolean that flips to `true`, `delay` ms after
 * `start()` (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{ready()}`, never bare `{ready}`.
 *
 * Distinct from the shipped `useTimeoutFn` (which invokes a caller-supplied
 * callback and reports `isPending`): `useTimeout` reports the settled
 * `ready` boolean itself, matching VueUse's `useTimeout`. Built directly on
 * {@link useTimeoutFn}, which already registers its own scope-dispose
 * cleanup, so `useTimeout` needs no extra `tryOnScopeDispose` call of its
 * own.
 *
 * SSR (`isClient === false`): returns a static `ready` getter of `false`
 * and no-op `start`/`stop` — registers no timer, the `isClient` no-op
 * invariant.
 */

import { signal } from '@aihu/signals'
import { isClient } from '../shared/index.ts'
import { useTimeoutFn } from '../useTimeoutFn/index.ts'

export interface UseTimeoutOptions {
  /** Call `start()` immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseTimeoutReturn {
  /** Reactive getter — read as `{ready()}` in templates (parens required).
   * `false` until `delay` ms after the most recent `start()`. */
  readonly ready: () => boolean
  /** (Re)start the timeout, replacing any pending one and resetting
   * `ready` to `false`. No-op after the owning effect scope is disposed. */
  start: () => void
  /** Cancel a pending timeout without flipping `ready`. Idempotent. */
  stop: () => void
}

/**
 * Flip a reactive `ready` boolean to `true`, `delay` ms (default `1000`)
 * after `start()` runs. Cleans up with the surrounding effect scope (via
 * the underlying `useTimeoutFn`).
 */
export function useTimeout(
  delay: number = 1000,
  options: UseTimeoutOptions = {},
): UseTimeoutReturn {
  // Snapshot options to plain values up front (D8).
  const { immediate = true } = options

  // SSR: static getter, no signal, no timer.
  if (!isClient) {
    const ready = (): boolean => false
    return { ready, start: () => {}, stop: () => {} }
  }

  const [ready, setReady] = signal(false)

  const { start: startFn, stop } = useTimeoutFn(() => setReady(true), delay, { immediate: false })

  const start = (): void => {
    setReady(false)
    startFn()
  }

  if (immediate) start()

  return { ready, start, stop }
}
