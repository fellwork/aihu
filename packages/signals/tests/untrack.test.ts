import { describe, expect, it } from 'vitest'
import { effect, signal, untrack } from '../src/index.ts'

describe('untrack', () => {
  it('reads a signal without creating a dependency', () => {
    const [count, setCount] = signal(0)
    let runs = 0
    effect(() => {
      untrack(() => count())
      runs++
    })
    expect(runs).toBe(1) // initial run
    setCount(1)
    expect(runs).toBe(1) // NOT re-run — no dependency created
  })

  it('returns the value from fn', () => {
    const [count] = signal(42)
    expect(untrack(() => count())).toBe(42)
  })

  it('restores the outer observer after fn completes', () => {
    const [b, setB] = signal(0)
    const [a] = signal(0)
    let runs = 0
    effect(() => {
      untrack(() => a()) // a: not tracked
      b() // b: tracked (observer restored after untrack)
      runs++
    })
    setB(1)
    expect(runs).toBe(2) // b write re-triggers; a write would not
  })

  it('restores the outer observer when fn throws (Learning #46)', () => {
    // try/finally guard at packages/signals/src/untrack.ts:17-24 must restore
    // the previous tracking state even when fn throws.
    const [b, setB] = signal(0)
    let runs = 0
    effect(() => {
      try {
        untrack(() => {
          throw new Error('boom')
        })
      } catch {}
      b() // observer restored after throw → b is tracked
      runs++
    })
    expect(runs).toBe(1)
    setB(1)
    expect(runs).toBe(2)
  })
})
