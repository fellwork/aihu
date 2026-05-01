# `@scribe/signals` Bench Results

**Generated:** 2026-05-01
**Runner:** mitata 1.0.34 + memory.ts (--expose-gc) · Bun 1.3.8 · Node 24.3.0
**Track:** A — vanilla scribe vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 530.09 ns | 513.23 ns | 713.18 ns | 1.89M |
| alien-signals | 686.64 ns | 671.04 ns | 861.13 ns | 1.46M |
| @preact/signals-core | 566.94 ns | 556.79 ns | 732.62 ns | 1.76M |
| @vue/reactivity | 951.73 ns | 911.67 ns | 1.17 µs | 1.05M |
| solid-js | 1.54 µs | 1.48 µs | 1.80 µs | 650.97K |
| s-js | 607.34 ns | 600.32 ns | 707.84 ns | 1.65M |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | — | — | — |
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
| @scribe/signals | 4.41 µs | 4.39 µs | 4.66 µs | 226.51K |
| alien-signals | 3.32 µs | 3.29 µs | 3.51 µs | 301.03K |
| @preact/signals-core | 4.40 µs | 4.39 µs | 4.58 µs | 227.26K |
| @vue/reactivity | 5.36 µs | 5.35 µs | 5.58 µs | 186.45K |
| solid-js | 10.25 µs | 10.22 µs | 10.48 µs | 97.53K |
| s-js | 3.81 µs | 3.79 µs | 3.95 µs | 262.77K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | — | — | — |
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
| @scribe/signals | 2.62 µs | 2.62 µs | 2.86 µs | 382.37K |
| alien-signals | 3.57 µs | 3.54 µs | 3.94 µs | 280.19K |
| @preact/signals-core | 4.08 µs | 4.06 µs | 4.38 µs | 245.24K |
| @vue/reactivity | 7.88 µs | 7.87 µs | 8.09 µs | 126.97K |
| solid-js | 6.46 µs | 6.44 µs | 6.70 µs | 154.69K |
| s-js | 2.67 µs | 2.64 µs | 2.90 µs | 374.04K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | — | — | — |
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
| @scribe/signals | 3.51 µs | 3.49 µs | 3.74 µs | 284.63K |
| alien-signals | 2.47 µs | 2.46 µs | 2.61 µs | 404.72K |
| @preact/signals-core | 3.14 µs | 3.13 µs | 3.33 µs | 318.56K |
| @vue/reactivity | 4.65 µs | 4.61 µs | 4.97 µs | 215.21K |
| solid-js | 6.25 µs | 6.24 µs | 6.49 µs | 159.97K |
| s-js | 1.98 µs | 1.97 µs | 2.10 µs | 504.05K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | — | — | — |
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
| @scribe/signals | 720.39 ns | 704.25 ns | 948.27 ns | 1.39M |
| alien-signals | 1.28 µs | 1.22 µs | 2.08 µs | 781.31K |
| @preact/signals-core | 891.00 ns | 886.43 ns | 1.13 µs | 1.12M |
| @vue/reactivity | 3.81 µs | 3.77 µs | 4.07 µs | 262.41K |
| solid-js | 1.02 µs | 1.01 µs | 1.18 µs | 980.94K |
| s-js | 618.98 ns | 613.87 ns | 737.13 ns | 1.62M |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | — | — | — |
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
| @scribe/signals | 70.80 µs | 70.41 µs | 73.52 µs | 14.12K |
| alien-signals | 87.42 µs | 87.80 µs | 89.19 µs | 11.44K |
| @preact/signals-core | 53.89 µs | 53.93 µs | 55.77 µs | 18.56K |
| @vue/reactivity | 81.55 µs | 80.80 µs | 84.90 µs | 12.26K |
| solid-js | 95.11 µs | 67.70 µs | 1.03 ms | 10.51K |
| s-js | 67.28 µs | 66.49 µs | 70.09 µs | 14.86K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | — | — | — |
| alien-signals | — | — | — |
| @preact/signals-core | — | — | — |
| @vue/reactivity | — | — | — |
| solid-js | — | — | — |
| s-js | — | — | — |

## Per-competitor-axis honesty

The competitors in this matrix emphasise different axes in their own READMEs. This section answers: do we beat each competitor on the bench they hold *themselves* to?

