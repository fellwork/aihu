# `@scribe/signals` Bench Results

**Generated:** 2026-04-28
**Runner:** mitata 1.0.34 · Bun 1.3.13 · Node 24.3.0
**Track:** A — vanilla scribe vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 1.76 µs | 1.59 µs | 2.66 µs | 569.23K |
| alien-signals | 1.71 µs | 1.63 µs | 3.03 µs | 584.05K |
| @preact/signals-core | 1.56 µs | 1.42 µs | 2.69 µs | 640.46K |
| @vue/reactivity | 3.25 µs | 3.01 µs | 5.18 µs | 308.11K |
| solid-js | 4.44 µs | 3.91 µs | 8.03 µs | 225.42K |
| s-js | 1.84 µs | 1.66 µs | 2.89 µs | 543.33K |

## Workload: `wide-fanout-100`

*1 signal → 100 computeds → 100 effects*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 13.14 µs | 12.67 µs | 14.28 µs | 76.09K |
| alien-signals | 8.38 µs | 8.26 µs | 9.27 µs | 119.31K |
| @preact/signals-core | 11.97 µs | 11.71 µs | 13.42 µs | 83.57K |
| @vue/reactivity | 19.86 µs | 19.23 µs | 23.35 µs | 50.36K |
| solid-js | 32.02 µs | 23.20 µs | 113.40 µs | 31.23K |
| s-js | 9.51 µs | 9.27 µs | 10.78 µs | 105.10K |

## Workload: `batched-writes-100`

*100 signal writes inside one batch() (or sequential if no batch)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 10.16 µs | 9.67 µs | 13.14 µs | 98.44K |
| alien-signals | 10.31 µs | 9.81 µs | 13.02 µs | 96.97K |
| @preact/signals-core | 10.44 µs | 10.33 µs | 11.39 µs | 95.74K |
| @vue/reactivity | 22.89 µs | 22.01 µs | 25.36 µs | 43.70K |
| solid-js | 17.49 µs | 17.20 µs | 18.01 µs | 57.17K |
| s-js | 6.96 µs | 6.82 µs | 8.02 µs | 143.67K |

## Bundle size (stretch)

Each competitor's main entry as shipped, gzipped at level 9. Note: not minified — Vue and Solid ship dev/prod variants; we use the production ESM build where one exists. `@scribe/signals` is measured against `dist/index.js` (the same file size-limit gates).

| Competitor | Raw | Gzipped |
| --- | ---: | ---: |
| @scribe/signals | 8.06 KB | 2.68 KB |
| alien-signals | 7.28 KB | 1.53 KB |
| @preact/signals-core | 5.31 KB | 1.87 KB |
| @vue/reactivity | 19.19 KB | 6.98 KB |
| solid-js (reactive only) | 50.14 KB | 11.81 KB |
| s-js | 13.93 KB | 3.35 KB |

<!-- bench-data:start -->
```json
{
  "date": "2026-04-28",
  "cells": [
    {
      "workload": "cellx",
      "competitor": "@scribe/signals",
      "mean": 1756.7466621968283,
      "p50": 1591.1376953125,
      "p99": 2659.0087890625,
      "opsPerSec": 569234.0401259055
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 1712.186359489051,
      "p50": 1625.4150390625,
      "p99": 3028.857421875,
      "opsPerSec": 584048.5730177286
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 1561.3702351614934,
      "p50": 1415.185546875,
      "p99": 2688.4033203125,
      "opsPerSec": 640463.086512322
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 3245.636416153169,
      "p50": 3014.9658203125,
      "p99": 5182.2265625,
      "opsPerSec": 308105.98347464675
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 4436.16015625,
      "p50": 3905.3466796875,
      "p99": 8029.1259765625,
      "opsPerSec": 225420.17528179724
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 1840.5183792114258,
      "p50": 1655.517578125,
      "p99": 2892.7734375,
      "opsPerSec": 543325.191041261
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@scribe/signals",
      "mean": 13142.464192708334,
      "p50": 12669.384765625,
      "p99": 14277.34375,
      "opsPerSec": 76089.23146656297
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 8381.870524088541,
      "p50": 8263.76953125,
      "p99": 9265.7958984375,
      "opsPerSec": 119305.11180363785
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 11966.50390625,
      "p50": 11713.4033203125,
      "p99": 13416.357421875,
      "opsPerSec": 83566.59621175645
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 19855.430772569445,
      "p50": 19228.22265625,
      "p99": 23345.263671875,
      "opsPerSec": 50364.05462335846
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 32018.907671462675,
      "p50": 23200,
      "p99": 113400,
      "opsPerSec": 31231.546380680087
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 9514.959161931818,
      "p50": 9273.5595703125,
      "p99": 10775.439453125,
      "opsPerSec": 105097.6659995428
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@scribe/signals",
      "mean": 10158.336181640625,
      "p50": 9673.2177734375,
      "p99": 13138.7939453125,
      "opsPerSec": 98441.31776297392
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 10312.219880756578,
      "p50": 9813.8427734375,
      "p99": 13015.4541015625,
      "opsPerSec": 96972.33103670331
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 10444.92919921875,
      "p50": 10331.396484375,
      "p99": 11387.353515625,
      "opsPerSec": 95740.23728899924
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 22885.707600911457,
      "p50": 22006.9091796875,
      "p99": 25361.6943359375,
      "opsPerSec": 43695.393537238655
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 17492.17529296875,
      "p50": 17200.9521484375,
      "p99": 18013.5009765625,
      "opsPerSec": 57168.41863584374
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 6960.358650453629,
      "p50": 6821.5576171875,
      "p99": 8017.919921875,
      "opsPerSec": 143670.75753126986
    }
  ]
}
```
<!-- bench-data:end -->
