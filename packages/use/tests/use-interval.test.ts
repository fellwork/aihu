/**
 * Unit tests for `useInterval` (effect-scope plan §5): default tick
 * counting, immediate: false, pause/resume, reset, scope cleanup, and the
 * SSR-static path (simulated `!isClient` via module re-evaluation). jsdom
 * environment (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useInterval } from '../src/useInterval/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useInterval', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at 0 and increments by 1 every interval', () => {
    const { counter } = useInterval(100)
    expect(counter()).toBe(0)
    vi.advanceTimersByTime(350)
    expect(counter()).toBe(3)
  })

  it('immediate: false does not tick until resume() is called', () => {
    const { counter, resume } = useInterval(100, { immediate: false })
    vi.advanceTimersByTime(300)
    expect(counter()).toBe(0)

    resume()
    vi.advanceTimersByTime(200)
    expect(counter()).toBe(2)
  })

  it('pause() stops further ticks; resume() continues counting', () => {
    const { counter, pause, resume } = useInterval(100)
    vi.advanceTimersByTime(100)
    expect(counter()).toBe(1)

    pause()
    vi.advanceTimersByTime(300)
    expect(counter()).toBe(1)

    resume()
    vi.advanceTimersByTime(100)
    expect(counter()).toBe(2)
  })

  it('reset() zeroes the counter without pausing', () => {
    const { counter, reset } = useInterval(100)
    vi.advanceTimersByTime(200)
    expect(counter()).toBe(2)

    reset()
    expect(counter()).toBe(0)
    vi.advanceTimersByTime(100)
    expect(counter()).toBe(1)
  })

  it('scope.stop() clears the interval', () => {
    const scope = effectScope()
    const { counter } = scope.run(() => useInterval(100)) as ReturnType<typeof useInterval>
    vi.advanceTimersByTime(100)
    expect(counter()).toBe(1)

    scope.stop()
    vi.advanceTimersByTime(300)
    expect(counter()).toBe(1)
  })
})

describe('@aihu/use/useInterval — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static counter()=0 and registers nothing', () =>
    withSSR(
      () => import('../src/useInterval/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useInterval> | undefined
        expect(() => {
          ret = mod.useInterval(100)
        }).not.toThrow()
        expect(ret?.counter()).toBe(0)
        expect(() => {
          ret?.reset()
          ret?.pause()
          ret?.resume()
        }).not.toThrow()
      },
    ))
})
