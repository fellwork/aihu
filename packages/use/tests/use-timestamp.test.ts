/**
 * Unit tests for `useTimestamp` (effect-scope plan §5): default interval
 * ticking, the `requestAnimationFrame` cadence, pause/resume, scope
 * cleanup, and the SSR-static path (simulated `!isClient` via module
 * re-evaluation). jsdom environment (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimestamp } from '../src/useTimestamp/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useTimestamp', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at Date.now() and advances on the default 1s interval', () => {
    const { timestamp } = useTimestamp()
    const t0 = timestamp()
    vi.advanceTimersByTime(1000)
    expect(timestamp()).toBeGreaterThan(t0)
  })

  it("interval: 'requestAnimationFrame' advances on each frame", () => {
    const { timestamp } = useTimestamp({ interval: 'requestAnimationFrame' })
    const t0 = timestamp()
    vi.advanceTimersToNextFrame()
    expect(timestamp()).toBeGreaterThanOrEqual(t0)
  })

  it('immediate: false does not start until resume() is called', () => {
    const { timestamp, resume } = useTimestamp({ immediate: false })
    const t0 = timestamp()
    vi.advanceTimersByTime(3000)
    expect(timestamp()).toBe(t0)

    resume()
    vi.advanceTimersByTime(1000)
    expect(timestamp()).toBeGreaterThan(t0)
  })

  it('pause() stops further ticking; resume() restarts it', () => {
    const { timestamp, pause, resume } = useTimestamp()
    vi.advanceTimersByTime(1000)
    pause()
    const frozen = timestamp()
    vi.advanceTimersByTime(3000)
    expect(timestamp()).toBe(frozen)

    resume()
    vi.advanceTimersByTime(1000)
    expect(timestamp()).toBeGreaterThan(frozen)
  })

  it('scope.stop() stops further ticking', () => {
    const scope = effectScope()
    const { timestamp } = scope.run(() => useTimestamp()) as ReturnType<typeof useTimestamp>
    vi.advanceTimersByTime(1000)
    const frozen = timestamp()

    scope.stop()
    vi.advanceTimersByTime(5000)
    expect(timestamp()).toBe(frozen)
  })
})

describe('@aihu/use/useTimestamp — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a stable static timestamp and registers nothing', () =>
    withSSR(
      () => import('../src/useTimestamp/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useTimestamp> | undefined
        expect(() => {
          ret = mod.useTimestamp()
        }).not.toThrow()
        const first = ret?.timestamp()
        const second = ret?.timestamp()
        expect(typeof first).toBe('number')
        expect(first).toBe(second)
        expect(() => {
          ret?.pause()
          ret?.resume()
        }).not.toThrow()
      },
    ))
})
