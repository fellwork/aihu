import { describe, expect, it } from 'vitest'
import { computed } from '../src/computed.ts'
import { effect } from '../src/effect.ts'
import { signal } from '../src/signal.ts'

describe('computed', () => {
  it('returns derived value on read', () => {
    const [n] = signal(3)
    const doubled = computed(() => n() * 2)
    expect(doubled()).toBe(6)
  })

  it('re-derives only when a dep changes (cached otherwise)', () => {
    const [n, setN] = signal(2)
    let evals = 0
    const doubled = computed(() => {
      evals++
      return n() * 2
    })
    expect(doubled()).toBe(4)
    expect(evals).toBe(1)
    expect(doubled()).toBe(4) // cached
    expect(doubled()).toBe(4) // cached
    expect(evals).toBe(1)
    setN(5)
    expect(doubled()).toBe(10)
    expect(evals).toBe(2)
    expect(doubled()).toBe(10) // cached again
    expect(evals).toBe(2)
  })

  it('triggers downstream effects through computed', () => {
    const [n, setN] = signal(1)
    const doubled = computed(() => n() * 2)
    let observed = -1
    let runs = 0
    effect(() => {
      observed = doubled()
      runs++
    })
    expect(observed).toBe(2)
    expect(runs).toBe(1)
    setN(4)
    expect(observed).toBe(8)
    expect(runs).toBe(2)
  })

  it('chained computeds stay lazy (outer recomputes only on read after dep change)', () => {
    const [n, setN] = signal(1)
    let innerEvals = 0
    let outerEvals = 0
    const inner = computed(() => {
      innerEvals++
      return n() + 1
    })
    const outer = computed(() => {
      outerEvals++
      return inner() * 10
    })
    // Nothing read yet — both are still lazy and uncomputed.
    expect(innerEvals).toBe(0)
    expect(outerEvals).toBe(0)
    expect(outer()).toBe(20)
    expect(innerEvals).toBe(1)
    expect(outerEvals).toBe(1)
    // Cached
    expect(outer()).toBe(20)
    expect(innerEvals).toBe(1)
    expect(outerEvals).toBe(1)
    // Dep change marks both stale; outer doesn't recompute until read.
    setN(2)
    expect(outerEvals).toBe(1) // not yet
    expect(outer()).toBe(30)
    expect(innerEvals).toBe(2)
    expect(outerEvals).toBe(2)
  })
})
