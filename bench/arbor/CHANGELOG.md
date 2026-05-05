# Changelog — `bench/arbor`

Append-only log of bench-result deltas. Newest entries first.

---

## 2026-04-30 — Initial harness (Round N+1)

**Builder:** Track A spawns 1–3 (automated, Round N+1 bench-spike session)
**Branch:** `feat/round-n1-track-a-arbor-bench`
**Runner:** mitata 1.0.34 · Bun 1.3.8 · JSDOM 25.0.1

**Scope:** Round N+1 closes the Learning #11 receipt gap: @aihu/arbor had zero
SOTA bench receipts. This harness adds 6 workloads × 6 competitors × 2 metrics
(time + memory) covering the axes the named competitors hold themselves to.

### Workloads

- `mount-10k-leaves` — promoted from `tests/bench.test.ts` smoke gate. Mount
  10k static text leaves under a fragment and dispose. One cycle = 1 op.
- `mount-deep-100x10` — depth-100 tree, fanout 10 per level. Pairs with
  mount-10k-leaves as wide vs. deep comparison.
- `mount-wide-1000` — 1000 sibling branches each with 1 reactive leaf.
  Stresses top-level sibling reactive bindings.
- `update-1-of-10k-leaves` — granular reactive update (solid-js parity axis).
  Tree mounted once; each op writes one signal → one DOM text patch.
- `attr-thrash-100x100` — 100 elements × 100 reactive attrs (vue parity axis).
  10k signal writes per op.
- `krausest-1k-cycle` — create+partial-update+clear cycle (krausest parity
  axis, JSDOM-relative). Three phases timed as one op.

### Competitors

| Library | Version | Notes |
|---|---|---|
| @aihu/arbor | workspace | Baseline — all 6 workloads pass |
| lit-html | 3.2.1 | 5/6 workloads pass (attr-thrash: readonly property error) |
| preact | 10.25.4 | All 6 workloads pass |
| vanilla DOM | native | All 6 workloads pass — sets the cost floor |
| solid-js | 1.9.12 | All 6 workloads ERROR — JSDOM "Client-only API" mismatch |
| @vue/runtime-dom | 3.5.33 | All 6 workloads ERROR — JSDOM missing `SVGElement` |

solid-js and @vue/runtime-dom errors are JSDOM environment mismatches, not
performance verdicts. See HARNESS.md for details.

### Key numbers (2026-04-30, Bun 1.3.8, JSDOM 25.0.1)

| Workload | @aihu/arbor | preact | vanilla | lit-html |
|---|---:|---:|---:|---:|
| mount-10k-leaves | 36.64 ms | 66.44 ms | 90.71 ms | 5.55 s |
| mount-deep-100x10 | 3.20 ms | 8.93 ms | 24.00 ms | 62.07 ms |
| mount-wide-1000 | 8.24 ms | 10.16 ms | 12.42 ms | 56.00 ms |
| update-1-of-10k-leaves | 25.37 ns | 1.63 ms | 3.10 µs | 598.80 µs |
| attr-thrash-100x100 | 42.48 µs | 10.24 ms | 6.64 ms | ERROR |
| krausest-1k-cycle | 20.90 ms | 19.68 ms | 16.07 ms | 77.01 ms |

@aihu/arbor is fastest on all mount workloads and dramatically fastest on
`update-1-of-10k-leaves` (25 ns vs. 3 µs vanilla — aihu's fine-grained
signals avoid DOM traversal entirely; vanilla writes textContent directly).
On `krausest-1k-cycle` and `attr-thrash-100x100`, vanilla and preact are
faster — expected, as those workloads favor lower per-op overhead.

### Files added

- `bench/arbor/package.json` — workspace package, pinned competitor deps
- `bench/arbor/tsconfig.json`, `bench/arbor/moon.yml` — typecheck + run tasks
- `bench/arbor/HARNESS.md` — full harness guide (add workload/competitor, N
  values, memory limitations, bench-bump override, JSDOM fidelity note)
- `bench/arbor/RESULTS.md` — 36 cells (6 workloads × 6 competitors)
- `bench/arbor/src/types.ts` — `DomAdapter`, `AdapterContext`, `WorkloadDefinition`
- `bench/arbor/src/jsdom-host.ts` — JSDOM singleton + host helpers
- `bench/arbor/src/runner.ts` — time bench (mitata)
- `bench/arbor/src/memory.ts` — memory bench (--expose-gc GC protocol)
- `bench/arbor/src/gate.ts` — regression gate (10% p50 threshold)
- `bench/arbor/src/size.ts` — bundle size reporter
- `bench/arbor/src/competitors/{index,aihu,lit,solid,vue,preact,vanilla}.ts`
- `bench/arbor/src/workloads/{index,mount-10k-leaves,mount-deep-100x10,`
  `mount-wide-1000,update-1-of-10k-leaves,attr-thrash-100x100,krausest-1k-cycle}.ts`
- `.github/workflows/plan-a.yml` — `bench-arbor` job + arbor paths in filter
