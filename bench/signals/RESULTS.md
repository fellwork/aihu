# `@aihu/signals` Bench Results

**Generated:** 2026-05-08
**Runner:** mitata 1.0.34 + memory.ts (--expose-gc) · Bun 1.3.8 · Node 24.3.0
**Track:** A — vanilla aihu vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/signals | 433.72 ns | 428.66 ns | 518.87 ns | 2.31M |
| alien-signals | 694.46 ns | 679.49 ns | 888.57 ns | 1.44M |
| @preact/signals-core | 572.39 ns | 558.47 ns | 762.23 ns | 1.75M |
| @vue/reactivity | 957.90 ns | 905.74 ns | 1.24 µs | 1.04M |
| solid-js | 1.52 µs | 1.48 µs | 1.77 µs | 659.47K |
| s-js | 632.97 ns | 627.00 ns | 738.99 ns | 1.58M |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | 0 B | 32.05 MB | 0 B |
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
| @aihu/signals | 2.81 µs | 2.77 µs | 3.12 µs | 355.46K |
| alien-signals | 3.04 µs | 3.02 µs | 3.25 µs | 329.38K |
| @preact/signals-core | 4.47 µs | 4.46 µs | 4.69 µs | 223.66K |
| @vue/reactivity | 5.30 µs | 5.31 µs | 5.47 µs | 188.57K |
| solid-js | 9.91 µs | 9.89 µs | 10.09 µs | 100.88K |
| s-js | 3.66 µs | 3.65 µs | 3.83 µs | 273.08K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | 34.88 KB | 65.74 MB | 34.06 MB |
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
| @aihu/signals | 2.53 µs | 2.52 µs | 2.88 µs | 395.40K |
| alien-signals | 3.78 µs | 3.76 µs | 4.02 µs | 264.63K |
| @preact/signals-core | 3.99 µs | 3.98 µs | 4.25 µs | 250.44K |
| @vue/reactivity | 7.56 µs | 7.58 µs | 7.77 µs | 132.30K |
| solid-js | 6.46 µs | 6.43 µs | 6.69 µs | 154.80K |
| s-js | 2.64 µs | 2.61 µs | 2.87 µs | 378.90K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | -3.26 KB | 0 B | -3.19 MB |
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
| @aihu/signals | 2.72 µs | 2.71 µs | 2.87 µs | 367.21K |
| alien-signals | 2.17 µs | 2.16 µs | 2.30 µs | 461.02K |
| @preact/signals-core | 3.08 µs | 3.08 µs | 3.25 µs | 324.55K |
| @vue/reactivity | 4.55 µs | 4.53 µs | 4.70 µs | 219.87K |
| solid-js | 6.39 µs | 6.36 µs | 6.68 µs | 156.50K |
| s-js | 2.04 µs | 2.03 µs | 2.15 µs | 490.29K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | 1.62 KB | 0 B | 1.58 MB |
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
| @aihu/signals | 559.23 ns | 548.29 ns | 704.98 ns | 1.79M |
| alien-signals | 1.32 µs | 1.24 µs | 2.12 µs | 759.01K |
| @preact/signals-core | 873.79 ns | 866.94 ns | 1.20 µs | 1.14M |
| @vue/reactivity | 3.72 µs | 3.72 µs | 3.91 µs | 268.80K |
| solid-js | 1.03 µs | 1.02 µs | 1.22 µs | 966.53K |
| s-js | 627.12 ns | 623.49 ns | 724.37 ns | 1.59M |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | 0 B | 0 B | 0 B |
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
| @aihu/signals | 69.56 µs | 68.73 µs | 71.62 µs | 14.38K |
| alien-signals | 88.90 µs | 87.86 µs | 91.23 µs | 11.25K |
| @preact/signals-core | 53.47 µs | 53.05 µs | 55.59 µs | 18.70K |
| @vue/reactivity | 79.85 µs | 78.93 µs | 82.15 µs | 12.52K |
| solid-js | 91.29 µs | 66.90 µs | 981.70 µs | 10.95K |
| s-js | 66.17 µs | 66.39 µs | 67.64 µs | 15.11K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @aihu/signals | 0 B | 0 B | 0 B |
| alien-signals | 0 B | 0 B | 0 B |
| @preact/signals-core | 0 B | 0 B | 0 B |
| @vue/reactivity | 0 B | 0 B | 0 B |
| solid-js | 0 B | 0 B | 0 B |
| s-js | 0 B | 0 B | 0 B |

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
| @aihu/signals | 3.95 KB | 1.68 KB |
| alien-signals | 7.28 KB | 1.58 KB |
| @preact/signals-core | 5.31 KB | 1.95 KB |
| @vue/reactivity | 19.19 KB | 7.27 KB |
| solid-js (reactive only) | 50.14 KB | 12.27 KB |
| s-js | 13.93 KB | 3.42 KB |

