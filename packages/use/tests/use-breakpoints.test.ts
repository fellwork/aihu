/**
 * Unit tests for `useBreakpoints` (effect-scope plan §5): per-name getters,
 * `greaterOrEqual`/`smaller`/`between`/`current`, the default preset, and
 * the SSR-static path (inherited from `useMediaQuery`, not re-implemented).
 * jsdom has no real `matchMedia`, so tests run against `_match-media.ts`'s
 * polyfill.
 */
import { describe, expect, it } from 'vitest'
import { breakpointsDefault, useBreakpoints } from '../src/useBreakpoints/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from './_match-media.ts'
import { withSSR } from './_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/useBreakpoints', () => {
  it('exposes a getter per breakpoint name, starting unmatched', () => {
    const bp = useBreakpoints({ sm: 100, md: 200, lg: 300 })
    expect(bp.sm()).toBe(false)
    expect(bp.md()).toBe(false)
    expect(bp.lg()).toBe(false)
  })

  it('a getter tracks its own (min-width) query', () => {
    const bp = useBreakpoints({ sm: 100, md: 200 })
    const mql = window.matchMedia('(min-width: 100px)')
    fireMatchMediaChange(mql, true)
    expect(bp.sm()).toBe(true)
    expect(bp.md()).toBe(false)
  })

  it('greaterOrEqual mirrors the named getter', () => {
    const bp = useBreakpoints({ sm: 100, md: 200 })
    const mql = window.matchMedia('(min-width: 100px)')
    fireMatchMediaChange(mql, true)
    expect(bp.greaterOrEqual('sm')).toBe(true)
    expect(bp.greaterOrEqual('md')).toBe(false)
  })

  it('smaller is the negation of the named getter', () => {
    const bp = useBreakpoints({ sm: 100, md: 200 })
    expect(bp.smaller('sm')).toBe(true)
    const mql = window.matchMedia('(min-width: 100px)')
    fireMatchMediaChange(mql, true)
    expect(bp.smaller('sm')).toBe(false)
  })

  it('between(a, b) is true in [a, b)', () => {
    const bp = useBreakpoints({ sm: 100, md: 200, lg: 300 })
    const smMql = window.matchMedia('(min-width: 100px)')
    const mdMql = window.matchMedia('(min-width: 200px)')

    // Below sm: not between sm and md.
    expect(bp.between('sm', 'md')).toBe(false)

    // >= sm, < md: between.
    fireMatchMediaChange(smMql, true)
    expect(bp.between('sm', 'md')).toBe(true)

    // >= md too: no longer between sm and md.
    fireMatchMediaChange(mdMql, true)
    expect(bp.between('sm', 'md')).toBe(false)
  })

  it('current() lists every satisfied breakpoint, ascending by width', () => {
    const bp = useBreakpoints({ sm: 100, md: 200, lg: 300 })
    expect(bp.current()).toEqual([])

    fireMatchMediaChange(window.matchMedia('(min-width: 100px)'), true)
    expect(bp.current()).toEqual(['sm'])

    fireMatchMediaChange(window.matchMedia('(min-width: 200px)'), true)
    expect(bp.current()).toEqual(['sm', 'md'])
  })

  it('the default preset (breakpointsDefault) is usable with no argument', () => {
    const bp = useBreakpoints()
    expect(bp.sm()).toBe(false)
    expect(typeof bp.greaterOrEqual).toBe('function')
    expect(Object.keys(breakpointsDefault)).toEqual(['sm', 'md', 'lg', 'xl', '2xl'])
  })
})

describe('@aihu/use/useBreakpoints — SSR-static path', () => {
  it('with isClient false, every getter is false (inherited from useMediaQuery)', () =>
    withSSR(
      () => import('../src/useBreakpoints/index.ts'),
      (mod) => {
        let bp: ReturnType<typeof mod.useBreakpoints> | undefined
        expect(() => {
          bp = mod.useBreakpoints({ sm: 100, md: 200 })
        }).not.toThrow()
        expect(bp?.sm()).toBe(false)
        expect(bp?.current()).toEqual([])
      },
    ))
})
