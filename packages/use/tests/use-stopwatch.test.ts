/**
 * Unit tests for `useStopwatch` (effect-scope plan §5): count-up elapsed
 * tracking, pause/resume accumulation, lap recording, start()/reset()
 * semantics, scope cleanup, and the SSR-static path (simulated
 * `!isClient` via module re-evaluation). jsdom environment (root vitest
 * config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStopwatch } from '../src/useStopwatch/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useStopwatch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not run until start() is called', () => {
    const { elapsed, isRunning, laps } = useStopwatch()
    expect(elapsed()).toBe(0)
    expect(isRunning()).toBe(false)
    expect(laps()).toEqual([])
    vi.advanceTimersByTime(1000)
    expect(elapsed()).toBe(0)
  })

  it('start() begins counting up', () => {
    const { elapsed, isRunning, start } = useStopwatch({ interval: 100 })
    start()
    expect(isRunning()).toBe(true)
    // `elapsed` only refreshes ON TICKS (every `interval` ms) — advance to
    // an exact tick boundary rather than asserting sub-tick precision.
    vi.advanceTimersByTime(300)
    expect(elapsed()).toBe(300)
  })

  it('lap() records the cumulative elapsed value', () => {
    const { laps, start, lap } = useStopwatch({ interval: 100 })
    start()
    vi.advanceTimersByTime(150)
    lap()
    vi.advanceTimersByTime(150)
    lap()
    expect(laps()).toEqual([150, 300])
  })

  it('lap() before start() is a no-op', () => {
    const { laps, lap } = useStopwatch()
    lap()
    expect(laps()).toEqual([])
  })

  it('pause() freezes elapsed; resume() continues accumulating from there', () => {
    const { elapsed, start, pause, resume } = useStopwatch({ interval: 100 })
    start()
    vi.advanceTimersByTime(300)
    pause()
    const frozen = elapsed()
    expect(frozen).toBe(300)

    vi.advanceTimersByTime(500) // paused: no accumulation
    expect(elapsed()).toBe(frozen)

    resume()
    vi.advanceTimersByTime(200)
    expect(elapsed()).toBe(frozen + 200)
  })

  it('start() resets elapsed and clears laps', () => {
    const { elapsed, laps, start, lap } = useStopwatch({ interval: 100 })
    start()
    vi.advanceTimersByTime(200)
    lap()
    expect(laps()).toEqual([200])

    start()
    expect(elapsed()).toBe(0)
    expect(laps()).toEqual([])
  })

  it('reset() stops running and clears elapsed + laps', () => {
    const { elapsed, laps, isRunning, start, lap, reset } = useStopwatch({ interval: 100 })
    start()
    vi.advanceTimersByTime(200)
    lap()

    reset()
    expect(elapsed()).toBe(0)
    expect(laps()).toEqual([])
    expect(isRunning()).toBe(false)
    vi.advanceTimersByTime(300)
    expect(elapsed()).toBe(0)
  })

  it('scope.stop() pauses and stops further ticking', () => {
    const scope = effectScope()
    const { elapsed, start } = scope.run(() => useStopwatch({ interval: 100 })) as ReturnType<
      typeof useStopwatch
    >
    start()
    vi.advanceTimersByTime(100)
    const frozen = elapsed()

    scope.stop()
    vi.advanceTimersByTime(500)
    expect(elapsed()).toBe(frozen)
  })
})

describe('@aihu/use/useStopwatch — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns static elapsed()=0/laps()=[] and registers nothing', () =>
    withSSR(
      () => import('../src/useStopwatch/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useStopwatch> | undefined
        expect(() => {
          ret = mod.useStopwatch()
        }).not.toThrow()
        expect(ret?.elapsed()).toBe(0)
        expect(ret?.laps()).toEqual([])
        expect(ret?.isRunning()).toBe(false)
        expect(() => {
          ret?.start()
          ret?.pause()
          ret?.resume()
          ret?.lap()
          ret?.reset()
        }).not.toThrow()
      },
    ))
})
