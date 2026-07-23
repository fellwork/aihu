/**
 * Unit tests for `usePrevious` — tracks the previous value of a reactive
 * source (effect-scope plan §5): initial `undefined`, updates on change,
 * scope cleanup, and the SSR-static path (simulated `!isClient` via module
 * re-evaluation). jsdom environment (root vitest config).
 */
import { effectScope, signal } from '@aihu/signals'
import { describe, expect, it, vi } from 'vitest'
import { usePrevious } from '../src/usePrevious/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/usePrevious', () => {
  it('starts undefined', () => {
    const [count] = signal(0)
    const previous = usePrevious(count)
    expect(previous()).toBeUndefined()
  })

  it('tracks the value from before the most recent change', () => {
    const [count, setCount] = signal(0)
    const previous = usePrevious(count)

    setCount(1)
    expect(previous()).toBe(0)

    setCount(2)
    expect(previous()).toBe(1)
  })

  it('does not update when the source is unchanged (equality short-circuit)', () => {
    const [count, setCount] = signal(0)
    const previous = usePrevious(count)

    setCount(1)
    expect(previous()).toBe(0)

    setCount(1) // same value — no signal write happens, no effect re-run
    expect(previous()).toBe(0)
  })

  it('scope.stop() freezes the previous value', () => {
    const [count, setCount] = signal(0)
    const scope = effectScope()
    const previous = scope.run(() => usePrevious(count)) as () => number | undefined

    setCount(1)
    expect(previous()).toBe(0)

    scope.stop()
    setCount(2)
    setCount(3)
    expect(previous()).toBe(0)
  })
})

describe('@aihu/use/usePrevious — SSR-static path', () => {
  it('with isClient false, returns a static undefined getter and never calls source', () =>
    withSSR(
      () => import('../src/usePrevious/index.ts'),
      (mod) => {
        const source = vi.fn(() => 1)
        const previous = mod.usePrevious(source)
        expect(previous()).toBeUndefined()
        expect(source).not.toHaveBeenCalled()
      },
    ))
})
