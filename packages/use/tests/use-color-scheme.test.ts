/**
 * Unit tests for `useColorScheme` (effect-scope plan §5): raw `scheme()`
 * state, `resolved()` against the OS preference for `'auto'`, `setScheme`,
 * and the SSR-static path. jsdom environment (root vitest config).
 */
import { describe, expect, it } from 'vitest'
import { useColorScheme } from '../src/useColorScheme/index.ts'
import { fireMatchMediaChange, installMatchMediaPolyfill } from './_match-media.ts'
import { withSSR } from './_ssr.ts'

installMatchMediaPolyfill()

describe('@aihu/use/useColorScheme', () => {
  it('defaults to auto, resolved against the OS preference (polyfill starts unmatched → light)', () => {
    const { scheme, resolved } = useColorScheme()
    expect(scheme()).toBe('auto')
    expect(resolved()).toBe('light')
  })

  it('respects an explicit initialValue', () => {
    const { scheme, resolved } = useColorScheme({ initialValue: 'dark' })
    expect(scheme()).toBe('dark')
    expect(resolved()).toBe('dark')
  })

  it('setScheme updates both scheme() and resolved()', () => {
    const { scheme, resolved, setScheme } = useColorScheme({ initialValue: 'light' })
    setScheme('dark')
    expect(scheme()).toBe('dark')
    expect(resolved()).toBe('dark')
  })

  it('auto resolves live against a change in preferred color scheme', () => {
    const { resolved, setScheme } = useColorScheme({ initialValue: 'light' })
    setScheme('auto')
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    fireMatchMediaChange(mql, true)
    expect(resolved()).toBe('dark')
  })
})

describe('@aihu/use/useColorScheme — SSR-static path', () => {
  it('with isClient false, resolves auto to light and registers nothing', () =>
    withSSR(
      () => import('../src/useColorScheme/index.ts'),
      (mod) => {
        let result: ReturnType<typeof mod.useColorScheme> | undefined
        expect(() => {
          result = mod.useColorScheme()
        }).not.toThrow()
        expect(result?.scheme()).toBe('auto')
        expect(result?.resolved()).toBe('light')
      },
    ))
})
