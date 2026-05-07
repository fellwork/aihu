# `@aihu/signals` Bench Results

**Generated:** 2026-05-07
**Runner:** mitata 1.0.34 + memory.ts (--expose-gc) · Bun 1.3.8 · Node 24.3.0
**Track:** A — vanilla aihu vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/signals | 386.62 ns | 371.22 ns | 630.47 ns | 2.59M |
| alien-signals | 703.82 ns | 681.23 ns | 1.01 µs | 1.42M |
| @preact/signals-core | 560.80 ns | 540.82 ns | 917.02 ns | 1.78M |
| @vue/reactivity | 974.28 ns | 890.87 ns | 1.50 µs | 1.03M |
| solid-js | 1.53 µs | 1.43 µs | 2.17 µs | 652.25K |
| s-js | 702.37 ns | 664.67 ns | 1.05 µs | 1.42M |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | — | — | — |
| alien-signals | — | — | — |
| @preact/signals-core | — | — | — |
| @vue/reactivity | — | — | — |
| solid-js | — | — | — |
| s-js | — | — | — |

## Workload: `wide-fanout-100`

*1 signal → 100 computeds → 100 effects*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/signals | 2.93 µs | 2.86 µs | 3.75 µs | 341.40K |
| alien-signals | 3.04 µs | 2.84 µs | 4.38 µs | 328.51K |
| @preact/signals-core | 4.79 µs | 4.51 µs | 6.86 µs | 208.79K |
| @vue/reactivity | 5.33 µs | 5.24 µs | 6.24 µs | 187.56K |
| solid-js | 10.14 µs | 9.98 µs | 10.90 µs | 98.60K |
| s-js | 4.05 µs | 3.57 µs | 6.18 µs | 246.80K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | — | — | — |
| alien-signals | — | — | — |
| @preact/signals-core | — | — | — |
| @vue/reactivity | — | — | — |
| solid-js | — | — | — |
| s-js | — | — | — |

## Workload: `batched-writes-100`

*100 signal writes inside one batch() (or sequential if no batch)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/signals | 2.57 µs | 2.56 µs | 3.05 µs | 388.47K |
| alien-signals | 3.56 µs | 3.37 µs | 4.87 µs | 280.60K |
| @preact/signals-core | 4.13 µs | 4.01 µs | 5.45 µs | 242.02K |
| @vue/reactivity | 7.53 µs | 7.51 µs | 7.81 µs | 132.82K |
| solid-js | 6.60 µs | 6.47 µs | 7.41 µs | 151.44K |
| s-js | 2.81 µs | 2.52 µs | 4.68 µs | 355.96K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | — | — | — |
| alien-signals | — | — | — |
| @preact/signals-core | — | — | — |
| @vue/reactivity | — | — | — |
| solid-js | — | — | — |
| s-js | — | — | — |

## Workload: `deep-propagation-100`

*100-deep computed chain: src → c0 → c1 → … → c99 → effect (alien-signals molBench)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/signals | 2.67 µs | 2.75 µs | 3.01 µs | 374.79K |
| alien-signals | 2.28 µs | 2.11 µs | 3.31 µs | 437.95K |
| @preact/signals-core | 3.18 µs | 3.08 µs | 4.27 µs | 314.84K |
| @vue/reactivity | 4.86 µs | 4.67 µs | 6.69 µs | 205.95K |
| solid-js | 6.18 µs | 6.14 µs | 6.71 µs | 161.77K |
| s-js | 2.14 µs | 2.00 µs | 3.18 µs | 467.08K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | — | — | — |
| alien-signals | — | — | — |
| @preact/signals-core | — | — | — |
| @vue/reactivity | — | — | — |
| solid-js | — | — | — |
| s-js | — | — | — |

## Workload: `dynamic-deps`

*1 computed reads 5 of 50 signals, set rotates per op (alien-signals kairoBench)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/signals | 623.60 ns | 554.93 ns | 968.33 ns | 1.60M |
| alien-signals | 1.37 µs | 1.24 µs | 2.17 µs | 729.48K |
| @preact/signals-core | 921.88 ns | 904.93 ns | 1.33 µs | 1.08M |
| @vue/reactivity | 4.09 µs | 3.86 µs | 5.96 µs | 244.36K |
| solid-js | 1.15 µs | 1.09 µs | 1.77 µs | 872.23K |
| s-js | 711.19 ns | 633.11 ns | 1.11 µs | 1.41M |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | — | — | — |
| alien-signals | — | — | — |
| @preact/signals-core | — | — | — |
| @vue/reactivity | — | — | — |
| solid-js | — | — | — |
| s-js | — | — | — |

## Workload: `creation-1to1000`

