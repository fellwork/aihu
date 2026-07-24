/**
 * Unit tests for `usePreferredReducedMotion` (effect-scope plan §5): the
 * CORE canonical `(prefers-reduced-motion: reduce)` reader (the
 * `@aihu/use/motion` family's `useReducedMotion` now delegates here). jsdom
 * environment (root vitest config); jsdom has no real `matchMedia`, so
 * tests run against `_match-media.ts`'s polyfill.
 */
import { describe, expect, it } from 'vitest'
import { usePreferredReducedMotion } from '../src/usePreferredReducedMotion/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from './_match-media.ts'
import { withSSR } from './_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/usePreferredReducedMotion', () => {
  it("starts 'no-preference' (the polyfill starts every query unmatched)", () => {
    const { preference } = usePreferredReducedMotion()
    expect(preference()).toBe('no-preference')
  })

  it("updates to 'reduce' when the underlying media query changes", () => {
    const { preference } = usePreferredReducedMotion()
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    fireMatchMediaChange(mql, true)
    expect(preference()).toBe('reduce')
    fireMatchMediaChange(mql, false)
    expect(preference()).toBe('no-preference')
  })
})

describe('@aihu/use/usePreferredReducedMotion — SSR-static path', () => {
  it("with isClient false, returns a static 'no-preference' getter and registers nothing", () =>
    withSSR(
      () => import('../src/usePreferredReducedMotion/index.ts'),
      (mod) => {
        let result: { preference: () => string } | undefined
        expect(() => {
          result = mod.usePreferredReducedMotion()
        }).not.toThrow()
        expect(result?.preference()).toBe('no-preference')
      },
    ))
})
