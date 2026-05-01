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
| @scribe/signals | 487.00 ns | 475.02 ns | 663.62 ns | 2.05M |
| alien-signals | 701.28 ns | 683.25 ns | 919.58 ns | 1.43M |
| @preact/signals-core | 563.82 ns | 555.66 ns | 691.70 ns | 1.77M |
| @vue/reactivity | 1.11 µs | 1.04 µs | 1.67 µs | 902.52K |
| solid-js | 1.60 µs | 1.55 µs | 2.14 µs | 624.64K |
| s-js | 638.66 ns | 632.18 ns | 737.72 ns | 1.57M |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | 0 B | 32.05 MB | 0 B |
| alien-signals | 0 B | 4.94 MB | 0 B |
| @preact/signals-core | 0 B | 0 B | 0 B |
| @vue/reactivity | 0 B | 3.37 MB | 0 B |
| solid-js | 0 B | 2.57 MB | 0 B |
| s-js | 0 B | 2.39 MB | 0 B |

## Workload: `wide-fanout-100`

*1 signal → 100 computeds → 100 effects*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 4.33 µs | 4.13 µs | 5.99 µs | 231.15K |
| alien-signals | 3.44 µs | 3.41 µs | 3.77 µs | 290.44K |
| @preact/signals-core | 4.62 µs | 4.50 µs | 5.55 µs | 216.29K |
| @vue/reactivity | 5.95 µs | 5.56 µs | 7.71 µs | 168.09K |
| solid-js | 10.59 µs | 10.55 µs | 10.94 µs | 94.41K |
| s-js | 3.76 µs | 3.71 µs | 4.31 µs | 266.29K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | 34.88 KB | 65.74 MB | 34.06 MB |
| alien-signals | 9.90 KB | 3.34 MB | 9.66 MB |
| @preact/signals-core | -13.84 KB | 3.26 MB | -13.52 MB |
| @vue/reactivity | 6.61 KB | 13.15 MB | 6.46 MB |
| solid-js | 6.59 KB | 9.46 MB | 6.43 MB |
| s-js | -5.54 KB | 2.16 MB | -5.41 MB |

## Workload: `batched-writes-100`

*100 signal writes inside one batch() (or sequential if no batch)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 2.78 µs | 2.67 µs | 4.13 µs | 360.07K |
| alien-signals | 3.32 µs | 3.26 µs | 4.08 µs | 301.35K |
| @preact/signals-core | 4.28 µs | 4.18 µs | 5.39 µs | 233.52K |
| @vue/reactivity | 8.11 µs | 8.03 µs | 8.48 µs | 123.31K |
| solid-js | 6.85 µs | 6.69 µs | 7.82 µs | 145.97K |
| s-js | 2.61 µs | 2.59 µs | 2.82 µs | 383.67K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | -3.26 KB | 0 B | -3.19 MB |
| alien-signals | 770 B | 0 B | 752.42 KB |
| @preact/signals-core | -9.05 KB | 0 B | -8.84 MB |
| @vue/reactivity | 3.53 KB | 0 B | 3.45 MB |
| solid-js | 1.97 KB | 0 B | 1.92 MB |
| s-js | 3.76 KB | 0 B | 3.67 MB |

## Workload: `deep-propagation-100`

*100-deep computed chain: src → c0 → c1 → … → c99 → effect (alien-signals molBench)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 3.40 µs | 3.35 µs | 3.99 µs | 293.76K |
| alien-signals | 2.57 µs | 2.54 µs | 2.95 µs | 388.91K |
| @preact/signals-core | 3.14 µs | 3.13 µs | 3.25 µs | 318.90K |
| @vue/reactivity | 4.82 µs | 4.80 µs | 5.13 µs | 207.42K |
| solid-js | 6.67 µs | 6.55 µs | 7.61 µs | 149.95K |
| s-js | 2.13 µs | 2.10 µs | 2.52 µs | 469.25K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | 1.62 KB | 0 B | 1.58 MB |
| alien-signals | 6.91 KB | 0 B | 6.75 MB |
| @preact/signals-core | -8.81 KB | 0 B | -8.60 MB |
| @vue/reactivity | 3.77 KB | 0 B | 3.68 MB |
| solid-js | 6.37 KB | 0 B | 6.22 MB |
| s-js | -3.22 KB | 0 B | -3.14 MB |

## Workload: `dynamic-deps`

*1 computed reads 5 of 50 signals, set rotates per op (alien-signals kairoBench)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 745.77 ns | 727.86 ns | 1.10 µs | 1.34M |
| alien-signals | 1.35 µs | 1.26 µs | 2.31 µs | 740.84K |
| @preact/signals-core | 937.74 ns | 933.96 ns | 1.17 µs | 1.07M |
| @vue/reactivity | 4.03 µs | 3.98 µs | 4.66 µs | 248.05K |
| solid-js | 1.13 µs | 1.10 µs | 1.60 µs | 885.82K |
| s-js | 626.83 ns | 615.19 ns | 944.58 ns | 1.60M |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | 0 B | 0 B | 0 B |
| alien-signals | 0 B | 0 B | 0 B |
| @preact/signals-core | 0 B | 0 B | 0 B |
| @vue/reactivity | 0 B | 0 B | 0 B |
| solid-js | 0 B | 0 B | 0 B |
| s-js | 0 B | 0 B | 0 B |

