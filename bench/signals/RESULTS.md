# `@scribe/signals` Bench Results

**Generated:** 2026-04-30
**Runner:** mitata 1.0.34 + memory.ts (--expose-gc) · Bun 1.3.8 · Node 24.3.0
**Track:** A — vanilla scribe vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 515.58 ns | 506.05 ns | 702.15 ns | 1.94M |
| alien-signals | 688.48 ns | 674.78 ns | 897.27 ns | 1.45M |
| @preact/signals-core | 581.88 ns | 574.76 ns | 722.24 ns | 1.72M |
| @vue/reactivity | 972.18 ns | 933.98 ns | 1.17 µs | 1.03M |
| solid-js | 1.54 µs | 1.49 µs | 1.81 µs | 649.06K |
| s-js | 623.06 ns | 620.41 ns | 699.68 ns | 1.60M |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | 0 B | 34.11 MB | 0 B |
| alien-signals | 0 B | 6.64 MB | 0 B |
| @preact/signals-core | 0 B | 1.70 MB | 0 B |
| @vue/reactivity | 0 B | 2.15 MB | 0 B |
| solid-js | 0 B | 1.60 MB | 0 B |
| s-js | 0 B | 3.38 MB | 0 B |

## Workload: `wide-fanout-100`

*1 signal → 100 computeds → 100 effects*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 4.69 µs | 4.68 µs | 5.30 µs | 213.24K |
| alien-signals | 3.30 µs | 3.29 µs | 3.43 µs | 303.19K |
| @preact/signals-core | 4.32 µs | 4.32 µs | 4.50 µs | 231.41K |
| @vue/reactivity | 5.29 µs | 5.28 µs | 5.52 µs | 188.89K |
| solid-js | 9.96 µs | 9.96 µs | 10.07 µs | 100.39K |
| s-js | 3.59 µs | 3.58 µs | 3.74 µs | 278.57K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | 38.82 KB | 68.13 MB | 37.91 MB |
| alien-signals | 5.77 KB | 1.05 MB | 5.63 MB |
| @preact/signals-core | -11.17 KB | 68.00 KB | -10.91 MB |
| @vue/reactivity | 825 B | 13.73 MB | 805.67 KB |
| solid-js | 10.62 KB | 3.22 MB | 10.37 MB |
| s-js | -4.55 KB | 0 B | -4.44 MB |

## Workload: `batched-writes-100`

*100 signal writes inside one batch() (or sequential if no batch)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 2.61 µs | 2.60 µs | 2.97 µs | 382.90K |
| alien-signals | 3.60 µs | 3.54 µs | 4.03 µs | 277.53K |
| @preact/signals-core | 3.99 µs | 3.99 µs | 4.20 µs | 250.53K |
| @vue/reactivity | 7.95 µs | 7.94 µs | 8.05 µs | 125.73K |
| solid-js | 6.34 µs | 6.31 µs | 6.72 µs | 157.75K |
| s-js | 2.58 µs | 2.56 µs | 2.73 µs | 387.99K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | -3.11 KB | 0 B | -3.04 MB |
| alien-signals | 496 B | 0 B | 484.34 KB |
| @preact/signals-core | -6.49 KB | 0 B | -6.34 MB |
| @vue/reactivity | 1.95 KB | 0 B | 1.90 MB |
| solid-js | 4.22 KB | 0 B | 4.12 MB |
| s-js | -1.12 KB | 0 B | -1.09 MB |

## Workload: `deep-propagation-100`

*100-deep computed chain: src → c0 → c1 → … → c99 → effect (alien-signals molBench)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 4.04 µs | 4.00 µs | 4.52 µs | 247.64K |
| alien-signals | 2.44 µs | 2.42 µs | 2.65 µs | 410.59K |
| @preact/signals-core | 3.13 µs | 3.13 µs | 3.27 µs | 319.03K |
| @vue/reactivity | 4.72 µs | 4.71 µs | 4.89 µs | 211.92K |
| solid-js | 6.11 µs | 6.09 µs | 6.29 µs | 163.76K |
| s-js | 2.00 µs | 2.00 µs | 2.08 µs | 500.04K |

### Memory

| Competitor | build/graph | peak-malloc | dispose-residual |
| --- | ---: | ---: | ---: |
| @scribe/signals | 9.17 KB | 0 B | 8.96 MB |
| alien-signals | -577 B | 0 B | -563.01 KB |
| @preact/signals-core | -10.41 KB | 0 B | -10.17 MB |
| @vue/reactivity | 3.87 KB | 0 B | 3.78 MB |
| solid-js | 7.67 KB | 0 B | 7.49 MB |
| s-js | -7.46 KB | 0 B | -7.29 MB |

## Workload: `dynamic-deps`

