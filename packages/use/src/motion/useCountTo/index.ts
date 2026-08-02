/**
 * `useCountTo` — tween a number to a target over a duration, eased
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5, `@aihu/use/motion`
 * wave 1 — performativeUI port doc, Track B Slice 3). Built on `useRafFn`.
 *
 * ⚠ Not `useCounter` (the pre-existing clamped, imperative counter). This
 * is the animated composable `stat-counter` (performativeUI port) reads.
 *
 * Return convention (ratified): getters are signals; read as `{value()}`.
 *
 * Honors `useReducedMotion`: `start()` jumps straight to the target under
 * `prefersReduced()` — decorative motion, never load-bearing content.
 *
 * SSR (`isClient === false`): `value()` tracks the last `start()` target
 * (or `from`); `start`/`stop`/`skip` register no rAF loop.
 */
import { signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../../shared/index.ts'
import { useRafFn } from '../../useRafFn/index.ts'
import { useReducedMotion } from '../useReducedMotion/index.ts'

/** Ease-out cubic — fast start, gentle settle. The default because a
 * counter that decelerates into its final value reads as more "arrived"
 * than a linear ramp. */
function easeOutCubic(t: number): number {
  const inv = 1 - t
  return 1 - inv * inv * inv
}

function round(n: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(n * factor) / factor
}

export interface UseCountToOptions {
  /** Starting value before any `start()` call. Default `0`. Every
   * subsequent `start()` tweens from whatever `value()` currently holds,
   * not back to this. */
  from?: number
  /** Tween duration in milliseconds. Default `1200`. */
  duration?: number
  /** Decimal places to round `value()` to. Default `0` (whole numbers). */
  decimals?: number
  /** Easing curve, `[0, 1] -> [0, 1]`. Default ease-out cubic. */
  easing?: (t: number) => number
}

export interface UseCountToReturn {
  /** Reactive getter — the current (eased, rounded) value. */
  readonly value: () => number
  /** Reactive getter — true while a tween is in flight. */
  readonly isCounting: () => boolean
  /** Tween from the current `value()` to `to` over `duration`. Replaces any
   * tween in progress. No-op after the owning effect scope is disposed. */
  start: (to: number) => void
  /** Freeze the tween where it stands. Idempotent. */
  stop: () => void
  /** Jump straight to the in-flight (or most recently requested) target and
   * stop. */
  skip: () => void
}

/**
 * Tween a number toward `to` on every `start()` call. Cleans up with the
 * surrounding effect scope; scopeless callers keep the rAF loop alive for
 * the duration of the tween regardless.
 */
export function useCountTo(options: UseCountToOptions = {}): UseCountToReturn {
  // Snapshot options to plain values up front (D8 — never let a later
  // mutation of a caller-owned object diverge SSR vs client).
  const { from = 0, duration = 1200, decimals = 0, easing = easeOutCubic } = options

  // SSR: static getter of the last-requested target (or `from`), no rAF.
  if (!isClient) {
    let target = from
    return {
      value: () => target,
      isCounting: () => false,
      start: (to: number) => {
        target = to
      },
      stop: () => {},
      skip: () => {},
    }
  }

  const { prefersReduced } = useReducedMotion()
  const [value, setValue] = signal(round(from, decimals))
  const [isCounting, setIsCounting] = signal(false)

  let target = from
  let startValue = from
  let startTime: number | undefined
  let disposed = false

  const finish = (): void => {
    setValue(round(target, decimals))
    setIsCounting(false)
  }

  const { pause, resume } = useRafFn(
    ({ timestamp }) => {
      if (startTime === undefined) startTime = timestamp
      const elapsed = timestamp - startTime
      const t = duration <= 0 ? 1 : Math.min(elapsed / duration, 1)
      setValue(round(startValue + (target - startValue) * easing(t), decimals))
      if (t >= 1) {
        setIsCounting(false)
        pause()
      }
    },
    { immediate: false },
  )

  const start = (to: number): void => {
    // A still-referenced start() must not re-arm the loop (and fire state
    // updates) once the owning scope tore down.
    if (disposed) return
    target = to

    if (prefersReduced()) {
      pause()
      finish()
      return
    }

    startValue = value()
    startTime = undefined
    setIsCounting(true)
    resume()
  }

  const stop = (): void => {
    pause()
    setIsCounting(false)
  }

  const skip = (): void => {
    pause()
    finish()
  }

  tryOnScopeDispose(() => {
    disposed = true
  })

  return { value, isCounting, start, stop, skip }
}
