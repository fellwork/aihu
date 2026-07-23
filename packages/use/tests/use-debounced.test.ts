/**
 * Unit tests for `useDebounced` (effect-scope plan §5): trailing-edge
 * debounce of a reactive source, rapid-change coalescing, scope cleanup,
 * and the SSR-static path (simulated `!isClient` via module
 * re-evaluation). jsdom environment (root vitest config).
 */
import { effectScope, signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDebounced } from '../src/useDebounced/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useDebounced', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts at the source value', () => {
    const [count] = signal(1)
    const { value } = useDebounced(() => count(), 100)
    expect(value()).toBe(1)
  })

  it("the effect's creation run does not arm a spurious trailing timer", () => {
    const [count, setCount] = signal(0)
    useDebounced(() => count(), 100)
    // Regression: the creation run used to schedule a trailing timer that
    // re-set the value `signal()` was already seeded with.
    expect(vi.getTimerCount()).toBe(0)

    // The first REAL change still arms the trailing edge normally.
    setCount(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('propagates a new value only after it is stable for the delay', () => {
    const [count, setCount] = signal(0)
    const { value } = useDebounced(() => count(), 100)

    setCount(1)
    vi.advanceTimersByTime(50)
    expect(value()).toBe(0)
    vi.advanceTimersByTime(50)
    expect(value()).toBe(1)
  })

  it('rapid changes within the window coalesce to the LAST value only', () => {
    const [count, setCount] = signal(0)
    const { value } = useDebounced(() => count(), 100)

    setCount(1)
    vi.advanceTimersByTime(40)
    setCount(2)
    vi.advanceTimersByTime(40)
    setCount(3)
    vi.advanceTimersByTime(40)
    expect(value()).toBe(0)

    vi.advanceTimersByTime(100)
    expect(value()).toBe(3)
  })

  it('scope.stop() prevents a pending debounce from ever firing', () => {
    const [count, setCount] = signal(0)
    const scope = effectScope()
    const { value } = scope.run(() => useDebounced(() => count(), 100)) as ReturnType<
      typeof useDebounced<number>
    >

    setCount(1)
    scope.stop()
    vi.advanceTimersByTime(200)
    expect(value()).toBe(0)
  })
})

describe('@aihu/use/useDebounced — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static getter of a single source() read', () =>
    withSSR(
      () => import('../src/useDebounced/index.ts'),
      (mod) => {
        let calls = 0
        const source = () => {
          calls += 1
          return 7
        }
        let ret: ReturnType<typeof mod.useDebounced<number>> | undefined
        expect(() => {
          ret = mod.useDebounced(source, 100)
        }).not.toThrow()
        expect(ret?.value()).toBe(7)
        expect(ret?.value()).toBe(7)
        expect(calls).toBe(1)
      },
    ))
})
