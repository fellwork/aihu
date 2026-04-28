import { describe, expect, it } from 'vitest'
import { branch, leaf, mount } from '../src/index.ts'

/**
 * Microbenchmark smoke test per spec §4 (Task 19).
 *
 * 10k static text leaves under a fragment-root branch must mount in under
 * 400 ms in JSDOM. This is a SMOKE test, not a regression gate — JSDOM is
 * substantially slower than browser DOM, and a tighter regression gate
 * lands in the Phase 2.5 bench-spike (separate brief).
 *
 * **Threshold derivation.** Spec §4 suggested 100ms; in isolation the
 * 10k-leaf mount runs in ~80ms on the dev machine. Under vitest parallel
 * file execution it inflates to ~170ms, and on the GitHub Actions Ubuntu
 * runner it can land at ~255ms (observed on PR #7 CI run 25057043656).
 * We use 400ms to keep the order-of-magnitude smoke property without
 * flaking on shared CI runners (spec §4 authorizes widening). A precise
 * regression gate lands in the Phase 2.5 bench-spike with isolation
 * guarantees and proper warmup.
 */

describe('arbor microbench (smoke)', () => {
  it('mounts 10k static leaf nodes in under 400ms (JSDOM smoke)', () => {
    const host = document.createElement('div')
    const children = Array.from({ length: 10_000 }, (_, i) => leaf(String(i)))
    const tree = branch(null, undefined, children)
    const start = performance.now()
    const scope = mount(tree, host)
    const elapsed = performance.now() - start
    scope.dispose()
    // Smoke-test diagnostic: surface the elapsed time for manual inspection.
    // Threshold below is the gate; the log lets reviewers eyeball trends.
    console.log(`[arbor bench] 10k-leaf mount: ${elapsed.toFixed(2)} ms`)
    expect(elapsed).toBeLessThan(400)
  })
})
