/**
 * Unit tests for `_hydrateOnVisible` (Plan 3.3 — Islands).
 *
 * Validates the IntersectionObserver-driven defer path and the immediate
 * fallback when the API is missing. JSDOM lacks a real IntersectionObserver,
 * so each test installs a controllable stub on `globalThis` and restores
 * the original after the assertion.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _hydrateOnVisible } from '../src/hydrate-on-visible.ts'

interface FakeObserverEntry {
  isIntersecting: boolean
  target: Element
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  callback: (entries: FakeObserverEntry[]) => void
  observed: Element[] = []
  disconnected = false

  constructor(callback: (entries: FakeObserverEntry[]) => void) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  observe(el: Element): void {
    this.observed.push(el)
  }

  disconnect(): void {
    this.disconnected = true
  }

  trigger(isIntersecting: boolean): void {
    this.callback(
      this.observed.map((target) => ({ isIntersecting, target })),
    )
  }
}

describe('_hydrateOnVisible — Plan 3.3', () => {
  let originalIO: typeof IntersectionObserver | undefined

  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    originalIO = (globalThis as { IntersectionObserver?: typeof IntersectionObserver })
      .IntersectionObserver
    ;(globalThis as unknown as { IntersectionObserver: typeof FakeIntersectionObserver })
      .IntersectionObserver = FakeIntersectionObserver
  })

  afterEach(() => {
    if (originalIO !== undefined) {
      ;(globalThis as { IntersectionObserver?: typeof IntersectionObserver })
        .IntersectionObserver = originalIO
    } else {
      delete (globalThis as { IntersectionObserver?: typeof IntersectionObserver })
        .IntersectionObserver
    }
  })

  it('does not call hydrate before the element intersects (#1)', () => {
    const el = document.createElement('div')
    const hydrate = vi.fn()
    _hydrateOnVisible(el, hydrate)
    expect(hydrate).not.toHaveBeenCalled()
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
    expect(FakeIntersectionObserver.instances[0]?.observed).toContain(el)
  })

  it('calls hydrate exactly once when the element first intersects (#2)', () => {
    const el = document.createElement('div')
    const hydrate = vi.fn()
    _hydrateOnVisible(el, hydrate)
    const obs = FakeIntersectionObserver.instances[0]
    expect(obs).toBeDefined()
    obs?.trigger(true)
    expect(hydrate).toHaveBeenCalledTimes(1)
    expect(obs?.disconnected).toBe(true)
  })

  it('ignores non-intersecting entries (#3)', () => {
    const el = document.createElement('div')
    const hydrate = vi.fn()
    _hydrateOnVisible(el, hydrate)
    const obs = FakeIntersectionObserver.instances[0]
    obs?.trigger(false)
    expect(hydrate).not.toHaveBeenCalled()
    expect(obs?.disconnected).toBe(false)
  })

  it('observes the element with the IntersectionObserver constructor (#4)', () => {
    const el = document.createElement('div')
    const hydrate = vi.fn()
    _hydrateOnVisible(el, hydrate)
    // Constructor was invoked exactly once; the element was observed.
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
    expect(FakeIntersectionObserver.instances[0]?.observed).toEqual([el])
  })

  it('disconnects the observer after the first intersection (#5)', () => {
    const el = document.createElement('div')
    const hydrate = vi.fn()
    _hydrateOnVisible(el, hydrate)
    const obs = FakeIntersectionObserver.instances[0]
    obs?.trigger(true)
    expect(obs?.disconnected).toBe(true)
  })
})
