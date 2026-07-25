/**
 * Unit tests for `usePreferredReducedTransparency` (effect-scope plan §5):
 * `(prefers-reduced-transparency: reduce)`. jsdom environment (root vitest
 * config); jsdom has no real `matchMedia`, so tests run against
 * `_match-media.ts`'s polyfill.
 */
import { describe, expect, it } from 'vitest'
import { usePreferredReducedTransparency } from '../src/usePreferredReducedTransparency/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from './_match-media.ts'
import { withSSR } from './_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/usePreferredReducedTransparency', () => {
  it("starts 'no-preference' (the polyfill starts every query unmatched)", () => {
    const { preference } = usePreferredReducedTransparency()
    expect(preference()).toBe('no-preference')
  })

  it("updates to 'reduce' when the underlying media query changes", () => {
    const { preference } = usePreferredReducedTransparency()
    const mql = window.matchMedia('(prefers-reduced-transparency: reduce)')
    fireMatchMediaChange(mql, true)
    expect(preference()).toBe('reduce')
    fireMatchMediaChange(mql, false)
    expect(preference()).toBe('no-preference')
  })
})

describe('@aihu/use/usePreferredReducedTransparency — SSR-static path', () => {
  it("with isClient false, returns a static 'no-preference' getter and registers nothing", () =>
    withSSR(
      () => import('../src/usePreferredReducedTransparency/index.ts'),
      (mod) => {
        let result: { preference: () => string } | undefined
        expect(() => {
          result = mod.usePreferredReducedTransparency()
        }).not.toThrow()
        expect(result?.preference()).toBe('no-preference')
      },
    ))
})
