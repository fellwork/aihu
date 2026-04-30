# `bench/arbor` Harness Guide

**Status:** in progress (Round N+1 spawn-sequence).

This file is a stub. The full harness guide — workload-add steps, competitor-add
steps, JSDOM gotchas, memory protocol, CI gate behavior, threshold rationale —
lands in **spawn 3 of 3** of the Round N+1 Track A bench-spike.

The authoritative design that this harness implements lives at
`.team/round-n1/bench-design.md` §3 (DomAdapter shape + workload set + comparator
pins) and §5.3 (RESULTS.md layout).

## Quick start (spawn 1 only)

```bash
cd bench/arbor
bun src/runner.ts            # times scribe on mount-10k-leaves; writes RESULTS.md
```

Right now the runner exercises **one workload** (`mount-10k-leaves`) against
**one competitor** (`@scribe/arbor`). Spawn 2 adds the remaining 5 workloads and
4 competitors; spawn 3 adds memory + size + gate + the full RESULTS.md layout.

## Layout

See `.team/round-n1/bench-design.md` §3.1 for the planned tree. Spawn 1 lands
the scaffold (`package.json`, `tsconfig.json`, `moon.yml`, `src/types.ts`,
`src/jsdom-host.ts`, `src/runner.ts`, `src/competitors/{index,scribe}.ts`,
`src/workloads/{index,mount-10k-leaves}.ts`).
