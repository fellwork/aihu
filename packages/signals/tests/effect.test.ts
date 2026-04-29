import { describe, expect, it } from 'vitest'
import { effect } from '../src/effect.ts'
import { SignalCircularError } from '../src/errors.ts'
import { signal } from '../src/signal.ts'

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

  it('thrown effect does not strand siblings; error rethrows after drain', () => {
    const [n, setN] = signal(0)
    let aRuns = 0
    let cRuns = 0
    effect(() => {
      n()
      aRuns++
    })
    effect(() => {
      if (n() > 0) throw new Error('boom')
    })
    effect(() => {
      n()
      cRuns++
    })
    expect(aRuns).toBe(1)
    expect(cRuns).toBe(1)
    expect(() => setN(1)).toThrow('boom')
    // Sibling effects (A and C) ran despite B's throw.
    expect(aRuns).toBe(2)
    expect(cRuns).toBe(2)
    // Subsequent writes that don't trip B's throw flow normally.
    expect(() => setN(0)).not.toThrow()
    expect(aRuns).toBe(3)
    expect(cRuns).toBe(3)
  })

  it('two thrown effects in one wave surface as AggregateError', () => {
    const [n, setN] = signal(0)
    let cRuns = 0
    effect(() => {
      if (n() > 0) throw new Error('boom-a')
    })
    effect(() => {
      if (n() > 0) throw new Error('boom-b')
    })
    effect(() => {
      n()
      cRuns++
    })
    expect(cRuns).toBe(1)
    let caught: unknown
    try {
      setN(1)
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(AggregateError)
    const agg = caught as AggregateError
    const messages = agg.errors.map((e) => (e as Error).message).sort()
    expect(messages).toEqual(['boom-a', 'boom-b'])
    expect(cRuns).toBe(2)
  })
})
