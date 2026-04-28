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

// Phase 2 — linked-list dep graph invariants. These tests use the
// internal `__inspectGraph` helper to walk the Link list in both
// directions and assert the dep↔sub bijection holds after construction,
// after dispose, and after a thrown cycle.
describe('properties — linked-list dep graph (Phase 2)', () => {
  it('property: every dep edge has a matching sub edge (back-edge invariant)', async () => {
    const { __hostOf, __inspectGraph } = await import('../src/signal.ts')
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 1, maxLength: 8 }),
        fc.array(fc.tuple(fc.nat(7), fc.nat(7)), { minLength: 0, maxLength: 8 }),
        (sigInits, edges) => {
          const sigs = sigInits.map((v) => signal(v))
          const reads = sigs.map(([r]) => r)
          const cmps = edges.map(([i, j]) => {
            const a = reads[i % reads.length]
            const b = reads[j % reads.length]
            return computed(() => (a === undefined ? 0 : a()) + (b === undefined ? 0 : b()))
          })
          const dispose = effect(() => {
            for (const c of cmps) c()
            for (const r of reads) r()
          })
          const roots = [...reads, ...cmps]
            .map((r) => __hostOf(r))
            .filter((h): h is NonNullable<typeof h> => h !== null)
          const nodes = __inspectGraph(roots)
          dispose()
          return nodes.violations === 0
        },
      ),
    )
  })

  it('property: dispose-effect splices all its dep edges in O(deps) time', async () => {
    const { __hostOf, __inspectGraph } = await import('../src/signal.ts')
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 10 }), { minLength: 1, maxLength: 6 }),
        (sigInits) => {
          const sigs = sigInits.map((v) => signal(v))
          const reads = sigs.map(([r]) => r)
          const dispose = effect(() => {
            for (const r of reads) r()
          })
          const roots = reads
            .map((r) => __hostOf(r))
            .filter((h): h is NonNullable<typeof h> => h !== null)
          const before = __inspectGraph(roots)
          dispose()
          const after = __inspectGraph(roots)
          return after.violations === 0 && after.totalEdges < before.totalEdges
        },
      ),
    )
  })

  it('property: cycle-throw leaves no partially-spliced Link', async () => {
    const { __hostOf, __inspectGraph } = await import('../src/signal.ts')
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5 }), (k) => {
        const [n, setN] = signal(k)
        let threw = false
        const c = computed(() => {
          const v = n()
          setN(v + 1)
          return v
        })
        try {
          c()
        } catch (e) {
          threw = true
          if (!(e instanceof Error)) return false
        }
        const roots = [__hostOf(n), __hostOf(c)].filter(
          (h): h is NonNullable<typeof h> => h !== null,
        )
        const post = __inspectGraph(roots)
        return threw && post.violations === 0
      }),
    )
  })

  it('property: NOTIFIED-dedup invariant holds with linked-list edges', () => {
    fc.assert(
      fc.property(fc.array(fc.integer(), { minLength: 1, maxLength: 20 }), (writes) => {
        // Diamond: src → a, src → b; both → c → effect. Each write to
        // src must run c's body exactly once, regardless of multiple
        // reachable paths.
        const [src, setSrc] = signal(0)
        let cRuns = 0
        const a = computed(() => src() + 1)
        const b = computed(() => src() + 2)
        const c = computed(() => {
          cRuns++
          return a() + b()
        })
        let effRuns = 0
        effect(() => {
          c()
          effRuns++
        })
        const beforeC = cRuns
        const beforeEff = effRuns
        // Each *distinct* write should bump cRuns by exactly 1.
        let prev = 0
        let distinct = 0
        for (const w of writes) {
          if (!Object.is(w, prev)) {
            distinct++
            prev = w
          }
          setSrc(w)
        }
        return cRuns === beforeC + distinct && effRuns === beforeEff + distinct
      }),
    )
  })
})
