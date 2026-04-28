# `@scribe/signals` Bench Results

**Generated:** 2026-04-28
**Runner:** mitata 1.0.34 · Bun 1.3.13 · Node 24.3.0
**Track:** A — vanilla scribe vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 1.26 µs | 1.18 µs | 2.04 µs | 796.70K |
| alien-signals | 1.72 µs | 1.45 µs | 3.09 µs | 582.11K |
| @preact/signals-core | 1.55 µs | 1.41 µs | 2.73 µs | 646.82K |
| @vue/reactivity | 2.72 µs | 2.51 µs | 4.16 µs | 367.36K |
| solid-js | 4.53 µs | 4.08 µs | 7.37 µs | 220.86K |
| s-js | 2.03 µs | 1.74 µs | 3.09 µs | 492.10K |

## Workload: `wide-fanout-100`

*1 signal → 100 computeds → 100 effects*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 10.62 µs | 8.71 µs | 16.61 µs | 94.13K |
| alien-signals | 9.77 µs | 9.36 µs | 11.78 µs | 102.39K |
| @preact/signals-core | 12.54 µs | 11.71 µs | 16.05 µs | 79.76K |
| @vue/reactivity | 17.32 µs | 16.01 µs | 19.80 µs | 57.74K |
| solid-js | 28.52 µs | 23.00 µs | 84.80 µs | 35.06K |
| s-js | 11.01 µs | 10.05 µs | 15.03 µs | 90.83K |

## Workload: `batched-writes-100`

*100 signal writes inside one batch() (or sequential if no batch)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 5.49 µs | 4.98 µs | 7.90 µs | 182.20K |
| alien-signals | 9.36 µs | 9.21 µs | 10.51 µs | 106.80K |
| @preact/signals-core | 12.86 µs | 12.66 µs | 14.65 µs | 77.73K |
| @vue/reactivity | 25.02 µs | 23.81 µs | 30.14 µs | 39.97K |
| solid-js | 22.55 µs | 20.50 µs | 28.60 µs | 44.34K |
| s-js | 6.79 µs | 6.76 µs | 7.39 µs | 147.36K |

## Bundle size (stretch)

Each competitor's main entry as shipped, gzipped at level 9. Note: not minified — Vue and Solid ship dev/prod variants; we use the production ESM build where one exists. `@scribe/signals` is measured against `dist/index.js` (the same file size-limit gates).

| Competitor | Raw | Gzipped |
| --- | ---: | ---: |
| @scribe/signals | 10.06 KB | 3.28 KB |
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
      "mean": 1255.171130952381,
      "p50": 1176.1474609375,
      "p99": 2041.9189453125,
      "opsPerSec": 796704.1109695012
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 1717.8880232093977,
      "p50": 1453.1982421875,
      "p99": 3085.1318359375,
      "opsPerSec": 582110.1180575071
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 1546.0282175164473,
      "p50": 1406.396484375,
      "p99": 2732.861328125,
      "opsPerSec": 646818.7246972816
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 2722.1351260230654,
      "p50": 2505.908203125,
      "p99": 4164.599609375,
      "opsPerSec": 367358.6922413222
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 4527.65283203125,
      "p50": 4084.765625,
      "p99": 7371.3623046875,
      "opsPerSec": 220864.99055877657
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 2032.086813038793,
      "p50": 1738.5986328125,
      "p99": 3090.13671875,
      "opsPerSec": 492104.96007530054
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@scribe/signals",
      "mean": 10623.44392475329,
      "p50": 8707.8369140625,
      "p99": 16607.373046875,
      "opsPerSec": 94131.43299697166
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 9766.934058779761,
      "p50": 9358.349609375,
      "p99": 11777.3193359375,
      "opsPerSec": 102386.27536356436
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 12537.097981770834,
      "p50": 11705.37109375,
      "p99": 16045.9716796875,
      "opsPerSec": 79763.27547683028
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 17319.94140625,
      "p50": 16012.59765625,
      "p99": 19795.1904296875,
      "opsPerSec": 57736.91587889231
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 28522.693015763434,
      "p50": 23000,
      "p99": 84800,
      "opsPerSec": 35059.80306443494
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 11009.765625,
      "p50": 10047.5341796875,
      "p99": 15032.2509765625,
      "opsPerSec": 90828.45485187156
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@scribe/signals",
      "mean": 5488.4906005859375,
      "p50": 4976.5380859375,
      "p99": 7896.044921875,
      "opsPerSec": 182199.4556924708
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 9363.664106889204,
      "p50": 9212.40234375,
      "p99": 10508.544921875,
      "opsPerSec": 106795.80008260462
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 12864.384765625,
      "p50": 12663.623046875,
      "p99": 14646.2158203125,
      "opsPerSec": 77733.99336376396
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 25020.756022135418,
      "p50": 23810.25390625,
      "p99": 30139.208984375,
      "opsPerSec": 39966.81791370804
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 22552.207438151043,
      "p50": 20503.662109375,
      "p99": 28595.2880859375,
      "opsPerSec": 44341.557372708594
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 6786.180877685547,
      "p50": 6764.2578125,
      "p99": 7387.1826171875,
      "opsPerSec": 147358.28856083393
    }
  ]
}
```
<!-- bench-data:end -->
