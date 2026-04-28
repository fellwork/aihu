# `bench/signals` Changelog

Append-only log of bench-result deltas. Newest entries first. Each entry pairs with
the commit that produced the numbers; CI uploads `RESULTS.md` as an artifact and
this file is the human-readable summary.

Entries should be terse: workload + competitor highlights, anything notable about
the run environment, and a link to the commit if non-obvious.

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
