import { describe, expect, it } from 'vitest'
import { computed } from '../src/computed.ts'
import { effect } from '../src/effect.ts'
import { SignalCircularError } from '../src/errors.ts'
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

  it('indirect cycle through a computed throws SignalCircularError', () => {
    // A computed that, while running, writes to a signal it (indirectly) reads
    // through an effect that depends on the computed. The write triggers the
    // effect's notify, which calls the computed's read, which is currently
    // RUNNING — cycle detected.
    const [n, setN] = signal(0)
    expect(() => {
      const c = computed(() => {
        // Reads n, then writes back to it — re-entrant via the dep chain.
        const v = n()
        setN(v + 1)
        return v
      })
      // Force evaluation to surface the cycle synchronously.
      c()
    }).toThrow(SignalCircularError)
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

  it('cascade suppressed on equal recompute (default Object.is)', () => {
    // Computed yields the same value (parity bit) for two distinct dep
    // values: 0 and 2 both produce 0. Default equals=Object.is should
    // suppress the cascade so the downstream effect does not re-run.
    const [n, setN] = signal(0)
    const parity = computed(() => n() % 2)
    let runs = 0
    let observed = -1
    effect(() => {
      observed = parity()
      runs++
    })
    expect(runs).toBe(1)
    expect(observed).toBe(0)
    setN(2) // n%2 still 0 — equal recompute, cascade suppressed
    expect(runs).toBe(1)
    expect(observed).toBe(0)
    setN(4) // still 0 — still suppressed
    expect(runs).toBe(1)
  })

  it('cascade fires on unequal recompute', () => {
    // Same shape as the suppression test, but writes that produce a
    // different parity must fire the downstream effect.
    const [n, setN] = signal(0)
    const parity = computed(() => n() % 2)
    let runs = 0
    let observed = -1
    effect(() => {
      observed = parity()
      runs++
    })
    expect(runs).toBe(1)
    setN(1) // 1 ≠ 0 — cascade fires
    expect(runs).toBe(2)
    expect(observed).toBe(1)
    setN(3) // 3%2=1 — equal to cached 1, suppressed
    expect(runs).toBe(2)
    setN(4) // 4%2=0 — different again
    expect(runs).toBe(3)
    expect(observed).toBe(0)
  })

  it('equals: false always cascades, even on identical recomputed value', () => {
    const [n, setN] = signal(0)
    // Even though the recomputed value is identical, equals: false means
    // "never short-circuit" — every dep change cascades.
    const c = computed(() => n() % 2, { equals: false })
    let runs = 0
    effect(() => {
      c()
      runs++
    })
    expect(runs).toBe(1)
    setN(2) // n%2 still 0 — but equals:false forces cascade
    expect(runs).toBe(2)
    setN(4) // still 0 — still forced
    expect(runs).toBe(3)
  })

  it('custom comparator gates cascade', () => {
    // Comparator that treats values as "equal" when their integer parts
    // match (so 1.1 and 1.9 are equal, but 1.9 and 2.0 are not).
    const sameInt = (a: number, b: number) => Math.trunc(a) === Math.trunc(b)
    const [n, setN] = signal(1.1)
    const c = computed(() => n(), { equals: sameInt })
    let runs = 0
    let observed = -1
    effect(() => {
      observed = c()
      runs++
    })
    expect(runs).toBe(1)
    expect(observed).toBe(1.1)
    setN(1.9) // sameInt(1.1, 1.9) → true; cascade suppressed
    expect(runs).toBe(1)
    setN(2.0) // sameInt(1.9, 2.0) → false; cascade fires
    expect(runs).toBe(2)
    expect(observed).toBe(2.0)
  })
})
