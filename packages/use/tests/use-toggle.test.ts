/**
 * Unit tests for `useToggle` — a reactive boolean with a flip/set toggler
 * (effect-scope plan §5): default/custom initial, flip, explicit set, and
 * the SSR-static path (simulated `!isClient` via module re-evaluation).
 * jsdom environment (root vitest config).
 */
import { describe, expect, it } from 'vitest'
import { useToggle } from '../src/useToggle/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useToggle', () => {
  it('defaults to false', () => {
    const [on] = useToggle()
    expect(on()).toBe(false)
  })

  it('respects a custom initial value', () => {
    const [on] = useToggle(true)
    expect(on()).toBe(true)
  })

  it('toggle() flips the current value', () => {
    const [on, toggle] = useToggle()
    toggle()
    expect(on()).toBe(true)
    toggle()
    expect(on()).toBe(false)
  })

  it('toggle(v) sets an explicit value', () => {
    const [on, toggle] = useToggle()
    toggle(true)
    expect(on()).toBe(true)
    toggle(true)
    expect(on()).toBe(true)
    toggle(false)
    expect(on()).toBe(false)
  })
})

describe('@aihu/use/useToggle — SSR-static path', () => {
  it('with isClient false, returns a static getter and a no-op toggle', () =>
    withSSR(
      () => import('../src/useToggle/index.ts'),
      (mod) => {
        const [on, toggle] = mod.useToggle(true)
        expect(on()).toBe(true)
        expect(() => toggle()).not.toThrow()
        expect(on()).toBe(true)
      },
    ))
})
