import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { batch } from '../src/batch.ts'
import { computed } from '../src/computed.ts'
import { effect } from '../src/effect.ts'
import { signal } from '../src/signal.ts'

// Windows CI startup latency: 50 runs are sufficient signal at our shrink-tree
// depth (Scout R-X2). Set globally for this file.
fc.configureGlobal({ numRuns: 50 })

describe('properties', () => {
  it('last-write-wins: signal value equals the final write of any sequence', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 50 }), (writes) => {
        const [n, setN] = signal(writes[0] as number)
        for (const w of writes) setN(w)
        return n() === writes[writes.length - 1]
      }),
    )
  })

  it('effect runs equal 1 + distinct consecutive writes (Object.is short-circuit)', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 50 }), (writes) => {
        const initial = writes[0] as number
        const [n, setN] = signal(initial)
        let runs = 0
        effect(() => {
          n()
          runs++
        })
        // Count how many writes actually change the value vs. the prior cell value.
        let prev = initial
        let distinct = 0
        for (const w of writes) {
          if (!Object.is(w, prev)) {
            distinct++
            prev = w
          }
        }
        for (const w of writes) setN(w)
        return runs === 1 + distinct
      }),
    )
  })

  it('batch(fn) collapses writes: total effect invocations = 1 init + 1 batched flush', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 20 }), (writes) => {
        const [n, setN] = signal(0)
        let runs = 0
        effect(() => {
          n()
          runs++
        })
        batch(() => {
          for (const w of writes) setN(w)
        })
        // 1 init run + 1 flush run, regardless of how many writes inside batch.
        // Note: if all writes equal the initial 0 AND no distinct value is set,
        // the queue may still have the effect enqueued (we enqueue on first
        // batched write, not on equality). But Object.is short-circuit at
        // signal level prevents enqueue when value is unchanged. So:
        // - If first write differs from 0, enqueue; flush runs once → 2.
        // - If all writes are 0 (no change), enqueue never happens → 1.
        const distinctFromInitial = writes.some((w) => !Object.is(w, 0))
        const expected = distinctFromInitial ? 2 : 1
        return runs === expected
      }),
    )
  })

  it('computed value equals f(signal) for any sequence of writes', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 50 }), (writes) => {
        const [n, setN] = signal(writes[0] as number)
        const doubled = computed(() => n() * 2)
        for (const w of writes) {
          setN(w)
          if (doubled() !== w * 2) return false
        }
        return true
      }),
    )
  })
})

// Sanity check: vitest expectations to confirm fast-check discovered no
// counterexample. (`fc.assert` throws on failure; this just makes the test
// surface have a regular expect call.)
describe('properties — sanity', () => {
  it('fast-check is wired up', () => {
    expect(typeof fc.assert).toBe('function')
  })
})
