import { describe, expect, it } from 'vitest'
import { batch } from '../src/batch.ts'
import { effect } from '../src/effect.ts'
import { SignalCircularError } from '../src/errors.ts'
import { signal } from '../src/signal.ts'

describe('batch', () => {
  it('returns the value its callback returns', () => {
    expect(batch(() => 42)).toBe(42)
    const [n, setN] = signal(1)
    // The pattern the compiler lowers `$action` to: mutate inside batch, return
    // a value. The agent driving the action must receive that value, not undefined.
    const result = batch(() => {
      setN(n() + 4)
      return n()
    })
    expect(result).toBe(5)
  })

  it('single batched write produces single effect run (1 init + 1 flush)', () => {
    const [n, setN] = signal(0)
    let runs = 0
    effect(() => {
      n()
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      setN(1)
    })
    expect(runs).toBe(2)
    expect(n()).toBe(1)
  })

  it('N batched writes to same signal collapse to 1 effect run', () => {
    const [n, setN] = signal(0)
    let runs = 0
    effect(() => {
      n()
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      for (let i = 1; i <= 20; i++) setN(i)
    })
    expect(runs).toBe(2)
    expect(n()).toBe(20)
  })

  it('N batched writes to N signals (effect subs to all) collapse to 1 effect run', () => {
    const [a, setA] = signal(0)
    const [b, setB] = signal(0)
    const [c, setC] = signal(0)
    let runs = 0
    effect(() => {
      a()
      b()
      c()
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      setA(1)
      setB(2)
      setC(3)
      setA(10) // re-write — should still only fire effect once
    })
    expect(runs).toBe(2)
    expect(a()).toBe(10)
    expect(b()).toBe(2)
    expect(c()).toBe(3)
  })

  it('nested batch(() => batch(...)) flushes once at outermost return', () => {
    const [n, setN] = signal(0)
    let runs = 0
    effect(() => {
      n()
      runs++
    })
    expect(runs).toBe(1)
    batch(() => {
      setN(1)
      batch(() => {
        setN(2)
        batch(() => {
          setN(3)
        })
      })
    })
    expect(runs).toBe(2)
    expect(n()).toBe(3)
  })

  it('effect that writes inside flush extends the same batch', () => {
    // Effect A reads signal x and writes signal y; effect B reads y. When we
    // batch a write to x, A should run once during flush, write y, and B
    // should run once total — not per nested write.
    const [x, setX] = signal(0)
    const [y, setY] = signal(0)
    let bRuns = 0
    effect(() => {
      const xv = x()
      // Each time A re-runs, propagate xv * 2 to y.
      setY(xv * 2)
    })
    effect(() => {
      y()
      bRuns++
    })
    expect(bRuns).toBe(1) // initial registration
    batch(() => {
      setX(1)
      setX(2)
      setX(3)
    })
    // A ran once during flush (writes y=6); B ran once for the y update.
    // Total bRuns = 1 (init) + 1 (flush) = 2.
    expect(bRuns).toBe(2)
    expect(y()).toBe(6)
  })

  it('pathological cycle inside batch throws SignalCircularError', () => {
    // Two ping-ponging effects: A reads/writes a, B reads a and writes a back.
    // Inside a batch this becomes an unbounded chain of re-enqueues. Spec §2.3
    // + Team Lead adjudication B-A: overflow reuses SignalCircularError with
    // the default message.
    const [a, setA] = signal(0)
    let started = false
    effect(() => {
      const v = a()
      if (started) {
        // Each re-run writes a+1 back, which re-enqueues this very effect.
        // The drain hits the 100-iteration cap and throws.
        setA(v + 1)
      }
    })
    started = true
    expect(() => {
      batch(() => {
        setA(1)
      })
    }).toThrow(SignalCircularError)
  })
})
