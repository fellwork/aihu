/**
 * Unit tests for `useIntervalFn` (effect-scope plan §5): auto-start,
 * pause/resume, scope cleanup, and the SSR-static path (simulated
 * `!isClient` via module re-evaluation). jsdom environment (root vitest
 * config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIntervalFn } from '../src/useIntervalFn/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useIntervalFn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-starts by default and calls the callback every interval', () => {
    const callback = vi.fn()
    const { isActive } = useIntervalFn(callback, 100)
    expect(isActive()).toBe(true)
    vi.advanceTimersByTime(350)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('immediate: false does not start until resume() is called', () => {
    const callback = vi.fn()
    const { isActive, resume } = useIntervalFn(callback, 100, { immediate: false })
    expect(isActive()).toBe(false)
    vi.advanceTimersByTime(300)
    expect(callback).not.toHaveBeenCalled()

    resume()
    expect(isActive()).toBe(true)
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('pause() stops further calls; resume() restarts', () => {
    const callback = vi.fn()
    const { isActive, pause, resume } = useIntervalFn(callback, 100)
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)

    pause()
    expect(isActive()).toBe(false)
    vi.advanceTimersByTime(300)
    expect(callback).toHaveBeenCalledTimes(1)

    resume()
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('pause() is idempotent', () => {
    const { pause } = useIntervalFn(() => {}, 100)
    expect(() => {
      pause()
      pause()
    }).not.toThrow()
  })

  it('scope.stop() clears the interval', () => {
    const callback = vi.fn()
    const scope = effectScope()
    scope.run(() => useIntervalFn(callback, 100))
    vi.advanceTimersByTime(100)
    expect(callback).toHaveBeenCalledTimes(1)

    scope.stop()
    vi.advanceTimersByTime(300)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('resume() after scope disposal does not re-arm the interval', () => {
    const callback = vi.fn()
    const scope = effectScope()
    const ret = scope.run(() => useIntervalFn(callback, 100)) as ReturnType<typeof useIntervalFn>

    scope.stop()
    ret.resume()
    // Regression: a still-referenced resume() used to restart the interval
    // (and fire state updates) after the owning scope tore down.
    expect(ret.isActive()).toBe(false)
    vi.advanceTimersByTime(300)
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('@aihu/use/useIntervalFn — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static isActive()=false and registers nothing', () =>
    withSSR(
      () => import('../src/useIntervalFn/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useIntervalFn> | undefined
        expect(() => {
          ret = mod.useIntervalFn(() => {}, 100)
        }).not.toThrow()
        expect(ret?.isActive()).toBe(false)
        expect(() => {
          ret?.pause()
          ret?.resume()
        }).not.toThrow()
      },
    ))
})
