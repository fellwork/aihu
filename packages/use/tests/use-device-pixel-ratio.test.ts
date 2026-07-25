/**
 * Unit tests for `useDevicePixelRatio` (effect-scope plan §5): initial
 * ratio, the re-arm-on-change technique (a `matchMedia('(resolution: …)')`
 * query at the OLD ratio fires once the ratio changes, and the composable
 * re-arms a fresh query at the NEW ratio), scope cleanup, and the
 * SSR-static path. jsdom has no real `matchMedia`, so tests run against
 * `_match-media.ts`'s polyfill; `window.devicePixelRatio` is redefined
 * per-test (jsdom's own getter is not settable directly).
 */
import { effectScope } from '@aihu/signals'
import { afterEach, describe, expect, it } from 'vitest'
import { useDevicePixelRatio } from '../src/useDevicePixelRatio/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from './_match-media.ts'
import { withSSR } from './_ssr.ts'

installMatchMediaPolyfill()

function setDevicePixelRatio(value: number): void {
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value,
  })
}

describe('@aihu/use/useDevicePixelRatio', () => {
  afterEach(() => {
    setDevicePixelRatio(1)
  })

  it('starts at the current window.devicePixelRatio', () => {
    setDevicePixelRatio(2)
    const { pixelRatio } = useDevicePixelRatio()
    expect(pixelRatio()).toBe(2)
  })

  it('defaults to 1 when devicePixelRatio is falsy', () => {
    setDevicePixelRatio(0)
    const { pixelRatio } = useDevicePixelRatio()
    expect(pixelRatio()).toBe(1)
  })

  it('re-arms at the new ratio when the resolution query fires', () => {
    setDevicePixelRatio(1)
    const { pixelRatio } = useDevicePixelRatio()
    expect(pixelRatio()).toBe(1)

    // The composable armed `(resolution: 1dppx)` — simulate the ratio
    // actually changing, then fire that query's `change` event.
    setDevicePixelRatio(2)
    fireMatchMediaChange(window.matchMedia('(resolution: 1dppx)'), false)
    expect(pixelRatio()).toBe(2)

    // It should now be listening on `(resolution: 2dppx)`.
    setDevicePixelRatio(3)
    fireMatchMediaChange(window.matchMedia('(resolution: 2dppx)'), false)
    expect(pixelRatio()).toBe(3)
  })

  it('scope.stop() detaches the resolution listener', () => {
    setDevicePixelRatio(1)
    const scope = effectScope()
    const { pixelRatio } = scope.run(() => useDevicePixelRatio()) as ReturnType<
      typeof useDevicePixelRatio
    >
    scope.stop()

    setDevicePixelRatio(2)
    fireMatchMediaChange(window.matchMedia('(resolution: 1dppx)'), false)
    expect(pixelRatio()).toBe(1)
  })
})

describe('@aihu/use/useDevicePixelRatio — SSR-static path', () => {
  it('with isClient false, returns a static 1 getter and registers nothing', () =>
    withSSR(
      () => import('../src/useDevicePixelRatio/index.ts'),
      (mod) => {
        let ret: { pixelRatio: () => number } | undefined
        expect(() => {
          ret = mod.useDevicePixelRatio()
        }).not.toThrow()
        expect(ret?.pixelRatio()).toBe(1)
      },
    ))
})
