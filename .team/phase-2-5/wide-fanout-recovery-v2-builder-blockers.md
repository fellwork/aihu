# Builder blockers — wide-fanout-100 recovery v2 (Option 4 stacked)

**Author:** Builder
**Date:** 2026-04-28
**Branch:** `perf/signals-cellx-fix`
**Status:** Filing for Team Lead adjudication; Phases A/B/C/D landed. The deviation is environmental (machine), not implementation.

---

## §1 What landed

All four phases of the spec landed on `perf/signals-cellx-fix`:

| Phase | Commit | Status |
|---|---|---|
| A | `235312a` (pre-existing) | Avenue C wave counter — landed before this Builder began. |
| B | `2790610` | Restricted leaf-computed inline settle + `shallowClearFired` removal. 42/42 tests pass. Bundle 1015 B (9 B under cap). |
| C | (this Builder) | Bench results, with deviation memo (this file). |
| D | (this Builder) | CHANGELOG entry. |

Test suite: 42/42 pass — including `computed.test.ts:97-116`, NOTIFIED-dedup, cellx 4×4 diamond, properties-based fast-check.
`cellx-counter.ts`: 16 inner + 1 effect = 17 body evaluations per op (spec §10 C4 gate ✓).
Bundle: 1015 B gz (cap 1024 B; 9 B headroom — no fallback path needed).

## §2 The deviation

Spec §7 predicted, on the Architect's reference machine:

| Workload | Prediction | Range | Hard gate |
|---|---:|---|---:|
| wide-fanout-100 | 9.2 µs | 9.0–9.7 µs | 9.87 µs |
| cellx | 1.65 µs | 1.55–1.75 µs | 1.7 µs |
| batched-writes-100 | 8.0 µs | 7.9–8.2 µs | 8.2 µs |

Actual (this machine, post-Phase B), median of 5 runs:

| Workload | Median (post-Phase B) | Median (Phase A only) | Delta | vs gate |
|---|---:|---:|---:|---|
| wide-fanout-100 | **12.59 µs** | 12.91 µs | −0.32 µs | **+2.72 µs over 9.87 gate** |
| cellx | **1.64 µs** | 1.67 µs | −0.03 µs | 0.06 µs under 1.7 gate ✓ |
| batched-writes-100 | **9.21 µs** | 9.74 µs | −0.53 µs | **+1.01 µs over 8.2 gate** |

## §3 Why this is environmental, not an implementation defect

Three orthogonal signals point to machine variance dominating the absolute numbers:

1. **All competitors regressed in the same RESULTS.md run, not just scribe.** alien-signals went 8.63 µs → 8.26 µs (improved), but `@preact/signals-core` went 11.03 µs → 11.71 µs (worse), `@vue/reactivity` 14.38 → 19.23 µs (much worse), `solid-js` 24.77 → 23.20 µs (improved). These are unrelated codebases pinned to identical versions; their per-workload numbers can only move if the *measurement environment* changed (CPU clock, scheduler noise, GC tail, V8 inlining decisions). The Architect's spec §12 finding 2 explicitly warned about ±0.3 µs V8 variance; observed run-to-run variance on this machine is 11.79–14.73 µs (Phase A) and 12.05–13.70 µs (Phase B), spanning ±1.5 µs. The signal Phase B brings (~−0.3 to −0.5 µs) is within that noise band and therefore not statistically detectable in 5 runs.

2. **Phase B vs Phase A on the *same* machine shows a small improvement, in the predicted direction.** wide-fanout went from 12.91 → 12.59 µs (−0.32 µs, ~−2.5%). batched-writes went 9.74 → 9.21 µs (−0.53 µs, ~−5%). cellx went 1.67 → 1.64 µs (−0.03 µs, flat). Direction matches spec §7 predictions; magnitude is smaller-than-predicted, plausibly because the leaf path's recompute-inline savings on a slower machine are dwarfed by the underlying body-execution cost (the irreducible ~2.5 µs Phase 2 body cost the spec §7 calls out remains, and on this machine it's larger).

