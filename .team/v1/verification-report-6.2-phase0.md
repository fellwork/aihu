# Verification Report — Plan 6.2 Phase 0 (Option C)
**Date:** 2026-04-30
**Branch:** feat/v1-signals-deepchain
**Audited commit:** 6933eeb — "perf(signals): Plan 6.2 Phase 0 — Option C conditional visited[] push"
**Verifier:** Claude Sonnet 4.6

---

## Code review

### `packages/signals/src/signal.ts`

Three net changes:

1. A new `HAS_EFFECT_SUB = 0x40` flag constant added after `HAS_COMPUTED_DEPS = 0x80`, with a 6-line JSDoc comment explaining its purpose.
2. In `markOne`, the unconditional `visited.push(sub)` (line 218) is replaced with `if (sub.flags & HAS_EFFECT_SUB) visited.push(sub)`.
3. `sub.flags |= STALE` immediately follows (line 219) — unconditional, unchanged.

Bit allocation: `0x40` is clean. Existing flags occupy `0x1`, `0x2`, `0x4`, `0x8`, `0x10`, `0x20`, `0x80`. No collision.

The conditional is in the right place in `markOne`: it fires for every computed node in the main body of the mark loop (after the EFFECT early-exit path, before the sub-walk), so it covers every depth of the chain without exception.

### `packages/signals/src/computed.ts`

Two net changes:

1. `HAS_EFFECT_SUB` imported from `./signal.ts` (import list addition).
2. At the effect-subscriber registration site in the `read()` closure: the single-expression `hasEffectSub = true` is extended to `{ hasEffectSub = true; node.flags |= HAS_EFFECT_SUB }`.

Both assignments are made atomically in the same `if` branch, so the closure-local `hasEffectSub` and `node.flags & HAS_EFFECT_SUB` are always in sync.

### Other files

`.team/v1/build-manifest-6.2-phase0.md` was created (untracked doc). No other source files touched.

---

## Criterion results

| AC | Criterion | Status | Notes |
|---|---|---|---|
| AC-1a | Only `signal.ts` and `computed.ts` modified in `packages/signals/src/` | PASS | `git diff --name-only` shows exactly those 2 files |
| AC-1b | Change is ≤ 15 lines across both files | PASS | 9 lines in `signal.ts` + 3 lines in `computed.ts` = 12 total (diff lines, includes removals) |
| AC-1c | `HAS_EFFECT_SUB` flag `0x40` defined in `signal.ts` | PASS | `export const HAS_EFFECT_SUB = 0x40` at line 56 |
| AC-1d | `visited.push(sub)` is conditional on `sub.flags & HAS_EFFECT_SUB` | PASS | Line 218: `if (sub.flags & HAS_EFFECT_SUB) visited.push(sub)` |
| AC-1e | `STALE` flag is still set unconditionally | PASS | Line 219: `sub.flags |= STALE` is unchanged and unconditional |
| AC-1f | In `computed.ts`, `node.flags |= HAS_EFFECT_SUB` set on effect subscriber | PASS | Line 95: `{ hasEffectSub = true; node.flags |= HAS_EFFECT_SUB }` |
| AC-2a | All tests pass | PASS | 255 tests passed (see below) |
| AC-2b | `@aihu/signals` size ≤ 1700 B gz | PASS | 1.54 kB (160 B headroom) |
| AC-3a | `deep-propagation-100` p50 improvement vs 4.00 µs baseline | PASS | Manifest reports 3.27 µs p50 (mitata), ~18% improvement |
| AC-3b | All 5 no-regression gates reported PASS in manifest | PASS | All 5 gates within floors (see bench section) |

---

## Test and size gates

### `bun run test`

```
Test Files  36 passed (36)
      Tests  255 passed (255)
   Duration  4.33s
```

All 255 tests pass. The build manifest reports 255 tests passing as well — consistent with the verifier's independent run. Note: the acceptance criteria spec mentions "270 from the last count" but the current suite has 255 tests; the build manifest is accurate at 255. No test failures.

### `bun run size`

```
@aihu/signals
  Size limit:  1.7 kB
  Size:        1.54 kB  (with all dependencies, minified and gzipped)
  Package size is 160 B less than limit
```

Gate: PASS. Limit is 1700 B; actual is 1540 B. The new flag constant + conditional branch + JSDoc compress to negligible gz delta (manifest states <1 B difference, rounding identically to 1.53 kB pre-optimization).

---

## Bench validation

From build manifest `.team/v1/build-manifest-6.2-phase0.md`:

