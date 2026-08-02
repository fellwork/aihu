/**
 * `useTypewriter` — reveal a string one character at a time, optionally
 * looping (type, hold, erase, retype) (docs/plans/2026-07-22-effect-scope-
 * and-composables.md §5, `@aihu/use/motion` wave 1 — performativeUI port
 * doc, Track B Slice 3). Built on a self-rescheduling `setTimeout`, not
 * `useIntervalFn` — the three phases (typing/holding/erasing) each run at a
 * different cadence, which a single fixed-interval timer can't express.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{text()}`, never bare `{text}`.
 *
 * Honors `useReducedMotion`: `start()` checked against the live
 * `prefersReduced()` reading skips straight to the fully-typed string with
 * no character-by-character reveal, looping or not — a typewriter cursor is
 * decorative motion, never load-bearing content.
 *
 * SSR (`isClient === false`): `text()` returns `source` (the finished
 * string) immediately, `isDone()` is `true`, `start`/`stop`/`skip` are
 * no-ops — no timer is ever registered.
 */
import { signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../../shared/index.ts'
import { useReducedMotion } from '../useReducedMotion/index.ts'

export interface UseTypewriterOptions {
  /** Milliseconds per character typed. Default `40`. */
  speed?: number
  /** Milliseconds per character erased, when `loop` is on. Default `20`. */
  eraseSpeed?: number
  /** Milliseconds to hold the fully-typed text before erasing, when `loop`
   * is on. Default `1200`. */
  holdDelay?: number
  /** Erase and retype forever once the text is fully typed. Default `false`. */
  loop?: boolean
  /** Start typing `source` immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseTypewriterReturn {
  /** Reactive getter — the substring typed (or not yet erased) so far. */
  readonly text: () => string
  /** Reactive getter — true while a type/hold/erase step is scheduled. */
  readonly isTyping: () => boolean
  /** Reactive getter — true once a non-looping run has fully typed `source`,
   * or immediately after `skip()`. Never true mid-loop. */
  readonly isDone: () => boolean
  /** (Re)start typing `source` from an empty string, replacing any run in
   * progress. No-op after the owning effect scope is disposed. */
  start: (source: string) => void
  /** Cancel the pending step, freezing `text()` where it stands. Idempotent. */
  stop: () => void
  /** Jump straight to the fully-typed string and stop. */
  skip: () => void
}

/**
 * Type `source` out one character at a time. Cleans up with the surrounding
 * effect scope; scopeless callers keep the pending step alive unless they
 * call the returned `stop()` themselves.
 */
export function useTypewriter(
  source: string,
  options: UseTypewriterOptions = {},
): UseTypewriterReturn {
  // Snapshot options to plain values up front (D8 — never let a later
  // mutation of a caller-owned object diverge SSR vs client).
  const { speed = 40, eraseSpeed = 20, holdDelay = 1200, loop = false, immediate = true } = options

  // SSR: static getters, no timer — land straight on the finished string.
  if (!isClient) {
    return {
      text: () => source,
      isTyping: () => false,
      isDone: () => true,
      start: () => {},
      stop: () => {},
      skip: () => {},
    }
  }

  const { prefersReduced } = useReducedMotion()
  const [text, setText] = signal('')
  const [isTyping, setIsTyping] = signal(false)
  const [isDone, setIsDone] = signal(false)

  let current = source
  let index = 0
  let phase: 'typing' | 'holding' | 'erasing' = 'typing'
  let handle: ReturnType<typeof setTimeout> | undefined
  let disposed = false

  const clear = (): void => {
    if (handle === undefined) return
    clearTimeout(handle)
    handle = undefined
  }

  const schedule = (delay: number): void => {
    clear()
    handle = setTimeout(tick, delay)
  }

  function tick(): void {
    handle = undefined
    if (phase === 'typing') {
      index++
      setText(current.slice(0, index))
      if (index >= current.length) {
        if (loop) {
          phase = 'holding'
          schedule(holdDelay)
        } else {
          setIsTyping(false)
          setIsDone(true)
        }
        return
      }
      schedule(speed)
      return
    }
    if (phase === 'holding') {
      phase = 'erasing'
      schedule(eraseSpeed)
      return
    }
    // erasing
    index--
    setText(current.slice(0, index))
    if (index <= 0) {
      phase = 'typing'
      schedule(speed)
      return
    }
    schedule(eraseSpeed)
  }

  const stop = (): void => {
    clear()
    setIsTyping(false)
  }

  const skip = (): void => {
    clear()
    index = current.length
    phase = 'typing'
    setText(current)
    setIsTyping(false)
    setIsDone(true)
  }

  const start = (nextSource: string): void => {
    // A still-referenced start() must not re-arm the timer (and fire state
    // updates) once the owning scope tore down.
    if (disposed) return
    clear()
    current = nextSource
    index = 0
    phase = 'typing'
    setText('')
    setIsDone(false)

    if (prefersReduced()) {
      index = current.length
      setText(current)
      setIsTyping(false)
      setIsDone(true)
      return
    }

    setIsTyping(true)
    schedule(speed)
  }

  tryOnScopeDispose(() => {
    disposed = true
    clear()
  })

  if (immediate) start(source)

  return { text, isTyping, isDone, start, stop, skip }
}
