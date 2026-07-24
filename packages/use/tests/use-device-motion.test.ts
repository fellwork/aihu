/**
 * Unit tests for `useDeviceMotion` (effect-scope plan §5):
 * feature-detection (`isSupported`), `devicemotion` event wiring, the
 * unsupported no-op path, and the SSR-static path. jsdom does not
 * implement `DeviceMotionEvent`, so the unsupported path is exercised by
 * default and the supported path by stubbing the constructor in.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDeviceMotion } from '../src/useDeviceMotion/index.ts'
import { withSSR } from './_ssr.ts'

const acceleration = { x: 1, y: 2, z: 3 }
const accelerationIncludingGravity = { x: 1, y: 2, z: 12.8 }
const rotationRate = { alpha: 4, beta: 5, gamma: 6 }

function fireDeviceMotion(props: {
  acceleration: unknown
  accelerationIncludingGravity: unknown
  rotationRate: unknown
  interval: number
}): void {
  const ev = Object.assign(new Event('devicemotion'), props)
  window.dispatchEvent(ev)
}

describe('@aihu/use/useDeviceMotion — unsupported (no DeviceMotionEvent)', () => {
  it('isSupported() is false; every reading stays at its static default', () => {
    const { isSupported, acceleration: acc, rotationRate: rr, interval } = useDeviceMotion()
    expect(isSupported()).toBe(false)
    fireDeviceMotion({ acceleration, accelerationIncludingGravity, rotationRate, interval: 16 })
    expect(acc()).toBeNull()
    expect(rr()).toBeNull()
    expect(interval()).toBe(0)
  })
})

describe('@aihu/use/useDeviceMotion — supported', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('isSupported() is true and readings update from devicemotion events', () => {
    vi.stubGlobal('DeviceMotionEvent', class {})
    const {
      isSupported,
      acceleration: acc,
      accelerationIncludingGravity: accGravity,
      rotationRate: rr,
      interval,
    } = useDeviceMotion()
    expect(isSupported()).toBe(true)
    expect(acc()).toBeNull()

    fireDeviceMotion({ acceleration, accelerationIncludingGravity, rotationRate, interval: 16 })
    expect(acc()).toEqual(acceleration)
    expect(accGravity()).toEqual(accelerationIncludingGravity)
    expect(rr()).toEqual(rotationRate)
    expect(interval()).toBe(16)
  })
})

describe('@aihu/use/useDeviceMotion — SSR-static path', () => {
  it('with isClient false, returns static null/0/false getters and registers nothing', () =>
    withSSR(
      () => import('../src/useDeviceMotion/index.ts'),
      (mod) => {
        let ret: ReturnType<typeof mod.useDeviceMotion> | undefined
        expect(() => {
          ret = mod.useDeviceMotion()
        }).not.toThrow()
        expect(ret?.isSupported()).toBe(false)
        expect(ret?.acceleration()).toBeNull()
        expect(ret?.accelerationIncludingGravity()).toBeNull()
        expect(ret?.rotationRate()).toBeNull()
        expect(ret?.interval()).toBe(0)
      },
    ))
})
