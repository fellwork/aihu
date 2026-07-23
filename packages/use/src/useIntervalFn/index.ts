/**
 * `useIntervalFn` — call `callback` every `interval` ms
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{isActive()}`, never bare `{isActive}`.
 *
 * SSR (`isClient === false`): returns a static `isActive` getter of `false`
 * and no-op `pause`/`resume` — registers no timer, the isClient no-op
 * invariant.
 */

import { signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseIntervalFnOptions {
  /** Start the interval immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseIntervalFnReturn {
  /** Reactive getter — read as `{isActive()}` in templates (parens required). */
  readonly isActive: () => boolean
  /** Stop the interval. Idempotent. */
  pause: () => void
  /** (Re)start the interval. No-op if already running. */
  resume: () => void
}

/**
 * Repeatedly call `callback` every `interval` ms. Cleans up with the
 * surrounding effect scope; scopeless callers keep the interval running for
 * the page's lifetime unless they call the returned `pause()` themselves.
 */
export function useIntervalFn(
  callback: () => void,
  interval: number = 1000,
  options: UseIntervalFnOptions = {},
): UseIntervalFnReturn {
  // Snapshot options to plain values up front (D8 — never let a later
  // mutation of a caller-owned object diverge SSR vs client).
  const { immediate = true } = options

  // SSR: static getter, no signal, no timer.
  if (!isClient) {
    const isActive = (): boolean => false
    return { isActive, pause: () => {}, resume: () => {} }
  }

  const [isActive, setIsActive] = signal(false)
  let handle: ReturnType<typeof setInterval> | undefined

  const pause = (): void => {
    if (handle === undefined) return
    clearInterval(handle)
    handle = undefined
    setIsActive(false)
  }

  const resume = (): void => {
    if (handle !== undefined) return
    setIsActive(true)
    handle = setInterval(callback, interval)
  }

  tryOnScopeDispose(pause)

  if (immediate) resume()

  return { isActive, pause, resume }
}
