# `@scribe/signals` Bench Results

**Generated:** 2026-04-28
**Runner:** mitata 1.0.34 · Bun 1.3.13 · Node 24.3.0
**Track:** A — vanilla scribe vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 1.70 µs | 1.61 µs | 2.24 µs | 588.25K |
| alien-signals | 1.24 µs | 1.19 µs | 1.73 µs | 803.66K |
| @preact/signals-core | 1.43 µs | 1.42 µs | 1.78 µs | 698.09K |
| @vue/reactivity | 2.49 µs | 2.39 µs | 2.93 µs | 401.52K |
| solid-js | 4.58 µs | 4.48 µs | 4.96 µs | 218.51K |
| s-js | 1.67 µs | 1.65 µs | 1.91 µs | 598.91K |

## Workload: `wide-fanout-100`

*1 signal → 100 computeds → 100 effects*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 10.89 µs | 10.81 µs | 11.25 µs | 91.83K |
| alien-signals | 8.72 µs | 8.63 µs | 9.08 µs | 114.62K |
| @preact/signals-core | 10.94 µs | 11.03 µs | 11.27 µs | 91.38K |
| @vue/reactivity | 14.32 µs | 14.38 µs | 14.69 µs | 69.82K |
| solid-js | 25.37 µs | 24.77 µs | 27.22 µs | 39.42K |
| s-js | 9.02 µs | 9.03 µs | 9.20 µs | 110.85K |

## Workload: `batched-writes-100`

*100 signal writes inside one batch() (or sequential if no batch)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 8.14 µs | 7.99 µs | 8.72 µs | 122.86K |
| alien-signals | 9.42 µs | 9.41 µs | 9.61 µs | 106.17K |
| @preact/signals-core | 10.61 µs | 10.57 µs | 10.89 µs | 94.25K |
| @vue/reactivity | 20.86 µs | 20.81 µs | 21.27 µs | 47.95K |
| solid-js | 16.57 µs | 16.57 µs | 16.77 µs | 60.34K |
| s-js | 6.64 µs | 6.61 µs | 6.94 µs | 150.54K |

## Bundle size (stretch)

Each competitor's main entry as shipped, gzipped at level 9. Note: not minified — Vue and Solid ship dev/prod variants; we use the production ESM build where one exists. `@scribe/signals` is measured against `dist/index.js` (the same file size-limit gates).

| Competitor | Raw | Gzipped |
| --- | ---: | ---: |
| @scribe/signals | 7.62 KB | 2.48 KB |
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
      "mean": 1699.9462539343526,
      "p50": 1612.20703125,
      "p99": 2241.11328125,
      "opsPerSec": 588253.8919601733
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 1244.3004028959424,
      "p50": 1187.0849609375,
      "p99": 1728.955078125,
      "opsPerSec": 803664.4508614109
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 1432.4892342808735,
      "p50": 1416.7724609375,
      "p99": 1775.0732421875,
      "opsPerSec": 698085.5255795425
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 2490.5294215425533,
      "p50": 2386.9873046875,
      "p99": 2926.3916015625,
      "opsPerSec": 401521.0546601904
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 4576.3935546875,
      "p50": 4480.5419921875,
      "p99": 4957.8125,
      "opsPerSec": 218512.67554900775
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 1669.7062747579225,
      "p50": 1652.2705078125,
      "p99": 1912.5244140625,
      "opsPerSec": 598907.7331250864
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@scribe/signals",
      "mean": 10889.214124177632,
      "p50": 10814.404296875,
      "p99": 11247.509765625,
      "opsPerSec": 91833.99174598574
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 8724.45068359375,
      "p50": 8629.7607421875,
      "p99": 9080.8349609375,
      "opsPerSec": 114620.39688991432
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 10942.727179276315,
      "p50": 11026.6357421875,
      "p99": 11271.4599609375,
      "opsPerSec": 91384.8973493401
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 14321.78485576923,
      "p50": 14384.4482421875,
      "p99": 14687.0849609375,
      "opsPerSec": 69823.69935526374
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 25370.355224609375,
      "p50": 24770.4345703125,
      "p99": 27217.8955078125,
      "opsPerSec": 39416.08192501754
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 9021.405029296875,
      "p50": 9026.904296875,
      "p99": 9201.220703125,
      "opsPerSec": 110847.47849725351
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@scribe/signals",
      "mean": 8139.512282151442,
      "p50": 7990.8203125,
      "p99": 8724.951171875,
      "opsPerSec": 122857.48400341245
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 9419.049627130682,
      "p50": 9409.8388671875,
      "p99": 9610.986328125,
      "opsPerSec": 106167.82367507594
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 10609.616570723685,
      "p50": 10566.455078125,
      "p99": 10894.091796875,
      "opsPerSec": 94254.11308071332
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 20856.036376953125,
      "p50": 20806.1279296875,
      "p99": 21273.8037109375,
      "opsPerSec": 47947.749127684
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 16571.89275568182,
      "p50": 16565.8203125,
      "p99": 16771.630859375,
      "opsPerSec": 60343.13730742321
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 6642.788233901515,
      "p50": 6610.302734375,
      "p99": 6943.0908203125,
      "opsPerSec": 150539.19601056876
    }
  ]
}
```
<!-- bench-data:end -->
