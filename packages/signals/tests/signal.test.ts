import { describe, expect, it } from 'vitest'
import { signal } from '../src/signal.ts'

describe('signal', () => {
  it('read returns initial value', () => {
    const [count] = signal(0)
    expect(count()).toBe(0)
  })

  it('setter mutates value', () => {
    const [count, setCount] = signal(0)
    setCount(7)
    expect(count()).toBe(7)
  })

  it('updater function form receives prev and writes derived value', () => {
    const [count, setCount] = signal(1)
    setCount((prev) => prev + 1)
    expect(count()).toBe(2)
    setCount((prev) => prev * 10)
    expect(count()).toBe(20)
  })

  it('Object.is short-circuits on identical reference', () => {
    const ref = { a: 1 }
    const [obj, setObj] = signal(ref)
    // Re-writing the same reference must be a no-op observable to readers.
    setObj(ref)
    expect(obj()).toBe(ref)
    // NaN equality: Object.is(NaN, NaN) === true, so re-write is a no-op.
    const [n, setN] = signal<number>(Number.NaN)
    setN(Number.NaN)
    expect(Number.isNaN(n())).toBe(true)
  })

  it('equals: false does not throw or crash on identical primitive', () => {
    const [count, setCount] = signal(5, { equals: false })
    expect(() => setCount(5)).not.toThrow()
    expect(count()).toBe(5)
  })

  it('subs shape: 0 → 1 → 2 → 3+ transitions all reach the right subscribers', async () => {
    // Implicitly exercises the tagged-union dispatcher: undefined → single
    // → tuple/Set → Set. Uses 4 effects on the same signal; assert each
    // fires on each write across each shape transition.
    const { effect } = await import('../src/effect.ts')
    const [n, setN] = signal(0)
    let r0 = 0
    let r1 = 0
    let r2 = 0
    let r3 = 0
    // 0 subs → write completes without crash.
    setN(1)
    // 1 sub (single shape).
    effect(() => {
      n()
      r0++
    })
    expect(r0).toBe(1)
    setN(2)
    expect(r0).toBe(2)
    // 2 subs (tuple or Set transition).
    effect(() => {
      n()
      r1++
    })
    setN(3)
    expect(r0).toBe(3)
    expect(r1).toBe(2)
    // 3 subs (Set guaranteed).
    effect(() => {
      n()
      r2++
    })
    // 4 subs.
    effect(() => {
      n()
      r3++
    })
    setN(4)
    expect(r0).toBe(4)
    expect(r1).toBe(3)
    expect(r2).toBe(2)
    expect(r3).toBe(2)
  })

  it('subs shape: dispose-mid-write does not lose remaining subscribers', async () => {
    // Effect A disposes itself; effect B (also subbed) must still run on
    // the same write. Exercises iteration during shape mutation.
    const { effect } = await import('../src/effect.ts')
    const [n, setN] = signal(0)
    let aRuns = 0
    let bRuns = 0
    let disposeA: () => void = () => {}
    disposeA = effect(() => {
      n()
      aRuns++
      if (aRuns === 2) disposeA()
    })
    effect(() => {
      n()
      bRuns++
    })
    expect(aRuns).toBe(1)
    expect(bRuns).toBe(1)
    setN(1) // both fire; A disposes itself in its body
    expect(aRuns).toBe(2)
    expect(bRuns).toBe(2)
    setN(2) // A disposed; B still fires
    expect(aRuns).toBe(2)
    expect(bRuns).toBe(3)
  })
})
