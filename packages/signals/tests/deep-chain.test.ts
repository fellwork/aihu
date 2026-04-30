import { describe, it, expect } from 'vitest'
import { signal, computed, effect } from '../src/index.ts'

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
    const dispose = effect(() => { runCount++; lastSeen = tail() })
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
    const dispose = effect(() => { runCount++; lastSeen = L3() })
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
    const c = computed(() => src() > 0 ? 1 : 0)   // stable output for all positive src values
    let runCount = 0
    const dispose = effect(() => { runCount++; c() })
    expect(runCount).toBe(1)
    // Write a different value but the computed's output doesn't change (1 in both cases)
    // NOTE: this tests the existing equals short-circuit in computed, not PENDING specifically.
    // For a direct PENDING test, write the source signal with the same value — no propagation.
    setSrc(5)   // same value — equals check short-circuits before propagation
    expect(runCount).toBe(1)  // effect did NOT run
    setSrc(10)  // different value, computed output still 1
    expect(runCount).toBe(1)  // effect did NOT run (shallowClear suppressed cascade)
    setSrc(-1)  // computed output changes to 0
    expect(runCount).toBe(2)  // effect ran
    dispose()
  })

  it('wide-fanout-100 pattern — all 100 effects fire exactly once per write', () => {
    const [src, setSrc] = signal(0)
    const computeds = Array.from({ length: 100 }, () => computed(() => src() + 1))
    const runCounts = new Array(100).fill(0)
    const disposes = computeds.map((c, i) =>
      effect(() => { runCounts[i]++; c() })
    )
    // Initial
    expect(runCounts.every(n => n === 1)).toBe(true)
    setSrc(1)
    expect(runCounts.every(n => n === 2)).toBe(true)
    setSrc(2)
    expect(runCounts.every(n => n === 3)).toBe(true)
    disposes.forEach(d => d())
  })
})