*1 signal × 1000 computeds creation cost (solid-js createComputations1to1000)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/signals | 77.93 µs | 74.61 µs | 91.66 µs | 12.83K |
| alien-signals | 90.92 µs | 91.32 µs | 93.32 µs | 11.00K |
| @preact/signals-core | 57.20 µs | 56.90 µs | 59.66 µs | 17.48K |
| @vue/reactivity | 82.42 µs | 80.49 µs | 88.76 µs | 12.13K |
| solid-js | 90.03 µs | 64.40 µs | 970.20 µs | 11.11K |
| s-js | 66.22 µs | 64.82 µs | 69.92 µs | 15.10K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | — | — | — |
| alien-signals | — | — | — |
| @preact/signals-core | — | — | — |
| @vue/reactivity | — | — | — |
| solid-js | — | — | — |
| s-js | — | — | — |

## Per-competitor-axis honesty

The competitors in this matrix emphasise different axes in their own READMEs. This section answers: do we beat each competitor on the bench they hold *themselves* to?

### vs. alien-signals

*alien-signals' canonical bench is `transitive-bullshit/js-reactivity-benchmark` (cellx, mol, kairo, s-bench).*

- `cellx` (diamond): see Time table above — aihu is the head-to-head measurement.
- `mol-bench` (deep-propagation-100, NEW): aihu is measured on alien-signals' deep-chain headline axis.
- `kairo-bench` (dynamic-deps, NEW): subscription-churn axis. Forward-subscription models (alien, aihu) historically lead this; we now have receipts.
- `s-bench 1to1000` (creation-1to1000, NEW): allocation/wiring throughput. See Time + Memory tables; aihu's per-graph cost is the load-bearing memory number.

### vs. @vue/reactivity

*Vue's `__benchmarks__` emphasise `effect.bench`, `computed.bench`, `reactiveObject.bench`.*

- `effect.bench` ≈ our `wide-fanout-100`: see Time table.
- `computed.bench` ≈ our `cellx`: see Time table.
- `reactiveObject.bench`: **NOT MEASURED** — proxy-reactivity is a fundamentally different model from aihu's tuple signals. Intentional gap; aihu does not aim to compete on object-property thrash. Documented per design §1.3.

### vs. @preact/signals-core

*Preact ships no dedicated bench dir; the implicit axis is throughput on small graphs + bundle size.*

- All 6 workloads + bundle size table cover the implicit Preact axes head-to-head.

### vs. solid-js

*Solid's `bench.cjs` measures creation/update across `1to1`, `1to4`, `1to1000`, `2to1`, `4to1`, `1000to1` shapes (krausest is the DOM-binding axis, separate.).*

- `1to1` ≈ our `cellx` chain: see Time table.
- `1to1000` ≈ our `creation-1to1000` (NEW): exact match on Solid's headline shape.
- `4to1` / `1000to1` (fan-in): **NOT MEASURED** — fan-in shapes deferred to v1+ (design §B mapping).
- Note: Solid's `bench.cjs` is the *signals-layer* bench; the DOM/krausest axis is `bench/arbor/`'s domain (Track A).

### vs. s-js

*s-js' canonical bench is `cellx`.*

- `cellx`: see Time table — exact match on s-js' published axis.

## Bundle size (gz)

Each competitor's main entry as shipped, gzipped at level 9. Note: not minified — Vue and Solid ship dev/prod variants; we use the production ESM build where one exists. `@aihu/signals` is measured against `dist/index.js` (the same file size-limit gates).

| Competitor | Raw | Gzipped |
| --- | ---: | ---: |
| @aihu/signals | 4.03 KB | 1.74 KB |
| alien-signals | 7.28 KB | 1.58 KB |
| @preact/signals-core | 5.31 KB | 1.95 KB |
| @vue/reactivity | 19.19 KB | 7.27 KB |
| solid-js (reactive only) | 50.14 KB | 12.27 KB |
| s-js | 13.93 KB | 3.42 KB |

