/**
 * Unit tests for `useCountdown` (effect-scope plan §5): count-down
 * remaining tracking, pause/resume, completion + onComplete, start()/reset()
 * semantics, scope cleanup, and the SSR-static path (simulated
 * `!isClient` via module re-evaluation). jsdom environment (root vitest
 * config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountdown } from '../src/useCountdown/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not run until start() is called', () => {
    const { remaining, isRunning } = useCountdown(1000, { interval: 100 })
    expect(remaining()).toBe(1000)
    expect(isRunning()).toBe(false)
    vi.advanceTimersByTime(500)
    expect(remaining()).toBe(1000)
  })

  it('start() begins counting down', () => {
    const { remaining, isRunning, start } = useCountdown(1000, { interval: 100 })
    start()
    expect(isRunning()).toBe(true)
    vi.advanceTimersByTime(300)
    expect(remaining()).toBe(700)
  })

  it('pause() freezes remaining; resume() continues from there', () => {
    const { remaining, start, pause, resume } = useCountdown(1000, { interval: 100 })
    start()
    vi.advanceTimersByTime(300)
    pause()
    const frozen = remaining()
    expect(frozen).toBe(700)

    vi.advanceTimersByTime(500) // paused: no countdown
    expect(remaining()).toBe(frozen)

    resume()
    vi.advanceTimersByTime(200)
    expect(remaining()).toBe(frozen - 200)
  })

  it('reaches 0, sets isComplete, and fires onComplete exactly once', () => {
    const onComplete = vi.fn()
    const { remaining, isRunning, isComplete, start } = useCountdown(300, {
      interval: 100,
      onComplete,
    })
    start()
    vi.advanceTimersByTime(300)
    expect(remaining()).toBe(0)
    expect(isRunning()).toBe(false)
    expect(isComplete()).toBe(true)
    expect(onComplete).toHaveBeenCalledTimes(1)

    // Ticking stops for good once complete — no further onComplete calls.
    vi.advanceTimersByTime(1000)
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('resume() is a no-op once complete', () => {
    const { remaining, isComplete, start, resume } = useCountdown(100, { interval: 100 })
    start()
    vi.advanceTimersByTime(100)
    expect(isComplete()).toBe(true)

    resume()
    vi.advanceTimersByTime(500)
    expect(remaining()).toBe(0)
  })

  it('start() while running/complete resets remaining to duration and restarts', () => {
    const onComplete = vi.fn()
    const { remaining, isComplete, start } = useCountdown(100, { interval: 100, onComplete })
    start()
    vi.advanceTimersByTime(100)
    expect(isComplete()).toBe(true)

    start()
    expect(remaining()).toBe(100)
    expect(isComplete()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(isComplete()).toBe(true)
    expect(onComplete).toHaveBeenCalledTimes(2)
  })

  it('reset() stops running and restores remaining to duration', () => {
    const { remaining, isRunning, isComplete, start, reset } = useCountdown(1000, {
      interval: 100,
    })
    start()
    vi.advanceTimersByTime(300)

    reset()
    expect(remaining()).toBe(1000)
    expect(isRunning()).toBe(false)
    expect(isComplete()).toBe(false)
    vi.advanceTimersByTime(300)
    expect(remaining()).toBe(1000)
  })

  it('scope.stop() pauses and stops further ticking', () => {
    const scope = effectScope()
    const { remaining, start } = scope.run(() =>
      useCountdown(1000, { interval: 100 }),
    ) as ReturnType<typeof useCountdown>
    start()
    vi.advanceTimersByTime(100)
    const frozen = remaining()

    scope.stop()
    vi.advanceTimersByTime(500)
    expect(remaining()).toBe(frozen)
  })
})

describe('@aihu/use/useCountdown — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns static remaining()=duration and registers nothing', () =>
    withSSR(
      () => import('../src/useCountdown/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useCountdown> | undefined
        expect(() => {
          ret = mod.useCountdown(1000)
        }).not.toThrow()
        expect(ret?.remaining()).toBe(1000)
        expect(ret?.isRunning()).toBe(false)
        expect(ret?.isComplete()).toBe(false)
        expect(() => {
          ret?.start()
          ret?.pause()
          ret?.resume()
          ret?.reset()
        }).not.toThrow()
      },
    ))
})
