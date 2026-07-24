/**
 * Unit tests for `useIdle` (effect-scope plan §5): idle-after-timeout,
 * activity events resetting the timer, `visibilitychange` resetting on
 * tab return, `reset()`, scope cleanup, and the SSR-static path (simulated
 * `!isClient` via module re-evaluation). jsdom environment (root vitest
 * config).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIdle } from '../src/useIdle/index.ts'
import { withSSR } from './_ssr.ts'

function setVisibility(state: DocumentVisibilityState): void {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state })
}

describe('@aihu/use/useIdle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('flips idle() to true after timeout ms with no activity', () => {
    const { idle } = useIdle({ timeout: 1000 })
    expect(idle()).toBe(false)
    vi.advanceTimersByTime(999)
    expect(idle()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(idle()).toBe(true)
  })

  it('an activity event resets the timer and clears idle()', () => {
    const { idle } = useIdle({ timeout: 1000 })
    vi.advanceTimersByTime(1000)
    expect(idle()).toBe(true)
    window.dispatchEvent(new Event('mousemove'))
    expect(idle()).toBe(false)
    vi.advanceTimersByTime(999)
    expect(idle()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(idle()).toBe(true)
  })

  it('lastActive() updates on activity', () => {
    vi.setSystemTime(1_000_000)
    const { lastActive } = useIdle({ timeout: 1000 })
    expect(lastActive()).toBe(0)
    window.dispatchEvent(new Event('keydown'))
    expect(lastActive()).toBe(1_000_000)
  })

  it('respects a custom events list', () => {
    const { idle } = useIdle({ timeout: 1000, events: ['wheel'] })
    vi.advanceTimersByTime(1000)
    expect(idle()).toBe(true)
    // Not in the custom list — must not reset.
    window.dispatchEvent(new Event('mousemove'))
    expect(idle()).toBe(true)
    window.dispatchEvent(new Event('wheel'))
    expect(idle()).toBe(false)
  })

  it('the tab becoming visible again resets the idle timer', () => {
    const { idle } = useIdle({ timeout: 1000 })
    vi.advanceTimersByTime(1000)
    expect(idle()).toBe(true)
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(idle()).toBe(false)
  })

  it('reset() manually clears idle() and restarts the timeout', () => {
    const { idle, reset } = useIdle({ timeout: 1000 })
    vi.advanceTimersByTime(1000)
    expect(idle()).toBe(true)
    reset()
    expect(idle()).toBe(false)
    vi.advanceTimersByTime(999)
    expect(idle()).toBe(false)
    vi.advanceTimersByTime(1)
    expect(idle()).toBe(true)
  })

  it('scope.stop() clears the pending timer and removes listeners', () => {
    const scope = effectScope()
    const ret = scope.run(() => useIdle({ timeout: 1000 })) as ReturnType<typeof useIdle>
    scope.stop()
    vi.advanceTimersByTime(2000)
    expect(ret.idle()).toBe(false) // timer was cleared, never fired
    window.dispatchEvent(new Event('mousemove'))
    expect(ret.lastActive()).toBe(0) // listener was removed
  })

  it('reset() after scope dispose does not re-arm a timer (re-arm-after-dispose regression)', () => {
    const scope = effectScope()
    const ret = scope.run(() => useIdle({ timeout: 1000 })) as ReturnType<typeof useIdle>
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
    // A retained reset() called post-dispose must be inert — no re-armed
    // setTimeout writing to signals of a dead scope.
    ret.reset()
    expect(vi.getTimerCount()).toBe(0)
    ret.reset()
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('@aihu/use/useIdle — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, returns static getters and reset() is a no-op', () =>
    withSSR(
      () => import('../src/useIdle/index.ts'),
      (mod) => {
        const { idle, lastActive, reset } = mod.useIdle({ initialState: true })
        expect(idle()).toBe(true)
        expect(lastActive()).toBe(0)
        expect(() => reset()).not.toThrow()
        expect(idle()).toBe(true)
      },
    ))
})
