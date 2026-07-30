/**
 * Unit tests for `usePerformanceObserver` (effect-scope plan §5): callback
 * wiring, the `{ stop }` return shape, the feature-detection guard when
 * `PerformanceObserver` is unsupported, and the SSR-static path. jsdom does
 * not implement `PerformanceObserver`, so a fake is stubbed in for the
 * supported-path tests and deliberately left absent for the unsupported
 * one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePerformanceObserver } from '../src/usePerformanceObserver/index.ts'
import { withSSR } from './_ssr.ts'

type POCallback = (list: unknown, observer: unknown) => void

class FakePerformanceObserver {
  static instances: FakePerformanceObserver[] = []
  cb: POCallback
  observeOptions: unknown
  disconnected = false
  constructor(cb: POCallback) {
    this.cb = cb
    FakePerformanceObserver.instances.push(this)
  }
  observe(options: unknown): void {
    this.observeOptions = options
  }
  disconnect(): void {
    this.disconnected = true
  }
  fire(list: unknown): void {
    this.cb(list, this)
  }
}

describe('@aihu/use/usePerformanceObserver', () => {
  beforeEach(() => {
    FakePerformanceObserver.instances = []
    vi.stubGlobal('PerformanceObserver', FakePerformanceObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observes with the given options and forwards entries to the callback', () => {
    const callback = vi.fn()
    usePerformanceObserver(callback, { entryTypes: ['mark'] })
    const observer = FakePerformanceObserver.instances[0]
    expect(observer?.observeOptions).toEqual({ entryTypes: ['mark'] })
    observer?.fire('the-list')
    expect(callback).toHaveBeenCalledWith('the-list', observer)
  })

  it('stop() disconnects the observer and is idempotent', () => {
    const { stop } = usePerformanceObserver(() => {}, { entryTypes: ['mark'] })
    const observer = FakePerformanceObserver.instances[0]
    stop()
    expect(observer?.disconnected).toBe(true)
    expect(() => stop()).not.toThrow()
  })

  it('unsupported (no global PerformanceObserver): registers nothing, stop() is a no-op', () => {
    vi.unstubAllGlobals()
    delete (globalThis as { PerformanceObserver?: unknown }).PerformanceObserver
    const callback = vi.fn()
    const { stop } = usePerformanceObserver(callback, { entryTypes: ['mark'] })
    expect(callback).not.toHaveBeenCalled()
    expect(() => stop()).not.toThrow()
  })
})

describe('@aihu/use/usePerformanceObserver — SSR-static path', () => {
  it('with isClient false, registers nothing and stop() is a no-op', () =>
    withSSR(
      () => import('../src/usePerformanceObserver/index.ts'),
      (mod) => {
        const callback = vi.fn()
        let ret: { stop: () => void } | undefined
        expect(() => {
          ret = mod.usePerformanceObserver(callback, { entryTypes: ['mark'] })
        }).not.toThrow()
        expect(callback).not.toHaveBeenCalled()
        expect(() => ret?.stop()).not.toThrow()
      },
    ))
})
