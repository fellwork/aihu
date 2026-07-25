/**
 * Unit tests for `useOrientation` (effect-scope plan §5): the
 * `screen.orientation` path (angle + type, `change` tracking) and the
 * `matchMedia('(orientation: portrait)')` fallback path — jsdom does not
 * implement the Screen Orientation API, so the fallback is exercised by
 * default and the real-API path by stubbing `screen.orientation` in. Also
 * covers scope cleanup and the SSR-static path.
 */
import { effectScope } from '@aihu/signals'
import { afterEach, describe, expect, it } from 'vitest'
import { useOrientation } from '../src/useOrientation/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from './_match-media.ts'
import { withSSR } from './_ssr.ts'

installMatchMediaPolyfill()

class FakeScreenOrientation extends EventTarget {
  angle: number
  type: OrientationType
  constructor(angle: number, type: OrientationType) {
    super()
    this.angle = angle
    this.type = type
  }
  rotate(angle: number, type: OrientationType): void {
    this.angle = angle
    this.type = type
    this.dispatchEvent(new Event('change'))
  }
}

describe('@aihu/use/useOrientation — screen.orientation path', () => {
  afterEach(() => {
    // biome-ignore lint: test-installed stub cleanup
    delete (window.screen as { orientation?: unknown }).orientation
  })

  it('starts at the current angle/type and tracks change events', () => {
    const fake = new FakeScreenOrientation(0, 'portrait-primary')
    Object.defineProperty(window.screen, 'orientation', { configurable: true, value: fake })

    const { angle, type } = useOrientation()
    expect(angle()).toBe(0)
    expect(type()).toBe('portrait-primary')

    fake.rotate(90, 'landscape-primary')
    expect(angle()).toBe(90)
    expect(type()).toBe('landscape-primary')
  })

  it('scope.stop() removes the change listener', () => {
    const fake = new FakeScreenOrientation(0, 'portrait-primary')
    Object.defineProperty(window.screen, 'orientation', { configurable: true, value: fake })

    const scope = effectScope()
    const { angle } = scope.run(() => useOrientation()) as ReturnType<typeof useOrientation>
    scope.stop()

    fake.rotate(180, 'portrait-secondary')
    expect(angle()).toBe(0)
  })
})

describe('@aihu/use/useOrientation — matchMedia fallback path', () => {
  it('reports landscape-primary/90 when the portrait query does not match', () => {
    const { angle, type } = useOrientation()
    expect(angle()).toBe(90)
    expect(type()).toBe('landscape-primary')
  })

  it('reports portrait-primary/0 once the portrait query matches', () => {
    const { angle, type } = useOrientation()
    fireMatchMediaChange(window.matchMedia('(orientation: portrait)'), true)
    expect(angle()).toBe(0)
    expect(type()).toBe('portrait-primary')
  })
})

describe('@aihu/use/useOrientation — SSR-static path', () => {
  it('with isClient false, returns angle: 0 / type: portrait-primary and registers nothing', () =>
    withSSR(
      () => import('../src/useOrientation/index.ts'),
      (mod) => {
        let ret: { angle: () => number; type: () => OrientationType } | undefined
        expect(() => {
          ret = mod.useOrientation()
        }).not.toThrow()
        expect(ret?.angle()).toBe(0)
        expect(ret?.type()).toBe('portrait-primary')
      },
    ))
})
