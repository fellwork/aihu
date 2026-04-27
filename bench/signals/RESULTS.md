# `@scribe/signals` Bench Results

**Generated:** 2026-04-27
**Runner:** mitata 1.0.34 · Bun 1.3.13 · Node 24.3.0
**Track:** A — vanilla scribe vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 5.69 µs | 5.71 µs | 6.58 µs | 175.72K |
| alien-signals | 1.31 µs | 1.25 µs | 1.73 µs | 765.39K |
| @preact/signals-core | 1.57 µs | 1.53 µs | 2.17 µs | 635.53K |
| @vue/reactivity | 2.53 µs | 2.45 µs | 3.02 µs | 395.21K |
| solid-js | 3.97 µs | 3.93 µs | 4.54 µs | 252.18K |
| s-js | 1.59 µs | 1.57 µs | 1.75 µs | 629.65K |

## Workload: `wide-fanout-100`

*1 signal → 100 computeds → 100 effects*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 9.00 µs | 8.97 µs | 9.72 µs | 111.15K |
| alien-signals | 8.40 µs | 8.37 µs | 8.59 µs | 119.10K |
| @preact/signals-core | 11.65 µs | 11.48 µs | 12.12 µs | 85.83K |
| @vue/reactivity | 14.32 µs | 14.15 µs | 14.78 µs | 69.85K |
| solid-js | 25.82 µs | 25.60 µs | 26.81 µs | 38.72K |
| s-js | 8.91 µs | 8.85 µs | 9.34 µs | 112.18K |

## Workload: `batched-writes-100`

*100 signal writes inside one batch() (or sequential if no batch)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 11.23 µs | 11.16 µs | 11.76 µs | 89.07K |
| alien-signals | 9.64 µs | 9.73 µs | 9.90 µs | 103.72K |
| @preact/signals-core | 10.44 µs | 10.38 µs | 10.74 µs | 95.83K |
| @vue/reactivity | 21.33 µs | 21.33 µs | 21.68 µs | 46.87K |
| solid-js | 16.75 µs | 16.68 µs | 17.31 µs | 59.68K |
| s-js | 6.61 µs | 6.58 µs | 6.90 µs | 151.37K |

## Bundle size (stretch)

Each competitor's main entry as shipped, gzipped at level 9. Note: not minified — Vue and Solid ship dev/prod variants; we use the production ESM build where one exists. `@scribe/signals` is measured against `dist/index.js` (the same file size-limit gates).

| Competitor | Raw | Gzipped |
| --- | ---: | ---: |
| @scribe/signals | 4.88 KB | 1.62 KB |
| alien-signals | 7.28 KB | 1.53 KB |
| @preact/signals-core | 5.31 KB | 1.87 KB |
| @vue/reactivity | 19.19 KB | 6.98 KB |
| solid-js (reactive only) | 50.14 KB | 11.81 KB |
| s-js | 13.93 KB | 3.35 KB |

<!-- bench-data:start -->
```json
{
  "date": "2026-04-27",
  "cells": [
    {
      "workload": "cellx",
      "competitor": "@scribe/signals",
      "mean": 5690.835962540064,
      "p50": 5708.69140625,
      "p99": 6578.857421875,
      "opsPerSec": 175721.10786227215
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 1306.5157376802886,
      "p50": 1254.736328125,
      "p99": 1727.4658203125,
      "opsPerSec": 765394.5307811557
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 1573.4909160025168,
      "p50": 1526.85546875,
      "p99": 2168.26171875,
      "opsPerSec": 635529.566666021
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 2530.305281929348,
      "p50": 2446.5576171875,
      "p99": 3015.625,
      "opsPerSec": 395209.229155742
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 3965.4646248653016,
      "p50": 3931.54296875,
      "p99": 4540.0390625,
      "opsPerSec": 252177.2590605238
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 1588.1852322776845,
      "p50": 1570.6298828125,
      "p99": 1745.2880859375,
      "opsPerSec": 629649.4764441659
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@scribe/signals",
      "mean": 8996.866508152174,
      "p50": 8970.7763671875,
      "p99": 9717.67578125,
      "opsPerSec": 111149.80966916509
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 8396.021484375,
      "p50": 8373.14453125,
      "p99": 8585.7421875,
      "opsPerSec": 119104.03062462388
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 11651.49356617647,
      "p50": 11481.7138671875,
      "p99": 12115.6982421875,
      "opsPerSec": 85825.90672348952
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 14315.963309151786,
      "p50": 14154.39453125,
      "p99": 14779.1748046875,
      "opsPerSec": 69852.09296818529
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 25824.76806640625,
      "p50": 25597.0947265625,
      "p99": 26809.1552734375,
      "opsPerSec": 38722.516207254324
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 8913.917032877604,
      "p50": 8845.9228515625,
      "p99": 9344.5556640625,
      "opsPerSec": 112184.12694572484
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@scribe/signals",
      "mean": 11227.370876736111,
      "p50": 11155.322265625,
      "p99": 11763.5986328125,
      "opsPerSec": 89068.04727294341
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 9641.295276988636,
      "p50": 9730.7373046875,
      "p99": 9902.24609375,
      "opsPerSec": 103720.50344591668
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 10435.2783203125,
      "p50": 10379.248046875,
      "p99": 10737.6220703125,
      "opsPerSec": 95828.78092033998
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 21333.939615885418,
      "p50": 21333.642578125,
      "p99": 21678.02734375,
      "opsPerSec": 46873.66787404761
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 16754.658647017044,
      "p50": 16684.7900390625,
      "p99": 17314.0625,
      "opsPerSec": 59684.892486785306
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 6606.422378077652,
      "p50": 6584.521484375,
      "p99": 6896.044921875,
      "opsPerSec": 151367.85733203177
    }
  ]
}
```
<!-- bench-data:end -->
