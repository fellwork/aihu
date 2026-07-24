/**
 * `useStopwatch` — a count-UP elapsed-time stopwatch with pause/resume and
 * lap recording (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{elapsed()}`, never bare `{elapsed}`.
 *
 * Same wall-clock-delta accuracy model as {@link useTimer} (this composable
 * is `useTimer` plus lap recording — kept as an independent implementation
 * rather than wrapping `useTimer`, matching the house precedent of
 * `useIntervalFn`/`useTimeoutFn`/`useRafFn` each owning their own timer
 * loop rather than sharing one).
 *
 * A lap records the CUMULATIVE elapsed time at the moment `lap()` is
 * called (not the delta since the previous lap) — read consecutive
 * `laps()` entries and subtract for split times.
 *
 * SSR (`isClient === false`): returns a static `elapsed` getter of `0`, a
 * static empty `laps` getter, a static `isRunning` getter of `false`, and
 * no-op controls — registers no timer, the `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseStopwatchOptions {
  /** How often (ms) the reactive `elapsed` getter is refreshed while
   * running. Default `1000`. */
  interval?: number
}

export interface UseStopwatchReturn {
  /** Reactive getter — read as `{elapsed()}` in templates (parens
   * required). Milliseconds elapsed since `start()`, minus paused time. */
  readonly elapsed: () => number
  /** Reactive getter — read as `{laps()}` in templates (parens required).
   * Cumulative `elapsed` snapshot at each `lap()` call, oldest first. A
   * fresh array reference on every change (safe to read directly in a
   * template `$each`). */
  readonly laps: () => number[]
  /** Reactive getter — read as `{isRunning()}` in templates (parens
   * required). */
  readonly isRunning: () => boolean
  /** Reset `elapsed` to `0`, clear `laps`, and (re)start running. No-op
   * after the owning effect scope is disposed. */
  start: () => void
  /** Stop running, freezing `elapsed` at its current value. Idempotent. */
  pause: () => void
  /** Continue running from the current `elapsed` value. No-op if already
   * running, or after the owning effect scope is disposed. */
  resume: () => void
  /** Record the current `elapsed` value onto the end of `laps`. No-op
   * while not running (there is nothing meaningful to snapshot before the
   * first `start()`, or after a `pause()`/`reset()`). */
  lap: () => void
  /** Stop running and reset both `elapsed` and `laps`. */
  reset: () => void
}

/**
 * Track elapsed wall-clock time from `start()`, with `pause()`/`resume()`
 * and lap recording. Cleans up with the surrounding effect scope;
 * scopeless callers keep the stopwatch running for the page's lifetime
 * unless they call the returned `pause()`/`reset()` themselves.
 */
export function useStopwatch(options: UseStopwatchOptions = {}): UseStopwatchReturn {
  const { interval = 1000 } = options

  // SSR: static getters, no signal, no timer.
  if (!isClient) {
    const elapsed = (): number => 0
    const laps = (): number[] => []
    const isRunning = (): boolean => false
    return {
      elapsed,
      laps,
      isRunning,
      start: () => {},
      pause: () => {},
      resume: () => {},
      lap: () => {},
      reset: () => {},
    }
  }

  const [elapsed, setElapsed] = signal(0)
  const [laps, setLaps] = signal<number[]>([])
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
    setLaps([])
    run()
  }

  const lap = (): void => {
    if (runStart === undefined) return
    const snapshot = currentElapsed()
    setLaps((prev: number[]) => [...prev, snapshot])
  }

  const reset = (): void => {
    stopTicking()
    accumulated = 0
    runStart = undefined
    setIsRunning(false)
    setElapsed(0)
    setLaps([])
  }

  tryOnScopeDispose(() => {
    disposed = true
    pause()
  })

  return { elapsed, laps, isRunning, start, pause, resume, lap, reset }
}
