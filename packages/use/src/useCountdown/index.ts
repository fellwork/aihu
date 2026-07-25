/**
 * `useCountdown` — a count-DOWN timer from a fixed `duration`, with
 * pause/resume and an optional `onComplete` callback
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{remaining()}`, never bare `{remaining}`.
 *
 * `remaining` is derived from a wall-clock delta (`Date.now()` at each
 * `start()`/`resume()`, accumulated across pauses), not a naive tick count,
 * so it stays correct even if the tab is throttled/backgrounded and ticks
 * are delayed or dropped — `interval` only controls how often the reactive
 * getter is refreshed.
 *
 * SSR (`isClient === false`): returns a static `remaining` getter of the
 * full `duration`, static `isRunning`/`isComplete` getters of `false`, and
 * no-op controls — registers no timer, the `isClient` no-op invariant.
 */

import { signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../shared/index.ts'

export interface UseCountdownOptions {
  /** How often (ms) the reactive `remaining` getter is refreshed while
   * running. Default `1000`. */
  interval?: number
  /** Called once, synchronously, when `remaining` reaches `0`. Not called
   * again until a subsequent `start()` completes. */
  onComplete?: () => void
}

export interface UseCountdownReturn {
  /** Reactive getter — read as `{remaining()}` in templates (parens
   * required). Milliseconds remaining, clamped to `>= 0`. */
  readonly remaining: () => number
  /** Reactive getter — read as `{isRunning()}` in templates (parens
   * required). */
  readonly isRunning: () => boolean
  /** Reactive getter — read as `{isComplete()}` in templates (parens
   * required). `true` once `remaining` has reached `0`. */
  readonly isComplete: () => boolean
  /** Reset `remaining` to `duration` and (re)start counting down. No-op
   * after the owning effect scope is disposed. */
  start: () => void
  /** Stop counting down, freezing `remaining` at its current value.
   * Idempotent. */
  pause: () => void
  /** Continue counting down from the current `remaining` value. No-op if
   * already running, already complete, or after the owning effect scope is
   * disposed. */
  resume: () => void
  /** Stop counting down and reset `remaining` back to `duration`. */
  reset: () => void
}

/**
 * Count down from `duration` ms, with `pause()`/`resume()` support and an
 * optional `onComplete` fired once `remaining` reaches `0`. Cleans up with
 * the surrounding effect scope; scopeless callers keep the countdown
 * running for the page's lifetime unless they call the returned
 * `pause()`/`reset()` themselves.
 */
export function useCountdown(
  duration: number,
  options: UseCountdownOptions = {},
): UseCountdownReturn {
  const { interval = 1000, onComplete } = options

  // SSR: static getters, no signal, no timer.
  if (!isClient) {
    const remaining = (): number => duration
    const isRunning = (): boolean => false
    const isComplete = (): boolean => false
    return {
      remaining,
      isRunning,
      isComplete,
      start: () => {},
      pause: () => {},
      resume: () => {},
      reset: () => {},
    }
  }

  const [remaining, setRemaining] = signal(duration)
  const [isRunning, setIsRunning] = signal(false)
  const [isComplete, setIsComplete] = signal(false)

  // `accumulated` is the total elapsed ms across all PAST running segments;
  // `runStart` is the `Date.now()` the CURRENT segment began, or
  // `undefined` while paused/stopped/complete.
  let accumulated = 0
  let runStart: number | undefined
  let handle: ReturnType<typeof setInterval> | undefined
  let disposed = false

  const currentRemaining = (): number => {
    const elapsedNow = accumulated + (runStart === undefined ? 0 : Date.now() - runStart)
    return Math.max(0, duration - elapsedNow)
  }

  const stopTicking = (): void => {
    if (handle === undefined) return
    clearInterval(handle)
    handle = undefined
  }

  const tick = (): void => {
    const next = currentRemaining()
    setRemaining(next)
    if (next <= 0) {
      accumulated = duration
      runStart = undefined
      stopTicking()
      setIsRunning(false)
      setIsComplete(true)
      onComplete?.()
    }
  }

  const pause = (): void => {
    if (runStart === undefined) return
    accumulated = duration - currentRemaining()
    runStart = undefined
    stopTicking()
    setIsRunning(false)
  }

  const run = (): void => {
    if (disposed || isComplete()) return
    if (runStart !== undefined) return
    runStart = Date.now()
    stopTicking()
    handle = setInterval(tick, interval)
    setIsRunning(true)
  }

  const resume = (): void => run()

  const start = (): void => {
    if (disposed) return
    stopTicking()
    accumulated = 0
    runStart = undefined
    setIsComplete(false)
    setRemaining(duration)
    run()
  }

  const reset = (): void => {
    stopTicking()
    accumulated = 0
    runStart = undefined
    setIsRunning(false)
    setIsComplete(false)
    setRemaining(duration)
  }

  tryOnScopeDispose(() => {
    disposed = true
    pause()
  })

  return { remaining, isRunning, isComplete, start, pause, resume, reset }
}
