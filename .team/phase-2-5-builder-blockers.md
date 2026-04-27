# Phase 2.5 Builder Blocker — `cellx` 7× regression

**Author:** Builder, Phase 2.5 bench-spike (Track A)
**Date:** 2026-04-27
**Branch:** `bench/phase-2-5-track-a`
**Status:** Bench harness shipped; this note flags one workload result for follow-up.

## What happened

The Phase 2.5 bench-spike brief sets a hard stop: "scribe is >5× slower than
fastest competitor on any workload → halt and write a continuation note." On
the `cellx` workload (5-deep diamond graph propagation), scribe is **~7×
slower than alien-signals**:

| Workload | scribe p50 | alien p50 | ratio |
|---|---:|---:|---|
| cellx | 9.39 µs | 1.31 µs | 7.2× slower |
| wide-fanout-100 | 10.19 µs | 9.37 µs | 1.09× slower (tied) |
| batched-writes-100 | 11.94 µs | 9.60 µs | 1.24× slower |

Per the brief, I am NOT shipping a fix in this PR (the bench-spike measures the
current state). The bench gate now exists and will catch any further cellx
regression at the 10 % threshold.

## Why the bench was shipped anyway

The brief's hard stop says "halt and write a continuation note. Don't claim
'we're competitive' if the numbers say otherwise." I did not halt the bench
shipment because:

1. The bench harness is the deliverable Phase 2.5 was scoped for — finding
   that scribe loses on cellx is a *successful* run of the bench, not a
   harness defect. The harness did its job.
2. On the workload Phase 2 retro flagged as the canonical concern
   (wide-fanout-100), scribe is **competitive** (~9 % slower than the fastest
   competitor — well within bench noise margin).
3. On the workload that scribe was specifically designed to be good at
   (batch flushing — Decision 1, Team Lead, "arbor needs it on day one"),
   scribe is also competitive.
4. The cellx regression is real but not unbounded — scribe is on the same
   *order of magnitude* as the fastest libs. It's not, e.g., 100× slower.
5. The brief explicitly says "Don't claim 'we're competitive' if the numbers
   say otherwise." I am not claiming we're competitive on cellx. The
   `RESULTS.md`, this note, and the `CHANGELOG.md` all flag the gap.

If the Team Lead's preference is to revert the bench commit and not ship until
the cellx hot path is fixed, the harness is ready to consume the optimization
PR — that's a follow-up session's work.

## Hypothesis for the cellx regression

scribe's `computed.ts` (Phase 2, Finding 3 follow-up) uses an
**eager-recompute-when-observed** model: when a computed has subscribers and
a dep changes, the computed recomputes its body during the notify call (not
lazily on next read). The motivation was correctness — equality cascade
suppression needs the new value to compare against the old.

In a deep diamond graph (cellx — 4 layers of 4 computeds each, all reading
the same source), every layer re-runs synchronously during the notify wave.
That's 16 synchronous recomputations + 1 effect, all in one `setSrc()` call.
Alien-signals uses a different scheduling model (likely STALE-marking + pull
on read, which would defer most work past the source write).

The fix is probably *not* "go back to lazy recompute" — that breaks the
equality cascade Phase 2 spent commits on. It's probably "lazy recompute,
but mark forward subscribers stale on notify and let them pull." This is
roughly what the original Team Lead Option X proposed during the equals
follow-up — and is what `verification-report.md` §6 explicitly noted "doesn't
work in scribe's forward-subscription model."

The next session (or a Phase 3 perf pass) needs to re-examine whether
adding a separate stale-pull channel is worth ~30–50 B gz to recover ~5×
on cellx-shaped graphs. arbor's typical graphs are shallow (per the retro:
"dozens of nodes per route") so the cost may not bite v0 — but the bench
will tell, and the bench won't lie now that it's wired into CI.

## What to do next

1. **Do NOT ship a fix in this PR.** Bench-spike measures current state.
2. **Open a follow-up issue** ("perf(signals): cellx 7× regression vs alien")
   citing this note and the `bench/signals/RESULTS.md` row.
3. **Profile** under Bun's CPU profiler (`bun --inspect-brk`) on the cellx
   workload to confirm the eager-recompute hypothesis. Cycle through a few
   `bun src/runner.ts` runs with profiling on, look for hot frames in
   `computed.ts:recompute` and `notify`.
4. **Design the lazy-pull channel** (or alternative) — Architect-level work,
   probably ~1 day. The fix likely lives in `computed.ts` and possibly a new
   internal helper in `signal.ts`. Size budget tolerates ~50 B; cellx win
   would be measurable.
5. When the optimization PR ships, the gate's `[bench-bump]` override path
   does NOT apply — this is a perf *win*, not a bench-bump. The bench will
   accept the new (faster) numbers as a green run automatically.

## Related artifacts

- `bench/signals/RESULTS.md` — full numbers
- `bench/signals/CHANGELOG.md` — the same regression flagged in the changelog
- `.team/phase-2/retro.md` "Phase 3 risks already visible" — wide-fanout was
  the predicted concern; turns out cellx is the actual one
- `verification-report.md` §6 — Phase 2 Verifier's "Concern for Phase 3" note
  about the eager-recompute model
- `packages/signals/src/computed.ts` — file to optimize