| Workload | Floor | Reported p50 | Manifest status |
|---|---|---|---|
| `deep-propagation-100` (primary) | ≥ 10% improvement from 4.00 µs (≤ 3.60 µs) | 3.27 µs (mitata), ~2.85–3.00 µs (micro-test) | IMPROVEMENT CONFIRMED |
| `cellx` | ≤ 557 ns | ~475–511 ns | PASS |
| `wide-fanout-100` | ≤ 5.15 µs | ~4.58–4.87 µs | PASS |
| `batched-writes-100` | ≤ 2.86 µs | ~2.56–2.81 µs | PASS |
| `dynamic-deps` | ≤ 816 ns | ~735–784 ns | PASS |
| `creation-1to1000` | ≤ 76.2 µs | ~66–76 µs | PASS |

All 5 regression gates are PASS per the manifest. `deep-propagation-100` improved ~18% (mitata) to ~29% (direct micro-test) from the 4.00 µs baseline, exceeding the ≥10% Phase 0 threshold.

Builder notes significant mitata variance on Windows (~3.12–7.17 µs across runs) attributed to OS scheduling noise. Stable mitata runs cluster at 3.12–3.31 µs; micro-test (100K iters) is more stable at ~2.85–3.00 µs. The bench evidence is credible — the settle-phase reduction of 99 `visited.push()` calls and 99 `recomputeIfNeeded` short-circuits is structurally sound.

Note: The plan-level ≤ 3.00 µs gate (≥25% from Director §4 Check 2) is NOT claimed by Option C. Per the Director ruling, Plan 6.2 is not closed — Option D (Phase 1) must follow.

---

## Bidirectional audit

### Under-implementation

**Is the `HAS_EFFECT_SUB` check in the right place in `markOne`?**

Yes. The check at line 218 is in the main body of the mark loop, after the early-exit for `EFFECT` nodes (which push to `effectQueue`) and before the sub-walk fan-out. This fires for every computed node at every depth during the mark phase. There is no path through a computed node in `markOne` that bypasses this check.

**Can a node with an effect subscriber have `HAS_EFFECT_SUB = 0`?**

No, under normal operation. The only path where an effect subscribes to a computed is through `computed.read()`, which sets both `hasEffectSub = true` and `node.flags |= HAS_EFFECT_SUB` in the same statement. Since JS is single-threaded, there is no window between these two assignments. The flag will always be set before any subsequent mark phase.

**Late-subscription scenario (new effect subscribes after the first mark phase runs):**

When a new effect is created and its body calls `computed.read()`:
1. `linkAdd(node, effectObserver)` is called → returns `true` (new edge)
2. `observer.flags & EFFECT` is truthy → `{ hasEffectSub = true; node.flags |= HAS_EFFECT_SUB }` executes
3. `HAS_EFFECT_SUB` is set on the computed node before the effect's initial `runEffect()` returns

Any signal write that triggers a subsequent mark phase will now find `HAS_EFFECT_SUB` set. Late subscription is handled correctly.

**One minor observation (not a defect):** `HAS_EFFECT_SUB` is never cleared, even if the sole effect subscriber is disposed. This means a computed node that once had an effect subscriber but was later fully unsubscribed will continue to be pushed into `visited[]` unnecessarily. This is a conservative approximation — the flag is one-way (monotonic). It cannot cause correctness issues (the `recomputeIfNeeded` guard in `computed.ts` line 67 checks `!hasEffectSub` and bails early if no effect sub is active). The worst-case performance impact is negligible (one redundant array push on an already-unused computed). This matches the intent documented in the `HAS_COMPUTED_DEPS` flag design ("One-way (once true, stays true)").

### Over-implementation

**Were any bench workloads modified?**

No. `git diff 6933eeb~1 6933eeb -- bench/` produces no output. All workload files in `bench/workloads/` are untouched.

**Were any test files modified?**

No. `git diff 6933eeb~1 6933eeb -- packages/signals/tests/` produces no output. The 255 tests are the unchanged pre-existing suite.

**Were any public API signatures changed?**

No. `packages/signals/src/index.ts` exports are identical to the pre-patch state. `HAS_EFFECT_SUB` is exported from `signal.ts` as `@internal` but is NOT re-exported from `index.ts`. The public surface (`signal`, `computed`, `effect`, `batch`, `$state`, `untrack`, error types, and their type parameters) is unchanged.

---

## Overall verdict

**STATUS: PASS**

All AC-1 (code correctness), AC-2 (test + size gates), and AC-3 (bench validation) criteria are met. The implementation is minimal (12 diff lines across 2 source files), structurally correct, and contains no over-reach into test files, bench workloads, or public API.

The under-implementation audit confirms the flag is reliably set on all effect-subscription paths including late subscribers. The one-way (monotonic) flag design is a deliberate conservative approximation consistent with the existing `HAS_COMPUTED_DEPS` pattern; it creates no correctness risk.

**Plan 6.2 remains open.** Option C (Phase 0) is complete and green. Option D (Phase 1) must follow to reach the plan-level ≤ 3.00 µs gate. Architect spec for Option D should be dispatched in Round 3 per Director ruling (track-c-round-002.md §5).
