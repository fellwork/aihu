/**
 * Unit tests for `useIntersectionObserver` — the general
 * `IntersectionObserver` wrapper (effect-scope plan §5): callback wiring,
 * `isActive`/`pause`/`resume`/`stop`, `root`/`rootMargin`/`threshold`
 * options, scope cleanup, and the SSR-static path. jsdom's
 * `IntersectionObserver` is stubbed here since jsdom itself does not
 * implement it.
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useIntersectionObserver } from '../src/useIntersectionObserver/index.ts'
import { withSSR } from './_ssr.ts'

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  cb: IOCallback
  observed: Element | null = null
  init: unknown
  disconnected = false
  constructor(cb: IOCallback, init?: unknown) {
    this.cb = cb
    this.init = init
    FakeIntersectionObserver.instances.push(this)
  }
  observe(el: Element): void {
    this.observed = el
  }
  disconnect(): void {
    this.disconnected = true
  }
  unobserve(): void {}
  fire(isIntersecting: boolean): void {
    this.cb([{ isIntersecting }])
  }
}

describe('@aihu/use/useIntersectionObserver', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts active by default and observes the target', () => {
    const el = document.createElement('div')
    const callback = vi.fn()
    const { isActive } = useIntersectionObserver(el, callback)
    expect(isActive()).toBe(true)
    const observer = FakeIntersectionObserver.instances[0]
    expect(observer?.observed).toBe(el)
  })

  it('forwards entries to the callback', () => {
    const el = document.createElement('div')
    const callback = vi.fn()
    useIntersectionObserver(el, callback)
    const observer = FakeIntersectionObserver.instances[0]
    observer?.fire(true)
    expect(callback).toHaveBeenCalledWith([{ isIntersecting: true }], observer)
  })

  it('passes root/rootMargin/threshold through to the native init', () => {
    const el = document.createElement('div')
    const root = document.createElement('section')
    useIntersectionObserver(el, () => {}, {
      root,
      rootMargin: '10px',
      threshold: [0, 0.5, 1],
    })
    expect(FakeIntersectionObserver.instances[0]?.init).toEqual({
      root,
      rootMargin: '10px',
      threshold: [0, 0.5, 1],
    })
  })

  it('immediate: false does not attach until resume() is called', () => {
    const el = document.createElement('div')
    const { isActive, resume } = useIntersectionObserver(el, () => {}, { immediate: false })
    expect(isActive()).toBe(false)
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
    resume()
    expect(isActive()).toBe(true)
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
  })

  it('pause() disconnects without stopping; resume() re-attaches', () => {
    const el = document.createElement('div')
    const { isActive, pause, resume } = useIntersectionObserver(el, () => {})
    const first = FakeIntersectionObserver.instances[0]
    pause()
    expect(isActive()).toBe(false)
    expect(first?.disconnected).toBe(true)
    resume()
    expect(isActive()).toBe(true)
    expect(FakeIntersectionObserver.instances).toHaveLength(2)
  })

  it('stop() disconnects permanently — a subsequent resume() is a no-op', () => {
    const el = document.createElement('div')
    const { isActive, resume, stop } = useIntersectionObserver(el, () => {})
    const first = FakeIntersectionObserver.instances[0]
    stop()
    expect(isActive()).toBe(false)
    expect(first?.disconnected).toBe(true)
    resume()
    expect(isActive()).toBe(false)
    expect(FakeIntersectionObserver.instances).toHaveLength(1)
    expect(() => stop()).not.toThrow()
  })

  it('no target: registers no observer, stays active-false until one resolves', () => {
    useIntersectionObserver(null, () => {})
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
  })

  it('scope.stop() disconnects the observer', () => {
    const el = document.createElement('div')
    const scope = effectScope()
    scope.run(() => useIntersectionObserver(el, () => {}))
    const observer = FakeIntersectionObserver.instances[0]
    expect(observer?.disconnected).toBe(false)
    scope.stop()
    expect(observer?.disconnected).toBe(true)
  })
})

describe('@aihu/use/useIntersectionObserver — SSR-static path', () => {
  it('with isClient false, isActive() is false and every action is a no-op', () =>
    withSSR(
      () => import('../src/useIntersectionObserver/index.ts'),
      (mod) => {
        const callback = vi.fn()
        let ret:
          | { isActive: () => boolean; pause: () => void; resume: () => void; stop: () => void }
          | undefined
        expect(() => {
          ret = mod.useIntersectionObserver(null, callback)
        }).not.toThrow()
        expect(ret?.isActive()).toBe(false)
        expect(callback).not.toHaveBeenCalled()
        expect(() => {
          ret?.pause()
          ret?.resume()
          ret?.stop()
        }).not.toThrow()
      },
    ))
})