*1 computed reads 5 of 50 signals, set rotates per op (alien-signals kairoBench)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @scribe/signals | 743.89 ns | 741.87 ns | 928.61 ns | 1.34M |
| alien-signals | 1.28 µs | 1.21 µs | 2.16 µs | 779.31K |
| @preact/signals-core | 847.16 ns | 848.14 ns | 1.03 µs | 1.18M |
| @vue/reactivity | 3.70 µs | 3.65 µs | 3.93 µs | 270.31K |
| solid-js | 1.00 µs | 1.00 µs | 1.13 µs | 995.77K |
| s-js | 643.97 ns | 641.11 ns | 724.51 ns | 1.55M |

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
| @scribe/signals | 69.48 µs | 69.27 µs | 70.74 µs | 14.39K |
| alien-signals | 91.55 µs | 91.13 µs | 94.48 µs | 10.92K |
| @preact/signals-core | 53.63 µs | 54.13 µs | 55.70 µs | 18.65K |
| @vue/reactivity | 81.59 µs | 81.48 µs | 83.90 µs | 12.26K |
| solid-js | 93.98 µs | 66.80 µs | 1.03 ms | 10.64K |
| s-js | 68.90 µs | 68.11 µs | 70.45 µs | 14.51K |

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
| @scribe/signals | 4.01 KB | 1.64 KB |
| alien-signals | 7.28 KB | 1.58 KB |
| @preact/signals-core | 5.31 KB | 1.95 KB |
| @vue/reactivity | 19.19 KB | 7.27 KB |
| solid-js (reactive only) | 50.14 KB | 12.27 KB |
| s-js | 13.93 KB | 3.42 KB |

