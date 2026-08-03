/**
 * Unit tests for `useSequence` (`@aihu/use/motion` wave 1 — performativeUI
 * port doc, Track B Slice 3): auto-advance, loop/no-loop bounds, manual
 * next/prev, reduced-motion bypass, scope cleanup, and the SSR-static path.
 * jsdom environment (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSequence } from '../../src/motion/useSequence/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from '../_match-media.ts'
import { withSSR } from '../_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/motion/useSequence', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('auto-starts by default and advances one item per `interval` ms', () => {
    const { current, index, isRunning } = useSequence(['a', 'b', 'c'], { interval: 10 })
    expect(current()).toBe('a')
    expect(isRunning()).toBe(true)
    vi.advanceTimersByTime(10)
    expect(current()).toBe('b')
    expect(index()).toBe(1)
    vi.advanceTimersByTime(10)
    expect(current()).toBe('c')
  })

  it('loop: true (default) wraps from the last item back to the first', () => {
    const { current, start } = useSequence(['a', 'b'], { interval: 10 })
    start()
    vi.advanceTimersByTime(10)
    expect(current()).toBe('b')
    vi.advanceTimersByTime(10)
    expect(current()).toBe('a')
  })

  it('loop: false stops the interval (not just the value) at the last item', () => {
    const { current, isRunning } = useSequence(['a', 'b'], { interval: 10, loop: false })
    vi.advanceTimersByTime(10)
    expect(current()).toBe('b')
    // Regression: the interval used to keep ticking forever (a permanent
    // no-op wakeup) instead of actually pausing once there's nothing left
    // to advance to.
    expect(isRunning()).toBe(false)
    vi.advanceTimersByTime(50)
    expect(current()).toBe('b')
  })

  it('loop: false, single item: stops immediately (nothing to advance to)', () => {
    const { current, isRunning } = useSequence(['only'], { interval: 10, loop: false })
    vi.advanceTimersByTime(10)
    expect(current()).toBe('only')
    expect(isRunning()).toBe(false)
  })

  it('next()/prev() work regardless of the auto-advance interval', () => {
    const { current, next, prev, stop } = useSequence(['a', 'b', 'c'], { interval: 1000 })
    stop()
    next()
    expect(current()).toBe('b')
    next()
    expect(current()).toBe('c')
    next()
    expect(current()).toBe('a') // wraps (loop: true default)
    prev()
    expect(current()).toBe('c')
  })

  it('stop() halts auto-advance; start() resumes it', () => {
    const { current, stop, start } = useSequence(['a', 'b', 'c'], { interval: 10 })
    stop()
    vi.advanceTimersByTime(50)
    expect(current()).toBe('a')
    start()
    vi.advanceTimersByTime(10)
    expect(current()).toBe('b')
  })

  it('immediate: false does not auto-advance until start() is called', () => {
    const { current, isRunning } = useSequence(['a', 'b'], { interval: 10, immediate: false })
    expect(isRunning()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(current()).toBe('a')
  })

  it('honors reduced motion: auto-advance never fires, but next()/prev() still work', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    const { current, isRunning, next } = useSequence(['a', 'b', 'c'], { interval: 10 })
    expect(isRunning()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(current()).toBe('a')
    next()
    expect(current()).toBe('b')
  })

  it('reduced motion is live: a mid-run preference change pauses, and clearing it resumes', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const { current, isRunning } = useSequence(['a', 'b', 'c', 'd'], { interval: 10 })
    vi.advanceTimersByTime(10)
    expect(current()).toBe('b')
    expect(isRunning()).toBe(true)

    fireMatchMediaChange(mql, true)
    expect(isRunning()).toBe(false)
    vi.advanceTimersByTime(30)
    expect(current()).toBe('b') // frozen — no further auto-advance

    fireMatchMediaChange(mql, false)
    expect(isRunning()).toBe(true)
    vi.advanceTimersByTime(10)
    expect(current()).toBe('c') // resumed
  })

  it('an explicit stop() is not overridden by a later reduced-motion preference change', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const { current, isRunning, stop } = useSequence(['a', 'b', 'c'], { interval: 10 })
    stop()
    expect(isRunning()).toBe(false)

    // Toggling the preference on and back off must not resume a sequence
    // the caller explicitly stopped.
    fireMatchMediaChange(mql, true)
    fireMatchMediaChange(mql, false)
    expect(isRunning()).toBe(false)
    vi.advanceTimersByTime(100)
    expect(current()).toBe('a')
  })

  it('throws on an empty items array', () => {
    expect(() => useSequence([])).toThrow()
  })

  it('disposing the owning scope stops auto-advance', () => {
    const scope = effectScope()
    let seq!: ReturnType<typeof useSequence<string>>
    scope.run(() => {
      seq = useSequence(['a', 'b', 'c'], { interval: 10 })
    })
    vi.advanceTimersByTime(10)
    expect(seq.current()).toBe('b')
    scope.stop()
    vi.advanceTimersByTime(100)
    expect(seq.current()).toBe('b')
    seq.start()
    vi.advanceTimersByTime(100)
    expect(seq.current()).toBe('b')
  })
})

describe('@aihu/use/motion/useSequence — SSR-static path', () => {
  it('with isClient false, current() is items[0] and mutators are no-ops', () =>
    withSSR(
      () => import('../../src/motion/useSequence/index.ts'),
      (mod) => {
        let result: ReturnType<typeof mod.useSequence<string>> | undefined
        expect(() => {
          result = mod.useSequence(['a', 'b', 'c'])
        }).not.toThrow()
        expect(result?.current()).toBe('a')
        expect(result?.index()).toBe(0)
        expect(result?.isRunning()).toBe(false)
        expect(() => {
          result?.start()
          result?.stop()
          result?.next()
          result?.prev()
        }).not.toThrow()
      },
    ))
})
