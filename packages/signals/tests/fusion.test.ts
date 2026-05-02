import { describe, expect, it } from 'vitest'
import { computed } from '../src/computed.ts'
import { effect } from '../src/effect.ts'
import { signal } from '../src/signal.ts'

/**
 * Round N+3 α (alien-style lazy) fusion regression tests.
 *
 * These tests pin the per-effect direct-dep settle path that replaced the
 * eager fan-out visited-walk. Cellx-shape suppression is already covered by
 * computed.test.ts; these tests target the algorithmic shift specifically:
 *
 *   - DI-1 transitive lazy-pull through Computed.read() inside the per-effect
 *     dep-settle loop (no eager visited[] pre-pass).
 *   - CS-1 cascade-suppression at the post-settle MARKED re-check, exercised
 *     via an equality-stable upstream computed that propagates to a downstream
 *     effect through one intermediate computed.
 *   - SF-1 dedup on duplicate marks reaching one effect across two roots.
 */
describe('signals/fusion (α lazy dep-settle)', () => {
  it('α regression: per-effect direct-dep settle suppresses fire on equality-stable upstream', () => {
    // c1 multiplies n by 0 — recomputes to 0 for any nonzero n, so the
    // equality check (Object.is) suppresses cascade. c2 reads c1 only,
    // so it never recomputes to a different value either. The effect
    // reads c2 and increments a counter on every fire.
    //
    // Without α's per-effect dep-settle path, the effect's MARKED bit
    // would not be cleared by the upstream shallowClear cascade; the
    // effect would fire spuriously on every setN.
    const [n, setN] = signal(1)
    const c1 = computed(() => n() * 0)
    const c2 = computed(() => c1())
    let count = 0
    effect(() => {
      c2()
      count++
    })
    expect(count).toBe(1)
    setN(2)
    expect(count).toBe(1)
    setN(3)
    expect(count).toBe(1)
    // Sanity: the cascade does fire when the value actually changes.
    const [m, setM] = signal(10)
    const c3 = computed(() => m())
    let count3 = 0
    effect(() => {
      c3()
      count3++
    })
    expect(count3).toBe(1)
    setM(11)
    expect(count3).toBe(2)
  })

  it('α regression: lazy upstream pull through Computed.read() resolves transitive PENDING chain', () => {
    // Linear chain: src → c1 → c2 → c3 → effect. Source write marks c1..c3
    // PENDING (linear path); effect arrives with PENDING set so the per-effect
    // dep-walk recomputes c3, which lazy-pulls c2, which lazy-pulls c1 via
    // Computed.read() inside recompute → fn → read.
    const [src, setSrc] = signal(1)
    const c1 = computed(() => src() + 1)
    const c2 = computed(() => c1() + 1)
    const c3 = computed(() => c2() + 1)
    let observed = -1
    effect(() => {
      observed = c3()
    })
    expect(observed).toBe(4)
    setSrc(10)
    expect(observed).toBe(13)
  })

  it('α regression: fan-out STALE parent settles via per-effect dep-walk (no eager visited)', () => {
    // src → c1 (fan-out: c2a, c2b) → effects. Without the eager visited-walk,
    // c1 stays STALE until each effect's dep-settle reaches it via c2a/c2b.
    const [src, setSrc] = signal(0)
    const c1 = computed(() => src() * 2)
    const c2a = computed(() => c1() + 1)
    const c2b = computed(() => c1() + 100)
    let observedA = -1
    let observedB = -1
    effect(() => {
      observedA = c2a()
    })
    effect(() => {
      observedB = c2b()
    })
    expect(observedA).toBe(1)
    expect(observedB).toBe(100)
    setSrc(5)
    expect(observedA).toBe(11)
    expect(observedB).toBe(110)
  })

  it('α regression: SF-1 — effect with two diamond paths fires once per source write', () => {
    // src → (c1, c2) → effect. Both paths reach the same effect; MARKED+
    // wave-dedup must keep firings to one per write.
    const [src, setSrc] = signal(1)
    const c1 = computed(() => src() + 1)
    const c2 = computed(() => src() + 10)
    let runs = 0
    let sum = 0
    effect(() => {
      sum = c1() + c2()
      runs++
    })
    expect(runs).toBe(1)
    expect(sum).toBe(13)
    setSrc(5)
    expect(runs).toBe(2)
    expect(sum).toBe(21)
  })
})
