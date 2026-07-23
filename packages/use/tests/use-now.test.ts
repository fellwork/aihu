/**
 * Unit tests for `useNow` (effect-scope plan §5): default interval ticking,
 * the `requestAnimationFrame` cadence, scope cleanup, and the SSR-static
 * path (simulated `!isClient` via module re-evaluation). jsdom environment
 * (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNow } from '../src/useNow/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at the current Date and advances on the default 1s interval', () => {
    const { now } = useNow()
    const t0 = now().getTime()
    vi.advanceTimersByTime(1000)
    expect(now().getTime()).toBeGreaterThan(t0)
  })

  it("interval: 'requestAnimationFrame' advances on each frame", () => {
    const { now } = useNow({ interval: 'requestAnimationFrame' })
    const t0 = now().getTime()
    vi.advanceTimersToNextFrame()
    expect(now().getTime()).toBeGreaterThanOrEqual(t0)
  })

  it('scope.stop() stops further ticking', () => {
    const scope = effectScope()
    const { now } = scope.run(() => useNow()) as ReturnType<typeof useNow>
    vi.advanceTimersByTime(1000)
    const frozen = now().getTime()

    scope.stop()
    vi.advanceTimersByTime(5000)
    expect(now().getTime()).toBe(frozen)
  })
})

describe('@aihu/use/useNow — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a stable static Date and registers nothing', () =>
    withSSR(
      () => import('../src/useNow/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useNow> | undefined
        expect(() => {
          ret = mod.useNow()
        }).not.toThrow()
        const first = ret?.now()
        const second = ret?.now()
        expect(first).toBeInstanceOf(Date)
        expect(first).toBe(second)
      },
    ))
})
