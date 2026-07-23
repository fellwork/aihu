/**
 * Unit tests for `usePreferredDark` (effect-scope plan §5): thin wrapper
 * over `useMediaQuery('(prefers-color-scheme: dark)')`. jsdom environment
 * (root vitest config); jsdom has no real `matchMedia`, so tests run
 * against `_match-media.ts`'s polyfill.
 */
import { describe, expect, it } from 'vitest'
import { usePreferredDark } from '../src/usePreferredDark/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from './_match-media.ts'
import { withSSR } from './_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/usePreferredDark', () => {
  it('starts false (the polyfill starts every query unmatched)', () => {
    const { prefersDark } = usePreferredDark()
    expect(prefersDark()).toBe(false)
  })

  it('updates when the underlying media query changes', () => {
    const { prefersDark } = usePreferredDark()
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    fireMatchMediaChange(mql, true)
    expect(prefersDark()).toBe(true)
  })
})

describe('@aihu/use/usePreferredDark — SSR-static path', () => {
  it('with isClient false, returns a static false getter and registers nothing', () =>
    withSSR(
      () => import('../src/usePreferredDark/index.ts'),
      (mod) => {
        let result: { prefersDark: () => boolean } | undefined
        expect(() => {
          result = mod.usePreferredDark()
        }).not.toThrow()
        expect(result?.prefersDark()).toBe(false)
      },
    ))
})
