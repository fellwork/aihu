/**
 * Unit tests for `useTimeAgo` (effect-scope plan §5): initial relative-time
 * text, auto-updating cadence, pause/resume, scope cleanup, and the
 * SSR-static path (simulated `!isClient` via module re-evaluation). jsdom
 * environment (root vitest config).
 */
import { effect, effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTimeAgo } from '../src/useTimeAgo/index.ts'
import { withSSR } from './_ssr.ts'

const rtf = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

describe('@aihu/use/useTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('formats a past Date as a relative-time string', () => {
    const target = Date.now() - 3 * 60_000 // 3 minutes ago
    const { timeAgo } = useTimeAgo(target, { locales: 'en-US' })
    expect(timeAgo()).toBe(rtf.format(-3, 'minute'))
  })

  it('formats a future Date as a relative-time string', () => {
    const target = Date.now() + 5 * 60_000 // in 5 minutes
    const { timeAgo } = useTimeAgo(target, { locales: 'en-US' })
    expect(timeAgo()).toBe(rtf.format(5, 'minute'))
  })

  it('auto-updates as time passes (seconds-scale cadence)', () => {
    const start = Date.now()
    const { timeAgo } = useTimeAgo(start, { locales: 'en-US' })
    expect(timeAgo()).toBe(rtf.format(0, 'second'))

    vi.advanceTimersByTime(30_000)
    expect(timeAgo()).toBe(rtf.format(-30, 'second'))
  })

  it('accepts a reactive getter source', () => {
    let target = Date.now() - 60_000
    const { timeAgo } = useTimeAgo(() => target, { locales: 'en-US' })
    expect(timeAgo()).toBe(rtf.format(-1, 'minute'))

    target = Date.now() - 2 * 60_000
    vi.advanceTimersByTime(60_000) // triggers the next scheduled re-poll
    expect(timeAgo()).toBe(rtf.format(-3, 'minute'))
  })

  it('immediate: false does not start updating until resume() is called', () => {
    const target = Date.now() - 10_000
    const { timeAgo, resume } = useTimeAgo(target, { locales: 'en-US', immediate: false })
    const initial = timeAgo()
    vi.advanceTimersByTime(20_000)
    expect(timeAgo()).toBe(initial) // frozen — never started

    // 10s-old target + 20s of (fake) real time = 30s ago, still in the
    // 'second' bucket (kept under the 60s unit boundary deliberately).
    resume()
    expect(timeAgo()).toBe(rtf.format(-30, 'second'))
  })

  it('pause() stops further updates; resume() continues polling', () => {
    const target = Date.now() - 10_000
    const { timeAgo, pause, resume } = useTimeAgo(target, { locales: 'en-US' })
    pause()
    const frozen = timeAgo()
    vi.advanceTimersByTime(20_000)
    expect(timeAgo()).toBe(frozen)

    // Same 30s-total math as above.
    resume()
    expect(timeAgo()).toBe(rtf.format(-30, 'second'))
  })

  it('a synchronous pause() during signal propagation clears the just-armed timer, not the stale one (ordering regression)', () => {
    const target = Date.now() - 5_000
    const composable = useTimeAgo(target, { locales: 'en-US' })
    let runs = 0
    const stopEffect = effect(() => {
      composable.timeAgo() // track — subscribes this effect to the signal
      runs++
      // On the SECOND run (the first re-poll tick), synchronously pause —
      // simulating a subscriber that reacts to the value change by
      // cancelling. With the old (buggy) order, `tick()` called
      // `setTimeAgo` (triggering this effect, and thus `pause()`) BEFORE
      // assigning the next `handle` — so `pause()` cleared the stale
      // already-fired handle, and the unconditional `handle = setTimeout(...)`
      // afterward re-armed a new timer past the pause.
      if (runs === 2) composable.pause()
    })
    // Advance past the first re-poll: fires the pending tick, which (with
    // the fix) arms the next handle BEFORE calling setTimeAgo — so the
    // synchronous pause() above clears that freshly-armed handle.
    vi.advanceTimersByTime(1000)
    expect(runs).toBe(2)
    expect(vi.getTimerCount()).toBe(0)
    stopEffect()
  })

  it('a synchronous scope dispose during signal propagation leaves no self-rescheduling timer (leak regression)', () => {
    const target = Date.now() - 5_000
    const scope = effectScope()
    const composable = scope.run(() => useTimeAgo(target, { locales: 'en-US' })) as ReturnType<
      typeof useTimeAgo
    >
    let runs = 0
    const stopEffect = effect(() => {
      composable.timeAgo()
      runs++
      if (runs === 2) scope.stop()
    })
    vi.advanceTimersByTime(1000)
    expect(runs).toBe(2)
    // Without the `disposed` guard at the top of tick() (and the
    // arm-before-publish ordering), this chain would keep re-scheduling
    // itself forever even after the owning scope tore down.
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(vi.getTimerCount()).toBe(0)
    stopEffect()
  })

  it('scope.stop() stops further updates', () => {
    const scope = effectScope()
    const target = Date.now() - 5_000
    const { timeAgo } = scope.run(() => useTimeAgo(target, { locales: 'en-US' })) as ReturnType<
      typeof useTimeAgo
    >
    const frozen = timeAgo()

    scope.stop()
    vi.advanceTimersByTime(60_000)
    expect(timeAgo()).toBe(frozen)
  })
})

describe('@aihu/use/useTimeAgo — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns a static string computed once and registers nothing', () =>
    withSSR(
      () => import('../src/useTimeAgo/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useTimeAgo> | undefined
        expect(() => {
          ret = mod.useTimeAgo(Date.now() - 60_000, { locales: 'en-US' })
        }).not.toThrow()
        expect(typeof ret?.timeAgo()).toBe('string')
        expect(ret?.timeAgo()).toBe(ret?.timeAgo())
        expect(() => {
          ret?.pause()
          ret?.resume()
        }).not.toThrow()
      },
    ))
})
