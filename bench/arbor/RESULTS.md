# `@scribe/arbor` Bench Results

> **INCOMPLETE — spawn 1 of 3.** This RESULTS.md is a placeholder.
> Spawn 1 wires the runner pipeline end-to-end with one workload
> (`mount-10k-leaves`) against one competitor (`@scribe/arbor`).
> Spawn 2 adds the remaining 5 competitors (lit-html, solid-js/web,
> @vue/runtime-dom, preact+htm, vanilla) and 5 workloads. Spawn 3
> adds memory + size + gate + the per-competitor-axis honesty section
> per design §5.3.

**Generated:** 2026-04-30
**Runner:** mitata 1.0.34 + JSDOM · Bun 1.3.8 · Node 24.3.0
**Track:** A — vanilla scribe vs. SOTA DOM-binding libs

See `HARNESS.md` (stub in spawn 1) and `.team/round-n1/bench-design.md` for the authoritative plan.

## Workload: `mount-10k-leaves`

*Mount 10k static text leaves under a fragment and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/arbor | 36.71 ms | 36.77 ms | 38.76 ms | 27.24 |

<!-- bench-data:start -->
```json
{
  "date": "2026-04-30",
  "spawn": "1-of-3",
  "cells": [
    {
      "workload": "mount-10k-leaves",
      "competitor": "@scribe/arbor",
      "mean": 36712745.833333336,
      "p50": 36774200,
      "p99": 38762500,
      "opsPerSec": 27.238496530326263
    }
  ]
}
```
<!-- bench-data:end -->