## Workload: `creation-1to1000`

*1 signal × 1000 computeds creation cost (solid-js createComputations1to1000)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 87.43 µs | 82.70 µs | 100.60 µs | 11.44K |
| alien-signals | 102.49 µs | 101.27 µs | 106.55 µs | 9.76K |
| @preact/signals-core | 63.38 µs | 63.38 µs | 72.73 µs | 15.78K |
| @vue/reactivity | 91.09 µs | 54.20 µs | 1.29 ms | 10.98K |
| solid-js | 104.63 µs | 71.50 µs | 1.14 ms | 9.56K |
| s-js | 79.33 µs | 50.60 µs | 1.12 ms | 12.60K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | 0 B | 0 B | 0 B |
| alien-signals | 0 B | 0 B | 0 B |
| @preact/signals-core | 0 B | 0 B | 0 B |
| @vue/reactivity | 0 B | 0 B | 0 B |
| solid-js | 0 B | 0 B | 0 B |
| s-js | 0 B | 0 B | 0 B |

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
| @scribe/signals | 4.18 KB | 1.78 KB |
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
      "mean": 486.99754284274195,
      "p50": 475.0244140625,
      "p99": 663.623046875,
      "opsPerSec": 2053398.4507657227,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 33603584,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 701.2832286746003,
      "p50": 683.251953125,
      "p99": 919.580078125,
      "opsPerSec": 1425957.3865611523,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 5177344,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 563.8155072648949,
      "p50": 555.6640625,
      "p99": 691.69921875,
      "opsPerSec": 1773629.8259178149,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 1108.004308629919,
      "p50": 1038.76953125,
      "p99": 1671.142578125,
      "opsPerSec": 902523.5662093501,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 3534848,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 1600.929878853463,
      "p50": 1545.99609375,
      "p99": 2143.701171875,
      "opsPerSec": 624636.9770524674,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 2691072,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 638.6640599165013,
      "p50": 632.177734375,
      "p99": 737.7197265625,
      "opsPerSec": 1565768.3949379267,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 2502656,
        "disposeResidual": 0
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@scribe/signals",
      "mean": 4326.156850961538,
      "p50": 4128.2958984375,
      "p99": 5988.9892578125,
      "opsPerSec": 231152.04428562004,
      "memory": {
        "buildHeapDelta": 35713.945,
        "peakMalloc": 68935680,
        "disposeResidual": 35713945
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 3443.0682281949626,
      "p50": 3414.74609375,
      "p99": 3768.5302734375,
      "opsPerSec": 290438.6244254743,
      "memory": {
        "buildHeapDelta": 10132.908,
        "peakMalloc": 3502080,
        "disposeResidual": 10132908
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 4623.5117386798465,
      "p50": 4500.927734375,
      "p99": 5553.271484375,
      "opsPerSec": 216285.81401320946,
      "memory": {
        "buildHeapDelta": -14177.008,
        "peakMalloc": 3416064,
        "disposeResidual": -14177008
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 5949.329603040541,
      "p50": 5562.6708984375,
      "p99": 7706.8115234375,
      "opsPerSec": 168086.16545449544,
      "memory": {
        "buildHeapDelta": 6768.734,
        "peakMalloc": 13787136,
        "disposeResidual": 6768734
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 10592.118112664473,
      "p50": 10547.802734375,
      "p99": 10940.576171875,
      "opsPerSec": 94409.8233576483,
      "memory": {
        "buildHeapDelta": 6744.392,
        "peakMalloc": 9924608,
        "disposeResidual": 6744392
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 3755.320264472336,
      "p50": 3714.5751953125,
      "p99": 4305.322265625,
      "opsPerSec": 266288.87273893034,
      "memory": {
        "buildHeapDelta": -5675.117,
        "peakMalloc": 2269184,
        "disposeResidual": -5675117
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@scribe/signals",
      "mean": 2777.2440347326806,
      "p50": 2670.361328125,
      "p99": 4128.466796875,
      "opsPerSec": 360069.18639263674,
      "memory": {
        "buildHeapDelta": -3341.453,
        "peakMalloc": 0,
        "disposeResidual": -3341453
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 3318.355887276786,
      "p50": 3261.23046875,
      "p99": 4078.515625,
      "opsPerSec": 301354.0542273335,
      "memory": {
        "buildHeapDelta": 770.478,
        "peakMalloc": 0,
        "disposeResidual": 770478
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 4282.283682193396,
      "p50": 4180.908203125,
      "p99": 5394.3359375,
      "opsPerSec": 233520.26026631604,
      "memory": {
        "buildHeapDelta": -9267.858,
        "peakMalloc": 0,
        "disposeResidual": -9267858
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 8109.366548978365,
      "p50": 8029.8583984375,
      "p99": 8481.396484375,
      "opsPerSec": 123314.19401999803,
      "memory": {
        "buildHeapDelta": 3613.694,
        "peakMalloc": 0,
        "disposeResidual": 3613694
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 6850.644683837891,
      "p50": 6693.5546875,
      "p99": 7822.5830078125,
      "opsPerSec": 145971.66342011723,
      "memory": {
        "buildHeapDelta": 2012.934,
        "peakMalloc": 0,
        "disposeResidual": 2012934
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 2606.4293077256943,
      "p50": 2592.2607421875,
      "p99": 2821.8994140625,
      "opsPerSec": 383666.6496328555,
      "memory": {
        "buildHeapDelta": 3852.889,
        "peakMalloc": 0,
        "disposeResidual": 3852889
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@scribe/signals",
      "mean": 3404.0911506204043,
      "p50": 3347.36328125,
      "p99": 3989.990234375,
      "opsPerSec": 293764.1666315978,
      "memory": {
        "buildHeapDelta": 1660.492,
        "peakMalloc": 0,
        "disposeResidual": 1660492
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "alien-signals",
      "mean": 2571.305427970467,
      "p50": 2538.720703125,
      "p99": 2951.220703125,
      "opsPerSec": 388907.51332847326,
      "memory": {
        "buildHeapDelta": 7074.295,
        "peakMalloc": 0,
        "disposeResidual": 7074295
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@preact/signals-core",
      "mean": 3135.8061919341217,
      "p50": 3132.1533203125,
      "p99": 3245.1904296875,
      "opsPerSec": 318897.25920313137,
      "memory": {
        "buildHeapDelta": -9022.226,
        "peakMalloc": 0,
        "disposeResidual": -9022226
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@vue/reactivity",
      "mean": 4821.228287067819,
      "p50": 4803.515625,
      "p99": 5131.494140625,
      "opsPerSec": 207416.02356443927,
      "memory": {
        "buildHeapDelta": 3863.15,
        "peakMalloc": 0,
        "disposeResidual": 3863150
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "solid-js",
      "mean": 6668.669359611742,
      "p50": 6550.048828125,
      "p99": 7613.134765625,
      "opsPerSec": 149954.95294104988,
      "memory": {
        "buildHeapDelta": 6522.593,
        "peakMalloc": 0,
        "disposeResidual": 6522593
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "s-js",
      "mean": 2131.0725031672296,
      "p50": 2096.533203125,
      "p99": 2523.4130859375,
      "opsPerSec": 469247.2914524429,
      "memory": {
        "buildHeapDelta": -3294.711,
        "peakMalloc": 0,
        "disposeResidual": -3294711
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@scribe/signals",
      "mean": 745.7652561435758,
      "p50": 727.8564453125,
      "p99": 1098.046875,
      "opsPerSec": 1340904.5162161302,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "alien-signals",
      "mean": 1349.8236607142858,
      "p50": 1257.3486328125,
      "p99": 2311.8408203125,
      "opsPerSec": 740837.5101906499,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@preact/signals-core",
      "mean": 937.7378463745117,
      "p50": 933.9599609375,
      "p99": 1165.7958984375,
      "opsPerSec": 1066396.1189859263,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@vue/reactivity",
      "mean": 4031.46758497807,
      "p50": 3978.3935546875,
      "p99": 4663.0615234375,
      "opsPerSec": 248048.62718633012,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "solid-js",
      "mean": 1128.900837448408,
      "p50": 1099.951171875,
      "p99": 1604.1748046875,
      "opsPerSec": 885817.3958487306,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "s-js",
      "mean": 626.8328936688312,
      "p50": 615.185546875,
      "p99": 944.580078125,
      "opsPerSec": 1595321.5124800403,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@scribe/signals",
      "mean": 87429.28670247395,
      "p50": 82698.583984375,
      "p99": 100598.0224609375,
      "opsPerSec": 11437.814921252279,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "alien-signals",
      "mean": 102490.66162109375,
      "p50": 101266.89453125,
      "p99": 106552.294921875,
      "opsPerSec": 9756.986482309805,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@preact/signals-core",
      "mean": 63375.28076171875,
      "p50": 63376.904296875,
      "p99": 72727.392578125,
      "opsPerSec": 15779.022798492133,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@vue/reactivity",
      "mean": 91092.24777787959,
      "p50": 54200,
      "p99": 1287100,
      "opsPerSec": 10977.882579409083,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "solid-js",
      "mean": 104632.40429112327,
      "p50": 71500,
      "p99": 1144900,
      "opsPerSec": 9557.26867575036,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "s-js",
      "mean": 79333.66028708134,
      "p50": 50600,
      "p99": 1121800,
      "opsPerSec": 12604.990068293113,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    }
  ]
}
```
<!-- bench-data:end -->
