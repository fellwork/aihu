/**
 * Unit tests for `useCounter` — a reactive numeric counter clamped to an
 * optional `[min, max]` range (effect-scope plan §5): inc/dec deltas,
 * explicit set, reset, min/max clamping, and the SSR-static path (simulated
 * `!isClient` via module re-evaluation). jsdom environment (root vitest
 * config).
 */
import { describe, expect, it } from 'vitest'
import { useCounter } from '../src/useCounter/index.ts'
import { withSSR } from './_ssr.ts'

describe('@aihu/use/useCounter', () => {
  it('defaults to 0', () => {
    const { count } = useCounter()
    expect(count()).toBe(0)
  })

  it('respects a custom initial value', () => {
    const { count } = useCounter({ initial: 5 })
    expect(count()).toBe(5)
  })

  it('inc()/dec() default to a delta of 1', () => {
    const { count, inc, dec } = useCounter()
    inc()
    expect(count()).toBe(1)
    dec()
    expect(count()).toBe(0)
  })

  it('inc(delta)/dec(delta) accept an explicit delta', () => {
    const { count, inc, dec } = useCounter()
    inc(5)
    expect(count()).toBe(5)
    dec(2)
    expect(count()).toBe(3)
  })

  it('set(value) sets an explicit value', () => {
    const { count, set } = useCounter()
    set(42)
    expect(count()).toBe(42)
  })

  it('reset() restores the (clamped) initial value', () => {
    const { count, inc, reset } = useCounter({ initial: 10 })
    inc(5)
    expect(count()).toBe(15)
    reset()
    expect(count()).toBe(10)
  })

  it('clamps to max on inc() and set()', () => {
    const { count, inc, set } = useCounter({ max: 10 })
    inc(20)
    expect(count()).toBe(10)
    set(999)
    expect(count()).toBe(10)
  })

  it('clamps to min on dec() and set()', () => {
    const { count, dec, set } = useCounter({ min: 0 })
    dec(20)
    expect(count()).toBe(0)
    set(-999)
    expect(count()).toBe(0)
  })

  it('clamps the initial value itself', () => {
    const { count } = useCounter({ initial: 100, max: 10 })
    expect(count()).toBe(10)
  })
})

describe('@aihu/use/useCounter — SSR-static path', () => {
  it('with isClient false, returns a static getter and no-op mutators', () =>
    withSSR(
      () => import('../src/useCounter/index.ts'),
      (mod) => {
        const { count, inc, dec, set, reset } = mod.useCounter({ initial: 3 })
        expect(count()).toBe(3)
        expect(() => {
          inc()
          dec()
          set(9)
          reset()
        }).not.toThrow()
        expect(count()).toBe(3)
      },
    ))
})
