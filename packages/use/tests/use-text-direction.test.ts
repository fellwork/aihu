/**
 * Unit tests for `useTextDirection` (effect-scope plan §5): default
 * `document.documentElement` target, a static custom target, the
 * null-vs-undefined target convention, reactive getter-target rebinding,
 * scope cleanup, and the SSR-static path. jsdom's `MutationObserver` is
 * stubbed here (mirrors `useElementSize`'s `ResizeObserver` stub) so
 * mutation delivery is synchronous and controllable in tests, rather than
 * depending on jsdom's real microtask-queued observer.
 */
import { effectScope, signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTextDirection } from '../src/useTextDirection/index.ts'
import { withSSR } from './_ssr.ts'

type MOCallback = (mutations: MutationRecord[]) => void

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = []
  cb: MOCallback
  observed: Element | null = null
  disconnected = false
  constructor(cb: MOCallback) {
    this.cb = cb
    FakeMutationObserver.instances.push(this)
  }
  observe(el: Element): void {
    this.observed = el
  }
  disconnect(): void {
    this.disconnected = true
  }
  fire(): void {
    this.cb([])
  }
}

describe('@aihu/use/useTextDirection', () => {
  beforeEach(() => {
    FakeMutationObserver.instances = []
    vi.stubGlobal('MutationObserver', FakeMutationObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.documentElement.removeAttribute('dir')
  })

  it("defaults to document.documentElement, reading 'ltr' with no dir attribute", () => {
    const { direction } = useTextDirection()
    expect(direction()).toBe('ltr')
    const observer = FakeMutationObserver.instances[0]
    expect(observer?.observed).toBe(document.documentElement)
  })

  it('reads an existing dir attribute on the default target', () => {
    document.documentElement.setAttribute('dir', 'rtl')
    const { direction } = useTextDirection()
    expect(direction()).toBe('rtl')
  })

  it('updates when the observer fires after a dir mutation on a static target', () => {
    const el = document.createElement('div')
    el.setAttribute('dir', 'ltr')
    const { direction } = useTextDirection({ target: el })
    expect(direction()).toBe('ltr')
    el.setAttribute('dir', 'rtl')
    FakeMutationObserver.instances[0]?.fire()
    expect(direction()).toBe('rtl')
  })

  it("an unrecognized dir value reads as 'ltr'", () => {
    const el = document.createElement('div')
    el.setAttribute('dir', 'bogus')
    const { direction } = useTextDirection({ target: el })
    expect(direction()).toBe('ltr')
  })

  it("explicit target: null registers no observer, direction stays 'ltr' (null-vs-undefined rule)", () => {
    const { direction } = useTextDirection({ target: null })
    expect(FakeMutationObserver.instances).toHaveLength(0)
    expect(direction()).toBe('ltr')
  })

  it('a reactive getter target rebinds the observer to the new element (old one disconnected)', () => {
    const elA = document.createElement('div')
    elA.setAttribute('dir', 'ltr')
    const elB = document.createElement('div')
    elB.setAttribute('dir', 'rtl')
    const [target, setTarget] = signal<Element | null>(elA)

    const { direction } = useTextDirection({ target })
    expect(direction()).toBe('ltr')

    setTarget(elB)
    expect(direction()).toBe('rtl')
    expect(FakeMutationObserver.instances[0]?.disconnected).toBe(true)
    expect(FakeMutationObserver.instances[1]?.observed).toBe(elB)
  })

  it('scope.stop() disconnects the observer', () => {
    const el = document.createElement('div')
    const scope = effectScope()
    scope.run(() => useTextDirection({ target: el }))
    const observer = FakeMutationObserver.instances[0]
    expect(observer?.disconnected).toBe(false)
    scope.stop()
    expect(observer?.disconnected).toBe(true)
  })
})

describe('@aihu/use/useTextDirection — SSR-static path', () => {
  it("with isClient false, returns a static 'ltr' getter and registers nothing", () =>
    withSSR(
      () => import('../src/useTextDirection/index.ts'),
      (mod) => {
        let result: { direction: () => string } | undefined
        expect(() => {
          result = mod.useTextDirection()
        }).not.toThrow()
        expect(result?.direction()).toBe('ltr')
      },
    ))
})
