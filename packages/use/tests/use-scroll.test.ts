/**
 * Unit tests for `useScroll` (effect-scope plan §5): scroll tracking
 * through the named-getter return shape, `initialValue`, the
 * null-vs-undefined target rule, scope cleanup, and the SSR-static path.
 * jsdom environment (root vitest config).
 */
import { effectScope } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useScroll } from '../src/useScroll/index.ts'
import { withSSR } from './_ssr.ts'

function scroll(target: EventTarget = window): void {
  target.dispatchEvent(new Event('scroll'))
}

describe('@aihu/use/useScroll', () => {
  it('starts at the default initial value (0,0)', () => {
    const { x, y } = useScroll()
    expect(x()).toBe(0)
    expect(y()).toBe(0)
  })

  it('respects a custom initialValue', () => {
    const { x, y } = useScroll({ initialValue: { x: 10, y: 20 } })
    expect(x()).toBe(10)
    expect(y()).toBe(20)
  })

  it('tracks scroll on window: getters read window.scrollX/Y', () => {
    const { x, y } = useScroll()
    Object.defineProperty(window, 'scrollX', { value: 33, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 44, configurable: true })
    scroll()
    expect(x()).toBe(33)
    expect(y()).toBe(44)
  })

  it('tracks scroll on an element target: getters read scrollLeft/scrollTop', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const { x, y } = useScroll({ target: el })
    Object.defineProperty(el, 'scrollLeft', { value: 12, configurable: true })
    Object.defineProperty(el, 'scrollTop', { value: 34, configurable: true })
    scroll(el)
    expect(x()).toBe(12)
    expect(y()).toBe(34)
  })

  it('explicit target: null registers NO listener (null-vs-undefined rule)', () => {
    const { x, y } = useScroll({ target: null, initialValue: { x: 5, y: 6 } })
    scroll()
    expect(x()).toBe(5)
    expect(y()).toBe(6)
  })

  it('scope.stop() removes the listener (getters freeze)', () => {
    const scope = effectScope()
    const s = scope.run(() => useScroll()) as ReturnType<typeof useScroll>
    Object.defineProperty(window, 'scrollX', { value: 1, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 2, configurable: true })
    scroll()
    expect(s.x()).toBe(1)

    scope.stop()
    Object.defineProperty(window, 'scrollX', { value: 100, configurable: true })
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true })
    scroll()
    expect(s.x()).toBe(1)
    expect(s.y()).toBe(2)
  })
})

describe('@aihu/use/useScroll — SSR-static path', () => {
  it('with isClient false, returns static getters of the initial value and registers nothing', () =>
    withSSR(
      () => import('../src/useScroll/index.ts'),
      (mod) => {
        let s: { x: () => number; y: () => number } | undefined
        expect(() => {
          s = mod.useScroll({ initialValue: { x: 3, y: 4 } })
        }).not.toThrow()
        expect(s?.x()).toBe(3)
        expect(s?.y()).toBe(4)
      },
    ))
})