<!-- bench-data:start -->
```json
{
  "date": "2026-04-30",
  "cells": [
    {
      "workload": "cellx",
      "competitor": "@scribe/signals",
      "mean": 515.5832665598291,
      "p50": 506.0546875,
      "p99": 702.1484375,
      "opsPerSec": 1939550.9219536674,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 35762176,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 688.4762834821429,
      "p50": 674.7802734375,
      "p99": 897.265625,
      "opsPerSec": 1452482.8581490812,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 6959104,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 581.8814711972891,
      "p50": 574.755859375,
      "p99": 722.2412109375,
      "opsPerSec": 1718563.0570816821,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 1781760,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 972.1800275177126,
      "p50": 933.984375,
      "p99": 1169.1650390625,
      "opsPerSec": 1028616.0707840509,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 2256896,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 1540.693831905242,
      "p50": 1487.01171875,
      "p99": 1809.814453125,
      "opsPerSec": 649058.2225304212,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 1675264,
        "disposeResidual": 0
      }
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 623.0615108204134,
      "p50": 620.41015625,
      "p99": 699.6826171875,
      "opsPerSec": 1604977.9718911774,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 3547136,
        "disposeResidual": 0
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@scribe/signals",
      "mean": 4689.6474202473955,
      "p50": 4675.5859375,
      "p99": 5295.556640625,
      "opsPerSec": 213235.64660373688,
      "memory": {
        "buildHeapDelta": 39748.385,
        "peakMalloc": 71438336,
        "disposeResidual": 39748385
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 3298.2327706473216,
      "p50": 3290.5029296875,
      "p99": 3432.177734375,
      "opsPerSec": 303192.6699957374,
      "memory": {
        "buildHeapDelta": 5905.908,
        "peakMalloc": 1105920,
        "disposeResidual": 5905908
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 4321.258199439859,
      "p50": 4324.8046875,
      "p99": 4504.4921875,
      "opsPerSec": 231414.08216005805,
      "memory": {
        "buildHeapDelta": -11440.848,
        "peakMalloc": 69632,
        "disposeResidual": -11440848
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 5294.223749069941,
      "p50": 5282.4462890625,
      "p99": 5522.265625,
      "opsPerSec": 188885.1033497922,
      "memory": {
        "buildHeapDelta": 825.006,
        "peakMalloc": 14393344,
        "disposeResidual": 825006
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 9960.777064732143,
      "p50": 9958.6669921875,
      "p99": 10065.478515625,
      "opsPerSec": 100393.7738492987,
      "memory": {
        "buildHeapDelta": 10874.512,
        "peakMalloc": 3379200,
        "disposeResidual": 10874512
      }
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 3589.7403717041016,
      "p50": 3579.1748046875,
      "p99": 3735.2294921875,
      "opsPerSec": 278571.6782980841,
      "memory": {
        "buildHeapDelta": -4654.952,
        "peakMalloc": 0,
        "disposeResidual": -4654952
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@scribe/signals",
      "mean": 2611.6578520014045,
      "p50": 2602.294921875,
      "p99": 2972.65625,
      "opsPerSec": 382898.5482281552,
      "memory": {
        "buildHeapDelta": -3187.661,
        "peakMalloc": 0,
        "disposeResidual": -3187661
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 3603.202438354492,
      "p50": 3541.1376953125,
      "p99": 4031.884765625,
      "opsPerSec": 277530.89567087416,
      "memory": {
        "buildHeapDelta": 495.966,
        "peakMalloc": 0,
        "disposeResidual": 495966
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 3991.6058456688597,
      "p50": 3988.5986328125,
      "p99": 4200.6103515625,
      "opsPerSec": 250525.73792702056,
      "memory": {
        "buildHeapDelta": -6642.826,
        "peakMalloc": 0,
        "disposeResidual": -6642826
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 7953.81763599537,
      "p50": 7941.845703125,
      "p99": 8049.51171875,
      "opsPerSec": 125725.78927060807,
      "memory": {
        "buildHeapDelta": 1994.006,
        "peakMalloc": 0,
        "disposeResidual": 1994006
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 6339.112723214285,
      "p50": 6310.0830078125,
      "p99": 6715.91796875,
      "opsPerSec": 157750.78369216062,
      "memory": {
        "buildHeapDelta": 4325.305,
        "peakMalloc": 0,
        "disposeResidual": 4325305
      }
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 2577.373529790522,
      "p50": 2560.2783203125,
      "p99": 2732.2265625,
      "opsPerSec": 387991.87950117415,
      "memory": {
        "buildHeapDelta": -1143.575,
        "peakMalloc": 0,
        "disposeResidual": -1143575
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@scribe/signals",
      "mean": 4038.0413925438597,
      "p50": 3996.826171875,
      "p99": 4517.2119140625,
      "opsPerSec": 247644.81162735837,
      "memory": {
        "buildHeapDelta": 9391.82,
        "peakMalloc": 0,
        "disposeResidual": 9391820
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "alien-signals",
      "mean": 2435.5244954427085,
      "p50": 2417.236328125,
      "p99": 2653.662109375,
      "opsPerSec": 410589.17776075524,
      "memory": {
        "buildHeapDelta": -576.521,
        "peakMalloc": 0,
        "disposeResidual": -576521
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@preact/signals-core",
      "mean": 3134.5165355785475,
      "p50": 3126.8310546875,
      "p99": 3269.3359375,
      "opsPerSec": 319028.4653628177,
      "memory": {
        "buildHeapDelta": -10661.29,
        "peakMalloc": 0,
        "disposeResidual": -10661290
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@vue/reactivity",
      "mean": 4718.735758463542,
      "p50": 4708.5205078125,
      "p99": 4889.0625,
      "opsPerSec": 211921.1693950856,
      "memory": {
        "buildHeapDelta": 3967.062,
        "peakMalloc": 0,
        "disposeResidual": 3967062
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "solid-js",
      "mean": 6106.416151258681,
      "p50": 6085.2294921875,
      "p99": 6285.1806640625,
      "opsPerSec": 163762.1765745323,
      "memory": {
        "buildHeapDelta": 7858.689,
        "peakMalloc": 0,
        "disposeResidual": 7858689
      }
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "s-js",
      "mean": 1999.8465401785713,
      "p50": 1997.6318359375,
      "p99": 2083.837890625,
      "opsPerSec": 500038.36789932265,
      "memory": {
        "buildHeapDelta": -7643.495,
        "peakMalloc": 0,
        "disposeResidual": -7643495
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@scribe/signals",
      "mean": 743.8942238136574,
      "p50": 741.8701171875,
      "p99": 928.61328125,
      "opsPerSec": 1344277.1404694978,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "alien-signals",
      "mean": 1283.187552787162,
      "p50": 1211.0107421875,
      "p99": 2164.16015625,
      "opsPerSec": 779309.3050411366,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@preact/signals-core",
      "mean": 847.1625529544455,
      "p50": 848.14453125,
      "p99": 1026.46484375,
      "opsPerSec": 1180411.004372821,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@vue/reactivity",
      "mean": 3699.393586189516,
      "p50": 3654.2724609375,
      "p99": 3928.7109375,
      "opsPerSec": 270314.5736461173,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "solid-js",
      "mean": 1004.249267578125,
      "p50": 1000.0732421875,
      "p99": 1128.466796875,
      "opsPerSec": 995768.7122955313,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "dynamic-deps",
      "competitor": "s-js",
      "mean": 643.9743489583333,
      "p50": 641.11328125,
      "p99": 724.51171875,
      "opsPerSec": 1552856.8826034132,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@scribe/signals",
      "mean": 69480.68033854167,
      "p50": 69271.337890625,
      "p99": 70744.189453125,
      "opsPerSec": 14392.490043671742,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "alien-signals",
      "mean": 91554.32942708333,
      "p50": 91129.0283203125,
      "p99": 94482.9833984375,
      "opsPerSec": 10922.476372856083,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@preact/signals-core",
      "mean": 53633.671061197914,
      "p50": 54132.958984375,
      "p99": 55703.955078125,
      "opsPerSec": 18645.003786128393,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@vue/reactivity",
      "mean": 81593.06030273438,
      "p50": 81482.0556640625,
      "p99": 83899.21875,
      "opsPerSec": 12255.944271359653,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "solid-js",
      "mean": 93981.37625070795,
      "p50": 66800,
      "p99": 1029800,
      "opsPerSec": 10640.406002699574,
      "memory": {
        "buildHeapDelta": 0,
        "peakMalloc": 0,
        "disposeResidual": 0
      }
    },
    {
      "workload": "creation-1to1000",
      "competitor": "s-js",
      "mean": 68899.52596028645,
      "p50": 68105.6640625,
      "p99": 70452.197265625,
      "opsPerSec": 14513.887955867765,
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
