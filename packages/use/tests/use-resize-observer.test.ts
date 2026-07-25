/**
 * Unit tests for `useResizeObserver` — the general `ResizeObserver` wrapper
 * (effect-scope plan §5): callback wiring, the `{ stop }` return shape,
 * reactive target rebinding, scope cleanup, and the SSR-static path.
 * jsdom's `ResizeObserver` is stubbed here since jsdom itself does not
 * implement it.
 */
import { effectScope, signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useResizeObserver } from '../src/useResizeObserver/index.ts'
import { withSSR } from './_ssr.ts'

type ROCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  cb: ROCallback
  observed: Element | null = null
  observeOptions: unknown
  disconnected = false
  constructor(cb: ROCallback) {
    this.cb = cb
    FakeResizeObserver.instances.push(this)
  }
  observe(el: Element, options?: unknown): void {
    this.observed = el
    this.observeOptions = options
  }
  disconnect(): void {
    this.disconnected = true
  }
  unobserve(): void {}
  fire(width: number, height: number): void {
    this.cb([{ contentRect: { width, height } }])
  }
}

describe('@aihu/use/useResizeObserver', () => {
  beforeEach(() => {
    FakeResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observes the target and forwards entries to the callback', () => {
    const el = document.createElement('div')
    const callback = vi.fn()
    useResizeObserver(el, callback)
    const observer = FakeResizeObserver.instances[0]
    expect(observer?.observed).toBe(el)
    expect(observer?.observeOptions).toEqual({ box: 'content-box' })
    observer?.fire(100, 200)
    expect(callback).toHaveBeenCalledWith([{ contentRect: { width: 100, height: 200 } }], observer)
  })

  it('passes through the box option', () => {
    const el = document.createElement('div')
    useResizeObserver(el, () => {}, { box: 'border-box' })
    expect(FakeResizeObserver.instances[0]?.observeOptions).toEqual({ box: 'border-box' })
  })

  it('no target: registers no observer', () => {
    useResizeObserver(null, () => {})
    expect(FakeResizeObserver.instances).toHaveLength(0)
  })

  it('a getter target rebinds: the observer follows a signal update', () => {
    const elA = document.createElement('div')
    const elB = document.createElement('span')
    const [el, setEl] = signal<Element | null>(elA)
    useResizeObserver(el, () => {})
    expect(FakeResizeObserver.instances[0]?.observed).toBe(elA)
    setEl(elB)
    expect(FakeResizeObserver.instances[0]?.disconnected).toBe(true)
    expect(FakeResizeObserver.instances[1]?.observed).toBe(elB)
  })

  it('stop() disconnects the observer and is idempotent', () => {
    const el = document.createElement('div')
    const { stop } = useResizeObserver(el, () => {})
    const observer = FakeResizeObserver.instances[0]
    expect(observer?.disconnected).toBe(false)
    stop()
    expect(observer?.disconnected).toBe(true)
    expect(() => stop()).not.toThrow()
  })

  it('scope.stop() disconnects the observer', () => {
    const el = document.createElement('div')
    const scope = effectScope()
    scope.run(() => useResizeObserver(el, () => {}))
    const observer = FakeResizeObserver.instances[0]
    expect(observer?.disconnected).toBe(false)
    scope.stop()
    expect(observer?.disconnected).toBe(true)
  })
})

describe('@aihu/use/useResizeObserver — SSR-static path', () => {
  it('with isClient false, registers nothing and stop() is a no-op', () =>
    withSSR(
      () => import('../src/useResizeObserver/index.ts'),
      (mod) => {
        const callback = vi.fn()
        let ret: { stop: () => void } | undefined
        expect(() => {
          ret = mod.useResizeObserver(null, callback)
        }).not.toThrow()
        expect(callback).not.toHaveBeenCalled()
        expect(() => ret?.stop()).not.toThrow()
      },
    ))
})
