/**
 * End-to-end test of the Plan 3.3 defer-attribute wrapping pattern.
 *
 * The compiler emits a postamble that looks up the freshly-defined custom
 * element via `customElements.get(tag)` and wraps its prototype
 * `connectedCallback` so instances bearing `defer` hydrate via
 * `_hydrateOnVisible`. This test reproduces that pattern by hand to
 * validate the runtime contract independently of the Rust binary.
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

  constructor(callback: (entries: FakeObserverEntry[]) => void) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  observe(el: Element): void {
    this.observed.push(el)
  }

  disconnect(): void {}

  trigger(isIntersecting: boolean): void {
    this.callback(this.observed.map((target) => ({ isIntersecting, target })))
  }
}

let tagCounter = 0
function uniqueTag(): string {
  return `x-defer-${tagCounter++}`
}

describe('defer attribute wrapping — Plan 3.3 integration', () => {
  let originalIO: typeof IntersectionObserver | undefined

  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    originalIO = (globalThis as { IntersectionObserver?: typeof IntersectionObserver })
      .IntersectionObserver
    ;(
      globalThis as unknown as { IntersectionObserver: typeof FakeIntersectionObserver }
    ).IntersectionObserver = FakeIntersectionObserver
  })

  afterEach(() => {
    if (originalIO !== undefined) {
      ;(globalThis as { IntersectionObserver?: typeof IntersectionObserver }).IntersectionObserver =
        originalIO
    } else {
      delete (globalThis as { IntersectionObserver?: typeof IntersectionObserver })
        .IntersectionObserver
    }
  })

  /**
   * Define a custom element whose original `connectedCallback` runs
   * `setupSpy`, then apply the same prototype-wrapping pattern the
   * compiler emits in `_buildDeferredHydration`.
   */
  function defineDeferAware(tag: string, setupSpy: () => void): typeof HTMLElement {
    class C extends HTMLElement {
      connectedCallback(): void {
        setupSpy()
      }
    }
    // Wrap BEFORE customElements.define so JSDOM's upgrade path captures
    // the wrapped callback (matches the pattern the compiler emits in
    // _buildDeferredHydration after defineElement runs — the runtime's
    // own defineElement subclasses the constructor, which preserves
    // prototype lookup at fire-time).
    const orig = (C.prototype as unknown as { connectedCallback?: () => void }).connectedCallback
    if (typeof orig === 'function') {
      ;(C.prototype as unknown as { connectedCallback: () => void }).connectedCallback = function (
        this: HTMLElement,
      ) {
        if (this.hasAttribute('defer')) {
          _hydrateOnVisible(this, () => orig.call(this))
        } else {
          orig.call(this)
        }
      }
    }
    customElements.define(tag, C)
    return customElements.get(tag) as typeof HTMLElement
  }

  it('hydrates eagerly when defer attribute is absent (#1)', () => {
    const setup = vi.fn()
    const tag = uniqueTag()
    defineDeferAware(tag, setup)
    const el = document.createElement(tag)
    document.body.appendChild(el)
    expect(setup).toHaveBeenCalledTimes(1)
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
    el.remove()
  })

  it('defers hydration until viewport intersection when defer is set (#2)', () => {
    const setup = vi.fn()
    const tag = uniqueTag()
    defineDeferAware(tag, setup)
    const el = document.createElement(tag)
    el.setAttribute('defer', '')
    document.body.appendChild(el)
    // Hydrate spy must NOT be called before intersection.
    expect(setup).not.toHaveBeenCalled()
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
    FakeIntersectionObserver.instances[0]?.trigger(true)
    expect(setup).toHaveBeenCalledTimes(1)
    el.remove()
  })

  it('does not hydrate while defer element stays out of view (#3)', () => {
    const setup = vi.fn()
    const tag = uniqueTag()
    defineDeferAware(tag, setup)
    const el = document.createElement(tag)
    el.setAttribute('defer', '')
    document.body.appendChild(el)
    FakeIntersectionObserver.instances[0]?.trigger(false)
    expect(setup).not.toHaveBeenCalled()
    el.remove()
  })
})
