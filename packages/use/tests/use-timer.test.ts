/**
 * Unit tests for `useTimer` (effect-scope plan §5): count-up elapsed
 * tracking, pause/resume accumulation, start()/reset() semantics, scope
 * cleanup, and the SSR-static path (simulated `!isClient` via module
 * re-evaluation). jsdom environment (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimer } from '../src/useTimer/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not run until start() is called', () => {
    const { elapsed, isRunning } = useTimer()
    expect(elapsed()).toBe(0)
    expect(isRunning()).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(elapsed()).toBe(0)
  })

  it('start() begins counting up', () => {
    const { elapsed, isRunning, start } = useTimer({ interval: 100 })
    start()
    expect(isRunning()).toBe(true)
    // `elapsed` only refreshes ON TICKS (every `interval` ms) — advance to
    // an exact tick boundary rather than asserting sub-tick precision.
    vi.advanceTimersByTime(300)
    expect(elapsed()).toBe(300)
  })

  it('pause() freezes elapsed; resume() continues accumulating from there', () => {
    const { elapsed, isRunning, start, pause, resume } = useTimer({ interval: 100 })
    start()
    vi.advanceTimersByTime(300)
    pause()
    expect(isRunning()).toBe(false)
    const frozen = elapsed()
    expect(frozen).toBe(300)

    vi.advanceTimersByTime(500) // paused: no accumulation
    expect(elapsed()).toBe(frozen)

    resume()
    vi.advanceTimersByTime(200)
    expect(elapsed()).toBe(frozen + 200)
  })

  it('start() while running resets elapsed back to 0 and keeps running', () => {
    const { elapsed, isRunning, start } = useTimer({ interval: 100 })
    start()
    vi.advanceTimersByTime(300)
    expect(elapsed()).toBe(300)

    start()
    expect(elapsed()).toBe(0)
    expect(isRunning()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(elapsed()).toBe(100)
  })

  it('reset() stops running and zeroes elapsed', () => {
    const { elapsed, isRunning, start, reset } = useTimer({ interval: 100 })
    start()
    vi.advanceTimersByTime(300)

    reset()
    expect(elapsed()).toBe(0)
    expect(isRunning()).toBe(false)
    vi.advanceTimersByTime(300)
    expect(elapsed()).toBe(0)
  })

  it('scope.stop() pauses and stops further ticking', () => {
    const scope = effectScope()
    const { elapsed, start } = scope.run(() => useTimer({ interval: 100 })) as ReturnType<
      typeof useTimer
    >
    start()
    vi.advanceTimersByTime(100)
    const frozen = elapsed()

    scope.stop()
    vi.advanceTimersByTime(500)
    expect(elapsed()).toBe(frozen)
  })
})

describe('@aihu/use/useTimer — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns static elapsed()=0/isRunning()=false and registers nothing', () =>
    withSSR(
      () => import('../src/useTimer/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useTimer> | undefined
        expect(() => {
          ret = mod.useTimer()
        }).not.toThrow()
        expect(ret?.elapsed()).toBe(0)
        expect(ret?.isRunning()).toBe(false)
        expect(() => {
          ret?.start()
          ret?.pause()
          ret?.resume()
          ret?.reset()
        }).not.toThrow()
      },
    ))
})
