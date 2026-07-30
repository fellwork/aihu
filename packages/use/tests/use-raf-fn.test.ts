/**
 * Unit tests for `useRafFn` (effect-scope plan §5): auto-start, delta
 * timing, pause/resume, scope cleanup, and the SSR-static path (simulated
 * `!isClient` via module re-evaluation). jsdom environment (root vitest
 * config) — jsdom's `requestAnimationFrame` runs on a real macrotask timer,
 * so these tests use fake timers and step it via `vi.advanceTimersByTime`.
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRafFn } from '../src/useRafFn/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useRafFn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-starts by default and calls the callback on each frame', () => {
    const callback = vi.fn()
    const { isActive } = useRafFn(callback)
    expect(isActive()).toBe(true)
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    expect(callback).toHaveBeenCalledTimes(2)
  })

  it('the first frame reports delta 0; later frames report elapsed ms', () => {
    const seen: number[] = []
    useRafFn(({ delta }) => seen.push(delta))
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    expect(seen[0]).toBe(0)
    expect(seen[1]).toBeGreaterThan(0)
  })

  it('immediate: false does not start until resume() is called', () => {
    const callback = vi.fn()
    const { isActive, resume } = useRafFn(callback, { immediate: false })
    expect(isActive()).toBe(false)
    vi.advanceTimersToNextFrame()
    expect(callback).not.toHaveBeenCalled()

    resume()
    expect(isActive()).toBe(true)
    vi.advanceTimersToNextFrame()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('pause() stops further frames; resume() restarts with a fresh delta', () => {
    const callback = vi.fn()
    const { isActive, pause, resume } = useRafFn(callback)
    vi.advanceTimersToNextFrame()
    expect(callback).toHaveBeenCalledTimes(1)

    pause()
    expect(isActive()).toBe(false)
    vi.advanceTimersToNextFrame()
    expect(callback).toHaveBeenCalledTimes(1)

    resume()
    vi.advanceTimersToNextFrame()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(expect.objectContaining({ delta: 0 }))
  })

  it('pause() called from inside the callback stops the loop for good', () => {
    let ticks = 0
    const { isActive, pause } = useRafFn(() => {
      ticks += 1
      if (ticks === 2) pause()
    })
    const isActiveRef = isActive

    vi.advanceTimersToNextFrame() // tick 1
    vi.advanceTimersToNextFrame() // tick 2 — calls pause() from inside
    expect(ticks).toBe(2)
    expect(isActiveRef()).toBe(false)

    // Regression: an unstopped loop would keep firing every frame here
    // even though isActive() reports false.
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    expect(ticks).toBe(2)
  })

  it('scope.stop() cancels the frame loop', () => {
    const callback = vi.fn()
    const scope = effectScope()
    scope.run(() => useRafFn(callback))
    vi.advanceTimersToNextFrame()
    expect(callback).toHaveBeenCalledTimes(1)

    scope.stop()
    vi.advanceTimersToNextFrame()
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('resume() after scope disposal does not re-arm the loop', () => {
    const callback = vi.fn()
    const scope = effectScope()
    const ret = scope.run(() => useRafFn(callback, { immediate: false })) as ReturnType<
      typeof useRafFn
    >

    scope.stop()
    ret.resume()
    // Regression: a still-referenced resume() used to restart the frame loop
    // (and fire state updates) after the owning scope tore down.
    expect(ret.isActive()).toBe(false)
    vi.advanceTimersToNextFrame()
    vi.advanceTimersToNextFrame()
    expect(callback).not.toHaveBeenCalled()
  })
})

describe('@aihu/use/useRafFn — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static isActive()=false and registers nothing', () =>
    withSSR(
      () => import('../src/useRafFn/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useRafFn> | undefined
        expect(() => {
          ret = mod.useRafFn(() => {})
        }).not.toThrow()
        expect(ret?.isActive()).toBe(false)
        expect(() => {
          ret?.pause()
          ret?.resume()
        }).not.toThrow()
      },
    ))
})
