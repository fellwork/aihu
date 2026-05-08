import { describe, expect, it } from 'vitest'
import { computed } from '../src/computed.ts'
import { effect } from '../src/effect.ts'
import { SignalCircularError } from '../src/errors.ts'
import { type Read, signal } from '../src/signal.ts'

describe('effect', () => {
  it('runs once on registration', () => {
    let runs = 0
    effect(() => {
      runs++
    })
    expect(runs).toBe(1)
  })

  it('re-runs on tracked signal change', () => {
    const [n, setN] = signal(0)
    let observed = -1
    effect(() => {
      observed = n()
    })
    expect(observed).toBe(0)
    setN(7)
    expect(observed).toBe(7)
    setN(42)
    expect(observed).toBe(42)
  })

  it('equality short-circuit suppresses re-run', () => {
    const [n, setN] = signal(0)
    let runs = 0
    effect(() => {
      n()
      runs++
    })
    expect(runs).toBe(1)
    setN(0) // Object.is short-circuit — no notify, no re-run
    expect(runs).toBe(1)
    setN(1)
    expect(runs).toBe(2)
  })

  it('equals: false forces re-run on identical value', () => {
    const [n, setN] = signal(0, { equals: false })
    let runs = 0
    effect(() => {
      n()
      runs++
    })
    expect(runs).toBe(1)
    setN(0)
    expect(runs).toBe(2)
    setN(0)
    expect(runs).toBe(3)
  })

  it('dispose() stops further re-runs and is idempotent', () => {
    const [n, setN] = signal(0)
    let runs = 0
    const dispose = effect(() => {
      n()
      runs++
    })
    expect(runs).toBe(1)
    setN(1)
    expect(runs).toBe(2)
    dispose()
    setN(2)
    expect(runs).toBe(2)
    // idempotent
    expect(() => dispose()).not.toThrow()
    setN(3)
    expect(runs).toBe(2)
  })

  it('direct self-write inside an effect throws SignalCircularError', () => {
    const [n, setN] = signal(0)
    expect(() => {
      effect(() => {
        // Reads n() (creating the dep), then writes — a re-entrant cycle.
        const v = n()
        setN(v + 1)
      })
    }).toThrow(SignalCircularError)
  })

  it('pooled effect: identity is internal; consecutive create+dispose cycles do not leak deps', async () => {
    // Phase 3 (§9.5 effect pool, §6.2 OVERRIDE): the effect node is
    // pooled across short-lived create/dispose cycles. Behaviour
    // contract: each disposed effect's dispose() is idempotent and
    // does NOT affect a later effect that may have reused the same
    // pooled node. Each effect runs only its own body.
    const [n, setN] = signal(0)
    const aRuns: number[] = []
    const bRuns: number[] = []
    const disposeA = effect(() => {
      aRuns.push(n())
    })
    expect(aRuns).toEqual([0])
    setN(1)
    expect(aRuns).toEqual([0, 1])
    disposeA()
    // Subsequent writes do not re-run A, even after we create another
    // effect (which may reuse A's pooled node).
    const disposeB = effect(() => {
      bRuns.push(n())
    })
    expect(aRuns).toEqual([0, 1])
    expect(bRuns).toEqual([1])
    setN(2)
    // A is disposed; only B fires.
    expect(aRuns).toEqual([0, 1])
    expect(bRuns).toEqual([1, 2])
    // Late dispose-A is idempotent and must NOT cancel B.
    disposeA()
    setN(3)
    expect(aRuns).toEqual([0, 1])
    expect(bRuns).toEqual([1, 2, 3])
    disposeB()
    setN(4)
    expect(bRuns).toEqual([1, 2, 3])
  })

  it('multiple effects on one signal each fire (fan-out)', () => {
    const [n, setN] = signal(0)
    let a = 0
    let b = 0
    effect(() => {
      n()
      a++
    })
    effect(() => {
      n()
      b++
    })
    expect(a).toBe(1)
    expect(b).toBe(1)
    setN(1)
    expect(a).toBe(2)
    expect(b).toBe(2)
  })

  it('thrown effect rethrows immediately (fail-fast); later siblings in the same wave may not run', () => {
    const [n, setN] = signal(0)
    let aRuns = 0
    effect(() => {
      n()
      aRuns++
    })
    effect(() => {
      if (n() > 0) throw new Error('boom')
    })
    expect(aRuns).toBe(1)
    // Fail-fast: the thrown error propagates immediately out of the write.
    expect(() => setN(1)).toThrow('boom')
    // A ran (it is queued before the throwing effect).
    expect(aRuns).toBe(2)
    // Subsequent writes that don't trip the throw flow normally.
    expect(() => setN(0)).not.toThrow()
    expect(aRuns).toBe(3)
  })

  it('first thrown effect in a wave surfaces immediately (fail-fast)', () => {
    const [n, setN] = signal(0)
    effect(() => {
      if (n() > 0) throw new Error('boom-a')
    })
    effect(() => {
      if (n() > 0) throw new Error('boom-b')
    })
    let caught: unknown
    try {
      setN(1)
    } catch (e) {
      caught = e
    }
    // Fail-fast: only the first error surfaces (boom-a).
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toBe('boom-a')
  })

  it('deep dep chain: 20000-level computed chain does not overflow stack on write', () => {
    // Regression for the recursive markOne (signal.ts ~lines 164-188).
    // For a chain `signal → c1 → c2 → ... → cN → effect`, the
    // recursive markOne descends N+1 frames in one go. V8 blows the
    // stack at ~10-13K frames, so 20000 reliably overflows the
    // recursive impl on every host while remaining instant under
    // the iterative work-stack version (O(1) JS-stack frames
    // regardless of chain depth).
    //
    // Each level gets its own effect so that `recomputeIfNeeded`
    // settles each computed iteratively in `visited` order (no
    // lazy-pull recursion through `computed.read → recompute → fn
    // → next.read` on STALE chains). This isolates the regression
    // to markOne's traversal, which is the function under test.
    const DEPTH = 20000
    const [src, setSrc] = signal(0)
    const observedPerLevel: number[] = new Array(DEPTH).fill(-1)
    let prev: Read<number> = src
    for (let i = 0; i < DEPTH; i++) {
      const cur = prev
      const next = computed(() => cur() + 1)
      // Attach an effect at every level so each computed has
      // `hasEffectSub === true`. settleAndDrain then recomputes them
      // in pre-order; each recompute reads the previous level, which
      // by then has cleared STALE — no recursive descent.
      const idx = i
      effect(() => {
        observedPerLevel[idx] = next()
      })
      prev = next
    }
    const final = prev
    let observedFinal = -1
    effect(() => {
      observedFinal = final()
    })
    expect(observedFinal).toBe(DEPTH)
    expect(observedPerLevel[DEPTH - 1]).toBe(DEPTH)
    expect(() => setSrc(1)).not.toThrow()
    expect(observedFinal).toBe(DEPTH + 1)
    expect(observedPerLevel[DEPTH - 1]).toBe(DEPTH + 1)
  })
})
