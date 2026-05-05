# `@aihu/arbor` Bench Results

**Generated:** 2026-05-05
**Runner:** mitata 1.0.34 · Bun 1.3.8 · JSDOM 25.0.1
**Track:** A — @aihu/arbor vs. SOTA DOM-binding libs (Round N+1)
**Note:** All runs in JSDOM under Bun. See HARNESS.md for methodology.

---

## Workload: `mount-10k-leaves`

*Mount 10k static text leaves under a fragment and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 36.82 ms | 36.93 ms | 40.10 ms | 27.16 |
| lit-html | 5.65 s | 5.53 s | 6.14 s | 0.18 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 67.18 ms | 65.84 ms | 71.43 ms | 14.89 |
| vanilla | 94.85 ms | 94.62 ms | 101.58 ms | 10.54 |

## Workload: `mount-deep-100x10`

*Mount a depth-100 spine (10 leaf siblings per level) and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 3.41 ms | 3.13 ms | 6.28 ms | 293.17 |
| lit-html | 62.59 ms | 62.69 ms | 65.40 ms | 15.98 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 9.08 ms | 8.64 ms | 11.95 ms | 110.12 |
| vanilla | 24.84 ms | 24.31 ms | 28.75 ms | 40.26 |

## Workload: `mount-wide-1000`

*Mount 1000 sibling branches each with 1 reactive text leaf and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 9.14 ms | 8.36 ms | 13.06 ms | 109.46 |
| lit-html | 53.24 ms | 53.21 ms | 55.91 ms | 18.78 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 10.20 ms | 9.46 ms | 13.83 ms | 98.02 |
| vanilla | 13.20 ms | 12.39 ms | 16.97 ms | 75.74 |

## Workload: `update-1-of-10k-leaves`

*Mount 10k-leaf tree once, then write the signal for leaf[0] on each op. One signal write = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 358.99 ns | 332.79 ns | 673.56 ns | 2.79M |
| lit-html | 631.97 µs | 580.30 µs | 1.48 ms | 1.58K |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 1.84 ms | 1.62 ms | 4.67 ms | 542.51 |
| vanilla | 3.17 µs | 3.12 µs | 3.59 µs | 315.72K |

## Workload: `attr-thrash-100x100`

*100 elements × 100 reactive attrs each. Write all 10k signals once per op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 8.27 ms | 8.01 ms | 10.87 ms | 120.93 |
| lit-html | ERROR | ERROR | ERROR | `Attempted to assign to readonly property.` |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 10.98 ms | 10.45 ms | 13.37 ms | 91.06 |
| vanilla | 6.66 ms | 6.38 ms | 8.82 ms | 150.16 |

## Workload: `krausest-1k-cycle`

*Create 1000 rows, partial-update every 10th, clear. Three-phase timed as one op. JSDOM-relative.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 21.21 ms | 21.58 ms | 27.40 ms | 47.15 |
| lit-html | 74.13 ms | 74.32 ms | 76.63 ms | 13.49 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 20.29 ms | 20.16 ms | 25.15 ms | 49.29 |
| vanilla | 16.50 ms | 16.31 ms | 19.44 ms | 60.61 |

---

## Per-competitor-axis honesty

The competitors in this matrix each have a primary bench axis.
This section answers: "how does @aihu/arbor perform on the axis
each competitor holds itself to?"

### vs. lit-html
*lit-html benchmarks focus on render-update-clear on row tables (krausest).*
- `krausest-1k-cycle`: p50 = 21.58 ms, 47.15 ops/s

### vs. solid-js
*Solid's headline claim is granular reactive updates without diffing.*
- `update-1-of-10k-leaves`: p50 = 332.79 ns, 2.79M ops/s

### vs. @vue/runtime-dom
*Vue's perf claim is patch flags reducing reactive diffs.*
- `attr-thrash-100x100`: p50 = 8.01 ms, 120.93 ops/s
- `update-1-of-10k-leaves`: p50 = 332.79 ns, 2.79M ops/s

### vs. preact
*Preact's claim is minimal VDOM runtime cost.*
- `krausest-1k-cycle`: p50 = 21.58 ms, 47.15 ops/s

### vs. vanilla DOM
*Vanilla is the floor. If we are more than 2-3x slower than vanilla on update, investigate.*
- `update-1-of-10k-leaves`: p50 = 332.79 ns, 2.79M ops/s

---

<!-- bench-data:start
{
  "date": "2026-05-05",
  "cells": [
    {
      "workload": "mount-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 36927700,
      "opsPerSec": 27.15572006390194
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "lit-html",
      "p50": 5527373100,
      "opsPerSec": 0.17700102934506115
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "solid-js",
      "error": true,
      "p50": null
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "@vue/runtime-dom",
      "error": true,
      "p50": null
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "preact",
      "p50": 65837800,
      "opsPerSec": 14.885653988183023
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "vanilla",
      "p50": 94619600,
      "opsPerSec": 10.543145053556103
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "@aihu/arbor",
      "p50": 3134700,
      "opsPerSec": 293.17199372734086
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "lit-html",
      "p50": 62690700,
      "opsPerSec": 15.976584717438122
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "solid-js",
      "error": true,
      "p50": null
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "@vue/runtime-dom",
      "error": true,
      "p50": null
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "preact",
      "p50": 8635100,
      "opsPerSec": 110.12036259518788
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "vanilla",
      "p50": 24305700,
      "opsPerSec": 40.25587066593872
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "@aihu/arbor",
      "p50": 8363000,
      "opsPerSec": 109.46367138262325
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "lit-html",
      "p50": 53214300,
      "opsPerSec": 18.783098166857272
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "solid-js",
      "error": true,
      "p50": null
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "@vue/runtime-dom",
      "error": true,
      "p50": null
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "preact",
      "p50": 9457700,
      "opsPerSec": 98.02168260474895
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "vanilla",
      "p50": 12387000,
      "opsPerSec": 75.74471254565987
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 332.7880859375,
      "opsPerSec": 2785574.0705298115
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "lit-html",
      "p50": 580300,
      "opsPerSec": 1582.363795999205
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "solid-js",
      "error": true,
      "p50": null
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "@vue/runtime-dom",
      "error": true,
      "p50": null
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "preact",
      "p50": 1620600,
      "opsPerSec": 542.5087001663929
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "vanilla",
      "p50": 3119.2626953125,
      "opsPerSec": 315724.30761875166
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "@aihu/arbor",
      "p50": 8008800,
      "opsPerSec": 120.92800773277763
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "lit-html",
      "error": true,
      "p50": null
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "solid-js",
      "error": true,
      "p50": null
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "@vue/runtime-dom",
      "error": true,
      "p50": null
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "preact",
      "p50": 10447500,
      "opsPerSec": 91.06336576270749
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "vanilla",
      "p50": 6381800,
      "opsPerSec": 150.15899883853044
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "@aihu/arbor",
      "p50": 21577300,
      "opsPerSec": 47.15001720975628
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "lit-html",
      "p50": 74319500,
      "opsPerSec": 13.489413036519483
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "solid-js",
      "error": true,
      "p50": null
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "@vue/runtime-dom",
      "error": true,
      "p50": null
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "preact",
      "p50": 20159800,
      "opsPerSec": 49.286592995257976
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "vanilla",
      "p50": 16310400,
      "opsPerSec": 60.605474205406416
    }
  ]
}
bench-data:end -->
