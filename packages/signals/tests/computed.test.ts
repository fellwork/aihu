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

  it('lazy stale propagation: only-computed subs do not recompute on notify', () => {
    // signal → c1 → c2 (no effect; c2 is only read once at the end)
    const [n, setN] = signal(1)
    let c1Evals = 0
    let c2Evals = 0
    const c1 = computed(() => {
      c1Evals++
      return n() + 1
    })
    const c2 = computed(() => {
      c2Evals++
      return c1() * 10
    })
    // Initial read of c2 to wire deps. c2 reads c1, c1 reads n.
    expect(c2()).toBe(20)
    expect(c1Evals).toBe(1)
    expect(c2Evals).toBe(1)
    // Now write to n. With no effect subscribed, c2 should NOT recompute
    // during notify — c2 has no subs → STALE-mark only. c1 has c2 as sub
    // → STALE-propagate, no recompute.
    setN(5)
    expect(c1Evals).toBe(1) // not yet (lazy)
    expect(c2Evals).toBe(1) // not yet (lazy)
    // Reading c2 forces the chain to recompute exactly once each.
    expect(c2()).toBe(60)
    expect(c1Evals).toBe(2)
    expect(c2Evals).toBe(2)
  })

  it('diamond graph: each node runs exactly once per signal write', () => {
    // Mini-diamond (1 source, 2 layers of 2 computeds each, 1 effect).
    // Under the new two-phase mark/propagate scheduler (.team/phase-2-5/
    // cellx-structural-rewrite-spec.md §5.4), the diamond glitch is
    // structurally eliminated: phase-1 marks every reachable node once
    // (NOTIFIED dedup), phase-2 settles computeds with effect subs in
    // visited order so all upstream is fresh before any equality check
    // fires, phase-3 runs effects whose MARKED bit survived. Counts
    // tighten from the wip's `≤2 / ≤3 / ≤5` ranges to exact `===` values.
    const [n, setN] = signal(0)
    const evals = { l1a: 0, l1b: 0, l2a: 0, l2b: 0 }
    const l1a = computed(() => {
      evals.l1a++
      return n() + 1
    })
    const l1b = computed(() => {
      evals.l1b++
      return n() + 2
    })
    const l2a = computed(() => {
      evals.l2a++
      return l1a() + l1b()
    })
    const l2b = computed(() => {
      evals.l2b++
      return l1a() * l1b()
    })
    let effectRuns = 0
    let observed = -1
    effect(() => {
      effectRuns++
      observed = l2a() + l2b()
    })
    // After construction, all 4 computeds have evaluated once (effect's read).
    expect(evals.l1a).toBe(1)
    expect(evals.l1b).toBe(1)
    expect(evals.l2a).toBe(1)
    expect(evals.l2b).toBe(1)
    expect(effectRuns).toBe(1)
    // n=0 → l1a=1, l1b=2, l2a=3, l2b=2, observed = 5.
    expect(observed).toBe(5)

    // Write to n. The new design produces exactly {l1*=2, l2*=2,
    // effectRuns=2} — no glitch storm. (Counts include the construction
    // run + the post-write run.)
    setN(10)
    expect(evals.l1a).toBe(2)
    expect(evals.l1b).toBe(2)
    expect(evals.l2a).toBe(2)
    expect(evals.l2b).toBe(2)
    expect(effectRuns).toBe(2)
    // n=10 → l1a=11, l1b=12, l2a=23, l2b=132, observed = 155.
    expect(observed).toBe(155)
  })

  it('cellx 4×4 diamond: exactly 17 body executions per signal write', () => {
    // Mirrors .team/phase-2-5/scratch/cellx-counter.ts as a unit test.
    // Spec §5.3 — binding diamond-glitch-absence regression check.
    type Tup4 = [number, number, number, number]
    const counters: { l1: Tup4; l2: Tup4; l3: Tup4; l4: Tup4; eff: number } = {
      l1: [0, 0, 0, 0],
      l2: [0, 0, 0, 0],
      l3: [0, 0, 0, 0],
      l4: [0, 0, 0, 0],
      eff: 0,
    }
    const [src, setSrc] = signal(0)
    const l1 = ([0, 1, 2, 3] as const).map((i) =>
      computed(() => {
        counters.l1[i]++
        return src() + i
      }),
    )
    /* biome-ignore-start lint/style/noNonNullAssertion: fixed-shape array, indices known */
    const l2 = [
      computed(() => {
        counters.l2[0]++
        return l1[0]!() + l1[1]!()
      }),
      computed(() => {
        counters.l2[1]++
        return l1[1]!() + l1[2]!()
      }),
      computed(() => {
        counters.l2[2]++
        return l1[2]!() + l1[3]!()
      }),
      computed(() => {
        counters.l2[3]++
        return l1[3]!() + l1[0]!()
      }),
    ]
    const l3 = [
      computed(() => {
        counters.l3[0]++
        return l2[0]!() + l2[1]!()
      }),
      computed(() => {
        counters.l3[1]++
        return l2[1]!() + l2[2]!()
      }),
      computed(() => {
        counters.l3[2]++
        return l2[2]!() + l2[3]!()
      }),
      computed(() => {
        counters.l3[3]++
        return l2[3]!() + l2[0]!()
      }),
    ]
    const l4 = [
      computed(() => {
        counters.l4[0]++
        return l3[0]!() + l3[1]!()
      }),
      computed(() => {
        counters.l4[1]++
        return l3[1]!() + l3[2]!()
      }),
      computed(() => {
        counters.l4[2]++
        return l3[2]!() + l3[3]!()
      }),
      computed(() => {
        counters.l4[3]++
        return l3[3]!() + l3[0]!()
      }),
    ]
    /* biome-ignore-end lint/style/noNonNullAssertion: fixed-shape array, indices known */
    let sink = 0
    effect(() => {
      counters.eff++
      // biome-ignore lint/style/noNonNullAssertion: fixed-shape array, indices known
      sink = l4[0]!() + l4[1]!() + l4[2]!() + l4[3]!()
    })
    // Reset post-construction.
    counters.l1 = [0, 0, 0, 0]
    counters.l2 = [0, 0, 0, 0]
    counters.l3 = [0, 0, 0, 0]
    counters.l4 = [0, 0, 0, 0]
    counters.eff = 0
    setSrc(1)
    // Exactly 1 body execution per computed; effect runs exactly once.
    for (let i = 0; i < 4; i++) {
      expect(counters.l1[i]).toBe(1)
      expect(counters.l2[i]).toBe(1)
      expect(counters.l3[i]).toBe(1)
      expect(counters.l4[i]).toBe(1)
    }
    expect(counters.eff).toBe(1)
    // Sink converged (acts as a touch-test on `sink` so it isn't
    // dead-code-eliminated by V8).
    expect(typeof sink).toBe('number')
  })

  it('NOTIFIED dedup: a write reaching the same computed via multiple paths only marks it once', () => {
    // Two-parent diamond: src → a, src → b; both → c → effect.
    // Without NOTIFIED dedup, c would be marked twice and (under the wip
    // eager design) recomputed twice. The new design caps it at once.
    const [src, setSrc] = signal(0)
    let aEvals = 0
    let bEvals = 0
    let cEvals = 0
    let effRuns = 0
    const a = computed(() => {
      aEvals++
      return src() + 1
    })
    const b = computed(() => {
      bEvals++
      return src() + 2
    })
    const c = computed(() => {
      cEvals++
      return a() + b()
    })
    effect(() => {
      effRuns++
      c()
    })
    expect(aEvals).toBe(1)
    expect(bEvals).toBe(1)
    expect(cEvals).toBe(1)
    expect(effRuns).toBe(1)
    setSrc(10)
    expect(aEvals).toBe(2)
    expect(bEvals).toBe(2)
    expect(cEvals).toBe(2) // exactly once, not twice
    expect(effRuns).toBe(2)
  })

  it('effect dedup: two cascades reaching the same effect run it once', () => {
    // Two computeds that both reach the same effect.
    const [src, setSrc] = signal(0)
    let effRuns = 0
    const a = computed(() => src() + 1)
    const b = computed(() => src() + 2)
    effect(() => {
      effRuns++
      a()
      b()
    })
    expect(effRuns).toBe(1)
    setSrc(5)
    // Effect is reached via a-cascade AND b-cascade; QUEUED dedup runs once.
    expect(effRuns).toBe(2)
  })

  it('mixed subs: computed with both effect and computed subs takes eager path', () => {
    // c1 is read by both a downstream computed (c2) AND an effect directly.
    // c1 must take the eager path because it has at least one effect sub,
    // which means equality suppression must work on c1.
    const [n, setN] = signal(0)
    let c1Evals = 0
    const c1 = computed(() => {
      c1Evals++
      return n() % 2 // returns 0 for even, 1 for odd
    })
    const c2 = computed(() => c1() * 10)
    let effectRuns = 0
    effect(() => {
      c1() // direct sub of c1
      c2() // indirect sub of c1 via c2
      effectRuns++
    })
    expect(c1Evals).toBe(1)
    expect(effectRuns).toBe(1)
    // Write that produces equal recompute (0 → 2, both even → c1=0 unchanged).
    setN(2)
    // c1 has effect sub → eager path → recompute → equals(0, 0) → suppress.
    // Effect must NOT have re-run.
    expect(c1Evals).toBe(2) // recomputed eagerly (eager path)
    expect(effectRuns).toBe(1) // suppressed by equality
  })
})
