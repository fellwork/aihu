/**
 * Unit tests for `useReducedMotion` (`@aihu/use/motion` family, wave0 seed):
 * reflects the `(prefers-reduced-motion: reduce)` query via the CORE
 * `useMediaQuery` it wraps, and the SSR-static path. jsdom environment
 * (root vitest config); jsdom has no real `matchMedia`, so tests run
 * against `_match-media.ts`'s polyfill (shared with `useMediaQuery`'s own
 * tests).
 */
import { describe, expect, it } from 'vitest'
import { useReducedMotion } from '../../src/motion/useReducedMotion/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from '../_match-media.ts'
import { withSSR } from '../_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/motion/useReducedMotion', () => {
  it('reflects the current match state', () => {
    const { prefersReduced } = useReducedMotion()
    expect(prefersReduced()).toBe(false)
  })

  it('updates when the query change fires', () => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const { prefersReduced } = useReducedMotion()
    fireMatchMediaChange(mql, true)
    expect(prefersReduced()).toBe(true)
    fireMatchMediaChange(mql, false)
    expect(prefersReduced()).toBe(false)
  })
})

describe('@aihu/use/motion/useReducedMotion — SSR-static path', () => {
  it('with isClient false, returns a static false getter and registers nothing', () =>
    withSSR(
      () => import('../../src/motion/useReducedMotion/index.ts'),
      (mod) => {
        let result: { prefersReduced: () => boolean } | undefined
        expect(() => {
          result = mod.useReducedMotion()
        }).not.toThrow()
        expect(result?.prefersReduced()).toBe(false)
      },
    ))
})
