/**
 * Unit tests for `useTimeoutFn` (effect-scope plan §5): auto-start,
 * start/stop, restart-replaces-pending, scope cleanup, and the SSR-static
 * path (simulated `!isClient` via module re-evaluation). jsdom environment
 * (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimeoutFn } from '../src/useTimeoutFn/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useTimeoutFn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-starts by default and calls the callback once after delay', () => {
    const callback = vi.fn()
    const { isPending } = useTimeoutFn(callback, 100)
    expect(isPending()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(isPending()).toBe(false)
    vi.advanceTimersByTime(500)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('immediate: false does not start until start() is called', () => {
    const callback = vi.fn()
    const { isPending, start } = useTimeoutFn(callback, 100, { immediate: false })
    expect(isPending()).toBe(false)
    vi.advanceTimersByTime(300)
    expect(callback).not.toHaveBeenCalled()

    start()
    expect(isPending()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('stop() cancels a pending timeout', () => {
    const callback = vi.fn()
    const { isPending, stop } = useTimeoutFn(callback, 100)
    stop()
    expect(isPending()).toBe(false)
    vi.advanceTimersByTime(200)
    expect(callback).not.toHaveBeenCalled()
  })

  it('start() called again replaces the pending timeout', () => {
    const callback = vi.fn()
    const { start } = useTimeoutFn(callback, 100, { immediate: false })
    start()
    vi.advanceTimersByTime(50)
    start()
    vi.advanceTimersByTime(50)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(50)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('stop() is idempotent', () => {
    const { stop } = useTimeoutFn(() => {}, 100)
    expect(() => {
      stop()
      stop()
    }).not.toThrow()
  })

  it('scope.stop() clears a pending timeout', () => {
    const callback = vi.fn()
    const scope = effectScope()
    scope.run(() => useTimeoutFn(callback, 100))

    scope.stop()
    vi.advanceTimersByTime(200)
    expect(callback).not.toHaveBeenCalled()
  })

  it('start() after scope disposal does not re-arm the timeout', () => {
    const callback = vi.fn()
    const scope = effectScope()
    const ret = scope.run(() => useTimeoutFn(callback, 100, { immediate: false })) as ReturnType<
      typeof useTimeoutFn
    >

    scope.stop()
    ret.start()
    // Regression: a still-referenced start() used to arm a fresh timeout
    // (and fire state updates) after the owning scope tore down.
    expect(ret.isPending()).toBe(false)
    vi.advanceTimersByTime(300)
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('@aihu/use/useTimeoutFn — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static isPending()=false and registers nothing', () =>
    withSSR(
      () => import('../src/useTimeoutFn/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useTimeoutFn> | undefined
        expect(() => {
          ret = mod.useTimeoutFn(() => {}, 100)
        }).not.toThrow()
        expect(ret?.isPending()).toBe(false)
        expect(() => {
          ret?.start()
          ret?.stop()
        }).not.toThrow()
      },
    ))
})
