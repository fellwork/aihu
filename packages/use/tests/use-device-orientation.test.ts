/**
 * Unit tests for `useDeviceOrientation` (effect-scope plan §5):
 * feature-detection (`isSupported`), `deviceorientation` event wiring, the
 * unsupported no-op path, and the SSR-static path. jsdom does not
 * implement `DeviceOrientationEvent`, so the unsupported path is exercised
 * by default and the supported path by stubbing the constructor in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDeviceOrientation } from '../src/useDeviceOrientation/index.ts'
import { withSSR } from './_ssr.ts'

function fireDeviceOrientation(props: {
  alpha: number | null
  beta: number | null
  gamma: number | null
  absolute: boolean
}): void {
  const ev = Object.assign(new Event('deviceorientation'), props)
  window.dispatchEvent(ev)
}

describe('@aihu/use/useDeviceOrientation — unsupported (no DeviceOrientationEvent)', () => {
  it('isSupported() is false; alpha/beta/gamma stay null, absolute stays false', () => {
    const { isSupported, alpha, beta, gamma, absolute } = useDeviceOrientation()
    expect(isSupported()).toBe(false)
    fireDeviceOrientation({ alpha: 1, beta: 2, gamma: 3, absolute: true })
    expect(alpha()).toBeNull()
    expect(beta()).toBeNull()
    expect(gamma()).toBeNull()
    expect(absolute()).toBe(false)
  })
})

describe('@aihu/use/useDeviceOrientation — supported', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('isSupported() is true and readings update from deviceorientation events', () => {
    vi.stubGlobal('DeviceOrientationEvent', class {})
    const { isSupported, alpha, beta, gamma, absolute } = useDeviceOrientation()
    expect(isSupported()).toBe(true)
    expect(alpha()).toBeNull()

    fireDeviceOrientation({ alpha: 10, beta: 20, gamma: 30, absolute: true })
    expect(alpha()).toBe(10)
    expect(beta()).toBe(20)
    expect(gamma()).toBe(30)
    expect(absolute()).toBe(true)
  })
})

describe('@aihu/use/useDeviceOrientation — SSR-static path', () => {
  it('with isClient false, returns static null/false getters and registers nothing', () =>
    withSSR(
      () => import('../src/useDeviceOrientation/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useDeviceOrientation> | undefined
        expect(() => {
          ret = mod.useDeviceOrientation()
        }).not.toThrow()
        expect(ret?.isSupported()).toBe(false)
        expect(ret?.alpha()).toBeNull()
        expect(ret?.beta()).toBeNull()
        expect(ret?.gamma()).toBeNull()
        expect(ret?.absolute()).toBe(false)
      },
    ))
})
