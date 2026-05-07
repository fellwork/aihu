# `@aihu/arbor` Bench Results

**Generated:** 2026-05-07
**Runner:** mitata 1.0.34 · Bun 1.3.8 · JSDOM 25.0.1
**Track:** A — @aihu/arbor vs. SOTA DOM-binding libs (Round N+1)
**Note:** All runs in JSDOM under Bun. See HARNESS.md for methodology.

---

## Workload: `mount-10k-leaves`

*Mount 10k static text leaves under a fragment and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 36.32 ms | 36.17 ms | 38.67 ms | 27.54 |
| lit-html | 5.40 s | 5.30 s | 5.73 s | 0.19 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 62.65 ms | 61.66 ms | 68.61 ms | 15.96 |
| vanilla | 93.41 ms | 91.17 ms | 101.47 ms | 10.71 |

## Workload: `mount-deep-100x10`

*Mount a depth-100 spine (10 leaf siblings per level) and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 3.33 ms | 3.11 ms | 6.15 ms | 299.87 |
| lit-html | 60.17 ms | 59.82 ms | 63.24 ms | 16.62 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 9.21 ms | 8.72 ms | 12.76 ms | 108.61 |
| vanilla | 24.00 ms | 23.32 ms | 27.24 ms | 41.66 |

## Workload: `mount-wide-1000`

*Mount 1000 sibling branches each with 1 reactive text leaf and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 9.04 ms | 8.53 ms | 11.71 ms | 110.62 |
| lit-html | 53.75 ms | 53.05 ms | 58.08 ms | 18.60 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 9.93 ms | 9.15 ms | 14.17 ms | 100.70 |
| vanilla | 12.88 ms | 11.89 ms | 17.35 ms | 77.64 |

## Workload: `update-1-of-10k-leaves`

*Mount 10k-leaf tree once, then write the signal for leaf[0] on each op. One signal write = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 26.09 ns | 25.32 ns | 40.65 ns | 38.32M |
| lit-html | 688.87 µs | 618.00 µs | 1.45 ms | 1.45K |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 1.80 ms | 1.60 ms | 4.39 ms | 556.95 |
| vanilla | 3.24 µs | 3.17 µs | 3.83 µs | 309.00K |

## Workload: `attr-thrash-100x100`

*100 elements × 100 reactive attrs each. Write all 10k signals once per op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 40.12 µs | 37.40 µs | 70.00 µs | 24.93K |
| lit-html | ERROR | ERROR | ERROR | `Attempted to assign to readonly property.` |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 10.54 ms | 10.04 ms | 12.87 ms | 94.84 |
| vanilla | 6.72 ms | 6.36 ms | 9.23 ms | 148.77 |

## Workload: `krausest-1k-cycle`

*Create 1000 rows, partial-update every 10th, clear. Three-phase timed as one op. JSDOM-relative.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 21.18 ms | 21.48 ms | 24.60 ms | 47.22 |
| lit-html | 74.79 ms | 73.19 ms | 78.23 ms | 13.37 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 19.24 ms | 18.88 ms | 22.26 ms | 51.96 |
| vanilla | 17.39 ms | 16.71 ms | 23.77 ms | 57.52 |

---

## Per-competitor-axis honesty

The competitors in this matrix each have a primary bench axis.
This section answers: "how does @aihu/arbor perform on the axis
each competitor holds itself to?"

### vs. lit-html
*lit-html benchmarks focus on render-update-clear on row tables (krausest).*
- `krausest-1k-cycle`: p50 = 21.48 ms, 47.22 ops/s

### vs. solid-js
*Solid's headline claim is granular reactive updates without diffing.*
- `update-1-of-10k-leaves`: p50 = 25.32 ns, 38.32M ops/s

### vs. @vue/runtime-dom
*Vue's perf claim is patch flags reducing reactive diffs.*
- `attr-thrash-100x100`: p50 = 37.40 µs, 24.93K ops/s
- `update-1-of-10k-leaves`: p50 = 25.32 ns, 38.32M ops/s

### vs. preact
*Preact's claim is minimal VDOM runtime cost.*
- `krausest-1k-cycle`: p50 = 21.48 ms, 47.22 ops/s

### vs. vanilla DOM
*Vanilla is the floor. If we are more than 2-3x slower than vanilla on update, investigate.*
- `update-1-of-10k-leaves`: p50 = 25.32 ns, 38.32M ops/s

---

<!-- bench-data:start
{
  "date": "2026-05-07",
  "cells": [
    {
      "workload": "mount-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 36167800,
      "opsPerSec": 27.535140288671528
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "lit-html",
      "p50": 5298803600,
      "opsPerSec": 0.18506525347631314
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
      "p50": 61661800,
      "opsPerSec": 15.961942472627264
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "vanilla",
      "p50": 91166500,
      "opsPerSec": 10.705490962290712
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "@aihu/arbor",
      "p50": 3111700,
      "opsPerSec": 299.8695567428169
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "lit-html",
      "p50": 59820400,
      "opsPerSec": 16.62065727795569
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
      "p50": 8716500,
      "opsPerSec": 108.61033494174099
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "vanilla",
      "p50": 23315200,
      "opsPerSec": 41.6639347551553
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "@aihu/arbor",
      "p50": 8526300,
      "opsPerSec": 110.62464099173113
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "lit-html",
      "p50": 53048200,
      "opsPerSec": 18.603296727419657
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
      "p50": 9153300,
      "opsPerSec": 100.69799444210007
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "vanilla",
      "p50": 11885900,
      "opsPerSec": 77.6352227228645
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 25.3173828125,
      "opsPerSec": 38322805.56945072
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "lit-html",
      "p50": 618000,
      "opsPerSec": 1451.6436712118884
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
      "p50": 1599200,
      "opsPerSec": 556.9518732823097
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "vanilla",
      "p50": 3172.65625,
      "opsPerSec": 309000.2159455855
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "@aihu/arbor",
      "p50": 37400,
      "opsPerSec": 24926.64587655542
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
      "p50": 10042500,
      "opsPerSec": 94.8442064051732
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "vanilla",
      "p50": 6361400,
      "opsPerSec": 148.76969005322775
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "@aihu/arbor",
      "p50": 21482000,
      "opsPerSec": 47.22428023488928
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "lit-html",
      "p50": 73190100,
      "opsPerSec": 13.370950273435932
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
      "p50": 18884300,
      "opsPerSec": 51.9616778295867
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "vanilla",
      "p50": 16711700,
      "opsPerSec": 57.517242657471286
    }
  ]
}
bench-data:end -->
