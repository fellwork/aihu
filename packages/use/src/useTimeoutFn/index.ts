/**
 * `useTimeoutFn` — call `callback` once, `delay` ms after `start()`
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{isPending()}`, never bare `{isPending}`.
 *
 * SSR (`isClient === false`): returns a static `isPending` getter of
 * `false` and no-op `start`/`stop` — registers no timer, the isClient
 * no-op invariant.
 */

import { signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseTimeoutFnOptions {
  /** Call `start()` immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseTimeoutFnReturn {
  /** Reactive getter — read as `{isPending()}` in templates (parens required). */
  readonly isPending: () => boolean
  /** (Re)start the timeout, replacing any pending one. No-op after the
   * owning effect scope is disposed. */
  start: () => void
  /** Cancel a pending timeout. Idempotent; no-op if none pending. */
  stop: () => void
}

/**
 * Call `callback` once, `delay` ms after `start()` runs. Cleans up with the
 * surrounding effect scope; scopeless callers keep the pending timer alive
 * unless they call the returned `stop()` themselves.
 */
export function useTimeoutFn(
  callback: () => void,
  delay: number = 1000,
  options: UseTimeoutFnOptions = {},
): UseTimeoutFnReturn {
  // Snapshot options to plain values up front (D8 — never let a later
  // mutation of a caller-owned object diverge SSR vs client).
  const { immediate = true } = options

  // SSR: static getter, no signal, no timer.
  if (!isClient) {
    const isPending = (): boolean => false
    return { isPending, start: () => {}, stop: () => {} }
  }

  const [isPending, setIsPending] = signal(false)
  let handle: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const stop = (): void => {
    if (handle === undefined) return
    clearTimeout(handle)
    handle = undefined
    setIsPending(false)
  }

  const start = (): void => {
    // A still-referenced start() must not re-arm the timeout (and fire
    // state updates) once the owning scope tore down.
    if (disposed) return
    stop()
    setIsPending(true)
    handle = setTimeout(() => {
      handle = undefined
      setIsPending(false)
      callback()
    }, delay)
  }

  tryOnScopeDispose(() => {
    disposed = true
    stop()
  })

  if (immediate) start()

  return { isPending, start, stop }
}
