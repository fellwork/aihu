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
| @aihu/arbor | 37.27 ms | 37.43 ms | 40.15 ms | 26.83 |
| lit-html | 5.52 s | 5.46 s | 5.91 s | 0.18 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 65.21 ms | 65.53 ms | 69.69 ms | 15.33 |
| vanilla | 93.78 ms | 91.06 ms | 99.63 ms | 10.66 |

## Workload: `mount-deep-100x10`

*Mount a depth-100 spine (10 leaf siblings per level) and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 3.46 ms | 3.15 ms | 6.41 ms | 288.85 |
| lit-html | 61.77 ms | 61.25 ms | 64.64 ms | 16.19 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 9.29 ms | 8.79 ms | 12.59 ms | 107.64 |
| vanilla | 24.09 ms | 23.48 ms | 27.64 ms | 41.52 |

## Workload: `mount-wide-1000`

*Mount 1000 sibling branches each with 1 reactive text leaf and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 8.84 ms | 8.06 ms | 13.53 ms | 113.11 |
| lit-html | 53.26 ms | 52.33 ms | 57.42 ms | 18.78 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 10.37 ms | 9.79 ms | 14.87 ms | 96.42 |
| vanilla | 12.92 ms | 12.51 ms | 16.79 ms | 77.39 |

## Workload: `update-1-of-10k-leaves`

*Mount 10k-leaf tree once, then write the signal for leaf[0] on each op. One signal write = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 28.42 ns | 25.00 ns | 88.82 ns | 35.19M |
| lit-html | 663.96 µs | 635.80 µs | 1.50 ms | 1.51K |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 1.86 ms | 1.64 ms | 3.99 ms | 538.51 |
| vanilla | 3.28 µs | 3.14 µs | 4.46 µs | 304.57K |

## Workload: `attr-thrash-100x100`

*100 elements × 100 reactive attrs each. Write all 10k signals once per op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 42.71 µs | 38.30 µs | 78.40 µs | 23.42K |
| lit-html | ERROR | ERROR | ERROR | `Attempted to assign to readonly property.` |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 11.13 ms | 10.77 ms | 13.15 ms | 89.84 |
| vanilla | 7.05 ms | 6.69 ms | 10.84 ms | 141.94 |

## Workload: `krausest-1k-cycle`

*Create 1000 rows, partial-update every 10th, clear. Three-phase timed as one op. JSDOM-relative.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 22.37 ms | 22.27 ms | 27.48 ms | 44.71 |
| lit-html | 77.76 ms | 79.42 ms | 80.02 ms | 12.86 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 20.35 ms | 19.71 ms | 23.86 ms | 49.15 |
| vanilla | 17.15 ms | 16.46 ms | 22.42 ms | 58.31 |

---

## Per-competitor-axis honesty

The competitors in this matrix each have a primary bench axis.
This section answers: "how does @aihu/arbor perform on the axis
each competitor holds itself to?"

### vs. lit-html
*lit-html benchmarks focus on render-update-clear on row tables (krausest).*
- `krausest-1k-cycle`: p50 = 22.27 ms, 44.71 ops/s

### vs. solid-js
*Solid's headline claim is granular reactive updates without diffing.*
- `update-1-of-10k-leaves`: p50 = 25.00 ns, 35.19M ops/s

### vs. @vue/runtime-dom
*Vue's perf claim is patch flags reducing reactive diffs.*
- `attr-thrash-100x100`: p50 = 38.30 µs, 23.42K ops/s
- `update-1-of-10k-leaves`: p50 = 25.00 ns, 35.19M ops/s

### vs. preact
*Preact's claim is minimal VDOM runtime cost.*
- `krausest-1k-cycle`: p50 = 22.27 ms, 44.71 ops/s

### vs. vanilla DOM
*Vanilla is the floor. If we are more than 2-3x slower than vanilla on update, investigate.*
- `update-1-of-10k-leaves`: p50 = 25.00 ns, 35.19M ops/s

---

<!-- bench-data:start
{
  "date": "2026-05-05",
  "cells": [
    {
      "workload": "mount-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 37428700,
      "opsPerSec": 26.831212773150494
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "lit-html",
      "p50": 5462399000,
      "opsPerSec": 0.18107120712134225
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
      "p50": 65530100,
      "opsPerSec": 15.334798914142889
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "vanilla",
      "p50": 91058400,
      "opsPerSec": 10.66363061254649
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "@aihu/arbor",
      "p50": 3150600,
      "opsPerSec": 288.85463543036036
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "lit-html",
      "p50": 61251200,
      "opsPerSec": 16.190382962336937
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
      "p50": 8791300,
      "opsPerSec": 107.64089960881849
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "vanilla",
      "p50": 23483700,
      "opsPerSec": 41.51598911844075
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "@aihu/arbor",
      "p50": 8059500,
      "opsPerSec": 113.11495653086484
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "lit-html",
      "p50": 52329900,
      "opsPerSec": 18.777527855836656
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
      "p50": 9792600,
      "opsPerSec": 96.41972596675447
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "vanilla",
      "p50": 12507800,
      "opsPerSec": 77.3884924583854
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 25,
      "opsPerSec": 35189755.87420878
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "lit-html",
      "p50": 635800,
      "opsPerSec": 1506.1123394696672
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
      "p50": 1636800,
      "opsPerSec": 538.5129558002561
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "vanilla",
      "p50": 3140.52734375,
      "opsPerSec": 304565.2387515502
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "@aihu/arbor",
      "p50": 38300,
      "opsPerSec": 23415.62524672714
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
      "p50": 10773600,
      "opsPerSec": 89.83619414604378
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "vanilla",
      "p50": 6692300,
      "opsPerSec": 141.93520046844833
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "@aihu/arbor",
      "p50": 22270400,
      "opsPerSec": 44.712535475579976
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "lit-html",
      "p50": 79416700,
      "opsPerSec": 12.860589495127552
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
      "p50": 19713500,
      "opsPerSec": 49.14719467278599
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "vanilla",
      "p50": 16462000,
      "opsPerSec": 58.31304255426676
    }
  ]
}
bench-data:end -->
