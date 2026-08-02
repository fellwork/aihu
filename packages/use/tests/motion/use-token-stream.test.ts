/**
 * Unit tests for `useTokenStream` (`@aihu/use/motion` wave 1 —
 * performativeUI port doc, Track B Slice 3): auto-stream, skip, loop
 * (stream/hold/reset), reduced-motion bypass, scope cleanup, and the
 * SSR-static path. jsdom environment (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTokenStream } from '../../src/motion/useTokenStream/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from '../_match-media.ts'
import { withSSR } from '../_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/motion/useTokenStream', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-starts by default and reveals one token per `interval` ms', () => {
    const { tokens, isStreaming } = useTokenStream(['a', 'b', 'c'], { interval: 10 })
    expect(isStreaming()).toBe(true)
    vi.advanceTimersByTime(10)
    expect(tokens()).toEqual(['a'])
    vi.advanceTimersByTime(10)
    expect(tokens()).toEqual(['a', 'b'])
    vi.advanceTimersByTime(10)
    expect(tokens()).toEqual(['a', 'b', 'c'])
    expect(isStreaming()).toBe(false)
  })

  it('isDone() flips true only once every token is revealed', () => {
    const { isDone } = useTokenStream(['a', 'b'], { interval: 10 })
    expect(isDone()).toBe(false)
    vi.advanceTimersByTime(10)
    expect(isDone()).toBe(false)
    vi.advanceTimersByTime(10)
    expect(isDone()).toBe(true)
  })

  it('skip() reveals every remaining token immediately and stops', () => {
    const { tokens, isStreaming, isDone, skip } = useTokenStream(['a', 'b', 'c'], {
      interval: 100,
    })
    vi.advanceTimersByTime(100)
    skip()
    expect(tokens()).toEqual(['a', 'b', 'c'])
    expect(isStreaming()).toBe(false)
    expect(isDone()).toBe(true)
  })

  it('stop() freezes tokens() where it stands, without marking done', () => {
    const { tokens, isDone, stop } = useTokenStream(['a', 'b', 'c'], { interval: 10 })
    vi.advanceTimersByTime(10)
    stop()
    const frozen = tokens()
    vi.advanceTimersByTime(200)
    expect(tokens()).toEqual(frozen)
    expect(isDone()).toBe(false)
  })

  it('start() restarts from empty with a new source', () => {
    const { tokens, start } = useTokenStream(['a', 'b'], { interval: 10 })
    vi.advanceTimersByTime(20)
    expect(tokens()).toEqual(['a', 'b'])
    start(['x', 'y', 'z'])
    expect(tokens()).toEqual([])
    vi.advanceTimersByTime(30)
    expect(tokens()).toEqual(['x', 'y', 'z'])
  })

  it('loop: true streams, holds, and restreams from empty', () => {
    const { tokens } = useTokenStream(['a', 'b'], { interval: 10, holdDelay: 20, loop: true })
    vi.advanceTimersByTime(20) // fully streamed
    expect(tokens()).toEqual(['a', 'b'])
    vi.advanceTimersByTime(20) // hold elapses -> reset
    expect(tokens()).toEqual([])
    vi.advanceTimersByTime(10)
    expect(tokens()).toEqual(['a'])
  })

  it('immediate: false does not start until start() is called', () => {
    const { tokens, isStreaming } = useTokenStream(['a', 'b'], { interval: 10, immediate: false })
    expect(isStreaming()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(tokens()).toEqual([])
  })

  it('honors reduced motion: start() reveals every token immediately', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    const { tokens, isStreaming, isDone } = useTokenStream(['a', 'b', 'c'], { interval: 100 })
    expect(tokens()).toEqual(['a', 'b', 'c'])
    expect(isStreaming()).toBe(false)
    expect(isDone()).toBe(true)
  })

  it('disposing the owning scope stops the pending step', () => {
    const scope = effectScope()
    let stream!: ReturnType<typeof useTokenStream>
    scope.run(() => {
      stream = useTokenStream(['a', 'b', 'c'], { interval: 10 })
    })
    vi.advanceTimersByTime(10)
    expect(stream.tokens()).toEqual(['a'])
    scope.stop()
    vi.advanceTimersByTime(100)
    expect(stream.tokens()).toEqual(['a'])
    stream.start(['x'])
    vi.advanceTimersByTime(100)
    expect(stream.tokens()).toEqual(['a'])
  })
})

describe('@aihu/use/motion/useTokenStream — SSR-static path', () => {
  it('with isClient false, tokens() is the full source and mutators are no-ops', () =>
    withSSR(
      () => import('../../src/motion/useTokenStream/index.ts'),
      (mod) => {
        let result: ReturnType<typeof mod.useTokenStream> | undefined
        expect(() => {
          result = mod.useTokenStream(['a', 'b'])
        }).not.toThrow()
        expect(result?.tokens()).toEqual(['a', 'b'])
        expect(result?.isDone()).toBe(true)
        expect(() => {
          result?.start(['c'])
          result?.stop()
          result?.skip()
        }).not.toThrow()
      },
    ))
})