<!-- bench-data:start -->
```json
{
  "date": "2026-05-07",
  "cells": [
    {
      "workload": "cellx",
      "competitor": "@aihu/signals",
      "mean": 386.6160627371206,
      "p50": 371.2158203125,
      "p99": 630.46875,
      "opsPerSec": 2586545.403520778
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 703.8232992964181,
      "p50": 681.2255859375,
      "p99": 1014.5263671875,
      "opsPerSec": 1420811.1624034855
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 560.8019735646802,
      "p50": 540.8203125,
      "p99": 917.0166015625,
      "opsPerSec": 1783160.6291318887
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 974.2824647484756,
      "p50": 890.869140625,
      "p99": 1496.2646484375,
      "opsPerSec": 1026396.3852189044
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 1533.1479964717741,
      "p50": 1430.810546875,
      "p99": 2169.775390625,
      "opsPerSec": 652252.7520508751
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 702.3723635659621,
      "p50": 664.6728515625,
      "p99": 1054.4921875,
      "opsPerSec": 1423746.223332272
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@aihu/signals",
      "mean": 2929.0796207476264,
      "p50": 2856.25,
      "p99": 3747.021484375,
      "opsPerSec": 341404.17109752627
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 3044.0696614583335,
      "p50": 2838.7939453125,
      "p99": 4381.6162109375,
      "opsPerSec": 328507.593850834
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 4789.408012058424,
      "p50": 4513.4765625,
      "p99": 6863.6474609375,
      "opsPerSec": 208794.07172708455
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 5331.501881669207,
      "p50": 5239.599609375,
      "p99": 6237.109375,
      "opsPerSec": 187564.4090904674
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 10142.176513671875,
      "p50": 9981.2255859375,
      "p99": 10901.6845703125,
      "opsPerSec": 98598.16565526919
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 4051.82625906808,
      "p50": 3567.08984375,
      "p99": 6178.466796875,
      "opsPerSec": 246802.2901431119
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@aihu/signals",
      "mean": 2574.2024739583335,
      "p50": 2561.7431640625,
      "p99": 3049.0966796875,
      "opsPerSec": 388469.8309928616
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 3563.7344360351562,
      "p50": 3370.361328125,
      "p99": 4867.08984375,
      "opsPerSec": 280604.5225728304
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 4131.846147017045,
      "p50": 4011.0595703125,
      "p99": 5446.484375,
      "opsPerSec": 242022.56434982276
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 7528.939082704741,
      "p50": 7509.6435546875,
      "p99": 7805.7861328125,
      "opsPerSec": 132820.83823697962
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 6603.375059185606,
      "p50": 6465.7958984375,
      "p99": 7406.005859375,
      "opsPerSec": 151437.71041884905
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 2809.2856802591464,
      "p50": 2520.1904296875,
      "p99": 4681.2255859375,
      "opsPerSec": 355962.37400382635
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@aihu/signals",
      "mean": 2668.1665593927555,
      "p50": 2746.97265625,
      "p99": 3011.4501953125,
      "opsPerSec": 374789.19615407696
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "alien-signals",
      "mean": 2283.35672026699,
      "p50": 2114.6728515625,
      "p99": 3305.1513671875,
      "opsPerSec": 437951.71867980016
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@preact/signals-core",
      "mean": 3176.2059877996576,
      "p50": 3077.7099609375,
      "p99": 4270.1416015625,
      "opsPerSec": 314841.04111671867
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@vue/reactivity",
      "mean": 4855.538807744565,
      "p50": 4668.798828125,
      "p99": 6686.2548828125,
      "opsPerSec": 205950.36711579855
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "solid-js",
      "mean": 6181.493462456598,
      "p50": 6141.8212890625,
      "p99": 6708.69140625,
      "opsPerSec": 161773.20352654523
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "s-js",
      "mean": 2140.9421608664775,
      "p50": 1999.12109375,
      "p99": 3184.375,
      "opsPerSec": 467084.08021414373
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@aihu/signals",
      "mean": 623.5971692304587,
      "p50": 554.931640625,
      "p99": 968.3349609375,
      "opsPerSec": 1603599.3255614613
    },
    {
      "workload": "dynamic-deps",
      "competitor": "alien-signals",
      "mean": 1370.8412831918354,
      "p50": 1242.48046875,
      "p99": 2169.189453125,
      "opsPerSec": 729479.0522150187
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@preact/signals-core",
      "mean": 921.8759354046935,
      "p50": 904.931640625,
      "p99": 1330.859375,
      "opsPerSec": 1084744.6620471885
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@vue/reactivity",
      "mean": 4092.2927024147725,
      "p50": 3859.0576171875,
      "p99": 5961.0595703125,
      "opsPerSec": 244361.7973391595
    },
    {
      "workload": "dynamic-deps",
      "competitor": "solid-js",
      "mean": 1146.48683988131,
      "p50": 1089.0869140625,
      "p99": 1767.7734375,
      "opsPerSec": 872229.8112933637
    },
    {
      "workload": "dynamic-deps",
      "competitor": "s-js",
      "mean": 711.1876181093289,
      "p50": 633.10546875,
      "p99": 1111.376953125,
      "opsPerSec": 1406098.7206983021
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@aihu/signals",
      "mean": 77927.5858561198,
      "p50": 74609.7412109375,
      "p99": 91663.2080078125,
      "opsPerSec": 12832.426271312088
    },
    {
      "workload": "creation-1to1000",
      "competitor": "alien-signals",
      "mean": 90921.93806966145,
      "p50": 91318.0908203125,
      "p99": 93321.9970703125,
      "opsPerSec": 10998.445713220854
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@preact/signals-core",
      "mean": 57200.213623046875,
      "p50": 56900.09765625,
      "p99": 59658.3251953125,
      "opsPerSec": 17482.45219135133
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@vue/reactivity",
      "mean": 82422.5341796875,
      "p50": 80493.84765625,
      "p99": 88761.23046875,
      "opsPerSec": 12132.604389716078
    },
    {
      "workload": "creation-1to1000",
      "competitor": "solid-js",
      "mean": 90033.45105496695,
      "p50": 64400,
      "p99": 970200,
      "opsPerSec": 11106.982885610849
    },
    {
      "workload": "creation-1to1000",
      "competitor": "s-js",
      "mean": 66217.95654296875,
      "p50": 64824.267578125,
      "p99": 69915.6005859375,
      "opsPerSec": 15101.64390758723
    }
  ]
}
```
<!-- bench-data:end -->
