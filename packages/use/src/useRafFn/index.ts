/**
 * `useRafFn` — call `callback` on every `requestAnimationFrame` tick
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{isActive()}`, never bare `{isActive}`.
 *
 * SSR (`isClient === false`): returns a static `isActive` getter of `false`
 * and no-op `pause`/`resume` — registers no frame callback, the isClient
 * no-op invariant.
 */

import { signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseRafFnCallbackArgs {
  /** Milliseconds elapsed since the previous frame (`0` on the first). */
  delta: number
  /** The frame's `DOMHighResTimeStamp`, as passed to `requestAnimationFrame`. */
  timestamp: number
}

export interface UseRafFnOptions {
  /** Start the rAF loop immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseRafFnReturn {
  /** Reactive getter — read as `{isActive()}` in templates (parens required). */
  readonly isActive: () => boolean
  /** Cancel the pending frame and stop the loop. Idempotent. */
  pause: () => void
  /** (Re)start the loop. No-op if already running, or after the owning
   * effect scope is disposed. */
  resume: () => void
}

/**
 * Run `callback` on every animation frame until paused. Cleans up with the
 * surrounding effect scope; scopeless callers keep the loop running for the
 * page's lifetime unless they call the returned `pause()` themselves.
 */
export function useRafFn(
  callback: (args: UseRafFnCallbackArgs) => void,
  options: UseRafFnOptions = {},
): UseRafFnReturn {
  // Snapshot options to plain values up front (D8 — never let a later
  // mutation of a caller-owned object diverge SSR vs client).
  const { immediate = true } = options

  // SSR: static getter, no signal, no frame callback.
  if (!isClient) {
    const isActive = (): boolean => false
    return { isActive, pause: () => {}, resume: () => {} }
  }

  const [isActive, setIsActive] = signal(false)
  let handle: number | undefined
  let previousTimestamp: number | undefined
  let disposed = false

  const loop = (timestamp: number): void => {
    // Reschedule BEFORE invoking the callback: if the callback calls
    // pause() (the canonical "stop when the animation finishes" pattern),
    // pause() cancels THIS frame's already-scheduled successor and clears
    // `handle` — so the loop actually stops. Rescheduling after the
    // callback would let pause() cancel only the just-finished frame's
    // (no-op) id, leaving the loop running forever underneath a
    // `isActive() === false` read.
    handle = requestAnimationFrame(loop)
    const delta = previousTimestamp === undefined ? 0 : timestamp - previousTimestamp
    previousTimestamp = timestamp
    callback({ delta, timestamp })
  }

  const pause = (): void => {
    if (handle === undefined) return
    cancelAnimationFrame(handle)
    handle = undefined
    previousTimestamp = undefined
    setIsActive(false)
  }

  const resume = (): void => {
    // A still-referenced resume() must not re-arm the frame loop (and fire
    // state updates) once the owning scope tore down.
    if (disposed) return
    if (handle !== undefined) return
    setIsActive(true)
    handle = requestAnimationFrame(loop)
  }

  tryOnScopeDispose(() => {
    disposed = true
    pause()
  })

  if (immediate) resume()

  return { isActive, pause, resume }
}
