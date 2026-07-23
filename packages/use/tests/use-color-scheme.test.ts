/**
 * Unit tests for `useColorScheme` (effect-scope plan §5): raw `scheme()`
 * state, `resolved()` against the OS preference for `'auto'`, `setScheme`,
 * and the SSR-static path. jsdom environment (root vitest config).
 */
import { describe, expect, it, vi } from 'vitest'
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

  it('with isClient false, returns static getters — setScheme is a no-op', () =>
    withSSR(
      () => import('../src/useColorScheme/index.ts'),
      (mod) => {
        const { scheme, resolved, setScheme } = mod.useColorScheme()
        expect(() => setScheme('dark')).not.toThrow()
        // Static, not a signal: the SSR setScheme is a documented no-op.
        expect(scheme()).toBe('auto')
        expect(resolved()).toBe('light')

        const explicit = mod.useColorScheme({ initialValue: 'dark' })
        expect(explicit.scheme()).toBe('dark')
        expect(explicit.resolved()).toBe('dark')
      },
    ))

  it('with isClient false, allocates no signal at all', async () => {
    // Regression: the SSR path used to allocate a `signal()` (the raw
    // scheme state) despite registering no listener. Wrap `@aihu/signals`
    // so any signal() call — direct or via usePreferredDark/useMediaQuery —
    // is observed.
    const signalCalls = vi.fn()
    vi.doMock('@aihu/signals', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@aihu/signals')>()
      return {
        ...actual,
        signal: (...args: Parameters<typeof actual.signal>) => {
          signalCalls()
          return actual.signal(...args)
        },
      }
    })
    try {
      await withSSR(
        () => import('../src/useColorScheme/index.ts'),
        (mod) => {
          mod.useColorScheme()
          expect(signalCalls).not.toHaveBeenCalled()
        },
      )
    } finally {
      vi.doUnmock('@aihu/signals')
      vi.resetModules()
    }
  })
})
