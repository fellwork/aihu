/**
 * Unit tests for `useMutationObserver` (effect-scope plan §5): callback
 * wiring, `takeRecords()` forwarding, reactive target rebinding, scope
 * cleanup, and the SSR-static path. jsdom's `MutationObserver` is stubbed
 * here for deterministic control over when records fire (jsdom does
 * implement one, but driving it requires real microtask flushes).
 */
import { effectScope, signal } from '@aihu/signals'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMutationObserver } from '../src/useMutationObserver/index.ts'
import { withSSR } from './_ssr.ts'

type MOCallback = (records: unknown[]) => void

class FakeMutationObserver {
  static instances: FakeMutationObserver[] = []
  cb: MOCallback
  observed: Element | null = null
  init: unknown
  disconnected = false
  takeRecordsCalls = 0
  constructor(cb: MOCallback) {
    this.cb = cb
    FakeMutationObserver.instances.push(this)
  }
  observe(el: Element, init?: unknown): void {
    this.observed = el
    this.init = init
  }
  disconnect(): void {
    this.disconnected = true
  }
  takeRecords(): unknown[] {
    this.takeRecordsCalls += 1
    return ['record']
  }
  fire(records: unknown[]): void {
    this.cb(records)
  }
}

describe('@aihu/use/useMutationObserver', () => {
  beforeEach(() => {
    FakeMutationObserver.instances = []
    vi.stubGlobal('MutationObserver', FakeMutationObserver)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('observes the target with the given init and forwards records', () => {
    const el = document.createElement('div')
    const callback = vi.fn()
    useMutationObserver(el, callback, { childList: true })
    const observer = FakeMutationObserver.instances[0]
    expect(observer?.observed).toBe(el)
    expect(observer?.init).toEqual({ childList: true })
    observer?.fire(['a record'])
    expect(callback).toHaveBeenCalledWith(['a record'], observer)
  })

  it('no target: registers no observer', () => {
    useMutationObserver(null, () => {}, { childList: true })
    expect(FakeMutationObserver.instances).toHaveLength(0)
  })

  it('takeRecords() forwards to the live observer; [] when none is attached', () => {
    const { takeRecords } = useMutationObserver(null, () => {}, { childList: true })
    expect(takeRecords()).toEqual([])

    const el = document.createElement('div')
    const bound = useMutationObserver(el, () => {}, { childList: true })
    expect(bound.takeRecords()).toEqual(['record'])
    // The null-target call above created no observer at all (unobserved
    // targets register nothing), so this is the FIRST real instance.
    expect(FakeMutationObserver.instances[0]?.takeRecordsCalls).toBe(1)
  })

  it('a getter target rebinds: the observer follows a signal update', () => {
    const elA = document.createElement('div')
    const elB = document.createElement('span')
    const [el, setEl] = signal<Element | null>(elA)
    useMutationObserver(el, () => {}, { childList: true })
    expect(FakeMutationObserver.instances[0]?.observed).toBe(elA)
    setEl(elB)
    expect(FakeMutationObserver.instances[0]?.disconnected).toBe(true)
    expect(FakeMutationObserver.instances[1]?.observed).toBe(elB)
  })

  it('stop() disconnects the observer and is idempotent', () => {
    const el = document.createElement('div')
    const { stop } = useMutationObserver(el, () => {}, { childList: true })
    const observer = FakeMutationObserver.instances[0]
    stop()
    expect(observer?.disconnected).toBe(true)
    expect(() => stop()).not.toThrow()
  })

  it('scope.stop() disconnects the observer', () => {
    const el = document.createElement('div')
    const scope = effectScope()
    scope.run(() => useMutationObserver(el, () => {}, { childList: true }))
    const observer = FakeMutationObserver.instances[0]
    scope.stop()
    expect(observer?.disconnected).toBe(true)
  })
})

describe('@aihu/use/useMutationObserver — SSR-static path', () => {
  it('with isClient false, registers nothing; stop/takeRecords are safe no-ops', () =>
    withSSR(
      () => import('../src/useMutationObserver/index.ts'),
      (mod) => {
        const callback = vi.fn()
        let ret: { stop: () => void; takeRecords: () => unknown[] } | undefined
        expect(() => {
          ret = mod.useMutationObserver(null, callback, { childList: true })
        }).not.toThrow()
        expect(callback).not.toHaveBeenCalled()
        expect(ret?.takeRecords()).toEqual([])
        expect(() => ret?.stop()).not.toThrow()
      },
    ))
})
