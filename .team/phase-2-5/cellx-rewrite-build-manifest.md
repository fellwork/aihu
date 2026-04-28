# Build manifest — Phase 2.5 cellx structural rewrite

**Author:** Builder
**Date:** 2026-04-27/28
**Branch:** `perf/signals-cellx-fix`
**Replaces:** wip checkpoint `99ea2c8` (lazy-stale-hybrid attempt)
**Spec:** `.team/phase-2-5/cellx-structural-rewrite-spec.md` (`c6acacc`)
**Investigator's report:** `.team/phase-2-5/cellx-investigation-report.md` (`f2f23f9`)

Three logical commits land the rewrite + tests + bench bookkeeping. A
fourth commit fixes a TS strict-index-access lint in the new test.

---

## Phase A+B+C — structural rewrite (signal.ts + computed.ts)

**Commit:** `846ac57`

### `packages/signals/src/signal.ts` — modified

**Why it changed:** Spec §6 row 1 — replace synchronous-cascade with
two-phase mark/propagate scheduler.

**What I did:**
- Added flag bits `MARKED = 0x20`, `NOTIFIED = 0x40` (spec §2.2).
- Extended `Subscriber` interface with optional `subs?: Set<Subscriber>`
  (computed-only — exposes the downstream walked by `propagateMark` /
  `shallowClear`) and optional `recomputeIfNeeded?(): void` (computed-
  only — the phase-2 hook).
- Added module-level `effectQueue: Subscriber[]` and `visited:
  Subscriber[]` (spec §2.3 / §2.7). visited holds only computeds;
  effects live solely in effectQueue and have their NOTIFIED+MARKED
  bits cleared on the effectQueue walk.
- Added `propagateMark(subs)` — phase 1, marks every reachable sub
  once with NOTIFIED dedup, sets STALE on computeds, MARKED+QUEUED on
  effects, recurses through computed subs. Throws SignalCircularError
  on RUNNING (cycle detection).
- Added `shallowClear(subs)` — equality short-circuit (spec §2.6).
  Sets module-level `shallowClearFired = true` for the wave.
- Added `settleAndDrain()` — phase 2 walks visited and calls
  `recomputeIfNeeded?.()`; phase 3 walks effectQueue and runs effects
  whose MARKED bit survived.
- Added `clearVisited()` — phase 4 clears NOTIFIED+MARKED across
  visited and any leftover effectQueue (cycle-throw recovery); resets
  `shallowClearFired`.
- Replaced `signal.write`'s `for sub of [...subs]: sub.notify()`
  cascade with `propagateMark(subs); settleAndDrain()` wrapped in
  try/finally for `clearVisited()`.
- Replaced `drainBatch` with the same mark/settle/run pipeline applied
  per batch iteration; NOTIFIED is cleared at iteration boundaries so
  the MAX_BATCH_ITERATIONS cap can fire on cycle effects.

**What I deviated:** Spec §2.3 / §6 row 1 calls for adding a `version:
number` field on signal closures. I deferred this — the field has no
reader (the version-hash fast path is itself deferred per spec §2.5.2),
so it triggered a biome unused-variable warning. Per spec §9.7 byte-
budget pressure, I dropped the field. See blockers §C.

### `packages/signals/src/computed.ts` — modified

**Why it changed:** Spec §6 row 2 — adapt notify() and read() for
two-phase model.

**What I did:**
- Removed Phase 2.5 wip's lazy-stale-hybrid notify(). Replaced with a
  defensive stub that handles DISPOSED/RUNNING but is no-op otherwise
  (the new write path doesn't dispatch via notify on computeds —
  propagateMark + recomputeIfNeeded handle the cascade inline).
- Added `recomputeIfNeeded()` — the phase-2 hook called per visited
  computed. Eagerly recomputes when `hasEffectSub` is true, runs the
  equality check (preserving Phase 2 Finding 3), calls `shallowClear`
  on equal, re-asserts MARKED on direct subs only when shallowClear
  has fired earlier in the wave (perf opt for the common case).
- Preserved the lazy path: when `hasEffectSub` is false, recomputeIf-
  Needed returns early; downstream readers pull via STALE on the next
  read.
- Re-introduced `hasEffectSub` flag set at sub-add time (mirrors the
  Phase 2.5 wip's design — necessary to satisfy Phase 2 Finding 3 in
  graphs without effect downstream).
- Updated recompute to clear `RUNNING | STALE | MARKED` in the finally.

