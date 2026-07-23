/**
 * Unit tests for `useMediaQuery` (effect-scope plan §5): initial match
 * state, `change` tracking, scope cleanup, and the SSR-static path.
 * jsdom environment (root vitest config); jsdom has no real `matchMedia`,
 * so tests run against `_match-media.ts`'s polyfill.
 */
import { effectScope } from '@aihu/signals'
import { describe, expect, it } from 'vitest'
import { useMediaQuery } from '../src/useMediaQuery/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from './_match-media.ts'
import { withSSR } from './_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/useMediaQuery', () => {
  it('reflects the current match state', () => {
    const { matches } = useMediaQuery('(min-width: 1px)')
    expect(matches()).toBe(false)
  })

  it('updates on a change event', () => {
    const mql = window.matchMedia('(min-width: 1px)')
    const { matches } = useMediaQuery('(min-width: 1px)')
    fireMatchMediaChange(mql, true)
    expect(matches()).toBe(true)
    fireMatchMediaChange(mql, false)
    expect(matches()).toBe(false)
  })

  it('scope.stop() removes the listener (getter freezes)', () => {
    const scope = effectScope()
    const mql = window.matchMedia('(min-width: 1px)')
    const query = scope.run(() => useMediaQuery('(min-width: 1px)')) as ReturnType<
      typeof useMediaQuery
    >
    fireMatchMediaChange(mql, true)
    expect(query.matches()).toBe(true)

    scope.stop()
    fireMatchMediaChange(mql, false)
    expect(query.matches()).toBe(true)
  })
})

describe('@aihu/use/useMediaQuery — SSR-static path', () => {
  it('with isClient false, returns a static false getter and registers nothing', () =>
    withSSR(
      () => import('../src/useMediaQuery/index.ts'),
      (mod) => {
        let result: { matches: () => boolean } | undefined
        expect(() => {
          result = mod.useMediaQuery('(prefers-color-scheme: dark)')
        }).not.toThrow()
        expect(result?.matches()).toBe(false)
      },
    ))
})
