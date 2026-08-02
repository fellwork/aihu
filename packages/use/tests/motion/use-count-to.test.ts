/**
 * Unit tests for `useCountTo` (`@aihu/use/motion` wave 1 — performativeUI
 * port doc, Track B Slice 3): tween-to-target via rAF, skip, reduced-motion
 * bypass, scope cleanup, and the SSR-static path. jsdom environment (root
 * vitest config) — jsdom's `requestAnimationFrame` runs on a real macrotask
 * timer, so these tests use fake timers and step it via
 * `vi.advanceTimersToNextFrame`.
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCountTo } from '../../src/motion/useCountTo/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from '../_match-media.ts'
import { withSSR } from '../_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/motion/useCountTo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not tween until start() is called', () => {
    const { value, isCounting } = useCountTo({ from: 0 })
    expect(value()).toBe(0)
    expect(isCounting()).toBe(false)
    vi.advanceTimersToNextFrame()
    expect(value()).toBe(0)
  })

  it('start() tweens toward the target and lands on it exactly', () => {
    const { value, isCounting, start } = useCountTo({ from: 0, duration: 100, decimals: 0 })
    start(100)
    expect(isCounting()).toBe(true)
    vi.advanceTimersToNextFrame() // t=0 frame: elapsed 0
    expect(value()).toBeGreaterThanOrEqual(0)
    // Advance past the full duration; jsdom rAF ticks ~16ms per frame.
    for (let i = 0; i < 20; i++) vi.advanceTimersToNextFrame()
    expect(value()).toBe(100)
    expect(isCounting()).toBe(false)
  })

  it('rounds to the configured decimal places', () => {
    const { value, start } = useCountTo({ from: 0, duration: 50, decimals: 2 })
    start(1)
    for (let i = 0; i < 10; i++) vi.advanceTimersToNextFrame()
    expect(value()).toBe(1)
  })

  it('skip() jumps straight to the in-flight target and stops', () => {
    const { value, isCounting, start, skip } = useCountTo({ from: 0, duration: 1000 })
    start(50)
    vi.advanceTimersToNextFrame()
    skip()
    expect(value()).toBe(50)
    expect(isCounting()).toBe(false)
  })

  it('stop() freezes value() where it stands', () => {
    const { value, isCounting, start, stop } = useCountTo({ from: 0, duration: 1000 })
    start(100)
    vi.advanceTimersToNextFrame()
    stop()
    const frozen = value()
    for (let i = 0; i < 5; i++) vi.advanceTimersToNextFrame()
    expect(value()).toBe(frozen)
    expect(isCounting()).toBe(false)
  })

  it('a second start() tweens from the current value, not from `from`', () => {
    const { value, start } = useCountTo({ from: 0, duration: 50 })
    start(10)
    for (let i = 0; i < 10; i++) vi.advanceTimersToNextFrame()
    expect(value()).toBe(10)
    start(0)
    for (let i = 0; i < 10; i++) vi.advanceTimersToNextFrame()
    expect(value()).toBe(0)
  })

  it('honors reduced motion: start() lands on the target immediately', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    const { value, isCounting, start } = useCountTo({ from: 0, duration: 1000 })
    start(42)
    expect(value()).toBe(42)
    expect(isCounting()).toBe(false)
    vi.advanceTimersToNextFrame()
    expect(value()).toBe(42)
  })

  it('disposing the owning scope stops the in-flight tween', () => {
    const scope = effectScope()
    let counter!: ReturnType<typeof useCountTo>
    scope.run(() => {
      counter = useCountTo({ from: 0, duration: 1000 })
    })
    counter.start(100)
    vi.advanceTimersToNextFrame()
    const before = counter.value()
    scope.stop()
    for (let i = 0; i < 5; i++) vi.advanceTimersToNextFrame()
    expect(counter.value()).toBe(before)
    counter.start(999)
    for (let i = 0; i < 5; i++) vi.advanceTimersToNextFrame()
    expect(counter.value()).toBe(before)
  })
})

describe('@aihu/use/motion/useCountTo — SSR-static path', () => {
  it('with isClient false, value() tracks the last start() target', () =>
    withSSR(
      () => import('../../src/motion/useCountTo/index.ts'),
      (mod) => {
        let result: ReturnType<typeof mod.useCountTo> | undefined
        expect(() => {
          result = mod.useCountTo({ from: 5 })
        }).not.toThrow()
        expect(result?.value()).toBe(5)
        expect(result?.isCounting()).toBe(false)
        result?.start(42)
        expect(result?.value()).toBe(42)
        expect(() => {
          result?.stop()
          result?.skip()
        }).not.toThrow()
      },
    ))
})
