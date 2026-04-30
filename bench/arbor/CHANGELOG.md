# `bench/arbor` Changelog

Append-only log of bench-result deltas. Newest entries first. Each entry pairs
with the commit that produced the numbers.

---

## 2026-04-30 — Round N+1 spawn 1: scaffold + scribe adapter + mount-10k-leaves

**Branch:** `feat/round-n1-track-a-arbor-bench`
**Spec:** `.team/round-n1/bench-design.md` §3, §6.1, §6.4 (spawn 1 of 3).
**Runner:** mitata 1.0.34 · JSDOM 25.x · Bun (machine-dependent).

First scaffold lands. Pipeline runs end-to-end against one workload
(`mount-10k-leaves`, n=10 per design §8.8) and one competitor (`@scribe/arbor`,
bypassing the runtime layer per design §8.6 — bench mounts Branch/Leaf trees
directly).

### Files

- `bench/arbor/package.json` — pinned competitor versions per design §3.4
  (lit-html 3.2.1, solid-js 1.9.12, @vue/runtime-dom 3.5.33, preact 10.25.4,
  htm 3.1.1). Spawn 2 wires the adapters; spawn 1 just registers the deps.
- `bench/arbor/tsconfig.json`, `bench/arbor/moon.yml` — typecheck + run +
  placeholder memory/size tasks.
- `bench/arbor/HARNESS.md` — stub (spawn 3 ships the full guide).
- `bench/arbor/src/{types,jsdom-host,runner}.ts` — DomAdapter interface,
  reused-JSDOM helper, mitata-driven time runner.
- `bench/arbor/src/competitors/{index,scribe}.ts` — scribe adapter using a
  `setScribeHook(hook)` handshake to bridge per-workload tree shapes into
  the generic adapter setup.
- `bench/arbor/src/workloads/{index,mount-10k-leaves}.ts` — first workload.

### Spawn-2/3 follow-ups

- Spawn 2: 4 more competitors (lit, solid, vue, preact, vanilla) + 5 more
  workloads (mount-deep-100x10, mount-wide-1000, update-1-of-10k-leaves,
  attr-thrash-100x100, krausest-1k-cycle).
- Spawn 3: `memory.ts` (--expose-gc protocol per design §2.6), `gate.ts`
  (10% p50 + 10% buildHeapDelta + 15% peak_malloced_memory), `size.ts`,
  full HARNESS.md, full RESULTS.md layout (per-axis honesty section per
  design §5.3), `.github/workflows/plan-a.yml` `bench-arbor` job.

### Tests

131/131 prior tests still pass. No new test files in `bench/arbor/`
(bench is its own kind of test surface; correctness lives upstream in
`packages/arbor/tests/`).