<!-- bench-data:start -->
```json
{
  "date": "2026-05-08",
  "cells": [
    {
      "workload": "cellx",
      "competitor": "@aihu/signals",
      "mean": 433.7183579749104,
      "p50": 428.662109375,
      "p99": 518.8720703125,
      "opsPerSec": 2305643.700831883,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 33603584,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 694.462651409402,
      "p50": 679.4921875,
      "p99": 888.57421875,
      "opsPerSec": 1439962.2470272726,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 5177344,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 572.3909350933056,
      "p50": 558.4716796875,
      "p99": 762.2314453125,
      "opsPerSec": 1747057.7164835597,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 957.9013671875,
      "p50": 905.7373046875,
      "p99": 1237.6953125,
      "opsPerSec": 1043948.8179624444,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 3534848,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 1516.3799698945063,
      "p50": 1482.1533203125,
      "p99": 1771.4599609375,
      "opsPerSec": 659465.3186229896,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 2691072,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 632.9704544988517,
      "p50": 627.001953125,
      "p99": 738.9892578125,
      "opsPerSec": 1579852.5711468481,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 2502656,
        "disposeResidual": 0
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@aihu/signals",
      "mean": 2813.2435993975905,
      "p50": 2771.5087890625,
      "p99": 3116.0888671875,
      "opsPerSec": 355461.5747509862,
      "memory": {
        "buildHeapDelta": 35713.945,
        "peakMalloc": 68935680,
        "disposeResidual": 35713945
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 3035.9844257305194,
      "p50": 3019.384765625,
      "p99": 3253.80859375,
      "opsPerSec": 329382.45385082293,
      "memory": {
        "buildHeapDelta": 10132.908,
        "peakMalloc": 3502080,
        "disposeResidual": 10132908
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 4471.1420994178925,
      "p50": 4461.279296875,
      "p99": 4686.962890625,
      "opsPerSec": 223656.50157488667,
      "memory": {
        "buildHeapDelta": -14177.008,
        "peakMalloc": 3416064,
        "disposeResidual": -14177008
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 5303.197674418605,
      "p50": 5312.2802734375,
      "p99": 5472.6318359375,
      "opsPerSec": 188565.4771693252,
      "memory": {
        "buildHeapDelta": 6768.734,
        "peakMalloc": 13787136,
        "disposeResidual": 6768734
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 9912.611607142857,
      "p50": 9886.03515625,
      "p99": 10087.6220703125,
      "opsPerSec": 100881.58798428229,
      "memory": {
        "buildHeapDelta": 6744.392,
        "peakMalloc": 9924608,
        "disposeResidual": 6744392
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 3661.9210379464284,
      "p50": 3647.314453125,
      "p99": 3830.6640625,
      "opsPerSec": 273080.71081750875,
      "memory": {
        "buildHeapDelta": -5675.117,
        "peakMalloc": 2269184,
        "disposeResidual": -5675117
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@aihu/signals",
      "mean": 2529.071575662364,
      "p50": 2520.6787109375,
      "p99": 2875.68359375,
      "opsPerSec": 395402.01614819857,
      "memory": {
        "buildHeapDelta": -3341.453,
        "peakMalloc": 0,
        "disposeResidual": -3341453
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 3778.89624423668,
      "p50": 3763.96484375,
      "p99": 4023.095703125,
      "opsPerSec": 264627.53549403034,
      "memory": {
        "buildHeapDelta": 770.478,
        "peakMalloc": 0,
        "disposeResidual": 770478
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 3993.0107250548244,
      "p50": 3977.2705078125,
      "p99": 4249.0966796875,
      "opsPerSec": 250437.59430079415,
      "memory": {
        "buildHeapDelta": -9267.858,
        "peakMalloc": 0,
        "disposeResidual": -9267858
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 7558.729290140086,
      "p50": 7579.4677734375,
      "p99": 7768.8720703125,
      "opsPerSec": 132297.3692554965,
      "memory": {
        "buildHeapDelta": 3613.694,
        "peakMalloc": 0,
        "disposeResidual": 3613694
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 6459.959501378677,
      "p50": 6427.6611328125,
      "p99": 6689.94140625,
      "opsPerSec": 154799.73207054645,
      "memory": {
        "buildHeapDelta": 2012.934,
        "peakMalloc": 0,
        "disposeResidual": 2012934
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 2639.240256320225,
      "p50": 2610.05859375,
      "p99": 2873.046875,
      "opsPerSec": 378896.9183859962,
      "memory": {
        "buildHeapDelta": 3852.889,
        "peakMalloc": 0,
        "disposeResidual": 3852889
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@aihu/signals",
      "mean": 2723.2694404069766,
      "p50": 2712.8173828125,
      "p99": 2867.6513671875,
      "opsPerSec": 367205.6775441786,
      "memory": {
        "buildHeapDelta": 1660.492,
        "peakMalloc": 0,
        "disposeResidual": 1660492
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "alien-signals",
      "mean": 2169.101428110665,
      "p50": 2157.5439453125,
      "p99": 2302.7099609375,
      "opsPerSec": 461020.3962988591,
      "memory": {
        "buildHeapDelta": 7074.295,
        "peakMalloc": 0,
        "disposeResidual": 7074295
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@preact/signals-core",
      "mean": 3081.198601973684,
      "p50": 3075.0244140625,
      "p99": 3250.7080078125,
      "opsPerSec": 324549.0243178232,
      "memory": {
        "buildHeapDelta": -9022.226,
        "peakMalloc": 0,
        "disposeResidual": -9022226
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@vue/reactivity",
      "mean": 4548.158203125,
      "p50": 4533.740234375,
      "p99": 4699.31640625,
      "opsPerSec": 219869.22075685684,
      "memory": {
        "buildHeapDelta": 3863.15,
        "peakMalloc": 0,
        "disposeResidual": 3863150
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "solid-js",
      "mean": 6389.796316964285,
      "p50": 6362.5,
      "p99": 6678.02734375,
      "opsPerSec": 156499.51115735844,
      "memory": {
        "buildHeapDelta": 6522.593,
        "peakMalloc": 0,
        "disposeResidual": 6522593
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "s-js",
      "mean": 2039.5964523841594,
      "p50": 2028.8330078125,
      "p99": 2148.8037109375,
      "opsPerSec": 490293.06695991906,
      "memory": {
        "buildHeapDelta": -3294.711,
        "peakMalloc": 0,
        "disposeResidual": -3294711
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@aihu/signals",
      "mean": 559.2256334092882,
      "p50": 548.291015625,
      "p99": 704.98046875,
      "opsPerSec": 1788186.986178647,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "alien-signals",
      "mean": 1317.5135633680557,
      "p50": 1241.6015625,
      "p99": 2120.9716796875,
      "opsPerSec": 759005.468940773,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@preact/signals-core",
      "mean": 873.7877002660779,
      "p50": 866.943359375,
      "p99": 1196.4599609375,
      "opsPerSec": 1144442.7515922794,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@vue/reactivity",
      "mean": 3720.2298072076615,
      "p50": 3722.607421875,
      "p99": 3909.08203125,
      "opsPerSec": 268800.59884004376,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "solid-js",
      "mean": 1034.6334523168102,
      "p50": 1022.607421875,
      "p99": 1217.28515625,
      "opsPerSec": 966525.8722891116,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "s-js",
      "mean": 627.1186967329545,
      "p50": 623.486328125,
      "p99": 724.365234375,
      "opsPerSec": 1594594.4606812277,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@aihu/signals",
      "mean": 69560.88053385417,
      "p50": 68726.1474609375,
      "p99": 71619.2626953125,
      "opsPerSec": 14375.896226806904,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "alien-signals",
      "mean": 88897.1211751302,
      "p50": 87863.8916015625,
      "p99": 91225.9521484375,
      "opsPerSec": 11248.958197757243,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@preact/signals-core",
      "mean": 53465.22013346354,
      "p50": 53053.564453125,
      "p99": 55589.1845703125,
      "opsPerSec": 18703.74792255099,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@vue/reactivity",
      "mean": 79847.90649414062,
      "p50": 78929.9072265625,
      "p99": 82148.4375,
      "opsPerSec": 12523.80987688615,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "solid-js",
      "mean": 91290.55305879116,
      "p50": 66900,
      "p99": 981700,
      "opsPerSec": 10954.03594888947,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "s-js",
      "mean": 66166.9453938802,
      "p50": 66391.7724609375,
      "p99": 67640.283203125,
      "opsPerSec": 15113.286461195627,
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
