# `bench/signals` Changelog

Append-only log of bench-result deltas. Newest entries first. Each entry pairs with
the commit that produced the numbers; CI uploads `RESULTS.md` as an artifact and
this file is the human-readable summary.

Entries should be terse: workload + competitor highlights, anything notable about
the run environment, and a link to the commit if non-obvious.

---

## 2026-04-28 — wide-fanout-100 recovery v2 (Option 4: stacked)

**Branch:** `perf/signals-cellx-fix`
**Commits:** Phase A `235312a` (Avenue C wave counter), Phase B `2790610` (restricted leaf-computed inline settle), Phase C `99bf8ea` (bench evidence + deviation memo).
**Spec:** `.team/phase-2-5/wide-fanout-recovery-v2-spec.md`
**Builder blocker:** `.team/phase-2-5/wide-fanout-recovery-v2-builder-blockers.md`

Avenue B (the prior recovery attempt) failed: its leaf detection
checked `inner.size === 1 && only.flags & EFFECT` — a forward
(subscriber-direction) test that gives no information about whether the
candidate computed has *upstream* computed deps. The NOTIFIED-dedup
test and cellx 4×4 diamond exposed it: those graphs satisfy the forward
test but inline-recompute reads still-unmarked sibling computeds and
corrupts the cache. Documented in
`.team/phase-2-5/wide-fanout-recovery-builder-blockers.md`.

Option 4 stacks two non-overlapping wins: (A) Avenue C — replace the
NOTIFIED bit with a module-level `wave` counter and per-Subscriber
`lastWave` field, eliminating 6 per-wave bit-clear iteration sites at
the cost of one `wave++` per write/iteration; (B) restricted leaf-
computed inline settle — add a one-way `HAS_COMPUTED_DEPS` flag set
when a computed observer reads a computed source, and a markOne fast
path that inline-recomputes when `inner.size === 1 && only.flags &
EFFECT && !(sub.flags & HAS_COMPUTED_DEPS)`. The flag is
*sufficient-not-necessary* (computed had no computed deps in any
prior recompute → cannot have any), conservatively excluding the
correctness-fragile graphs that broke Avenue B.

### Bench deltas (this machine, median p50 of 5 runs)

| Workload | Phase A median | Phase B median | Δ | Hard gate | Status |
|---|---:|---:|---:|---:|---|
| cellx | 1.67 µs | 1.64 µs | -0.03 µs | ≤ 1.7 µs | PASS |
| wide-fanout-100 | 12.91 µs | 12.59 µs | -0.32 µs | ≤ 9.87 µs | MISS |
| batched-writes-100 | 9.74 µs | 9.21 µs | -0.53 µs | ≤ 8.2 µs | MISS |

Phase B improves on the predicted direction across all three workloads
on this machine; magnitudes (~−0.3 to −0.5 µs) are smaller than the
spec's reference predictions (~−1.0 to −1.5 µs for wide-fanout). Both
the wide-fanout and batched-writes hard gates miss because **Phase A
also missed them on this machine** — the cellx-rewrite baseline run
recorded 10.81 µs wide-fanout, but a fresh Phase A run on the Builder's
machine records 12.91 µs (a +2.1 µs machine-level offset). All
competitors moved by µs-scale amounts in the same RESULTS.md run
(preact 11.03 → 11.71, vue 14.38 → 19.23, solid 24.77 → 23.20),
confirming environmental variance — see builder-blockers §3 for the
full deviation analysis. cellx and bundle-size gates pass; surfaced for
Team Lead adjudication on whether the gate should be evaluated against
CI numbers, not the Builder's local machine.

### Bundle size

1015 B gzipped (cap 1024 B; 9 B headroom). No fallback path needed.
The `shallowClearFired` removal (~14 B saved) funded the
`HAS_COMPUTED_DEPS` flag + restricted leaf branch (~15 B added),
near-net-neutral as projected in spec §6.

### cellx body-count contract

`bun .team/phase-2-5/scratch/cellx-counter.ts` reports 16 inner + 1
effect = 17 evals/op (spec §10 C4 PASS); the structural minimum is
preserved across the stacked optimization.

### Tests

42/42 pass — including `computed.test.ts:97-116` (Phase 2 Finding 3
single-effect parity), the NOTIFIED-dedup test, the cellx 4×4 diamond
test, and the property-based fast-check suite. The Avenue B failure
modes are correctly rejected by the new `HAS_COMPUTED_DEPS` test.

---

## 2026-04-28 — Two-phase mark/propagate scheduler (cellx structural fix)

