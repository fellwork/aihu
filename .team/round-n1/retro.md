# Round N+1 Retro

**Date:** 2026-04-30
**Track:** plan-a
**Branch:** claude/aihu-phase-3-team-Za4UQ (post-merge)
**Scope:** Bench receipts — bench/arbor SOTA + signals memory + competitor-parity workloads

---

## What we did

Round N+1 was the bench-receipts close for v0: we built a full SOTA arbor harness (`bench/arbor/` — 6 workloads × 6 competitors × 2 metrics in JSDOM under Bun) and extended the signals bench with a memory runner and 3 competitor-parity workloads. Both tracks ran in parallel, merged cleanly into the team branch, and all CI gates pass. Property-mangling was also probed as a potential size win and correctly abandoned after confirming it would break the public API surface.

## What shipped

| Item | Status |
|---|---|
| bench/arbor/ — 6×6×2 bench harness | ✅ |
| bench/signals/ — memory runner + 3 parity workloads | ✅ |
| CI gate extended (arbor time-only, signals memory dimension) | ✅ |
| Property mangling probe — ABANDON | ✅ |

## Results (headline numbers)

**arbor wins (vs JSDOM-compatible comparators):**
- `mount-10k-leaves`: aihu 36.95 ms vs lit-html 5.65 s vs preact 66.01 ms vs vanilla 92.60 ms — aihu fastest
- `mount-deep-100x10`: aihu 3.44 ms vs preact 9.35 ms vs lit-html 61.88 ms — aihu fastest
- `mount-wide-1000`: aihu 8.57 ms vs preact 10.48 ms vs vanilla 12.98 ms — aihu fastest
- `update-1-of-10k-leaves`: aihu **25 ns** (p50) vs vanilla 3.1 µs — **122× faster** (nodeValue vs textContent)
- `krausest-1k-cycle`: aihu 20.9 ms vs preact 19.7 ms (near-tie) vs vanilla 16.1 ms — acceptable overhead

**arbor notes:**
- solid-js and @vue/runtime-dom ERROR in all workloads (JSDOM env gaps — deferred Round N+2)
- `attr-thrash-100x100`: lit-html, solid, vue all ERROR in JSDOM; only preact/vanilla/aihu run (inconclusive axis)

**signals wins:**
- `cellx` (5-deep diamond): aihu 506 ns p50 vs alien 675 ns — aihu wins
- `batched-writes-100`: aihu 2.60 µs vs alien 3.54 µs — aihu wins
- `dynamic-deps` (rotating fan-in/fan-out): aihu 742 ns vs alien 1.21 µs — aihu wins 1.6×
- `creation-1to1000` (solid parity): aihu 69.3 µs vs alien 91.1 µs — aihu wins

**signals losses (honest):**
- `deep-propagation-100` (100-deep chain): aihu 4.0 µs vs alien 2.4 µs — **1.65× slower** (deep-chain gap)
- `wide-fanout-100`: aihu 4.68 µs vs alien 3.29 µs — alien faster on pure fan-out

**memory:**
- wide-fanout-100 confirmed: 38.82 KB/graph build delta (stable, real allocation)
- All other workloads: GC-noise zeros — V8 young-gen GC clears small graphs during build phase

## Honest assessment: Learning #11 status

Learning #11: every runtime PR drops bench receipts; beat SOTA on a named axis or don't ship.

**Arbor:** YES — Round N+1 satisfies Learning #11 for arbor. Aihu is fastest on all 4 mount/update workloads vs the JSDOM-compatible competitors (lit-html, preact, vanilla). The `update-1-of-10k-leaves` 122× win is the headline axis. The krausest near-tie with preact is acceptable overhead. solid-js/vue comparison is deferred to a browser runner (Round N+2) — that's an environment limitation, not a performance limitation.

**Signals:** YES — Round N+1 satisfies Learning #11 for signals. Prior work (Phase 2.5) established time receipts. Round N+1 adds memory receipts and closes the parity workload gap. Aihu wins on cellx, batched-writes, dynamic-deps, and creation-1to1000. The deep-propagation loss (1.65×) is documented honestly (Learning #26) and assigned to v0+1 work — aihu is tuned for shallow diamonds, and that is a known, documented design point, not a surprise.

