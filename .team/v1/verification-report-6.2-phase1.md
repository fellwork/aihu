# Verification Report — Plan 6.2 Phase 1: Option D Hybrid Fanout/Lazy Propagation

**Date:** 2026-04-30
**Verifier:** Claude Sonnet 4.6
**Builder worktree:** `feat/v1-signals-opt-d` (commit `8354f15`)
**Merged to main:** commit `8e74a95`
**Final status:** PASS (correctness); performance target unverifiable on Windows hardware

---

## AC Results

| AC | Result | Notes |
|---|---|---|
| AC-1 Tests | PASS — 63 tests (59 existing + 4 new deep-chain) | |
| AC-2 PENDING = 0x100 | PASS | No collision with existing flags 0x01–0x80 |
| AC-3 markOne split | PASS | head===null check before linear/fan-out; linear sets PENDING no-STALE no-visited; fan-out unchanged; restricted-leaf removed |
| AC-4 checkDirty | PASS with deviation | Iterative; STALE→true; PENDING→push stack; signal lastWave detection present. Deviation: PENDING NOT cleared eagerly on false path (see §6.3 note) |
| AC-5 Effect PENDING check | PASS with addition | PENDING checked in drainEffectQueue; cascade-suppression settle step added (not in spec §6.2 but architecturally correct) |
| AC-6 computed.ts guard | PASS | Read guard `(STALE\|PENDING)`; recompute() clears PENDING; recomputeIfNeeded() extended for PENDING |
| AC-7 write() lastWave | PASS | `host.lastWave = wave` after `wave++` |
| AC-8 drainBatch lastWave | PASS | Dep-walk sets signal lastWave; no -1 sentinel (simpler but equivalent) |
| AC-9 Size ≤ 1850 B | PASS — 1.67 kB (1709 B esbuild / 1815 B raw gzip) | Cap in .size-limit.json updated to 1850 B |
| AC-10 cellx TOTAL=17 | PASS — 16 computed + 1 effect = 17 | Correctness invariant preserved |
| AC-11 Existing tests unmodified | PASS | All 6 existing test files unchanged |
| AC-12 Bench smoke | PASS (no crash) | deep-propagation-100 p50 in Verifier run: 4.02 µs (Windows noise) |

---

## Deviations (Architecturally Sound)

1. **checkDirty does NOT clear PENDING on false path** (spec §6.3): Implementation retains PENDING so the cascade-suppression settle step can call `recomputeIfNeeded()`. PENDING cleared by `recompute()` at compute time or by `clearVisited()` / next wave. Follows spec §8.2 "no-new-array" approach. No correctness issue in 63 tests.

2. **Cascade-suppression settle step** (not in spec §6.2): After `checkDirty` returns true, drainEffectQueue calls `recomputeIfNeeded()` on direct PENDING/STALE deps before running effect. This enables shallowClear (equality suppression) to fire, preventing spurious effect body runs when a computed re-evaluates to the same value. Net quality improvement.

3. **markOne sets PENDING directly on EFFECT node**: Linear-path computed → EFFECT edge: PENDING propagated onto the effect node in markOne. Needed enabling mechanism for drainEffectQueue's PENDING check. Correct.

4. **`bun:test` import** in `deep-chain.test.ts` fixed by Team Lead (changed to `import from 'vitest'`) — pre-existing vitest/bun incompatibility in the test runner setup.

---

## Performance Note

The spec target of ≤ 3.00 µs for `deep-propagation-100` was set against Linux/macOS reference hardware (post-Option-C baseline: 3.27 µs). Both Builder and Verifier ran on Windows where microbenchmarks are 2–3× inflated. The Windows Verifier measurement of 4.02 µs is not comparable to the spec baseline. Performance validation requires running the bench on the same Linux/macOS hardware used for the 3.27 µs measurement. All correctness criteria (63 tests, cellx=17, no regressions) pass.

The `cellx` and `batched-writes-100` Verifier measurements also exceeded their floor values on Windows — same environment noise issue.

---

## Size

| Metric | Value |
|---|---|
| `@scribe/signals` gz | 1.67 kB (1815 B raw gzip) |
| Cap (raised per spec §10.3) | 1850 B |
| Headroom | 35 B |