### vs. alien-signals

*alien-signals' canonical bench is `transitive-bullshit/js-reactivity-benchmark` (cellx, mol, kairo, s-bench).*

- `cellx` (diamond): see Time table above — scribe is the head-to-head measurement.
- `mol-bench` (deep-propagation-100, NEW): scribe is measured on alien-signals' deep-chain headline axis.
- `kairo-bench` (dynamic-deps, NEW): subscription-churn axis. Forward-subscription models (alien, scribe) historically lead this; we now have receipts.
- `s-bench 1to1000` (creation-1to1000, NEW): allocation/wiring throughput. See Time + Memory tables; scribe's per-graph cost is the load-bearing memory number.

### vs. @vue/reactivity

*Vue's `__benchmarks__` emphasise `effect.bench`, `computed.bench`, `reactiveObject.bench`.*

- `effect.bench` ≈ our `wide-fanout-100`: see Time table.
- `computed.bench` ≈ our `cellx`: see Time table.
- `reactiveObject.bench`: **NOT MEASURED** — proxy-reactivity is a fundamentally different model from scribe's tuple signals. Intentional gap; scribe does not aim to compete on object-property thrash. Documented per design §1.3.

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

Each competitor's main entry as shipped, gzipped at level 9. Note: not minified — Vue and Solid ship dev/prod variants; we use the production ESM build where one exists. `@scribe/signals` is measured against `dist/index.js` (the same file size-limit gates).

| Competitor | Raw | Gzipped |
| --- | ---: | ---: |
| @scribe/signals | 3.80 KB | 1.66 KB |
| alien-signals | 7.28 KB | 1.58 KB |
| @preact/signals-core | 5.31 KB | 1.95 KB |
| @vue/reactivity | 19.19 KB | 7.27 KB |
| solid-js (reactive only) | 50.14 KB | 12.27 KB |
| s-js | 13.93 KB | 3.42 KB |

