/**
 * Unit tests for `useTimeout` (effect-scope plan §5): default settling,
 * immediate: false, restart via start(), stop(), and the SSR-static path
 * (simulated `!isClient` via module re-evaluation). jsdom environment
 * (root vitest config).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimeout } from '../src/useTimeout/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('starts false and flips to true after delay', () => {
    const { ready } = useTimeout(100)
    expect(ready()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(ready()).toBe(true)
  })

  it('immediate: false does not start until start() is called', () => {
    const { ready, start } = useTimeout(100, { immediate: false })
    vi.advanceTimersByTime(300)
    expect(ready()).toBe(false)

    start()
    vi.advanceTimersByTime(100)
    expect(ready()).toBe(true)
  })

  it('start() restarts a pending timeout and resets ready to false', () => {
    const { ready, start } = useTimeout(100)
    vi.advanceTimersByTime(100)
    expect(ready()).toBe(true)

    start()
    expect(ready()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(ready()).toBe(true)
  })

  it('stop() cancels a pending timeout without flipping ready', () => {
    const { ready, stop } = useTimeout(100)
    stop()
    vi.advanceTimersByTime(200)
    expect(ready()).toBe(false)
  })

  it('stop() is idempotent', () => {
    const { stop } = useTimeout(100)
    expect(() => {
      stop()
      stop()
    }).not.toThrow()
  })
})

describe('@aihu/use/useTimeout — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static ready()=false and registers nothing', () =>
    withSSR(
      () => import('../src/useTimeout/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useTimeout> | undefined
        expect(() => {
          ret = mod.useTimeout(100)
        }).not.toThrow()
        expect(ret?.ready()).toBe(false)
        expect(() => {
          ret?.start()
          ret?.stop()
        }).not.toThrow()
      },
    ))
})
