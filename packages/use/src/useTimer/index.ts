/**
 * `useTimer` — a count-UP elapsed-time timer with pause/resume
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{elapsed()}`, never bare `{elapsed}`.
 *
 * Elapsed time is tracked as a wall-clock delta (`Date.now()` at each
 * `start()`/`resume()`, accumulated across pauses) rather than a naive tick
 * count, so `elapsed()` stays correct even if the tab is throttled/backgrounded
 * and ticks are delayed or dropped. `interval` only controls how often the
 * reactive getter is refreshed, not the timer's accuracy.
 *
 * SSR (`isClient === false`): returns a static `elapsed` getter of `0`, a
 * static `isRunning` getter of `false`, and no-op controls — registers no
 * timer, the `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseTimerOptions {
  /** How often (ms) the reactive `elapsed` getter is refreshed while
   * running. Default `1000`. Lower values give smoother display at the
   * cost of more ticks. */
  interval?: number
}

export interface UseTimerReturn {
  /** Reactive getter — read as `{elapsed()}` in templates (parens
   * required). Milliseconds elapsed since `start()`, minus paused time. */
  readonly elapsed: () => number
  /** Reactive getter — read as `{isRunning()}` in templates (parens
   * required). */
  readonly isRunning: () => boolean
  /** Reset `elapsed` to `0` and (re)start running. No-op after the owning
   * effect scope is disposed. */
  start: () => void
  /** Stop running, freezing `elapsed` at its current value. Idempotent. */
  pause: () => void
  /** Continue running from the current `elapsed` value. No-op if already
   * running, or after the owning effect scope is disposed. */
  resume: () => void
  /** Stop running and reset `elapsed` back to `0`. */
  reset: () => void
}

/**
 * Track elapsed wall-clock time from `start()`, with `pause()`/`resume()`
 * support. Cleans up with the surrounding effect scope; scopeless callers
 * keep the timer running for the page's lifetime unless they call the
 * returned `pause()`/`reset()` themselves.
 */
export function useTimer(options: UseTimerOptions = {}): UseTimerReturn {
  const { interval = 1000 } = options

  // SSR: static getters, no signal, no timer.
  if (!isClient) {
    const elapsed = (): number => 0
    const isRunning = (): boolean => false
    return {
      elapsed,
      isRunning,
      start: () => {},
      pause: () => {},
      resume: () => {},
      reset: () => {},
    }
  }

  const [elapsed, setElapsed] = signal(0)
  const [isRunning, setIsRunning] = signal(false)

  // `accumulated` is the total elapsed ms across all PAST running segments;
  // `runStart` is the `Date.now()` the CURRENT segment began, or
  // `undefined` while paused/stopped.
  let accumulated = 0
  let runStart: number | undefined
  let handle: ReturnType<typeof setInterval> | undefined
  let disposed = false

  const currentElapsed = (): number =>
    accumulated + (runStart === undefined ? 0 : Date.now() - runStart)

  const stopTicking = (): void => {
    if (handle === undefined) return
    clearInterval(handle)
    handle = undefined
  }

  const pause = (): void => {
    if (runStart === undefined) return
    accumulated = currentElapsed()
    runStart = undefined
    stopTicking()
    setElapsed(accumulated)
    setIsRunning(false)
  }

  const run = (): void => {
    if (disposed) return
    if (runStart !== undefined) return
    runStart = Date.now()
    stopTicking()
    handle = setInterval(() => setElapsed(currentElapsed()), interval)
    setIsRunning(true)
  }

  const resume = (): void => run()

  const start = (): void => {
    if (disposed) return
    stopTicking()
    accumulated = 0
    runStart = undefined
    setElapsed(0)
    run()
  }

  const reset = (): void => {
    stopTicking()
    accumulated = 0
    runStart = undefined
    setIsRunning(false)
    setElapsed(0)
  }

  tryOnScopeDispose(() => {
    disposed = true
    pause()
  })

  return { elapsed, isRunning, start, pause, resume, reset }
}
