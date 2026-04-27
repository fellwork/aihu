# `@scribe/signals` Bench Results

**Generated:** 2026-04-27
**Runner:** mitata 1.0.34 · Bun 1.3.13 · Node 24.3.0
**Track:** A — vanilla scribe vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 10.08 µs | 9.39 µs | 12.35 µs | 99.20K |
| alien-signals | 1.48 µs | 1.31 µs | 2.77 µs | 674.67K |
| @preact/signals-core | 1.73 µs | 1.44 µs | 3.03 µs | 577.68K |
| @vue/reactivity | 2.76 µs | 2.54 µs | 4.21 µs | 362.37K |
| solid-js | 4.28 µs | 4.05 µs | 6.21 µs | 233.91K |
| s-js | 1.77 µs | 1.64 µs | 2.70 µs | 565.40K |

## Workload: `wide-fanout-100`

*1 signal → 100 computeds → 100 effects*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 10.56 µs | 10.19 µs | 12.49 µs | 94.66K |
| alien-signals | 9.65 µs | 9.37 µs | 10.86 µs | 103.58K |
| @preact/signals-core | 14.15 µs | 14.11 µs | 16.18 µs | 70.68K |
| @vue/reactivity | 15.82 µs | 15.29 µs | 16.87 µs | 63.20K |
| solid-js | 30.47 µs | 30.43 µs | 34.00 µs | 32.82K |
| s-js | 10.09 µs | 9.99 µs | 11.42 µs | 99.13K |

## Workload: `batched-writes-100`

*100 signal writes inside one batch() (or sequential if no batch)*

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 12.97 µs | 11.94 µs | 16.26 µs | 77.13K |
| alien-signals | 10.26 µs | 9.60 µs | 12.70 µs | 97.47K |
| @preact/signals-core | 12.84 µs | 12.33 µs | 14.92 µs | 77.90K |
| @vue/reactivity | 22.32 µs | 21.47 µs | 25.06 µs | 44.80K |
| solid-js | 17.62 µs | 17.01 µs | 19.63 µs | 56.76K |
| s-js | 7.31 µs | 6.94 µs | 9.69 µs | 136.71K |

## Bundle size (stretch)

Each competitor's main ESM entry, minified with esbuild (matches size-limit's internal pipeline) and gzipped at level 9. Where a library ships a production-ready ESM build (Vue's `reactivity.esm-browser.prod`, Solid's `solid.js`), that's the file we measure. `@scribe/signals` is measured against `dist/index.js` — the same file `bun run size` gates on.

The minified+gzipped column here is directly comparable to `bun run size`'s 698 B reading for `@scribe/signals`; the 781 B vs 698 B delta is gzip level 9 vs size-limit's default level 6.

| Competitor | Raw | Minified | Gzipped |
| --- | ---: | ---: | ---: |
| @scribe/signals | 4.67 KB | 1.62 KB | **781 B** |
| alien-signals | 7.28 KB | 2.95 KB | 1.11 KB |
| @preact/signals-core | 5.31 KB | 5.09 KB | 1.86 KB |
| @vue/reactivity | 19.19 KB | 19.03 KB | 7.05 KB |
| solid-js (reactive only) | 50.14 KB | 21.85 KB | 8.42 KB |
| s-js | 13.93 KB | 5.07 KB | 1.86 KB |

**`@scribe/signals` is the smallest gzipped** — 30% smaller than alien, 58% smaller than Preact, ~88% smaller than Vue. This is the size-axis win Learning #11 demands.

<!-- bench-data:start -->
```json
{
  "date": "2026-04-27",
  "cells": [
    {
      "workload": "cellx",
      "competitor": "@scribe/signals",
      "mean": 10080.460205078125,
      "p50": 9393.4326171875,
      "p99": 12346.2158203125,
      "opsPerSec": 99201.82012089495
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 1482.2073690546383,
      "p50": 1308.59375,
      "p99": 2767.578125,
      "opsPerSec": 674669.4294454943
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 1731.0568416819854,
      "p50": 1437.109375,
      "p99": 3033.3984375,
      "opsPerSec": 577681.7813956633
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 2759.6388483621986,
      "p50": 2541.4794921875,
      "p99": 4211.42578125,
      "opsPerSec": 362366.25694463024
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 4275.186861478365,
      "p50": 4051.7578125,
      "p99": 6212.255859375,
      "opsPerSec": 233907.90447325585
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 1768.6646425634399,
      "p50": 1635.7177734375,
      "p99": 2696.484375,
      "opsPerSec": 565398.3100779555
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@scribe/signals",
      "mean": 10564.354248046875,
      "p50": 10192.7734375,
      "p99": 12493.310546875,
      "opsPerSec": 94657.93900132408
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 9653.92578125,
      "p50": 9373.5595703125,
      "p99": 10858.0810546875,
      "opsPerSec": 103584.80297644457
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 14148.50551060268,
      "p50": 14114.599609375,
      "p99": 16180.6884765625,
      "opsPerSec": 70678.8430234285
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 15822.465006510416,
      "p50": 15291.0400390625,
      "p99": 16872.314453125,
      "opsPerSec": 63201.277398214086
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 30471.897379557293,
      "p50": 30430.95703125,
      "p99": 34004.9072265625,
      "opsPerSec": 32817.122857300994
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 10087.833658854166,
      "p50": 9985.25390625,
      "p99": 11424.1943359375,
      "opsPerSec": 99129.3109915916
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@scribe/signals",
      "mean": 12965.294596354166,
      "p50": 11938.916015625,
      "p99": 16261.0595703125,
      "opsPerSec": 77128.9840403009
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 10259.678955078125,
      "p50": 9595.166015625,
      "p99": 12701.3916015625,
      "opsPerSec": 97468.93683306148
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 12836.731770833334,
      "p50": 12328.076171875,
      "p99": 14924.365234375,
      "opsPerSec": 77901.44858149374
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 22321.315511067707,
      "p50": 21466.4794921875,
      "p99": 25061.2548828125,
      "opsPerSec": 44800.226917816035
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 17618.994140625,
      "p50": 17013.3056640625,
      "p99": 19632.3486328125,
      "opsPerSec": 56756.9290288967
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 7314.940564385776,
      "p50": 6941.30859375,
      "p99": 9688.0615234375,
      "opsPerSec": 136706.5106268527
    }
  ]
}
```
<!-- bench-data:end -->
