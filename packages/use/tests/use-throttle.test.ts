/**
 * Unit tests for `useThrottle` (effect-scope plan §5): leading-edge
 * immediate propagation, trailing-edge flush of a coalesced value, scope
 * cleanup, and the SSR-static path (simulated `!isClient` via module
 * re-evaluation). jsdom environment (root vitest config).
 */
import { effectScope, signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useThrottle } from '../src/useThrottle/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at the source value', () => {
    const [count] = signal(1)
    const { value } = useThrottle(() => count(), 100)
    expect(value()).toBe(1)
  })

  it('a change once the window has elapsed applies immediately (leading edge)', () => {
    const [count, setCount] = signal(0)
    const { value } = useThrottle(() => count(), 100)

    vi.advanceTimersByTime(100)
    setCount(1)
    expect(value()).toBe(1)
  })

  it('the first REAL change propagates immediately even when it arrives ' +
    'right after creation (creation itself must not consume the leading-edge slot)', () => {
    const [count, setCount] = signal(0)
    const { value } = useThrottle(() => count(), 100)

    // No advance — this change lands well within `delay` ms of creation.
    // A bug that stamps `lastRun` on the effect's creation run would defer
    // this to the trailing edge instead.
    setCount(1)
    expect(value()).toBe(1)
  })

  it('changes within a still-open window are coalesced and flushed once at its end', () => {
    const [count, setCount] = signal(0)
    const { value } = useThrottle(() => count(), 100)
    vi.advanceTimersByTime(100)

    setCount(1)
    expect(value()).toBe(1) // change once the window elapsed — leading edge
    setCount(2)
    vi.advanceTimersByTime(50)
    setCount(3)
    expect(value()).toBe(1) // still within the window — not yet flushed

    vi.advanceTimersByTime(50)
    expect(value()).toBe(3) // trailing flush: only the LAST value survives
  })

  it('scope.stop() prevents a pending trailing flush from ever firing', () => {
    const [count, setCount] = signal(0)
    const scope = effectScope()
    const { value } = scope.run(() => useThrottle(() => count(), 100)) as ReturnType<
      typeof useThrottle<number>
    >
    vi.advanceTimersByTime(100)

    setCount(1) // leading edge — applies immediately, opens a new window
    setCount(2) // within the window — pending trailing flush
    scope.stop()
    vi.advanceTimersByTime(200)
    expect(value()).toBe(1)
  })
})

describe('@aihu/use/useThrottle — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static getter of a single source() read', () =>
    withSSR(
      () => import('../src/useThrottle/index.ts'),
      (mod) => {
        let calls = 0
        const source = () => {
          calls += 1
          return 9
        }
        let ret: ReturnType<typeof mod.useThrottle<number>> | undefined
        expect(() => {
          ret = mod.useThrottle(source, 100)
        }).not.toThrow()
        expect(ret?.value()).toBe(9)
        expect(ret?.value()).toBe(9)
        expect(calls).toBe(1)
      },
    ))
})
