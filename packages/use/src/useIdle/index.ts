/**
 * `useIdle` — whether the user has been inactive for `timeout` ms, reset by
 * activity events (`mousemove`, `keydown`, `touchstart`, `scroll`) and by
 * the tab becoming visible again (docs/plans/2026-07-22-effect-scope-and-
 * composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{idle()}`, never bare `{idle}`.
 *
 * SSR (`isClient === false`): returns a static `idle` getter of
 * `initialState` (default `false`), a static `lastActive` getter of `0`,
 * and a no-op `reset` — registers no listener/timer, the isClient no-op
 * invariant.
 */

import { batch, signal } from '@aihu/signals'
import { defaultDocument, defaultWindow, isClient, tryOnScopeDispose } from '../shared/index.ts'
import { useEventListener } from '../useEventListener/index.ts'
import { useEventListenerMap } from '../useEventListenerMap/index.ts'

/** The house default activity events — a deliberately small, low-noise set
 * (mirrors VueUse's `useIdle` defaults). Pass `events` to add/replace
 * (e.g. `'mousedown'`, `'wheel'` for a stricter definition of "active"). */
const DEFAULT_EVENTS: Array<keyof WindowEventMap> = ['mousemove', 'keydown', 'touchstart', 'scroll']

export interface UseIdleOptions {
  /** Milliseconds of inactivity before `idle()` flips to `true`. Default
   * `60_000` (one minute). */
  timeout?: number
  /** `idle()`'s value before the first timeout elapses (and the permanent
   * value under SSR). Default `false`. */
  initialState?: boolean
  /** Which `window` events reset the idle timer. Default
   * `['mousemove', 'keydown', 'touchstart', 'scroll']`. */
  events?: Array<keyof WindowEventMap>
  /** The `window` to listen on. Default the global `window`. */
  window?: Window
  /** The `document` to watch `visibilitychange` on (becoming visible again
   * counts as activity). Default the global `document`; pass `null` to
   * disable this check. */
  document?: Document | null
}

export interface UseIdleReturn {
  /** Reactive getter — read as `{idle()}` in templates (parens required). */
  readonly idle: () => boolean
  /** Reactive getter — `Date.now()` (ms epoch) at the last detected
   * activity. `0` before the first activity (and under SSR — see module
   * doc; deliberately static rather than a live server-side timestamp). */
  readonly lastActive: () => number
  /** Manually mark activity now, as if an activity event had just fired —
   * clears `idle()` and restarts the timeout. No-op under SSR. */
  reset: () => void
}

/**
 * Track whether the user has gone `timeout` ms without an activity event.
 * Cleans up with the surrounding effect scope; scopeless callers keep the
 * listeners and timer for the page's lifetime.
 */
export function useIdle(options: UseIdleOptions = {}): UseIdleReturn {
  // Snapshot options to plain values up front (D8 — a later mutation of a
  // caller-owned `events` array must not diverge SSR vs client, and must
  // not let the array change out from under an already-registered
  // listener map).
  const {
    timeout = 60_000,
    initialState = false,
    events = DEFAULT_EVENTS,
    window: win = defaultWindow,
    document: doc = defaultDocument,
  } = options

  // SSR (or no window): static getters, no signal, no listener, no timer.
  if (!isClient || win === undefined) {
    const idle = (): boolean => initialState
    const lastActive = (): number => 0
    return { idle, lastActive, reset: () => {} }
  }

  const [idle, setIdle] = signal(initialState)
  const [lastActive, setLastActive] = signal(0)
  let handle: ReturnType<typeof setTimeout> | undefined
  // Guards against the re-arm-after-dispose class this package has hit
  // twice before (see useIntervalFn/useTimeoutFn/useTimer): a retained
  // `reset()` called after the owning scope disposes must not schedule a
  // new timer into a dead scope.
  let disposed = false

  const scheduleIdle = (): void => {
    if (disposed) return
    if (handle !== undefined) clearTimeout(handle)
    handle = setTimeout(() => setIdle(true), timeout)
  }

  const onActivity = (): void => {
    if (disposed) return
    // Batched: observers see ONE consistent (idle=false, lastActive) update
    // per activity event, never an intermediate half-written pair.
    batch(() => {
      setLastActive(Date.now())
      setIdle(false)
    })
    scheduleIdle()
  }

  const activityMap: Partial<Record<keyof WindowEventMap, () => void>> = {}
  for (const event of events) activityMap[event] = onActivity
  const stopActivity = useEventListenerMap(win, activityMap)

  // Returning to a hidden tab does not itself fire any of the activity
  // events above (no mousemove while backgrounded) — without this, a tab
  // left open in the background would report idle even the instant it's
  // switched back to. `visibilitychange` closes that gap.
  let stopVisibility: (() => void) | undefined
  if (doc !== null && doc !== undefined) {
    stopVisibility = useEventListener(doc, 'visibilitychange', () => {
      if (doc.visibilityState === 'visible') onActivity()
    })
  }

  scheduleIdle()

  const stop = (): void => {
    disposed = true
    if (handle !== undefined) {
      clearTimeout(handle)
      handle = undefined
    }
    stopActivity()
    stopVisibility?.()
  }
  tryOnScopeDispose(stop)

  return { idle, lastActive, reset: onActivity }
}
