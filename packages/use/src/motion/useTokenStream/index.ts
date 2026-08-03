/**
 * `useTokenStream` — reveal an array of tokens (words, chunks) one at a
 * time, optionally looping (docs/plans/2026-07-22-effect-scope-and-
 * composables.md §5, `@aihu/use/motion` wave 1 — performativeUI port doc,
 * Track B Slice 3). The LLM-response-streaming look `token-stream` (Tier B)
 * builds on: unlike `useTypewriter`'s per-character reveal, each step
 * appends one whole array element, so callers can stream pre-tokenized
 * words/sentences without a per-character cadence.
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * `{tokens()}`, never bare `{tokens}`.
 *
 * Honors `useReducedMotion`: `start()` checked against the live
 * `prefersReduced()` reading reveals every token immediately — a streaming
 * reveal is decorative motion, never load-bearing content.
 *
 * SSR (`isClient === false`): `tokens()` returns the full array passed to
 * `start()` (or `[]` before any `start()`), `isDone()` is `true` once a
 * `start()` has run, `start`/`stop`/`skip` register no timer.
 */
import { signal } from '@aihu/signals'
import { isClient, tryOnScopeDispose } from '../../shared/index.ts'
import { useReducedMotion } from '../useReducedMotion/index.ts'

export interface UseTokenStreamOptions {
  /** Milliseconds between revealing each token. Default `60`. */
  interval?: number
  /** Milliseconds to hold the fully-revealed stream before resetting and
   * restreaming, when `loop` is on. Default `1500`. */
  holdDelay?: number
  /** Reset to empty and restream forever once fully revealed. Default `false`. */
  loop?: boolean
  /** Start streaming `source` immediately on call. Default `true`. */
  immediate?: boolean
}

export interface UseTokenStreamReturn {
  /** Reactive getter — the tokens revealed so far, in order. */
  readonly tokens: () => string[]
  /** Reactive getter — true while a reveal/hold step is scheduled. */
  readonly isStreaming: () => boolean
  /** Reactive getter — true once a non-looping run has revealed every
   * token, or immediately after `skip()`. Never true mid-loop. */
  readonly isDone: () => boolean
  /** (Re)start streaming `source` from empty, replacing any run in progress.
   * No-op after the owning effect scope is disposed. */
  start: (source: string[]) => void
  /** Cancel the pending step, freezing `tokens()` where it stands. Idempotent. */
  stop: () => void
  /** Reveal every remaining token immediately and stop. */
  skip: () => void
}

/**
 * Reveal `source` one token at a time. Cleans up with the surrounding
 * effect scope; scopeless callers keep the pending step alive unless they
 * call the returned `stop()` themselves.
 */
export function useTokenStream(
  source: string[],
  options: UseTokenStreamOptions = {},
): UseTokenStreamReturn {
  // Snapshot options AND the initial source array to plain values up front
  // (D8 — never let a later mutation of a caller-owned object/array diverge
  // SSR vs client, or let a caller-held reference to `source` change this
  // composable's reported output after the fact).
  const { interval = 60, holdDelay = 1500, loop = false, immediate = true } = options
  const initialSource = source.slice()

  // SSR: static getter of the full stream, no timer. Returns a fresh copy
  // each call too — the returned array must not be a live handle either.
  if (!isClient) {
    return {
      tokens: () => initialSource.slice(),
      isStreaming: () => false,
      isDone: () => true,
      start: () => {},
      stop: () => {},
      skip: () => {},
    }
  }

  const { prefersReduced } = useReducedMotion()
  const [tokens, setTokens] = signal<string[]>([])
  const [isStreaming, setIsStreaming] = signal(false)
  const [isDone, setIsDone] = signal(false)

  let current: string[] = initialSource
  let index = 0
  let phase: 'streaming' | 'holding' = 'streaming'
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
    if (phase === 'streaming') {
      index++
      setTokens(current.slice(0, index))
      if (index >= current.length) {
        if (loop) {
          phase = 'holding'
          schedule(holdDelay)
        } else {
          setIsStreaming(false)
          setIsDone(true)
        }
        return
      }
      schedule(interval)
      return
    }
    // holding -> reset and restream
    index = 0
    setTokens([])
    phase = 'streaming'
    schedule(interval)
  }

  // A retained stop()/skip() handle must not write to signals once the
  // owning scope has torn down.
  const stop = (): void => {
    if (disposed) return
    clear()
    setIsStreaming(false)
  }

  const skip = (): void => {
    if (disposed) return
    clear()
    index = current.length
    phase = 'streaming'
    setTokens(current)
    setIsStreaming(false)
    setIsDone(true)
  }

  const start = (nextSource: string[]): void => {
    // A still-referenced start() must not re-arm the timer (and fire state
    // updates) once the owning scope tore down.
    if (disposed) return
    clear()
    current = nextSource
    index = 0
    phase = 'streaming'
    setTokens([])
    setIsDone(false)

    if (prefersReduced()) {
      index = current.length
      setTokens(current)
      setIsStreaming(false)
      setIsDone(true)
      return
    }

    setIsStreaming(true)
    schedule(interval)
  }

  tryOnScopeDispose(() => {
    disposed = true
    clear()
  })

  if (immediate) start(source)

  return { tokens, isStreaming, isDone, start, stop, skip }
}
