import { describe, expect, it } from 'vitest'
import { batch, computed, effect, signal } from '../src/index.ts'

/**
 * Regression suite for reactivity-glitch fixes:
 *
 * 1. CONFIRMED marks (signal.ts) — an equality-suppressed computed dep must
 *    not erase the mark contributed by a dep that actually changed (the old
 *    shallowClear was last-settled-wins, so diamonds could miss updates
 *    depending on dep order).
 * 2. Dynamic dependency pruning (beginTrack/pruneDeps) — deps not re-read by
 *    the latest run stop notifying the sub.
 * 3. Effect first-run throw disposes the partially-linked effect.
 * 4. Computed recompute throw keeps STALE so the next read retries instead
 *    of silently serving the stale cached value.
 */
describe('diamond graphs with equality suppression', () => {
  it('re-runs an effect reading a signal directly AND via a suppressed computed (signal read first)', () => {
    const [s, setS] = signal(1)
    const c = computed(() => (s() > 0 ? 'pos' : 'neg'))
    let runs = 0
    let seen = ''
    effect(() => {
      runs++
      seen = `${s()}:${c()}`
    })
    setS(2) // c stays 'pos' (suppressed) but s itself changed
    expect(runs).toBe(2)
    expect(seen).toBe('2:pos')
  })

  it('re-runs an effect reading a suppressed computed first, signal second', () => {
    const [s, setS] = signal(1)
    const c = computed(() => (s() > 0 ? 'pos' : 'neg'))
    let runs = 0
    let seen = ''
    effect(() => {
      runs++
      seen = `${c()}:${s()}`
    })
    setS(2)
    expect(runs).toBe(2)
    expect(seen).toBe('pos:2')
  })

  it('re-runs when the changed computed settles BEFORE the unchanged one', () => {
    const [s, setS] = signal(1)
    const c1 = computed(() => s() * 10) // always changes
    const c2 = computed(() => s() > 0) // stays true
    let runs = 0
    let seen = 0
    effect(() => {
      runs++
      seen = c1()
      c2()
    })
    setS(2)
    expect(runs).toBe(2)
    expect(seen).toBe(20)
  })

  it('re-runs when the changed computed settles AFTER the unchanged one', () => {
    const [s, setS] = signal(1)
    const c1 = computed(() => s() > 0) // stays true
    const c2 = computed(() => s() * 10) // always changes
    let runs = 0
    let seen = 0
    effect(() => {
      runs++
      c1()
      seen = c2()
    })
    setS(2)
    expect(runs).toBe(2)
    expect(seen).toBe(20)
  })

  it('handles the batched variants too', () => {
    const [s, setS] = signal(1)
    const cUnchanged = computed(() => s() > 0)
    const cChanged = computed(() => s() * 10)
    let seen = ''
    effect(() => {
      seen = `${cUnchanged()}:${cChanged()}:${s()}`
    })
    batch(() => setS(2))
    expect(seen).toBe('true:20:2')
  })

  it('still suppresses the cascade when the ONLY dep is an unchanged computed', () => {
    const [s, setS] = signal(1)
    const c = computed(() => s() > 0)
    let runs = 0
    effect(() => {
      runs++
      c()
    })
    expect(runs).toBe(1)
    setS(2) // c recomputes to the same value — effect must NOT re-run
    expect(runs).toBe(1)
    setS(-1) // c actually changes now
    expect(runs).toBe(2)
  })

  it('does not let an unchanged computed clear a sibling STALE computed (stale read via chain)', () => {
    // c3 depends on cChanged; e1's settle of cUnchanged used to clear
    // c3's STALE via shallowClear when both were subs of the same effect
    // wave, leaving e2 to read a stale cached c3.
    const [s, setS] = signal(1)
    const cChanged = computed(() => s() * 10)
    const cUnchanged = computed(() => s() > 0)
    const c3 = computed(() => cChanged() + (cUnchanged() ? 1 : 0))
    let seen3 = 0
    effect(() => {
      cChanged()
      cUnchanged()
    })
    effect(() => {
      seen3 = c3()
    })
    expect(seen3).toBe(11)
    setS(2)
    expect(seen3).toBe(21)
  })
})

describe('dynamic dependency pruning', () => {
  it('stops re-running an effect for deps it no longer reads', () => {
    const [cond, setCond] = signal(true)
    const [a, setA] = signal('a')
    const [b, setB] = signal('b')
    let runs = 0
    effect(() => {
      runs++
      cond() ? a() : b()
    })
    expect(runs).toBe(1)
    setCond(false) // now reads b only
    expect(runs).toBe(2)
    setA('a2') // no longer a dep — must NOT re-run
    expect(runs).toBe(2)
    setB('b2') // current dep — must re-run
    expect(runs).toBe(3)
  })

  it('re-tracks a dep that comes back in a later run', () => {
    const [cond, setCond] = signal(true)
    const [a, setA] = signal(1)
    let runs = 0
    let seen = 0
    effect(() => {
      runs++
      seen = cond() ? a() : -1
    })
    setCond(false) // a pruned
    setA(2) // no run
    expect(runs).toBe(2)
    setCond(true) // a re-tracked, reads fresh value
    expect(seen).toBe(2)
    setA(3) // notifies again
    expect(seen).toBe(3)
    expect(runs).toBe(4)
  })

  it('stops recomputing a computed for branches it no longer reads', () => {
    const [cond, setCond] = signal(true)
    const [a, setA] = signal(1)
    const [b] = signal(100)
    let computes = 0
    const c = computed(() => {
      computes++
      return cond() ? a() : b()
    })
    let latest = 0
    effect(() => {
      latest = c()
    })
    expect(latest).toBe(1)
    setCond(false)
    expect(latest).toBe(100)
    const before = computes
    setA(2) // pruned dep — must not recompute or re-run
    expect(computes).toBe(before)
    expect(latest).toBe(100)
  })
})

describe('disposal edge cases', () => {
  it('drops edges linked AFTER a mid-run self-dispose (no leak on the signal host)', async () => {
    const { __countSubs } = await import('../src/signal.ts')
    const [s, setS] = signal(1)
    let dispose: (() => void) | null = null
    let runs = 0
    dispose = effect(() => {
      runs++
      if (dispose) dispose() // self-dispose on re-run…
      s() // …then keep reading: this edge must not survive the run
    })
    setS(2) // triggers the self-disposing run
    expect(runs).toBe(2)
    expect(__countSubs(s)).toBe(0) // no lingering edge on the host
    setS(3)
    expect(runs).toBe(2)
  })
})

describe('error resilience', () => {
  it('disposes an effect whose first run throws (no lingering subscription)', () => {
    const [s, setS] = signal(1)
    let calls = 0
    expect(() =>
      effect(() => {
        calls++
        s()
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(calls).toBe(1)
    // If the throwing effect had leaked, this write would re-run it and throw.
    expect(() => setS(2)).not.toThrow()
    expect(calls).toBe(1)
  })

  it('keeps a computed STALE after a throwing recompute (no silent stale cache)', () => {
    let mode = 'ok'
    const [s, setS] = signal(1)
    const c = computed(() => {
      if (mode === 'throw') throw new Error('compute failed')
      return s() * 2
    })
    expect(c()).toBe(2)
    mode = 'throw'
    setS(5)
    expect(() => c()).toThrow('compute failed')
    // Must KEEP throwing on retry, not fall back to the stale cached 2.
    expect(() => c()).toThrow('compute failed')
    mode = 'ok'
    expect(c()).toBe(10)
  })
})
