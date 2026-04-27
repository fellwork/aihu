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
})
