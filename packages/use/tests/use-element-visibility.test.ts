/**
 * Unit tests for `useElementVisibility` (effect-scope plan §5):
 * IntersectionObserver wiring through the named-getter return shape,
 * `initialValue`, scope cleanup, and the SSR-static path. jsdom's
 * `IntersectionObserver` is stubbed here since jsdom itself does not
 * implement it.
 */
import { effectScope } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useElementVisibility } from '../src/useElementVisibility/index.ts'
import { withSSR } from './_ssr.ts'

type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = []
  cb: IOCallback
  observed: Element | null = null
  disconnected = false
  constructor(cb: IOCallback) {
    this.cb = cb
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

describe('@aihu/use/useElementVisibility', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances = []
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts at the default initial value (false)', () => {
    const { isVisible } = useElementVisibility()
    expect(isVisible()).toBe(false)
  })

  it('respects a custom initialValue', () => {
    const { isVisible } = useElementVisibility({ initialValue: true })
    expect(isVisible()).toBe(true)
  })

  it('updates the getter when the observer fires', () => {
    const el = document.createElement('div')
    const { isVisible } = useElementVisibility({ target: el })
    const observer = FakeIntersectionObserver.instances[0]
    expect(observer?.observed).toBe(el)
    observer?.fire(true)
    expect(isVisible()).toBe(true)
    observer?.fire(false)
    expect(isVisible()).toBe(false)
  })

  it('no target: registers no observer, getter stays at the initial value', () => {
    const { isVisible } = useElementVisibility({ initialValue: true })
    expect(FakeIntersectionObserver.instances).toHaveLength(0)
    expect(isVisible()).toBe(true)
  })

  it('scope.stop() disconnects the observer', () => {
    const el = document.createElement('div')
    const scope = effectScope()
    scope.run(() => useElementVisibility({ target: el }))
    const observer = FakeIntersectionObserver.instances[0]
    expect(observer?.disconnected).toBe(false)
    scope.stop()
    expect(observer?.disconnected).toBe(true)
  })
})

describe('@aihu/use/useElementVisibility — SSR-static path', () => {
  it('with isClient false, returns a static getter of false and registers nothing', () =>
    withSSR(
      () => import('../src/useElementVisibility/index.ts'),
      (mod) => {
        let ret: { isVisible: () => boolean } | undefined
        expect(() => {
          ret = mod.useElementVisibility()
        }).not.toThrow()
        expect(ret?.isVisible()).toBe(false)

        const truthy = mod.useElementVisibility({ initialValue: true })
        expect(truthy.isVisible()).toBe(true)
      },
    ))
})