**Branch:** `perf/signals-cellx-fix`
**Commit:** `b7dc00c` (replaces wip 99ea2c8)
**Spec:** `.team/phase-2-5/cellx-structural-rewrite-spec.md`

Replaces the wip lazy-stale-hybrid scheduler with a two-phase mark /
settle / drain pipeline. Phase 1 marks every reachable sub once
(NOTIFIED bit dedups diamond fan-in); phase 2 settles computeds with
effect subs (eager recompute + equality cascade-suppression); phase 3
runs effects whose MARKED bit survived. The Investigator's regression
check (`.team/phase-2-5/scratch/cellx-counter.ts`) confirms 92 → 17
body executions per cellx op — the structural minimum.

### Bench deltas (median p50 of 4 runs)

| Workload | Pre-rewrite (wip) | Post-rewrite | Delta |
| --- | ---: | ---: | ---: |
| cellx | 5.71 µs | 1.61 µs | **−72 %** |
| wide-fanout-100 | 8.97 µs | 10.81 µs | +20 % |
| batched-writes-100 | 11.16 µs | 7.99 µs | **−28 %** |

Wide-fanout-100 trips the 10 % regression gate. Per
`.team/phase-2-5/cellx-rewrite-builder-blockers.md` §A: the workload
has no algorithmic benefit from the new design (no diamond glitch
exists in a 1-deep fan-out), only the constant-factor overhead of the
two-phase dispatch. cellx-shaped graphs (which dominate real-app
reactive surfaces) win by 3.5×; the trade is favorable. Tagged for
`[bench-bump]` adjudication at PR-review time.

### Bundle size

scribe ships at **1.01 KB gzipped** under size-limit's measurement
(was 742 B). +37 % over the wip baseline; the structural rewrite
spends bytes on the two-phase pipeline + visited/effectQueue + the
NOTIFIED dedup bit infrastructure. Fits inside the 1024 B hard cap
with ~10 B headroom. Spec §9 deeper wins (single-sub fast path,
linked-list dep graph) deferred to a follow-up perf session.

---

## 2026-04-27 — Phase 2.5 baseline (Track A, initial)

**Branch:** `bench/phase-2-5-track-a`
**Commit:** initial bench-spike landing
**Runner:** mitata 1.0.34 · Bun 1.3.13 · Node 24
**Host:** Windows 11 (developer laptop, AC power)

First baseline. 3 workloads × 6 competitors = 18 cells, all populated.

### Where scribe is competitive (within 30 % of fastest)

- **wide-fanout-100** — scribe ~10.2 µs p50, alien (fastest) ~9.4 µs p50.
  Scribe is ~9 % slower than the leader on this workload. **This is the
  Phase 2 retro's canonical concern; scribe is essentially tied with alien
  and ahead of @preact, @vue, solid, and s-js.**
- **batched-writes-100** — scribe ~11.9 µs p50, alien (fastest non-S.js)
  ~9.6 µs p50. Scribe is ~24 % slower than alien but faster than Vue and
  Solid. (S.js is fastest at 6.9 µs because `S.freeze` is more aggressive
  than scribe's batch — worth investigating in a future optimization PR.)

### Where scribe loses

- **cellx** — scribe ~9.4 µs p50, alien (fastest) ~1.3 µs p50. **Scribe is
  ~7× slower** than alien on the deep-diamond propagation workload. This
  trips the "5× slower than fastest" hard-stop in the bench-spike brief.
  Continuation note in `.team/phase-2-5-builder-blockers.md` documents the
  hypothesis (eager-recompute-when-observed cascade traverses the diamond
  on every notify) and proposes a fix path.

### Bundle size

scribe ships at **781 B gzipped** when measured with the same methodology
as `bun run size` (esbuild minify + gzip). That puts scribe at the smallest
gzipped of any competitor measured: 30 % smaller than alien-signals
(1.11 KB), 58 % smaller than Preact (1.86 KB), and ~88 % smaller than Vue
(7.05 KB).

Note: an earlier draft of this changelog cited "1.56 KB gzipped (un-minified)"
because the initial `size.ts` script gzipped raw source without minification,
making `@scribe/signals` look bigger than the libs that ship pre-minified.
That methodology was inconsistent with `bun run size` (size-limit minifies
first). The updated `size.ts` now runs each competitor through esbuild
before gzipping, producing apples-to-apples numbers.

The 781 B vs `bun run size`'s 698 B reading is from gzip level 9 vs
size-limit's default level 6.
