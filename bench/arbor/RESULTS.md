# `@scribe/arbor` Bench Results

**Generated:** 2026-04-30
**Runner:** mitata 1.0.34 · Bun 1.3.8 · JSDOM 25.0.1
**Track:** A — @scribe/arbor vs. SOTA DOM-binding libs (Round N+1)
**Note:** All runs in JSDOM under Bun. See HARNESS.md for methodology.

---

## Workload: `mount-10k-leaves`

*Mount 10k static text leaves under a fragment and dispose. One mount+dispose = 1 op.*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/arbor | 36.95 ms | 36.64 ms | 39.46 ms | 27.06 |
| lit-html | 5.65 s | 5.55 s | 6.15 s | 0.18 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 66.01 ms | 66.44 ms | 69.15 ms | 15.15 |
| vanilla | 92.60 ms | 90.71 ms | 100.83 ms | 10.80 |

### Memory

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 0 B | 0 B | 10 |
| lit-html | 0 B | 0 B | 10 |
| solid-js | 4.21 MB | 42.08 MB | 10 |
| @vue/runtime-dom | 0 B | 0 B | 10 |
| preact | 0 B | 0 B | 10 |
| vanilla | 0 B | 0 B | 10 |

## Workload: `mount-deep-100x10`

*Mount a depth-100 spine (10 leaf siblings per level) and dispose. One mount+dispose = 1 op.*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/arbor | 3.44 ms | 3.20 ms | 6.18 ms | 291.05 |
| lit-html | 61.88 ms | 62.07 ms | 63.83 ms | 16.16 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 9.35 ms | 8.93 ms | 12.36 ms | 106.92 |
| vanilla | 24.35 ms | 24.00 ms | 26.43 ms | 41.07 |

### Memory

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 0 B | 0 B | 10 |
| lit-html | 0 B | 0 B | 10 |
| solid-js | 0 B | 0 B | 10 |
| @vue/runtime-dom | 0 B | 0 B | 10 |
| preact | 0 B | 0 B | 10 |
| vanilla | 0 B | 0 B | 10 |

## Workload: `mount-wide-1000`

*Mount 1000 sibling branches each with 1 reactive text leaf and dispose. One mount+dispose = 1 op.*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/arbor | 8.57 ms | 8.24 ms | 11.31 ms | 116.62 |
| lit-html | 55.85 ms | 56.00 ms | 58.60 ms | 17.90 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 10.48 ms | 10.16 ms | 13.91 ms | 95.44 |
| vanilla | 12.98 ms | 12.42 ms | 15.71 ms | 77.07 |

### Memory

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 0 B | 0 B | 100 |
| lit-html | 0 B | 0 B | 100 |
| solid-js | 0 B | 0 B | 100 |
| @vue/runtime-dom | 0 B | 0 B | 100 |
| preact | 8.2 KB | 824.6 KB | 100 |
| vanilla | 0 B | 0 B | 100 |

## Workload: `update-1-of-10k-leaves`

*Mount 10k-leaf tree once, then write the signal for leaf[0] on each op. One signal write = 1 op.*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/arbor | 25.99 ns | 25.37 ns | 38.21 ns | 38.48M |
| lit-html | 624.28 µs | 598.80 µs | 967.30 µs | 1.60K |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 1.72 ms | 1.63 ms | 3.65 ms | 580.38 |
| vanilla | 3.14 µs | 3.10 µs | 3.55 µs | 318.12K |

### Memory

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | -31.12 MB | -31.12 MB | 1 |
| lit-html | 38.62 MB | 38.62 MB | 1 |
| solid-js | ERROR | `Client-only API called on the server side. Run client-only c` | — |
| @vue/runtime-dom | ERROR | `SVGElement is not defined` | — |
| preact | -25.40 MB | -25.40 MB | 1 |
| vanilla | -5.23 MB | -5.23 MB | 1 |

## Workload: `attr-thrash-100x100`

*100 elements × 100 reactive attrs each. Write all 10k signals once per op.*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/arbor | 42.91 µs | 42.48 µs | 43.61 µs | 23.31K |
| lit-html | ERROR | ERROR | ERROR | `Attempted to assign to readonly property.` |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 10.59 ms | 10.24 ms | 12.57 ms | 94.41 |
| vanilla | 6.80 ms | 6.64 ms | 8.23 ms | 147.11 |

### Memory

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 5.82 MB | 58.24 MB | 10 |
| lit-html | ERROR | `Attempted to assign to readonly property.` | — |
| solid-js | ERROR | `Client-only API called on the server side. Run client-only c` | — |
| @vue/runtime-dom | ERROR | `SVGElement is not defined` | — |
| preact | 1.29 MB | 12.90 MB | 10 |
| vanilla | -951.9 KB | -9.30 MB | 10 |

## Workload: `krausest-1k-cycle`