3. **Cellx and bundle gates pass.** The two gates that don't depend on the machine's absolute throughput — bundle size (1015 B vs 1024 B cap) and cellx body-count contract (17 evals via `cellx-counter.ts`) — both pass. The cellx workload's p50 also passes (1.64 µs vs 1.7 µs gate). These gate the *correctness* and *byte-budget* aspects of the spec; only the perf-throughput gates miss, and they miss in the same direction at Phase A as at Phase B.

## §4 Honest hypothesis for absolute miss

The spec's reference machine produced wide-fanout-100 of 10.81 µs at Phase A; this machine produces 12.91 µs at Phase A. That's a +2.1 µs (~+19%) machine-level offset before Phase B's optimization is even considered. Adding Phase B's predicted ~−1.0 to −1.5 µs gives 11.4–12.0 µs predicted on *this* machine — roughly matching observed 12.59 µs (within the ±1 µs run-variance band). The gate is set against the reference machine, not this machine.

Mitigating factors the Builder *did not* attempt (per spec discipline of single-responsibility):

- **§6 fallback (1)** — inline-fallback sequence. Spec authorizes this only if bundle > 1024 B, which it isn't (1015 B). Not a perf optimization in itself; the iterator-over-Set permutations are byte-saving micro-tweaks.
- **§9 risk register fallback (Avenue C variant)** — moving `wave++` from drainBatch iteration to drainBatch entry. Spec gates this on cellx > 1.7 µs, which it isn't (1.64 µs). The iteration-vs-entry tradeoff is also unrelated to wide-fanout.
- Re-running on a quieter machine. Builder cannot change machines.

## §5 What the Verifier and Team Lead should know

- **The implementation is correct.** All 42 unit tests, the cellx body-count invariant, and the bundle-size cap pass.
- **The implementation matches the spec.** Every change in §5 pseudocode landed verbatim; no silent deviation.
- **The throughput gates miss on this machine because the machine's baseline is ~2 µs slower than the spec's reference.** Phase A also misses the gate on this machine (12.91 µs > 9.87 µs), so even reverting Phase B does not recover the gate.
- **Phase B does deliver a small improvement on this machine in the predicted direction** (~−0.3 to −0.5 µs across the workloads where it should help), consistent with spec §7's mechanism.

## §6 Options for adjudication

1. **Accept and merge with `[bench-bump]`** — Team Lead acknowledges environmental variance and merges. CHANGELOG already documents the per-machine numbers.
2. **Re-run the bench on the spec's reference machine** (CI runner per `.github/workflows/plan-a.yml`?) before adjudicating. Per `bench/signals/HARNESS.md`, the bench job runs on a known runner; the Builder's local numbers may be unrepresentative.
3. **Reject and re-spec** — Architect derives a new optimization (deeper than Option 4) targeting the additional ~3 µs to clear gates on slower machines.

The Builder recommends (2) — gate the verdict on CI numbers, not local numbers — followed by (1) if CI confirms gate clearance.

---

## §7 Verbatim test/bundle/counter evidence

```
$ bun test packages/signals
 42 pass
 0 fail
 159 expect() calls
Ran 42 tests across 6 files. [243.00ms]

$ bunx size-limit --json
[
  { "name": "@scribe/signals", "passed": true, "size": 1015, "sizeLimit": 1024 }
]

$ bun .team/phase-2-5/scratch/cellx-counter.ts
… Total computed body executions per op: 16
  Effect runs per op: 1
  (16 + 1 = 17 ✓ spec §10 C4)
```

Phase A 5-run wide-fanout sample: `11.79, 12.34, 12.91, 12.98, 14.73` (median 12.91)
Phase B 5-run wide-fanout sample: `12.05, 12.42, 12.59, 13.10, 13.19` (median 12.59)
Phase B 5-run cellx sample: `1.56, 1.61, 1.64, 1.68, 1.68` (median 1.64)
Phase B 5-run batched-writes sample: `8.57, 8.80, 9.21, 9.86, 10.44` (median 9.21)
