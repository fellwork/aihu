/**
 * `useTimeAgo` — a reactive relative-time string ("3 minutes ago") for a
 * `Date`/epoch-number/date-string, auto-updating on an adaptive cadence
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention: an object of named getters PLUS controls — mirrors
 * `useIntervalFn`/`useMediaQuery` (a getter alongside `pause`/`resume`),
 * not the single-bare-getter shape (`usePrevious`) — this composable has
 * more than one meaningful output (the string AND whether it is still
 * auto-updating). Readers in `.aihu` templates MUST call the getter with
 * parens: `{timeAgo()}`, never bare `{timeAgo}`.
 *
 * Uses `Intl.RelativeTimeFormat` when available, falling back to a plain
 * `"N unit(s)"` string in a minimal/embedded runtime that lacks it (same
 * feature-detection posture as `useDateFormat`).
 *
 * Adaptive cadence: re-polls roughly as often as the DISPLAYED unit can
 * change — every second while the diff reads in seconds, every minute once
 * it reads in minutes, and so on — capped to hourly so a page left open
 * for days doesn't poll faster than the string could plausibly need to
 * change, without ever polling so slowly (e.g. once a year) that a
 * long-lived page's string goes stale.
 *
 * SSR (`isClient === false`): returns a static getter of the string
 * computed ONCE at call time (`source` is read once, mirroring
 * `useDebounced`'s SSR path) and no-op `pause`/`resume` — registers no
 * timer, the `isClient` no-op invariant.
 *
 * `date` is POLLED, not reactively tracked (FEL-406 #3 review note,
 * deliberate — see `tick()` below): each read happens inside the plain
 * `setTimeout` callback, outside any effect, so a change to `date` is only
 * picked up at the next scheduled poll, not the instant it happens. This is
 * intentional, not an oversight, for two reasons: (1) `date` is a
 * `MaybeGetter` — callers may pass a plain closure with no signal underneath
 * it at all (see the "reactive getter source" test), so effect-based
 * tracking wouldn't universally help even if added, only for the
 * signal-backed subset; and (2) the adaptive cadence already re-polls as
 * often as the DISPLAYED unit could plausibly need to change, so the
 * worst-case staleness after a `date` change is bounded by that same cadence
 * (capped at an hour), not unbounded. A caller needing sub-cadence
 * responsiveness to a changing `date` should key/remount the composable
 * (e.g. an `#key` block) rather than rely on it re-tracking mid-flight.
 */

import { signal } from '@aihu/signals'
import { isClient, type MaybeGetter, toValue, tryOnScopeDispose } from '../shared/index.ts'

/** A `Date`, an epoch-ms `number`, or any string `Date` accepts. */
export type UseTimeAgoSource = Date | number | string

export interface UseTimeAgoOptions {
  /** Passed through to `Intl.RelativeTimeFormat`. Default the runtime's
   * locale. */
  locales?: string | string[]
  /** Start the auto-update loop immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseTimeAgoReturn {
  /** Reactive getter — read as `{timeAgo()}` in templates (parens
   * required). */
  readonly timeAgo: () => string
  /** Stop auto-updating, freezing the string at its current value.
   * Idempotent. */
  pause: () => void
  /** Resume auto-updating (recomputes immediately, then resumes the
   * adaptive cadence). No-op if already running, or after the owning
   * effect scope is disposed. */
  resume: () => void
}

const hasRelativeTimeFormat =
  typeof Intl !== 'undefined' && typeof Intl.RelativeTimeFormat === 'function'

function toMs(value: UseTimeAgoSource): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

// Largest unit first: the first threshold the diff meets or exceeds picks
// both the display unit and (capped) the next poll delay. `second` is the
// unconditional last resort, so the loop always terminates with a match.
const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
]

const MAX_POLL_DELAY = 60 * 60 * 1000

function formatTimeAgo(rtf: Intl.RelativeTimeFormat | undefined, diffMs: number): [string, number] {
  const abs = Math.abs(diffMs)
  for (const [unit, unitMs] of UNITS) {
    if (abs >= unitMs || unit === 'second') {
      const value = Math.round(-diffMs / unitMs)
      const text = rtf !== undefined ? rtf.format(value, unit) : `${Math.abs(value)} ${unit}(s)`
      return [text, Math.min(MAX_POLL_DELAY, Math.max(1000, unitMs))]
    }
  }
  /* c8 ignore next -- UNITS always matches on 'second'; unreachable */
  return ['', 1000]
}

/**
 * Track a reactive relative-time string for `date`. Cleans up with the
 * surrounding effect scope; scopeless callers keep polling for the page's
 * lifetime unless they call the returned `pause()` themselves.
 */
export function useTimeAgo(
  date: MaybeGetter<UseTimeAgoSource>,
  options: UseTimeAgoOptions = {},
): UseTimeAgoReturn {
  const { locales, immediate = true } = options
  const rtf = hasRelativeTimeFormat
    ? new Intl.RelativeTimeFormat(locales, { numeric: 'auto' })
    : undefined

  // SSR: a single static formatTimeAgo() computation from one source()
  // read, no signal, no timer.
  if (!isClient) {
    const [text] = formatTimeAgo(rtf, Date.now() - toMs(toValue(date)))
    const timeAgo = (): string => text
    return { timeAgo, pause: () => {}, resume: () => {} }
  }

  const [timeAgo, setTimeAgo] = signal(formatTimeAgo(rtf, Date.now() - toMs(toValue(date)))[0])
  let handle: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const tick = (): void => {
    // Belt-and-suspenders: a self-rescheduling chain must not survive
    // dispose even if something upstream still calls tick() directly.
    if (disposed) return
    // POLLED, not tracked — this `toValue(date)` read is a plain function
    // call, not inside an `effect()`, so it establishes no reactive
    // dependency. See the module doc's "POLLED, not reactively tracked"
    // note for why that's the deliberate contract here, not a bug.
    const [text, nextDelay] = formatTimeAgo(rtf, Date.now() - toMs(toValue(date)))
    // Arm the NEXT timer before publishing the signal update. `setTimeAgo`
    // can synchronously run subscriber effects (e.g. one that calls
    // `pause()`, or that triggers scope dispose) — if that ran first, it
    // would only ever clear the (already-fired, now-stale) `handle` from
    // the PREVIOUS tick and this line would then re-arm a fresh timer past
    // the pause/dispose. Assigning `handle` first means a synchronous
    // pause()/dispose during propagation clears the one we just armed.
    handle = setTimeout(tick, nextDelay)
    setTimeAgo(text)
  }

  const pause = (): void => {
    if (handle === undefined) return
    clearTimeout(handle)
    handle = undefined
  }

  const resume = (): void => {
    if (disposed) return
    if (handle !== undefined) return
    tick()
  }

  tryOnScopeDispose(() => {
    disposed = true
    pause()
  })

  if (immediate) resume()

  return { timeAgo, pause, resume }
}
