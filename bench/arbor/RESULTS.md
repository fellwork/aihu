# `@aihu/arbor` Bench Results

**Generated:** 2026-05-25
**Runner:** mitata 1.0.34 · Bun 1.3.8 · JSDOM 25.0.1
**Track:** A — @aihu/arbor vs. SOTA DOM-binding libs (Round N+1)
**Note:** All runs in JSDOM under Bun. See HARNESS.md for methodology.

---

## Workload: `mount-10k-leaves`

*Mount 10k static text leaves under a fragment and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 49.70 ms | 49.04 ms | 52.96 ms | 20.12 |
| lit-html | 8.09 s | 8.21 s | 8.36 s | 0.12 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 108.62 ms | 107.10 ms | 116.18 ms | 9.21 |
| vanilla | 143.95 ms | 139.42 ms | 158.33 ms | 6.95 |

## Workload: `mount-deep-100x10`

*Mount a depth-100 spine (10 leaf siblings per level) and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 4.75 ms | 4.32 ms | 7.46 ms | 210.61 |
| lit-html | 84.02 ms | 82.33 ms | 90.14 ms | 11.90 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 12.78 ms | 12.32 ms | 15.92 ms | 78.23 |
| vanilla | 29.10 ms | 28.92 ms | 30.61 ms | 34.37 |

## Workload: `mount-wide-1000`

*Mount 1000 sibling branches each with 1 reactive text leaf and dispose. One mount+dispose = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 12.93 ms | 12.69 ms | 17.26 ms | 77.36 |
| lit-html | 92.56 ms | 92.01 ms | 99.50 ms | 10.80 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 15.52 ms | 14.78 ms | 20.40 ms | 64.42 |
| vanilla | 17.59 ms | 17.38 ms | 21.92 ms | 56.84 |

## Workload: `update-1-of-10k-leaves`

*Mount 10k-leaf tree once, then write the signal for leaf[0] on each op. One signal write = 1 op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 30.12 ns | 28.63 ns | 48.47 ns | 33.20M |
| lit-html | 762.40 µs | 743.62 µs | 1.11 ms | 1.31K |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 2.53 ms | 2.33 ms | 5.46 ms | 394.57 |
| vanilla | 4.39 µs | 4.36 µs | 5.26 µs | 227.76K |

## Workload: `attr-thrash-100x100`

*100 elements × 100 reactive attrs each. Write all 10k signals once per op.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 66.81 µs | 65.52 µs | 94.68 µs | 14.97K |
| lit-html | ERROR | ERROR | ERROR | `Attempted to assign to readonly property.` |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 16.14 ms | 16.24 ms | 18.22 ms | 61.97 |
| vanilla | 10.06 ms | 9.63 ms | 11.50 ms | 99.38 |

## Workload: `krausest-1k-cycle`

*Create 1000 rows, partial-update every 10th, clear. Three-phase timed as one op. JSDOM-relative.*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/arbor | 31.71 ms | 31.16 ms | 36.04 ms | 31.53 |
| lit-html | 116.72 ms | 114.20 ms | 123.26 ms | 8.57 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 31.25 ms | 30.71 ms | 36.32 ms | 32.00 |
| vanilla | 25.82 ms | 25.17 ms | 31.41 ms | 38.73 |

---

## Per-competitor-axis honesty

The competitors in this matrix each have a primary bench axis.
This section answers: "how does @aihu/arbor perform on the axis
each competitor holds itself to?"

### vs. lit-html
*lit-html benchmarks focus on render-update-clear on row tables (krausest).*
- `krausest-1k-cycle`: p50 = 31.16 ms, 31.53 ops/s

### vs. solid-js
*Solid's headline claim is granular reactive updates without diffing.*
- `update-1-of-10k-leaves`: p50 = 28.63 ns, 33.20M ops/s

### vs. @vue/runtime-dom
*Vue's perf claim is patch flags reducing reactive diffs.*
- `attr-thrash-100x100`: p50 = 65.52 µs, 14.97K ops/s
- `update-1-of-10k-leaves`: p50 = 28.63 ns, 33.20M ops/s

### vs. preact
*Preact's claim is minimal VDOM runtime cost.*
- `krausest-1k-cycle`: p50 = 31.16 ms, 31.53 ops/s

### vs. vanilla DOM
*Vanilla is the floor. If we are more than 2-3x slower than vanilla on update, investigate.*
- `update-1-of-10k-leaves`: p50 = 28.63 ns, 33.20M ops/s

---

<!-- bench-data:start
{
  "date": "2026-05-25",
  "cells": [
    {
      "workload": "mount-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 49043682,
      "opsPerSec": 20.12213226272254
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "lit-html",
      "p50": 8212828687,
      "opsPerSec": 0.12360390072026603
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
      "p50": 107103409,
      "opsPerSec": 9.206357695195532
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "vanilla",
      "p50": 139420471,
      "opsPerSec": 6.946777810025042
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "@aihu/arbor",
      "p50": 4318938,
      "opsPerSec": 210.61353282707435
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "lit-html",
      "p50": 82333262,
      "opsPerSec": 11.901425349610717
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
      "p50": 12323197,
      "opsPerSec": 78.23116105658131
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "vanilla",
      "p50": 28915436,
      "opsPerSec": 34.36575610353732
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "@aihu/arbor",
      "p50": 12686487,
      "opsPerSec": 77.35865128968274
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "lit-html",
      "p50": 92009246,
      "opsPerSec": 10.803359101409432
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
      "p50": 14778494,
      "opsPerSec": 64.42498755655525
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "vanilla",
      "p50": 17382329,
      "opsPerSec": 56.83513413990296
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "@aihu/arbor",
      "p50": 28.631591796875,
      "opsPerSec": 33198131.860227488
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "lit-html",
      "p50": 743615,
      "opsPerSec": 1311.6557128689578
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
      "p50": 2326146,
      "opsPerSec": 394.5684516422412
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "vanilla",
      "p50": 4355.67431640625,
      "opsPerSec": 227758.7791662353
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "@aihu/arbor",
      "p50": 65517,
      "opsPerSec": 14968.830404348984
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
      "p50": 16241214,
      "opsPerSec": 61.97260114371932
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "vanilla",
      "p50": 9629299,
      "opsPerSec": 99.38208361329404
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "@aihu/arbor",
      "p50": 31164500,
      "opsPerSec": 31.532445688380406
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "lit-html",
      "p50": 114203777,
      "opsPerSec": 8.567695650912599
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
      "p50": 30708032,
      "opsPerSec": 31.999301098693373
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "vanilla",
      "p50": 25170012,
      "opsPerSec": 38.72961438253045
    }
  ]
}
bench-data:end -->
