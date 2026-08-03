/**
 * `useSequence` — cycle through a list of items, holding on each for a
 * fixed interval (docs/plans/2026-07-22-effect-scope-and-composables.md §5,
 * `@aihu/use/motion` wave 1 — performativeUI port doc, Track B Slice 3).
 * Built on `useIntervalFn` — every hold is the same duration, unlike
 * `useTypewriter`/`useTokenStream`'s multi-phase cadence, so the fixed-
 * interval primitive fits directly. The rotating-phrase composable
 * `rotator`/`word-roll`/`slippy-words` (performativeUI port, Tier B) drive
 * their current item from this; pair with `useTypewriter` to type each item
 * in rather than hard-cutting between them.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{current()}`, never bare `{current}`.
 *
 * Honors `useReducedMotion`: while `prefersReduced()` is true, the interval
 * never auto-advances — the sequence holds on whatever item it's showing.
 * `next()`/`prev()` still work (an explicit user/caller action, not
 * autoplay), and the check is live (a mid-run preference change pauses or
 * resumes the interval accordingly) since an auto-rotating phrase list is
 * decorative motion, never load-bearing content.
 *
 * SSR (`isClient === false`): `current()` returns `items[0]`, `index()` is
 * `0`, `isRunning()` is `false`, every mutator is a no-op — no timer is
 * ever registered.
 */
import { effect, signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../../shared/index.ts'
import { useIntervalFn } from '../../useIntervalFn/index.ts'
import { useReducedMotion } from '../useReducedMotion/index.ts'

export interface UseSequenceOptions {
  /** Milliseconds to hold on each item before advancing. Default `2000`. */
  interval?: number
  /** Wrap from the last item back to the first. Default `true`; `false`
   * stops (and stays put) after reaching the last item. */
  loop?: boolean
  /** Start the auto-advance interval immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseSequenceReturn<T> {
  /** Reactive getter — the item at the current index. */
  readonly current: () => T
  /** Reactive getter — the current index into `items`. */
  readonly index: () => number
  /** Reactive getter — true while the auto-advance interval is armed (false
   * whenever `prefersReduced()` is true, even if `start()` was called). */
  readonly isRunning: () => boolean
  /** (Re)start auto-advancing. Under reduced motion, arms once the
   * preference clears (see the reduced-motion note above); no-op after the
   * owning effect scope is disposed. */
  start: () => void
  /** Stop auto-advancing. Idempotent. A later reduced-motion preference
   * change will not resume it — call `start()` again to re-arm. */
  stop: () => void
  /** Advance one item (wrapping per `loop`). Works regardless of
   * `isRunning()` — an explicit call, not autoplay. */
  next: () => void
  /** Go back one item (wrapping per `loop`). */
  prev: () => void
}

/**
 * Cycle through `items`, holding on each for `interval` ms. Cleans up with
 * the surrounding effect scope; scopeless callers keep the interval running
 * for the page's lifetime unless they call the returned `stop()` themselves.
 */
export function useSequence<T>(
  items: readonly T[],
  options: UseSequenceOptions = {},
): UseSequenceReturn<T> {
  // Snapshot options to plain values up front (D8 — never let a later
  // mutation of a caller-owned object diverge SSR vs client).
  const { interval = 2000, loop = true, immediate = true } = options

  if (items.length === 0) {
    throw new Error('useSequence: `items` must not be empty')
  }

  // SSR: static first-item getters, no timer.
  if (!isClient) {
    return {
      current: () => items[0] as T,
      index: () => 0,
      isRunning: () => false,
      start: () => {},
      stop: () => {},
      next: () => {},
      prev: () => {},
    }
  }

  const { prefersReduced } = useReducedMotion()
  const [index, setIndex] = signal(0)
  let disposed = false
  // Tracks the CALLER's intent (start()'d vs. stop()'d), independent of
  // whether the interval is actually armed right now — the reduced-motion
  // effect below needs this to decide whether a preference flip back to
  // no-preference should resume, without overriding an explicit stop().
  let wantsRunning = false

  const current = (): T => items[index()] as T

  const advance = (delta: 1 | -1): void => {
    const next = index() + delta
    if (next < 0) {
      setIndex(loop ? items.length - 1 : 0)
    } else if (next >= items.length) {
      setIndex(loop ? 0 : items.length - 1)
    } else {
      setIndex(next)
    }
  }

  const tick = (): void => {
    advance(1)
    // `loop: false` reaching the last item has nothing left to advance to —
    // stop the interval instead of ticking forever with no visible effect.
    if (!loop && index() === items.length - 1) pause()
  }

  const { isActive, pause, resume } = useIntervalFn(tick, interval, { immediate: false })

  const isRunning = (): boolean => isActive() && !prefersReduced()

  const start = (): void => {
    // A still-referenced start() must not re-arm the interval (and fire
    // state updates) once the owning scope tore down.
    if (disposed) return
    wantsRunning = true
    if (prefersReduced()) return
    resume()
  }

  const stop = (): void => {
    if (disposed) return
    wantsRunning = false
    pause()
  }

  // A retained next()/prev() handle (e.g. captured by an event listener)
  // must not write to `index` once the owning scope has torn down.
  const next = (): void => {
    if (disposed) return
    advance(1)
  }
  const prev = (): void => {
    if (disposed) return
    advance(-1)
  }

  // Live reduced-motion: a mid-run preference change pauses/resumes the
  // interval without overriding an explicit stop() (`wantsRunning` is only
  // ever set by start()/stop(), never by this effect).
  const disposeReducedMotionEffect = effect(() => {
    if (disposed) return
    if (prefersReduced()) {
      pause()
    } else if (wantsRunning) {
      resume()
    }
  })

  tryOnScopeDispose(() => {
    disposed = true
    pause()
    disposeReducedMotionEffect()
  })

  if (immediate) start()

  return { current, index, isRunning, start, stop, next, prev }
}