*Create 1000 rows, partial-update every 10th, clear. Three-phase timed as one op. JSDOM-relative.*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/arbor | 20.99 ms | 20.90 ms | 25.10 ms | 47.64 |
| lit-html | 76.98 ms | 77.01 ms | 77.84 ms | 12.99 |
| solid-js | ERROR | ERROR | ERROR | `Client-only API called on the server side. Run client-only code in onMount, or conditionally run client-only component with <Show>.` |
| @vue/runtime-dom | ERROR | ERROR | ERROR | `SVGElement is not defined` |
| preact | 19.63 ms | 19.68 ms | 24.03 ms | 50.93 |
| vanilla | 16.59 ms | 16.07 ms | 20.23 ms | 60.28 |

### Memory

| Competitor | buildHeapDelta/ctx | disposeResidual | n |
| --- | ---: | ---: | ---: |
| @scribe/arbor | 0 B | 0 B | 10 |
| lit-html | 0 B | 0 B | 10 |
| solid-js | 0 B | 0 B | 10 |
| @vue/runtime-dom | 0 B | 0 B | 10 |
| preact | 0 B | 0 B | 10 |
| vanilla | 0 B | 0 B | 10 |

---

## Per-competitor-axis honesty

The competitors in this matrix each have a primary bench axis.
This section answers: "how does @scribe/arbor perform on the axis
each competitor holds itself to?"

### vs. lit-html
*lit-html benchmarks focus on render-update-clear on row tables (krausest).*
- `krausest-1k-cycle`: p50 = 20.90 ms, 47.64 ops/s

### vs. solid-js
*Solid's headline claim is granular reactive updates without diffing.*
- `update-1-of-10k-leaves`: p50 = 25.37 ns, 38.48M ops/s

### vs. @vue/runtime-dom
*Vue's perf claim is patch flags reducing reactive diffs.*
- `attr-thrash-100x100`: p50 = 42.48 µs, 23.31K ops/s
- `update-1-of-10k-leaves`: p50 = 25.37 ns, 38.48M ops/s

### vs. preact
*Preact's claim is minimal VDOM runtime cost.*
- `krausest-1k-cycle`: p50 = 20.90 ms, 47.64 ops/s

### vs. vanilla DOM
*Vanilla is the floor. If we are more than 2-3x slower than vanilla on update, investigate.*
- `update-1-of-10k-leaves`: p50 = 25.37 ns, 38.48M ops/s

---

<!-- bench-data:start
{
  "date": "2026-04-30",
  "cells": [
    {
      "workload": "mount-10k-leaves",
      "competitor": "@scribe/arbor",
      "p50": 36636300,
      "opsPerSec": 27.060248967820627
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "lit-html",
      "p50": 5548333600,
      "opsPerSec": 0.17683753444102557
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
      "p50": 66438500,
      "opsPerSec": 15.149921731716853
    },
    {
      "workload": "mount-10k-leaves",
      "competitor": "vanilla",
      "p50": 90709400,
      "opsPerSec": 10.799013618096122
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "@scribe/arbor",
      "p50": 3196700,
      "opsPerSec": 291.0464544741269
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "lit-html",
      "p50": 62065800,
      "opsPerSec": 16.1611600828794
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
      "p50": 8929700,
      "opsPerSec": 106.91525813599165
    },
    {
      "workload": "mount-deep-100x10",
      "competitor": "vanilla",
      "p50": 23996800,
      "opsPerSec": 41.071664059541035
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "@scribe/arbor",
      "p50": 8235800,
      "opsPerSec": 116.62458720830567
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "lit-html",
      "p50": 55999500,
      "opsPerSec": 17.9036237701809
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
      "p50": 10163100,
      "opsPerSec": 95.44151608433337
    },
    {
      "workload": "mount-wide-1000",
      "competitor": "vanilla",
      "p50": 12415600,
      "opsPerSec": 77.07128280715995
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "@scribe/arbor",
      "p50": 25.3662109375,
      "opsPerSec": 38478814.861116976
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "lit-html",
      "p50": 598800,
      "opsPerSec": 1601.8488994222791
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
      "p50": 1625900,
      "opsPerSec": 580.3835809687167
    },
    {
      "workload": "update-1-of-10k-leaves",
      "competitor": "vanilla",
      "p50": 3099.267578125,
      "opsPerSec": 318123.83512691513
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "@scribe/arbor",
      "p50": 42483.4716796875,
      "opsPerSec": 23306.179143681893
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
      "p50": 10242100,
      "opsPerSec": 94.40838827866949
    },
    {
      "workload": "attr-thrash-100x100",
      "competitor": "vanilla",
      "p50": 6644100,
      "opsPerSec": 147.10877757955242
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "@scribe/arbor",
      "p50": 20903700,
      "opsPerSec": 47.63815443726672
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "lit-html",
      "p50": 77006600,
      "opsPerSec": 12.99094026260464
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
      "p50": 19678900,
      "opsPerSec": 50.93426445503588
    },
    {
      "workload": "krausest-1k-cycle",
      "competitor": "vanilla",
      "p50": 16073900,
      "opsPerSec": 60.276414949185394
    }
  ]
}
bench-data:end -->
