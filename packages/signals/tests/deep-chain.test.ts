import { describe, expect, it } from 'vitest'
import { batch, computed, effect, signal } from '../src/index.ts'
import { __hostOf, HOST, MERGE, type Subscriber } from '../src/signal.ts'

describe('deep-chain', () => {
  it('signal change propagates to terminal effect through 100-node chain', () => {
    const [src, setSrc] = signal(0)
    let prev = src
    for (let i = 0; i < 100; i++) {
      const c = prev
      prev = computed(() => c() + 1)
    }
    const tail = prev
    let runCount = 0
    let lastSeen = -1
    const dispose = effect(() => {
      runCount++
      lastSeen = tail()
    })
    // Initial run
    expect(runCount).toBe(1)
    expect(lastSeen).toBe(100)
    // Update
    setSrc(1)
    expect(runCount).toBe(2)
    expect(lastSeen).toBe(101)
    setSrc(2)
    expect(runCount).toBe(3)
    expect(lastSeen).toBe(102)
    dispose()
  })

  it('diamond graph — all paths compute correctly after signal change', () => {
    // Reproduce the core cellx diamond: src → [L1a, L1b] → [L2a, L2b] → L3 → effect
    const [src, setSrc] = signal(0)
    const L1a = computed(() => src() * 2)
    const L1b = computed(() => src() + 1)
    const L2a = computed(() => L1a() + L1b())
    const L2b = computed(() => L1a() - L1b())
    const L3 = computed(() => L2a() + L2b())
    let runCount = 0
    let lastSeen = 0
    const dispose = effect(() => {
      runCount++
      lastSeen = L3()
    })
    // Initial: src=0, L1a=0, L1b=1, L2a=1, L2b=-1, L3=0
    expect(runCount).toBe(1)
    expect(lastSeen).toBe(0)
    // Update: src=3, L1a=6, L1b=4, L2a=10, L2b=2, L3=12
    setSrc(3)
    expect(runCount).toBe(2)
    expect(lastSeen).toBe(12)
    // Update: src=5, L1a=10, L1b=6, L2a=16, L2b=4, L3=20
    setSrc(5)
    expect(runCount).toBe(3)
    expect(lastSeen).toBe(20)
    dispose()
  })

  it('effect does NOT run when upstream value unchanged (equal write)', () => {
    const [src, setSrc] = signal(5)
    const c = computed(() => (src() > 0 ? 1 : 0)) // stable output for all positive src values
    let runCount = 0
    const dispose = effect(() => {
      runCount++
      c()
    })
    expect(runCount).toBe(1)
    // Write a different value but the computed's output doesn't change (1 in both cases)
    // NOTE: this tests the existing equals short-circuit in computed, not PENDING specifically.
    // For a direct PENDING test, write the source signal with the same value — no propagation.
    setSrc(5) // same value — equals check short-circuits before propagation
    expect(runCount).toBe(1) // effect did NOT run
    setSrc(10) // different value, computed output still 1
    expect(runCount).toBe(1) // effect did NOT run (shallowClear suppressed cascade)
    setSrc(-1) // computed output changes to 0
    expect(runCount).toBe(2) // effect ran
    dispose()
  })

  it('wide-fanout-100 pattern — all 100 effects fire exactly once per write', () => {
    const [src, setSrc] = signal(0)
    const computeds = Array.from({ length: 100 }, () => computed(() => src() + 1))
    const runCounts = new Array(100).fill(0)
    const disposes = computeds.map((c, i) =>
      effect(() => {
        runCounts[i]++
        c()
      }),
    )
    // Initial
    expect(runCounts.every((n) => n === 1)).toBe(true)
    setSrc(1)
    expect(runCounts.every((n) => n === 2)).toBe(true)
    setSrc(2)
    expect(runCounts.every((n) => n === 3)).toBe(true)
    disposes.forEach((d) => d())
  })

  // ───────── Phase 2 / spec-6.2-phase2.md §9.2 — H4 property tests ─────────

  describe('H4 property: depth-parameterised glitch-freedom (spec §9.2.1)', () => {
    for (const depth of [1, 5, 10, 100, 500] as const) {
      it(`depth-${depth}: effect runs once per write and observes value = src + depth`, () => {
        const [src, setSrc] = signal(0)
        let prev: () => number = src
        for (let i = 0; i < depth; i++) {
          const c = prev
          prev = computed(() => c() + 1)
        }
        const tail = prev
        let runCount = 0
        let lastSeen = -1
        let intermediateObserved = false
        const dispose = effect(() => {
          runCount++
          const observed = tail()
          // Glitch-freedom: from the second run onward the observed value must
          // be exactly the prior lastSeen + delta of the source change.
          if (lastSeen !== -1 && runCount > 1 && observed !== lastSeen + 1) {
            // The expected diff per write is +1 in this test (we increment src
            // by 1 between observations); a non-incremental observation would
            // mean the effect saw an intermediate "glitch" state.
            // The third write sets src=7 (delta from 2 → 7 = +5), so we only
            // assert strict +1 increments for the first two writes.
            if (runCount === 2 || runCount === 3) {
              intermediateObserved = true
            }
          }
          lastSeen = observed
        })
        // Initial run: src=0, tail = 0 + depth.
        expect(runCount).toBe(1)
        expect(lastSeen).toBe(depth)
        // Write 1: src=1.
        setSrc(1)
        expect(runCount).toBe(2)
        expect(lastSeen).toBe(depth + 1)
        // Write 2: src=2.
        setSrc(2)
        expect(runCount).toBe(3)
        expect(lastSeen).toBe(depth + 2)
        // Write 3: src=7 (jump).
        setSrc(7)
        expect(runCount).toBe(4)
        expect(lastSeen).toBe(depth + 7)
        expect(intermediateObserved).toBe(false)
        dispose()
      })
    }
  })

  it('H4: equality short-circuit at c50 suppresses effect when c50 value unchanged (spec §9.2.2)', () => {
    const [src, setSrc] = signal(0)
    let prev: () => number = src
    for (let i = 0; i < 100; i++) {
      const c = prev
      if (i === 50) {
        prev = computed(() => (c() > 0 ? 1 : 0), { equals: Object.is })
      } else {
        prev = computed(() => c() + 1)
      }
    }
    // Chain values at src=0:
    //   c0=1, c1=2, …, c49=50, c50 = (50 > 0 ? 1 : 0) = 1,
    //   c51=2, c52=3, …, c99 = 1 + (99 - 50) = 50.
    const tail = prev
    let runCount = 0
    let lastSeen = -1
    const dispose = effect(() => {
      runCount++
      lastSeen = tail()
    })
    expect(runCount).toBe(1)
    expect(lastSeen).toBe(50)
    // Write that does NOT change c50's output (src=5 still > 0 → c50 = 1).
    // Cascade-suppression settle (signal.ts:285–287) calls c99.recomputeIfNeeded;
    // the lazy-pull chain reaches c50, recomputes to the same value 1,
    // shallowClear fires, the effect is skipped.
    setSrc(5)
    expect(runCount).toBe(1)
    expect(lastSeen).toBe(50)
    // Write that DOES change c50's output. Spec §9.2.2 wrote `setSrc(-1)`
    // but at that input c49 = -1 + 49 = 48 > 0, so c50 still emits 1 and
    // the cascade does NOT fire. To exercise the spec's intent ("Write that
    // DOES change c50's output (1 → 0)" — spec §9.2.2 paragraph), we use a
    // src value that drives c49 ≤ 0: src = -100 gives c49 = -51 ≤ 0, so
    // c50 = 0, c99 = 0 + 49 = 49. The assertion `lastSeen.toBe(49)` is
    // preserved verbatim (matches the c50 → 0 cascade intent).
    setSrc(-100)
    expect(runCount).toBe(2)
    expect(lastSeen).toBe(49)
    dispose()
  })

  // H5 spec §9.3 — linkAdd MERGE-promotion test (3 properties).
  it('linkAdd: linear sub stays Linear with 1 dep, upgrades to Merge on 2nd dep, dedups in same wave', () => {
    // (a) Build a single-dep computed; verify Linear after first read.
    const [src, setSrc] = signal(0)
    const c1 = computed(() => src() + 1)
    let observed = -1
    const dispose = effect(() => {
      observed = c1()
    })
    expect(observed).toBe(1)
    // c1 has 1 inbound dep (src). Should still be Linear.
    const c1node = __hostOf(c1)!
    expect(c1node.flags & MERGE).toBe(0) // (a) Linear

    // (b) Build a 2-dep computed; verify it upgrades to Merge.
    const [s2, setS2] = signal(10)
    const c2 = computed(() => c1() + s2())
    let merged = -1
    const dispose2 = effect(() => {
      merged = c2()
    })
    expect(merged).toBe(11)
    const c2node = __hostOf(c2)!
    expect((c2node.flags & MERGE) !== 0).toBe(true) // (b) Merge after 2nd dep

    // (c) Mark through both deps in the same wave (via batch).
    let runCount = 0
    const dispose3 = effect(() => {
      runCount++
      void c2()
    })
    runCount = 0
    batch(() => {
      setSrc(5)
      setS2(20)
    })
    // c2 should re-emit ONCE for the combined wave (DI-1 dedup).
    expect(runCount).toBe(1)
    expect(merged).toBe(26) // (5+1) + 20

    dispose()
    dispose2()
    dispose3()
  })

  // Phase 3 spec §9.2 — K-1: HOST flag detection test.
  // Verifies signal-source Subscribers carry the HOST flag bit; Computed
  // and Effect Subscribers do NOT; the HOST bit survives a wave (not
  // cleared by RC-1's mask, clearVisited, or shallowClear).
  it('K-1: signal hosts carry HOST; computeds and effects do not; HOST survives waves', () => {
    // (a) signal host carries HOST | MERGE
    const [src, setSrc] = signal(0)
    const srcNode = __hostOf(src)!
    expect(srcNode).not.toBe(null)
    expect((srcNode.flags & HOST) !== 0).toBe(true)
    expect((srcNode.flags & MERGE) !== 0).toBe(true) // hosts always carry HOST AND MERGE

    // (b) computed does NOT carry HOST
    const c1 = computed(() => src() + 1)
    let observed = -1
    const dispose1 = effect(() => {
      observed = c1()
    })
    expect(observed).toBe(1)
    const c1Node = __hostOf(c1)!
    expect((c1Node.flags & HOST) === 0).toBe(true)

    // (b) effect does NOT carry HOST. We reach the Effect instance by walking
    // the subs list of c1 — the effect we just created subscribed to c1.
    const effectNode: Subscriber | null = c1Node.subsHead ? c1Node.subsHead.sub : null
    expect(effectNode).not.toBe(null)
    expect((effectNode!.flags & HOST) === 0).toBe(true)

    // (c) HOST preserved across waves
    setSrc(5)
    expect(observed).toBe(6)
    expect((srcNode.flags & HOST) !== 0).toBe(true)
    setSrc(7)
    expect(observed).toBe(8)
    expect((srcNode.flags & HOST) !== 0).toBe(true)
    // (c) HOST also preserved on Computed/Effect (the bit was never set, so
    // confirming `=== 0` after waves verifies RC-1's mask does not flip it).
    expect((c1Node.flags & HOST) === 0).toBe(true)
    expect((effectNode!.flags & HOST) === 0).toBe(true)

    dispose1()
  })

  // Phase 3 spec §9.3 — K-2: prototype-method dispatch test.
  // Verifies notify and recomputeIfNeeded live on the prototype shared
  // across all Computed/Effect instances. Catches any regression where a
  // method is accidentally re-assigned as an own-property in the
  // constructor (which would defeat K1c+'s memory savings).
  it('K-2: notify and recomputeIfNeeded live on prototype, shared across instances', () => {
    // (a, c) two computeds share their methods
    const [s1] = signal(0)
    const [s2] = signal(0)
    const c1 = computed(() => s1())
    const c2 = computed(() => s2())
    // Force construction by reading through effects.
    const dispose1 = effect(() => {
      void c1()
    })
    const dispose2 = effect(() => {
      void c2()
    })
    const c1Node = __hostOf(c1)!
    const c2Node = __hostOf(c2)!
    expect(c1Node.notify).toBeDefined()
    expect(c1Node.notify).toBe(c2Node.notify) // (a) shared
    expect(c1Node.recomputeIfNeeded).toBeDefined()
    expect(c1Node.recomputeIfNeeded).toBe(c2Node.recomputeIfNeeded) // (c) shared
    // Same prototype chain.
    expect(Object.getPrototypeOf(c1Node)).toBe(Object.getPrototypeOf(c2Node))

    // (b) two effects share their notify. Reach them via the computed's subs.
    const e1: Subscriber | null = c1Node.subsHead?.sub ?? null
    const e2: Subscriber | null = c2Node.subsHead?.sub ?? null
    expect(e1).not.toBe(null)
    expect(e2).not.toBe(null)
    expect(e1?.notify).toBeDefined()
    expect(e1?.notify).toBe(e2?.notify) // (b) shared
    expect(Object.getPrototypeOf(e1!)).toBe(Object.getPrototypeOf(e2!))

    // (d) notify and recomputeIfNeeded are NOT own-properties on Computeds
    expect(Object.hasOwn(c1Node, 'notify')).toBe(false)
    expect(Object.hasOwn(c1Node, 'recomputeIfNeeded')).toBe(false)
    // notify is also NOT an own-property on Effects.
    expect(Object.hasOwn(e1!, 'notify')).toBe(false)

    dispose1()
    dispose2()
  })
})