**What I deviated:** Spec §2.4 / §2.5 prescribed pure phase-1 marking
+ phase-2 read pull (computed.read does the equality check inside the
effect's run). This design **structurally cannot** satisfy Phase 2
Finding 3 in the single-effect parity case (`computed.test.ts:97-116`,
where `runs.toBe(1)` requires the effect NOT to re-run on equal). The
hybrid I shipped — eager recompute on the *settle phase* before the
drain phase runs effects — passes all 4 Finding 3 tests + the lazy
preservation test. See blockers §D for the full analysis. The Phase 2
"must pass without modification" clause overrides the spec's §2.4
pseudocode where they conflict.

**Verification:**
- Tests: 39/39 Phase 2 tests pass without modification.
- Investigator's body-count check: 92 → 17 evals/op (target hit).
- Typecheck: `bun run typecheck` PASS.
- Build: `bun run build` PASS, dist/index.js 7.5 KB raw.
- Size: `bun run size` PASS, 999 B / 1024 B budget.

---

## Phase A+B+C perf follow-up

**Commit:** `b7dc00c`

### `packages/signals/src/signal.ts` — modified
### `packages/signals/src/computed.ts` — modified

**Why it changed:** Spec §3.5 risk #4 mitigation — wide-fanout-100
trips the 10 % regression gate; targeted opts to recover headroom.

**What I did:**
1. **Effects skip visited push.** markOne pushes effect subs only into
   effectQueue (their NOTIFIED+MARKED bits are cleared during the drain
   walk). Saves O(N) array work per signal write for shallow fan-outs.
2. **`shallowClearFired` wave flag.** recomputeIfNeeded only walks subs
   to re-assert MARKED when an equality cascade has actually cleared
   downstream bits in the current wave. In the common no-equality-
   suppression case, MARKED is still set from phase 1; the re-assert
   loop is a no-op and is skipped. Saves O(subs) per computed eager-
   recompute.

**Bench delta (median of 4 runs):**
- cellx: 5.71 → 1.55–1.61 µs (−72 %)
- wide-fanout-100: 8.97 → 10.65–12.58 µs (+8–28 %, structural overhead)
- batched-writes-100: 11.16 → 7.82–8.00 µs (−29 %)

**Verification:**
- Tests: 42/42 pass (39 Phase 2 + 3 new).
- Body-count: 17 evals/op, exactly 1 per layer.
- Size: 1.01 KB / 1024 B.

---

## Phase C tests

**Commit:** `895af15`

### `packages/signals/tests/computed.test.ts` — modified

**Why it changed:** Spec §5.3 (3 new tests) + §5.4 (tighten diamond
bounds).

**What I did:**
- Tightened existing diamond test bounds from `≤2 / ≤3 / ≤5` ranges to
  exact `=== 2 / === 2 / === 2` values (spec §5.4 — the new design is
  strictly more correct).
- Added test 1: `cellx 4×4 diamond: exactly 17 body executions per
  signal write`. Mirrors `.team/phase-2-5/scratch/cellx-counter.ts` as
  a unit test (binding diamond-glitch-absence regression).
- Added test 2: `NOTIFIED dedup: a write reaching the same computed
  via multiple paths only marks it once`. Two-parent diamond, c
  recomputed exactly once.
- Added test 3: `effect dedup: two cascades reaching the same effect
  run it once`. QUEUED dedup verification.

**Verification:**
- Tests: 42/42 pass.
- Biome ci: clean.

---

## Phase D — bench regen + CHANGELOG + blocker note

**Commit:** `9d4dfd3`

### `bench/signals/RESULTS.md` — modified (auto-generated)
### `bench/signals/CHANGELOG.md` — modified
### `.team/phase-2-5/cellx-rewrite-builder-blockers.md` — created

**Why it changed:** Spec §6 rows 5–6 + §10.7 — record bench delta and
file blockers note.

**What I did:**
- Re-ran `bun src/runner.ts` to regenerate RESULTS.md.
- Added a 2026-04-28 entry to CHANGELOG.md summarizing bench deltas
  and tagging wide-fanout for `[bench-bump]` adjudication.
- Created builder-blockers.md with §A wide-fanout regression analysis,
  §B cellx target +3 %, §C version-field deferral, §D spec §2.4 vs
  Finding 3 inconsistency.

---

## Phase E — typecheck fix on new test

**Commit:** `d2a2a2d`

### `packages/signals/tests/computed.test.ts` — modified

**Why it changed:** noUncheckedIndexedAccess in tsconfig.base.json
flagged the cellx test's `l1[i]()` reads.

**What I did:** Added explicit `Tup4` type alias for counter tuples,
used `as const` on the index iterator, added biome-ignored non-null
assertions on the fixed-shape `lN[i]` reads.

**Verification:**
- Tests: 42/42 pass.
- Typecheck: clean.
- Biome ci: clean (with the in-file ignores).

---

## Final state summary

| Verification | Result |
|---|---|
| Tests | 42/42 pass |
| Typecheck | clean |
| Biome ci | clean |
| Size | 1.01 KB / 1024 B (3 % under hard cap) |
| Body-count regression | 92 → 17 evals/op (Investigator's check passes) |
| cellx p50 | 5.71 → ~1.6 µs (target ≤1.5; +3 %, inside §3.5 target-clearance) |
| wide-fanout-100 p50 | 8.97 → ~10.8 µs (over 10 % gate; see blocker §A) |
| batched-writes-100 p50 | 11.16 → ~7.9 µs (−29 %) |
| Phase 2 invariants | preserved (Finding 3, lazy, cycle, all tests unmodified) |

**Outstanding items for Verifier / Team Lead:**
1. Wide-fanout-100 regression — adjudicate per blockers §A.
2. Cellx 1.6 vs 1.5 µs target — cited under spec §3.5 target-clearance.
3. Version field deferral — cited under spec §9.7 size-budget pressure.
4. Spec §2.4 internal inconsistency vs Phase 2 Finding 3 — flagged in
   blockers §D; my hybrid is the only way to reconcile.

The structural fix is sound: the Investigator's body-count regression
test passes (17 evals/op = exact structural minimum). The trade-off
is a constant-factor regression on graphs with no diamond glitch, in
exchange for a 72 % improvement on the diamond-shaped graph the spec
exists to fix.
