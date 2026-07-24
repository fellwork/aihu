/**
 * Unit tests for `usePreferredContrast` (effect-scope plan §5): the
 * `prefers-contrast` media feature, derived from three independent
 * `useMediaQuery` calls (`more`/`less`/`custom`). jsdom environment (root
 * vitest config); jsdom has no real `matchMedia`, so tests run against
 * `_match-media.ts`'s polyfill.
 */
import { describe, expect, it } from 'vitest'
import { usePreferredContrast } from '../src/usePreferredContrast/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from './_match-media.ts'
import { withSSR } from './_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/usePreferredContrast', () => {
  it("starts 'no-preference' (the polyfill starts every query unmatched)", () => {
    const { preference } = usePreferredContrast()
    expect(preference()).toBe('no-preference')
  })

  it("reports 'more' when the (prefers-contrast: more) query matches", () => {
    const { preference } = usePreferredContrast()
    const mql = window.matchMedia('(prefers-contrast: more)')
    fireMatchMediaChange(mql, true)
    expect(preference()).toBe('more')
  })

  it("reports 'less' when the (prefers-contrast: less) query matches", () => {
    const { preference } = usePreferredContrast()
    const mql = window.matchMedia('(prefers-contrast: less)')
    fireMatchMediaChange(mql, true)
    expect(preference()).toBe('less')
  })

  it("reports 'custom' when the (prefers-contrast: custom) query matches", () => {
    const { preference } = usePreferredContrast()
    const mql = window.matchMedia('(prefers-contrast: custom)')
    fireMatchMediaChange(mql, true)
    expect(preference()).toBe('custom')
  })
})

describe('@aihu/use/usePreferredContrast — SSR-static path', () => {
  it("with isClient false, returns a static 'no-preference' getter and registers nothing", () =>
    withSSR(
      () => import('../src/usePreferredContrast/index.ts'),
      (mod) => {
        let result: { preference: () => string } | undefined
        expect(() => {
          result = mod.usePreferredContrast()
        }).not.toThrow()
        expect(result?.preference()).toBe('no-preference')
      },
    ))
})
