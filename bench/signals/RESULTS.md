# `@aihu/signals` Bench Results

**Generated:** 2026-05-02
**Runner:** mitata 1.0.34 + memory.ts (--expose-gc) · Bun 1.3.8 · Node 24.3.0
**Track:** A — vanilla aihu vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/signals | 428.09 ns | 415.89 ns | 583.57 ns | 2.34M |
| alien-signals | 729.49 ns | 716.09 ns | 928.10 ns | 1.37M |
| @preact/signals-core | 582.76 ns | 572.12 ns | 803.05 ns | 1.72M |
| @vue/reactivity | 1.00 µs | 954.10 ns | 1.25 µs | 995.57K |
| solid-js | 1.57 µs | 1.52 µs | 1.84 µs | 635.76K |
| s-js | 658.67 ns | 653.78 ns | 736.01 ns | 1.52M |

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
| @aihu/signals | 3.18 µs | 3.13 µs | 3.69 µs | 314.73K |
| alien-signals | 3.05 µs | 3.02 µs | 3.28 µs | 328.13K |
| @preact/signals-core | 4.84 µs | 4.80 µs | 5.29 µs | 206.61K |
| @vue/reactivity | 5.70 µs | 5.67 µs | 5.86 µs | 175.59K |
| solid-js | 10.44 µs | 10.39 µs | 10.75 µs | 95.80K |
| s-js | 4.02 µs | 4.01 µs | 4.14 µs | 248.82K |

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
| @aihu/signals | 2.70 µs | 2.69 µs | 2.98 µs | 370.77K |
| alien-signals | 3.68 µs | 3.64 µs | 4.04 µs | 271.71K |
| @preact/signals-core | 4.51 µs | 4.47 µs | 4.85 µs | 221.93K |
| @vue/reactivity | 8.36 µs | 8.34 µs | 8.57 µs | 119.62K |
| solid-js | 6.76 µs | 6.76 µs | 6.89 µs | 148.00K |
| s-js | 2.68 µs | 2.66 µs | 2.88 µs | 373.32K |

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
| @aihu/signals | 2.91 µs | 2.88 µs | 3.23 µs | 343.51K |
| alien-signals | 2.27 µs | 2.25 µs | 2.41 µs | 440.92K |
| @preact/signals-core | 3.46 µs | 3.48 µs | 3.61 µs | 289.18K |
| @vue/reactivity | 4.87 µs | 4.86 µs | 5.09 µs | 205.42K |
| solid-js | 6.94 µs | 6.89 µs | 7.21 µs | 144.05K |
| s-js | 2.64 µs | 2.63 µs | 2.78 µs | 378.78K |

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
| @aihu/signals | 595.55 ns | 585.94 ns | 780.10 ns | 1.68M |
| alien-signals | 1.41 µs | 1.35 µs | 2.09 µs | 707.16K |
| @preact/signals-core | 947.46 ns | 952.44 ns | 1.15 µs | 1.06M |
| @vue/reactivity | 3.95 µs | 3.93 µs | 4.27 µs | 252.93K |
| solid-js | 1.10 µs | 1.10 µs | 1.28 µs | 909.25K |
| s-js | 655.95 ns | 649.54 ns | 775.59 ns | 1.52M |

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
| @aihu/signals | 88.06 µs | 87.63 µs | 91.09 µs | 11.36K |
| alien-signals | 97.08 µs | 96.43 µs | 98.90 µs | 10.30K |
| @preact/signals-core | 57.95 µs | 57.70 µs | 60.14 µs | 17.26K |
| @vue/reactivity | 90.60 µs | 89.86 µs | 95.20 µs | 11.04K |
| solid-js | 100.15 µs | 72.50 µs | 1.09 ms | 9.99K |
| s-js | 72.21 µs | 72.16 µs | 73.48 µs | 13.85K |

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
| @aihu/signals | 4.68 KB | 1.82 KB |
| alien-signals | 7.28 KB | 1.58 KB |
| @preact/signals-core | 5.31 KB | 1.95 KB |
| @vue/reactivity | 19.19 KB | 7.27 KB |
| solid-js (reactive only) | 50.14 KB | 12.27 KB |
| s-js | 13.93 KB | 3.42 KB |

