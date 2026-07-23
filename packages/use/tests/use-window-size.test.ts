/**
 * Unit tests for `useWindowSize` (effect-scope plan §5): resize tracking
 * through the named-getter return shape, initial read of
 * `window.innerWidth/innerHeight`, scope cleanup, and the SSR-static path
 * (`initialWidth`/`initialHeight` options). jsdom environment (root vitest
 * config).
 */
import { effectScope } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useWindowSize } from '../src/useWindowSize/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useWindowSize', () => {
  it('starts at the current window inner size', () => {
    const { width, height } = useWindowSize()
    expect(width()).toBe(window.innerWidth)
    expect(height()).toBe(window.innerHeight)
  })

  it('updates the getters on resize', () => {
    const { width, height } = useWindowSize()
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true })
    window.dispatchEvent(new Event('resize'))
    expect(width()).toBe(800)
    expect(height()).toBe(600)
  })

  it('scope.stop() removes the listener (getters freeze)', () => {
    const scope = effectScope()
    const s = scope.run(() => useWindowSize()) as ReturnType<typeof useWindowSize>
    Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true })
    window.dispatchEvent(new Event('resize'))
    expect(s.width()).toBe(900)

    scope.stop()
    Object.defineProperty(window, 'innerWidth', { value: 111, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 222, configurable: true })
    window.dispatchEvent(new Event('resize'))
    expect(s.width()).toBe(900)
    expect(s.height()).toBe(700)
  })
})

describe('@aihu/use/useWindowSize — SSR-static path', () => {
  it('with isClient false, returns static getters of initialWidth/initialHeight and registers nothing', () =>
    withSSR(
      () => import('../src/useWindowSize/index.ts'),
      (mod) => {
        let s: { width: () => number; height: () => number } | undefined
        expect(() => {
          s = mod.useWindowSize({ initialWidth: 3, initialHeight: 4 })
        }).not.toThrow()
        expect(s?.width()).toBe(3)
        expect(s?.height()).toBe(4)

        const zero = mod.useWindowSize()
        expect(zero.width()).toBe(0)
        expect(zero.height()).toBe(0)
      },
    ))
})
