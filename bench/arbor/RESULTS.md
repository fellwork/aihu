# `@aihu/arbor` Bench Results

**Generated:** 2026-05-08
**Runner:** mitata 1.0.34 · Bun 1.3.8 · JSDOM 25.0.1
**Track:** A — @aihu/arbor vs. SOTA DOM-binding libs (Round N+1)
**Note:** All runs in JSDOM under Bun. See HARNESS.md for methodology.

---

## Workload: `mount-10k-leaves`

*Mount 10k static text leaves under a fragment and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 36.83 ms | 36.63 ms | 39.68 ms | 27.15 |
| lit-html | 5.50 s | 5.40 s | 5.94 s | 0.18 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 72.95 ms | 72.36 ms | 75.60 ms | 13.71 |
| vanilla | 93.98 ms | 92.36 ms | 103.05 ms | 10.64 |

## Workload: `mount-deep-100x10`

*Mount a depth-100 spine (10 leaf siblings per level) and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 3.52 ms | 3.28 ms | 6.25 ms | 284.07 |
| lit-html | 63.31 ms | 63.46 ms | 65.86 ms | 15.79 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 10.01 ms | 9.12 ms | 14.81 ms | 99.85 |
| vanilla | 25.15 ms | 24.60 ms | 28.94 ms | 39.76 |

## Workload: `mount-wide-1000`

*Mount 1000 sibling branches each with 1 reactive text leaf and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 9.19 ms | 8.60 ms | 12.01 ms | 108.84 |
| lit-html | 59.02 ms | 57.49 ms | 63.53 ms | 16.94 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 10.62 ms | 9.82 ms | 15.09 ms | 94.14 |
| vanilla | 12.73 ms | 12.24 ms | 17.02 ms | 78.58 |

## Workload: `update-1-of-10k-leaves`

*Mount 10k-leaf tree once, then write the signal for leaf[0] on each op. One signal write = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 26.61 ns | 25.34 ns | 42.63 ns | 37.59M |
| lit-html | 603.58 µs | 570.30 µs | 967.80 µs | 1.66K |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 2.06 ms | 1.90 ms | 4.67 ms | 485.40 |
| vanilla | 3.33 µs | 3.32 µs | 4.04 µs | 300.02K |

## Workload: `attr-thrash-100x100`

*100 elements × 100 reactive attrs each. Write all 10k signals once per op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 44.45 µs | 43.40 µs | 48.19 µs | 22.50K |
| lit-html | ERROR | ERROR | ERROR | `Attempted to assign to readonly property.` |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 10.69 ms | 10.35 ms | 13.00 ms | 93.55 |
| vanilla | 6.64 ms | 6.45 ms | 8.07 ms | 150.57 |

## Workload: `krausest-1k-cycle`

*Create 1000 rows, partial-update every 10th, clear. Three-phase timed as one op. JSDOM-relative.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 22.18 ms | 21.94 ms | 27.61 ms | 45.08 |
| lit-html | 77.63 ms | 77.43 ms | 81.14 ms | 12.88 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 19.83 ms | 19.40 ms | 23.88 ms | 50.44 |
| vanilla | 16.95 ms | 16.46 ms | 21.23 ms | 58.99 |

---

## Per-competitor-axis honesty

The competitors in this matrix each have a primary bench axis.
This section answers: "how does @aihu/arbor perform on the axis
each competitor holds itself to?"

### vs. lit-html
*lit-html benchmarks focus on render-update-clear on row tables (krausest).*
- `krausest-1k-cycle`: p50 = 21.94 ms, 45.08 ops/s

### vs. solid-js
*Solid's headline claim is granular reactive updates without diffing.*
- `update-1-of-10k-leaves`: p50 = 25.34 ns, 37.59M ops/s

### vs. @vue/runtime-dom
*Vue's perf claim is patch flags reducing reactive diffs.*
- `attr-thrash-100x100`: p50 = 43.40 µs, 22.50K ops/s
- `update-1-of-10k-leaves`: p50 = 25.34 ns, 37.59M ops/s

### vs. preact
*Preact's claim is minimal VDOM runtime cost.*
- `krausest-1k-cycle`: p50 = 21.94 ms, 45.08 ops/s

### vs. vanilla DOM
*Vanilla is the floor. If we are more than 2-3x slower than vanilla on update, investigate.*
- `update-1-of-10k-leaves`: p50 = 25.34 ns, 37.59M ops/s

---

<!-- bench-data:start
{
  "date": "2026-05-08",
  "cells": [
    {
      "workload": "mount-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 36628800,
      "opsPerSec": 27.149858735891268
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "lit-html",
      "p50": 5402825400,
      "opsPerSec": 0.18175506379225598
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
      "p50": 72364600,
      "opsPerSec": 13.707949664957148
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "vanilla",
      "p50": 92361900,
      "opsPerSec": 10.639997630827194
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "@aihu/arbor",
      "p50": 3276400,
      "opsPerSec": 284.06609148883007
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "lit-html",
      "p50": 63460200,
      "opsPerSec": 15.794542485410778
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
      "p50": 9121600,
      "opsPerSec": 99.85471139492039
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "vanilla",
      "p50": 24597700,
      "opsPerSec": 39.75608756808368
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "@aihu/arbor",
      "p50": 8597800,
      "opsPerSec": 108.83876500964313
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "lit-html",
      "p50": 57487400,
      "opsPerSec": 16.942010643939202
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
      "p50": 9818800,
      "opsPerSec": 94.14455394153434
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "vanilla",
      "p50": 12239700,
      "opsPerSec": 78.58470414744922
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 25.341796875,
      "opsPerSec": 37585269.95659458
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "lit-html",
      "p50": 570300,
      "opsPerSec": 1656.7699195687937
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
      "p50": 1900200,
      "opsPerSec": 485.4014746476533
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "vanilla",
      "p50": 3318.4814453125,
      "opsPerSec": 300015.7956685899
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "@aihu/arbor",
      "p50": 43403.076171875,
      "opsPerSec": 22496.534004152832
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
      "p50": 10348300,
      "opsPerSec": 93.5493658444405
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "vanilla",
      "p50": 6446400,
      "opsPerSec": 150.5735045704731
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "@aihu/arbor",
      "p50": 21935600,
      "opsPerSec": 45.08028413773236
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "lit-html",
      "p50": 77427600,
      "opsPerSec": 12.88216369966581
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
      "p50": 19397300,
      "opsPerSec": 50.439808298679225
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "vanilla",
      "p50": 16457500,
      "opsPerSec": 58.992057416647704
    }
  ]
}
bench-data:end -->