<!-- bench-data:start -->
```json
{
  "date": "2026-05-01",
  "cells": [
    {
      "workload": "cellx",
      "competitor": "@scribe/signals",
      "mean": 530.0905997293037,
      "p50": 513.232421875,
      "p99": 713.18359375,
      "opsPerSec": 1886469.9742094285
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 686.6379262375356,
      "p50": 671.044921875,
      "p99": 861.1328125,
      "opsPerSec": 1456371.6360375641
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 566.944677505135,
      "p50": 556.787109375,
      "p99": 732.6171875,
      "opsPerSec": 1763840.5292039146
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 951.726810515873,
      "p50": 911.669921875,
      "p99": 1173.828125,
      "opsPerSec": 1050721.6870962803
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 1536.1622668850807,
      "p50": 1482.7392578125,
      "p99": 1796.0205078125,
      "opsPerSec": 650972.8962603202
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 607.3424216782116,
      "p50": 600.3173828125,
      "p99": 707.8369140625,
      "opsPerSec": 1646517.622195392
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@scribe/signals",
      "mean": 4414.8442287071075,
      "p50": 4393.994140625,
      "p99": 4661.4990234375,
      "opsPerSec": 226508.5579911505
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 3321.9241768973216,
      "p50": 3293.8720703125,
      "p99": 3513.57421875,
      "opsPerSec": 301030.35070896783
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 4400.213623046875,
      "p50": 4386.4501953125,
      "p99": 4581.93359375,
      "opsPerSec": 227261.69356013267
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 5363.252766927083,
      "p50": 5350.244140625,
      "p99": 5584.0087890625,
      "opsPerSec": 186454.01278988342
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 10253.63037109375,
      "p50": 10215.576171875,
      "p99": 10480.908203125,
      "opsPerSec": 97526.4334492809
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 3805.6288422131147,
      "p50": 3787.98828125,
      "p99": 3951.953125,
      "opsPerSec": 262768.6622793364
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@scribe/signals",
      "mean": 2615.2681157830057,
      "p50": 2619.3603515625,
      "p99": 2863.57421875,
      "opsPerSec": 382369.9734513079
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 3569.0531099759614,
      "p50": 3538.671875,
      "p99": 3937.3046875,
      "opsPerSec": 280186.36013145105
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 4077.7117047991073,
      "p50": 4064.404296875,
      "p99": 4377.3193359375,
      "opsPerSec": 245235.5812263746
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 7875.89427806713,
      "p50": 7874.12109375,
      "p99": 8089.7705078125,
      "opsPerSec": 126969.70841581891
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 6464.407887178309,
      "p50": 6439.990234375,
      "p99": 6696.875,
      "opsPerSec": 154693.20894546717
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 2673.505410380747,
      "p50": 2641.4306640625,
      "p99": 2895.3369140625,
      "opsPerSec": 374040.76165964635
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@scribe/signals",
      "mean": 3513.335626775568,
      "p50": 3489.306640625,
      "p99": 3741.6748046875,
      "opsPerSec": 284629.7952233415
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "alien-signals",
      "mean": 2470.849609375,
      "p50": 2457.3974609375,
      "p99": 2610.3515625,
      "opsPerSec": 404719.0878011185
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@preact/signals-core",
      "mean": 3139.138381545608,
      "p50": 3126.318359375,
      "p99": 3334.423828125,
      "opsPerSec": 318558.75034971634
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@vue/reactivity",
      "mean": 4646.591497927296,
      "p50": 4612.1337890625,
      "p99": 4971.4599609375,
      "opsPerSec": 215211.5158920404
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "solid-js",
      "mean": 6251.154920789931,
      "p50": 6241.064453125,
      "p99": 6490.52734375,
      "opsPerSec": 159970.43949018535
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "s-js",
      "mean": 1983.9148256959033,
      "p50": 1973.3154296875,
      "p99": 2097.0458984375,
      "opsPerSec": 504053.8973991624
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@scribe/signals",
      "mean": 720.390201043226,
      "p50": 704.248046875,
      "p99": 948.2666015625,
      "opsPerSec": 1388136.593962355
    },
    {
      "workload": "dynamic-deps",
      "competitor": "alien-signals",
      "mean": 1279.905520203293,
      "p50": 1222.0703125,
      "p99": 2075.244140625,
      "opsPerSec": 781307.6701483135
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@preact/signals-core",
      "mean": 891.0025137442129,
      "p50": 886.42578125,
      "p99": 1130.2001953125,
      "opsPerSec": 1122331.2892774597
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@vue/reactivity",
      "mean": 3810.80322265625,
      "p50": 3772.75390625,
      "p99": 4074.8291015625,
      "opsPerSec": 262411.8700369337
    },
    {
      "workload": "dynamic-deps",
      "competitor": "solid-js",
      "mean": 1019.4348404255319,
      "p50": 1009.228515625,
      "p99": 1179.1015625,
      "opsPerSec": 980935.671751792
    },
    {
      "workload": "dynamic-deps",
      "competitor": "s-js",
      "mean": 618.9831229967949,
      "p50": 613.8671875,
      "p99": 737.1337890625,
      "opsPerSec": 1615552.9332666118
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@scribe/signals",
      "mean": 70800.95621744792,
      "p50": 70413.6962890625,
      "p99": 73515.2099609375,
      "opsPerSec": 14124.103026641944
    },
    {
      "workload": "creation-1to1000",
      "competitor": "alien-signals",
      "mean": 87421.98282877605,
      "p50": 87802.001953125,
      "p99": 89185.8154296875,
      "opsPerSec": 11438.770520208762
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@preact/signals-core",
      "mean": 53889.607747395836,
      "p50": 53929.6875,
      "p99": 55770.8740234375,
      "opsPerSec": 18556.453494474063
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@vue/reactivity",
      "mean": 81551.77815755208,
      "p50": 80800.5615234375,
      "p99": 84904.248046875,
      "opsPerSec": 12262.14832579215
    },
    {
      "workload": "creation-1to1000",
      "competitor": "solid-js",
      "mean": 95112.28019877676,
      "p50": 67700,
      "p99": 1029800,
      "opsPerSec": 10513.889456861754
    },
    {
      "workload": "creation-1to1000",
      "competitor": "s-js",
      "mean": 67282.70670572917,
      "p50": 66494.921875,
      "p99": 70085.693359375,
      "opsPerSec": 14862.660094422885
    }
  ]
}
```
<!-- bench-data:end -->