<!-- bench-data:start -->
```json
{
  "date": "2026-05-02",
  "cells": [
    {
      "workload": "cellx",
      "competitor": "@aihu/signals",
      "mean": 428.08961041205754,
      "p50": 415.8935546875,
      "p99": 583.5693359375,
      "opsPerSec": 2335959.5180024346
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 729.4876006155303,
      "p50": 716.0888671875,
      "p99": 928.1005859375,
      "opsPerSec": 1370825.2191760568
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 582.7554159118357,
      "p50": 572.119140625,
      "p99": 803.0517578125,
      "opsPerSec": 1715985.7681207524
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 1004.4510528820904,
      "p50": 954.1015625,
      "p99": 1250.78125,
      "opsPerSec": 995568.6711967508
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 1572.9154271005796,
      "p50": 1520.7275390625,
      "p99": 1835.3759765625,
      "opsPerSec": 635762.0904280541
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 658.6733958760246,
      "p50": 653.7841796875,
      "p99": 736.0107421875,
      "opsPerSec": 1518203.1128948464
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@aihu/signals",
      "mean": 3177.3230147688355,
      "p50": 3128.7109375,
      "p99": 3688.37890625,
      "opsPerSec": 314730.3548779269
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 3047.55859375,
      "p50": 3019.482421875,
      "p99": 3277.24609375,
      "opsPerSec": 328131.5089563239
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 4840.031632133152,
      "p50": 4795.361328125,
      "p99": 5291.2841796875,
      "opsPerSec": 206610.21993347365
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 5695.159755608975,
      "p50": 5673.1201171875,
      "p99": 5863.8671875,
      "opsPerSec": 175587.69953997043
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 10438.3837890625,
      "p50": 10387.646484375,
      "p99": 10745.556640625,
      "opsPerSec": 95800.27140291732
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 4018.9037657620615,
      "p50": 4009.7900390625,
      "p99": 4139.4775390625,
      "opsPerSec": 248824.0720067057
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@aihu/signals",
      "mean": 2697.0680414244184,
      "p50": 2693.5302734375,
      "p99": 2983.5205078125,
      "opsPerSec": 370772.99669157184
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 3680.4388230846776,
      "p50": 3637.3291015625,
      "p99": 4043.06640625,
      "opsPerSec": 271706.7306560668
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 4505.84619140625,
      "p50": 4468.8720703125,
      "p99": 4845.3369140625,
      "opsPerSec": 221933.89599211008
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 8359.988168569711,
      "p50": 8344.3603515625,
      "p99": 8569.873046875,
      "opsPerSec": 119617.3941680455
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 6756.842803955078,
      "p50": 6760.0341796875,
      "p99": 6894.0673828125,
      "opsPerSec": 147998.1152461703
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 2678.657619432471,
      "p50": 2661.1083984375,
      "p99": 2884.2041015625,
      "opsPerSec": 373321.3206292003
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@aihu/signals",
      "mean": 2911.0897827148438,
      "p50": 2878.9794921875,
      "p99": 3227.1240234375,
      "opsPerSec": 343513.96715336386
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "alien-signals",
      "mean": 2267.9755577674277,
      "p50": 2246.435546875,
      "p99": 2413.2568359375,
      "opsPerSec": 440921.8593979866
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@preact/signals-core",
      "mean": 3458.1043755830224,
      "p50": 3480.517578125,
      "p99": 3609.130859375,
      "opsPerSec": 289175.77128695085
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@vue/reactivity",
      "mean": 4868.121987200798,
      "p50": 4864.208984375,
      "p99": 5091.1865234375,
      "opsPerSec": 205418.02416397675
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "solid-js",
      "mean": 6941.872406005859,
      "p50": 6893.994140625,
      "p99": 7209.0087890625,
      "opsPerSec": 144053.35354980535
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "s-js",
      "mean": 2640.03631934691,
      "p50": 2633.3251953125,
      "p99": 2779.78515625,
      "opsPerSec": 378782.66775033576
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@aihu/signals",
      "mean": 595.5468990532636,
      "p50": 585.9375,
      "p99": 780.1025390625,
      "opsPerSec": 1679128.884038675
    },
    {
      "workload": "dynamic-deps",
      "competitor": "alien-signals",
      "mean": 1414.1028994605654,
      "p50": 1349.3408203125,
      "p99": 2087.7197265625,
      "opsPerSec": 707162.1169728651
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@preact/signals-core",
      "mean": 947.4557471087599,
      "p50": 952.44140625,
      "p99": 1148.4375,
      "opsPerSec": 1055458.2660473413
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@vue/reactivity",
      "mean": 3953.6339069234914,
      "p50": 3926.2939453125,
      "p99": 4268.4814453125,
      "opsPerSec": 252931.8656056719
    },
    {
      "workload": "dynamic-deps",
      "competitor": "solid-js",
      "mean": 1099.804351526663,
      "p50": 1096.3623046875,
      "p99": 1276.5625,
      "opsPerSec": 909252.6308082686
    },
    {
      "workload": "dynamic-deps",
      "competitor": "s-js",
      "mean": 655.9508613918139,
      "p50": 649.5361328125,
      "p99": 775.5859375,
      "opsPerSec": 1524504.4390644957
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@aihu/signals",
      "mean": 88055.36702473958,
      "p50": 87627.490234375,
      "p99": 91086.6455078125,
      "opsPerSec": 11356.49119171856
    },
    {
      "workload": "creation-1to1000",
      "competitor": "alien-signals",
      "mean": 97079.48404947917,
      "p50": 96434.0087890625,
      "p99": 98901.66015625,
      "opsPerSec": 10300.837605300036
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@preact/signals-core",
      "mean": 57948.75691731771,
      "p50": 57697.900390625,
      "p99": 60135.986328125,
      "opsPerSec": 17256.625563630594
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@vue/reactivity",
      "mean": 90596.17309570312,
      "p50": 89856.201171875,
      "p99": 95199.8779296875,
      "opsPerSec": 11037.993833841409
    },
    {
      "workload": "creation-1to1000",
      "competitor": "solid-js",
      "mean": 100146.229739253,
      "p50": 72500,
      "p99": 1088500,
      "opsPerSec": 9985.398377988495
    },
    {
      "workload": "creation-1to1000",
      "competitor": "s-js",
      "mean": 72207.3954264323,
      "p50": 72162.255859375,
      "p99": 73482.763671875,
      "opsPerSec": 13848.996963459773
    }
  ]
}
```
<!-- bench-data:end -->
