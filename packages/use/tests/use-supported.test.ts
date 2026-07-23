/**
 * Unit tests for `useSupported` — wraps a feature-detection predicate into
 * a boolean getter (effect-scope plan §5): true/false predicates, and the
 * SSR-static path (simulated `!isClient` via module re-evaluation; predicate
 * must never be called). jsdom environment (root vitest config).
 */
import { describe, expect, it, vi } from 'vitest'
import { useSupported } from '../src/useSupported/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useSupported', () => {
  it('reports true when the predicate is true', () => {
    const supported = useSupported(() => true)
    expect(supported()).toBe(true)
  })

  it('reports false when the predicate is false', () => {
    const supported = useSupported(() => false)
    expect(supported()).toBe(false)
  })

  it('evaluates a real feature-detection predicate against jsdom', () => {
    const supported = useSupported(() => typeof document.createElement === 'function')
    expect(supported()).toBe(true)
  })
})

describe('@aihu/use/useSupported — SSR-static path', () => {
  it('with isClient false, returns a static false getter and never calls the predicate', () =>
    withSSR(
      () => import('../src/useSupported/index.ts'),
      (mod) => {
        const predicate = vi.fn(() => true)
        const supported = mod.useSupported(predicate)
        expect(supported()).toBe(false)
        expect(predicate).not.toHaveBeenCalled()
      },
    ))
})
