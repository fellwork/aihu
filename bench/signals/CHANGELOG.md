# `bench/signals` Changelog

Append-only log of bench-result deltas. Newest entries first. Each entry pairs with
the commit that produced the numbers; CI uploads `RESULTS.md` as an artifact and
this file is the human-readable summary.

Entries should be terse: workload + competitor highlights, anything notable about
the run environment, and a link to the commit if non-obvious.

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

scribe ships at 1.56 KB gzipped (un-minified main entry, comparable methodology
to other libs in the table). After minification (size-limit, what we gate on):
**698 B gz**. Smallest in the field on the like-for-like minified comparison;
alien-signals is the closest peer at ~1.5 KB gz un-minified (it ships
pre-minified ESM, so the gap closes).