## What went well

- Two parallel tracks (arbor + signals) ran independently and merged with zero conflicts — the file-isolation discipline worked
- Track A identified and documented JSDOM environment gaps (solid/vue) cleanly, deferring without blocking the harness
- The 122× `update-1-of-10k-leaves` result validated a key architectural decision (nodeValue vs textContent in `materialize.ts`)
- Memory bench runner landed with correct --expose-gc protocol; the wide-fanout stable signal (38.82 KB) is reproducible
- Property-mangling probe was correctly scoped as ABANDON with rationale documented before wasting further effort
- Gate self-test wired and passing for arbor; signals gate extended with memory dimension

## What could improve

- bench/arbor/tsconfig.json shipped without `paths` entries for `@aihu/arbor` and `@aihu/signals` — typecheck failed on the team branch until the Historian fixed it (needed `dist/` path mappings, not `src/` to avoid rootDir violations)
- solid-js/vue arbor gap was anticipated in the bench design but not pre-empted with a browser runner stub — deferred to Round N+2 with no immediate workaround
- V8/Bun memory bench GC-quiesce protocol produces zero noise for small graphs — the `--expose-gc` approach needs a larger N or last-resort GC calls for reliable small-graph measurement
- `attr-thrash-100x100` has limited comparator coverage (only preact + vanilla work in JSDOM) — axis is inconclusive without browser runner
- No `bun run typecheck` clean-state gate was included in the Verifier's PASS WITH NOTES — the tsconfig gap slipped through

## New learnings (candidates for .team/learnings.md)

**#23 — JSDOM environment gaps block solid-js and @vue/runtime-dom**

solid-js/web's render() calls browser-only APIs; @vue/runtime-dom requires `SVGElement` at module load time. Both fail silently under Bun/JSDOM. A real-browser runner (Playwright or browser-native Bun) is required for solid/vue arbor comparisons. Deferred to Round N+2.

**#24 — `textContent` vs `nodeValue` performance gap in JSDOM**

`element.textContent = v` is a multi-step DOM operation (child list walk, remove, recreate text nodes). `textNode.nodeValue = v` is a direct property set. In JSDOM, the gap is 122× (3.1 µs vs 25 ns). Arbor's `leaf(signal)` uses `nodeValue` internally via `materialize.ts`. This is the source of aihu's headline `update-1-of-10k-leaves` advantage — not just signal efficiency, but the bind target.

**#25 — Memory bench under V8/Bun: GC timing noise dominates small graphs**

N=1000 signal graphs × small structures = V8's young-gen GC clears prior objects during the build phase, producing negative or near-zero `buildHeapDelta`. Reliable memory measurement requires either larger N (for large graphs) or a more aggressive GC quiesce protocol (explicit `gc({ execution: 'async', flavor: 'last-resort' })` calls). The current protocol gives stable results only for wide-fanout (38.82 KB/graph, 100% residual consistent across runs).

**#26 — aihu is tuned for shallow diamond propagation; deep-chain is the gap**

`deep-propagation-100` (100-deep linear chain): aihu 4.0 µs vs alien-signals 2.4 µs (1.65× slower). `dynamic-deps` (rotating fan-in/fan-out): aihu 742 ns vs alien 1.21 µs (aihu wins 1.6×). The pattern: aihu's forward-subscription model dominates on dynamic-dependency changes but loses on pure deep-chain propagation. The cellx win is a shallow-diamond shape; alien's deep-chain tuning is the gap to close in v0+1 signals work.

**#27 — krausest-in-JSDOM: vanilla wins on 1k-cycle because it skips signals entirely**

Vanilla DOM in `krausest-1k-cycle` builds a 1k-row table with direct createElement + textContent (no reactive layer). Aihu adds a signals reactive layer with 1 signal per cell (2 cells/row × 1k rows = 2k signals). The ~30% aihu-vs-vanilla overhead is the reactive bookkeeping cost for a pre-mounted tree. This is acceptable overhead for a system that also wins 122× on targeted reactive updates (`update-1-of-10k-leaves`). The two numbers together define aihu's design point: pay a modest mount overhead, win hugely on update.
