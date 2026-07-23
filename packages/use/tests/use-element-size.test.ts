/**
 * Unit tests for `useElementSize` (effect-scope plan §5): ResizeObserver
 * wiring through the named-getter return shape, `initialSize`, scope
 * cleanup, and the SSR-static path. jsdom's `ResizeObserver` is stubbed
 * here since jsdom itself does not implement it.
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElementSize } from '../src/useElementSize/index.ts'
import { withSSR } from './_ssr.ts'

type ROCallback = (entries: Array<{ contentRect: { width: number; height: number } }>) => void

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = []
  cb: ROCallback
  observed: Element | null = null
  disconnected = false
  constructor(cb: ROCallback) {
    this.cb = cb
    FakeResizeObserver.instances.push(this)
  }
  observe(el: Element): void {
    this.observed = el
  }
  disconnect(): void {
    this.disconnected = true
  }
  unobserve(): void {}
  fire(width: number, height: number): void {
    this.cb([{ contentRect: { width, height } }])
  }
}

describe('@aihu/use/useElementSize', () => {
  beforeEach(() => {
    FakeResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts at the default initial size (0,0)', () => {
    const { width, height } = useElementSize()
    expect(width()).toBe(0)
    expect(height()).toBe(0)
  })

  it('respects a custom initialSize', () => {
    const { width, height } = useElementSize({ initialSize: { width: 10, height: 20 } })
    expect(width()).toBe(10)
    expect(height()).toBe(20)
  })

  it('updates getters when the observer fires', () => {
    const el = document.createElement('div')
    const { width, height } = useElementSize({ target: el })
    const observer = FakeResizeObserver.instances[0]
    expect(observer?.observed).toBe(el)
    observer?.fire(100, 200)
    expect(width()).toBe(100)
    expect(height()).toBe(200)
  })

  it('no target: registers no observer, getters stay at the initial size', () => {
    const { width, height } = useElementSize({ initialSize: { width: 5, height: 6 } })
    expect(FakeResizeObserver.instances).toHaveLength(0)
    expect(width()).toBe(5)
    expect(height()).toBe(6)
  })

  it('scope.stop() disconnects the observer', () => {
    const el = document.createElement('div')
    const scope = effectScope()
    scope.run(() => useElementSize({ target: el }))
    const observer = FakeResizeObserver.instances[0]
    expect(observer?.disconnected).toBe(false)
    scope.stop()
    expect(observer?.disconnected).toBe(true)
  })
})

describe('@aihu/use/useElementSize — SSR-static path', () => {
  it('with isClient false, returns static getters of the initial size and registers nothing', () =>
    withSSR(
      () => import('../src/useElementSize/index.ts'),
      (mod) => {
        let size: { width: () => number; height: () => number } | undefined
        expect(() => {
          size = mod.useElementSize({ initialSize: { width: 3, height: 4 } })
        }).not.toThrow()
        expect(size?.width()).toBe(3)
        expect(size?.height()).toBe(4)
      },
    ))
})
