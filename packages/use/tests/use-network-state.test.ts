/**
 * Unit tests for `useNetworkState` (effect-scope plan §5): `onLine`
 * tracking, `online`/`offline` events, the (mocked) Network Information
 * API's `change` event, `isSupported`, and the SSR-static path (simulated
 * `!isClient` via module re-evaluation). jsdom does not implement
 * `navigator.connection`, so it is stubbed per-test. jsdom environment
 * (root vitest config).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNetworkState } from '../src/useNetworkState/index.ts'
import { withSSR } from './_ssr.ts'

class FakeConnection extends EventTarget {
  effectiveType: string | undefined = '4g'
  downlink: number | undefined = 10
  rtt: number | undefined = 50
  saveData: boolean | undefined = false
}

function stubOnLine(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  })
}

describe('@aihu/use/useNetworkState', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts at navigator.onLine and isSupported is false without navigator.connection', () => {
    stubOnLine(true)
    const { isOnline, isSupported, effectiveType } = useNetworkState()
    expect(isOnline()).toBe(true)
    expect(isSupported()).toBe(false)
    expect(effectiveType()).toBeUndefined()
  })

  it('online/offline events update isOnline()', () => {
    stubOnLine(true)
    const { isOnline } = useNetworkState()
    window.dispatchEvent(new Event('offline'))
    expect(isOnline()).toBe(false)
    window.dispatchEvent(new Event('online'))
    expect(isOnline()).toBe(true)
  })

  it('reads the initial Network Information fields when connection is present', () => {
    const connection = new FakeConnection()
    Object.defineProperty(window.navigator, 'connection', {
      configurable: true,
      value: connection,
    })
    const { effectiveType, downlink, rtt, saveData, isSupported } = useNetworkState()
    expect(isSupported()).toBe(true)
    expect(effectiveType()).toBe('4g')
    expect(downlink()).toBe(10)
    expect(rtt()).toBe(50)
    expect(saveData()).toBe(false)
    delete (window.navigator as unknown as Record<string, unknown>).connection
  })

  it('a connection "change" event updates the getters together', () => {
    const connection = new FakeConnection()
    Object.defineProperty(window.navigator, 'connection', {
      configurable: true,
      value: connection,
    })
    const { effectiveType, downlink } = useNetworkState()
    connection.effectiveType = '3g'
    connection.downlink = 1.5
    connection.dispatchEvent(new Event('change'))
    expect(effectiveType()).toBe('3g')
    expect(downlink()).toBe(1.5)
    delete (window.navigator as unknown as Record<string, unknown>).connection
  })
})

describe('@aihu/use/useNetworkState — SSR-static path', () => {
  // The exhaustive zero-side-effect gate lives in ssr-safety.test.ts.

  it('with isClient false, isOnline defaults true and registers nothing', () =>
    withSSR(
      () => import('../src/useNetworkState/index.ts'),
      (mod) => {
        const { isOnline, isSupported, effectiveType } = mod.useNetworkState()
        expect(isOnline()).toBe(true)
        expect(isSupported()).toBe(false)
        expect(effectiveType()).toBeUndefined()
      },
    ))
})
