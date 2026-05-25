# `@aihu/signals` Bench Results

**Generated:** 2026-05-25
**Runner:** mitata 1.0.34 + memory.ts (--expose-gc) · Bun 1.3.8 · Node 24.3.0
**Track:** A — vanilla aihu vs. SOTA JS reactivity libs

See `HARNESS.md` for how this is measured and how to add new workloads. See `CHANGELOG.md` for the historical record.

## Workload: `cellx`

*5-deep diamond graph propagation (S.js classic)*

### Time

| Competitor | mean | p50 | p99 | ops/s |
| --- | ---: | ---: | ---: | ---: |
| @aihu/signals | 881.67 ns | 807.33 ns | 1.80 µs | 1.13M |
| alien-signals | 1.25 µs | 1.21 µs | 1.63 µs | 798.01K |
| @preact/signals-core | 1.15 µs | 1.14 µs | 1.28 µs | 866.74K |
| @vue/reactivity | 1.75 µs | 1.69 µs | 2.45 µs | 572.91K |
| solid-js | 3.01 µs | 2.97 µs | 3.36 µs | 332.52K |
| s-js | 1.40 µs | 1.40 µs | 1.54 µs | 712.75K |

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
| @aihu/signals | 5.43 µs | 5.36 µs | 5.61 µs | 184.15K |
| alien-signals | 6.89 µs | 6.88 µs | 6.94 µs | 145.21K |
| @preact/signals-core | 8.75 µs | 8.75 µs | 8.81 µs | 114.27K |
| @vue/reactivity | 9.84 µs | 9.83 µs | 9.90 µs | 101.68K |
| solid-js | 20.37 µs | 20.08 µs | 20.79 µs | 49.08K |
| s-js | 8.82 µs | 8.81 µs | 8.85 µs | 113.42K |

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
| @aihu/signals | 5.10 µs | 5.07 µs | 5.68 µs | 196.00K |
| alien-signals | 8.12 µs | 8.10 µs | 8.32 µs | 123.14K |
| @preact/signals-core | 7.26 µs | 7.20 µs | 7.65 µs | 137.71K |
| @vue/reactivity | 15.45 µs | 15.43 µs | 15.47 µs | 64.73K |
| solid-js | 12.79 µs | 12.80 µs | 12.89 µs | 78.17K |
| s-js | 5.77 µs | 5.75 µs | 5.85 µs | 173.44K |

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
| @aihu/signals | 3.29 µs | 3.25 µs | 3.94 µs | 304.20K |
| alien-signals | 3.99 µs | 3.97 µs | 4.13 µs | 250.92K |
| @preact/signals-core | 3.86 µs | 3.87 µs | 4.00 µs | 259.18K |
| @vue/reactivity | 7.35 µs | 7.34 µs | 7.55 µs | 136.00K |
| solid-js | 11.93 µs | 11.86 µs | 12.07 µs | 83.84K |
| s-js | 4.13 µs | 4.12 µs | 4.22 µs | 242.22K |

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
| @aihu/signals | 1.09 µs | 1.09 µs | 1.23 µs | 917.54K |
| alien-signals | 2.88 µs | 2.78 µs | 4.43 µs | 346.88K |
| @preact/signals-core | 1.78 µs | 1.78 µs | 1.84 µs | 563.27K |
| @vue/reactivity | 7.09 µs | 7.08 µs | 7.20 µs | 141.00K |
| solid-js | 1.94 µs | 1.93 µs | 2.11 µs | 514.76K |
| s-js | 1.33 µs | 1.33 µs | 1.38 µs | 753.23K |

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
| @aihu/signals | 99.69 µs | 69.02 µs | 875.77 µs | 10.03K |
| alien-signals | 125.48 µs | 90.01 µs | 1.01 ms | 7.97K |
| @preact/signals-core | 82.17 µs | 64.53 µs | 663.66 µs | 12.17K |
| @vue/reactivity | 117.00 µs | 92.97 µs | 802.53 µs | 8.55K |
| solid-js | 166.66 µs | 139.98 µs | 842.93 µs | 6.00K |
| s-js | 129.21 µs | 107.53 µs | 724.24 µs | 7.74K |

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
| @aihu/signals | 4.34 KB | 1.72 KB |
| alien-signals | 7.28 KB | 1.53 KB |
| @preact/signals-core | 5.31 KB | 1.87 KB |
| @vue/reactivity | 19.19 KB | 6.99 KB |
| solid-js (reactive only) | 50.14 KB | 11.81 KB |
| s-js | 13.93 KB | 3.34 KB |

<!-- bench-data:start -->
```json
{
  "date": "2026-05-25",
  "cells": [
    {
      "workload": "cellx",
      "competitor": "@aihu/signals",
      "mean": 881.6684353298612,
      "p50": 807.332275390625,
      "p99": 1798.01611328125,
      "opsPerSec": 1134213.2256621697
    },
    {
      "workload": "cellx",
      "competitor": "alien-signals",
      "mean": 1253.1249331825659,
      "p50": 1214.951171875,
      "p99": 1630.65625,
      "opsPerSec": 798005.0300813155
    },
    {
      "workload": "cellx",
      "competitor": "@preact/signals-core",
      "mean": 1153.750894787242,
      "p50": 1143.349365234375,
      "p99": 1282.3310546875,
      "opsPerSec": 866738.2227117626
    },
    {
      "workload": "cellx",
      "competitor": "@vue/reactivity",
      "mean": 1745.474068257346,
      "p50": 1686.76513671875,
      "p99": 2447.718994140625,
      "opsPerSec": 572910.2587003107
    },
    {
      "workload": "cellx",
      "competitor": "solid-js",
      "mean": 3007.3500205592104,
      "p50": 2968.800537109375,
      "p99": 3355.850341796875,
      "opsPerSec": 332518.6603367346
    },
    {
      "workload": "cellx",
      "competitor": "s-js",
      "mean": 1403.0154935396636,
      "p50": 1397.466796875,
      "p99": 1543.41748046875,
      "opsPerSec": 712750.5039000695
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@aihu/signals",
      "mean": 5430.466683736661,
      "p50": 5362.646240234375,
      "p99": 5607.307861328125,
      "opsPerSec": 184146.23608590264
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "alien-signals",
      "mean": 6886.792385962702,
      "p50": 6877.91015625,
      "p99": 6939.365966796875,
      "opsPerSec": 145205.4808619311
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@preact/signals-core",
      "mean": 8751.16396077474,
      "p50": 8753.864501953125,
      "p99": 8805.030029296875,
      "opsPerSec": 114270.51355480147
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "@vue/reactivity",
      "mean": 9835.058570498511,
      "p50": 9829.69970703125,
      "p99": 9904.16845703125,
      "opsPerSec": 101677.07623009232
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "solid-js",
      "mean": 20374.640991210938,
      "p50": 20084.82470703125,
      "p99": 20793.5546875,
      "opsPerSec": 49080.61940484608
    },
    {
      "workload": "wide-fanout-100",
      "competitor": "s-js",
      "mean": 8816.552744547525,
      "p50": 8809.667724609375,
      "p99": 8854.864990234375,
      "opsPerSec": 113423.01565863553
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@aihu/signals",
      "mean": 5102.02044968378,
      "p50": 5073.701904296875,
      "p99": 5682.763916015625,
      "opsPerSec": 196000.7824080712
    },
    {
      "workload": "batched-writes-100",
      "competitor": "alien-signals",
      "mean": 8120.676400991587,
      "p50": 8098.90087890625,
      "p99": 8321.687744140625,
      "opsPerSec": 123142.45151769544
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@preact/signals-core",
      "mean": 7261.862262594289,
      "p50": 7197.365234375,
      "p99": 7645.392333984375,
      "opsPerSec": 137705.7239368172
    },
    {
      "workload": "batched-writes-100",
      "competitor": "@vue/reactivity",
      "mean": 15448.981160481771,
      "p50": 15430.3896484375,
      "p99": 15471.895751953125,
      "opsPerSec": 64729.18761516668
    },
    {
      "workload": "batched-writes-100",
      "competitor": "solid-js",
      "mean": 12792.751171875,
      "p50": 12796.123291015625,
      "p99": 12890.9130859375,
      "opsPerSec": 78169.26840557258
    },
    {
      "workload": "batched-writes-100",
      "competitor": "s-js",
      "mean": 5765.5546311598555,
      "p50": 5754.494140625,
      "p99": 5847.992431640625,
      "opsPerSec": 173443.85128110912
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@aihu/signals",
      "mean": 3287.301963032156,
      "p50": 3250.24951171875,
      "p99": 3942.378662109375,
      "opsPerSec": 304200.8343759256
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "alien-signals",
      "mean": 3985.323174838362,
      "p50": 3969.68603515625,
      "p99": 4133.220458984375,
      "opsPerSec": 250920.67973648294
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@preact/signals-core",
      "mean": 3858.319870521282,
      "p50": 3869.0380859375,
      "p99": 3996.022216796875,
      "opsPerSec": 259180.17001138217
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "@vue/reactivity",
      "mean": 7353.004541015625,
      "p50": 7339.089111328125,
      "p99": 7552.29736328125,
      "opsPerSec": 135998.82801947463
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "solid-js",
      "mean": 11927.279368681066,
      "p50": 11862.57470703125,
      "p99": 12074.59912109375,
      "opsPerSec": 83841.41672960423
    },
    {
      "workload": "deep-propagation-100",
      "competitor": "s-js",
      "mean": 4128.527370383523,
      "p50": 4118.3564453125,
      "p99": 4219.254150390625,
      "opsPerSec": 242217.11770003458
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@aihu/signals",
      "mean": 1089.8759364297946,
      "p50": 1089.357177734375,
      "p99": 1228.561767578125,
      "opsPerSec": 917535.6263721086
    },
    {
      "workload": "dynamic-deps",
      "competitor": "alien-signals",
      "mean": 2882.8198674841774,
      "p50": 2778.4453125,
      "p99": 4432.266845703125,
      "opsPerSec": 346882.58232127945
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@preact/signals-core",
      "mean": 1775.3470651726973,
      "p50": 1780.6982421875,
      "p99": 1839.994140625,
      "opsPerSec": 563270.1456617581
    },
    {
      "workload": "dynamic-deps",
      "competitor": "@vue/reactivity",
      "mean": 7092.275716145833,
      "p50": 7079.43017578125,
      "p99": 7197.816650390625,
      "opsPerSec": 140998.46650398296
    },
    {
      "workload": "dynamic-deps",
      "competitor": "solid-js",
      "mean": 1942.657730985279,
      "p50": 1934.319580078125,
      "p99": 2114.056884765625,
      "opsPerSec": 514758.7163966444
    },
    {
      "workload": "dynamic-deps",
      "competitor": "s-js",
      "mean": 1327.6088702598315,
      "p50": 1325.513916015625,
      "p99": 1378.656005859375,
      "opsPerSec": 753233.8947119915
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@aihu/signals",
      "mean": 99685.5988185823,
      "p50": 69020,
      "p99": 875766,
      "opsPerSec": 10031.539278004428
    },
    {
      "workload": "creation-1to1000",
      "competitor": "alien-signals",
      "mean": 125484.8797731569,
      "p50": 90010,
      "p99": 1014863,
      "opsPerSec": 7969.08760487903
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@preact/signals-core",
      "mean": 82168.0205377763,
      "p50": 64532,
      "p99": 663661,
      "opsPerSec": 12170.184865780664
    },
    {
      "workload": "creation-1to1000",
      "competitor": "@vue/reactivity",
      "mean": 116999.1858687985,
      "p50": 92965,
      "p99": 802532,
      "opsPerSec": 8547.06802080989
    },
    {
      "workload": "creation-1to1000",
      "competitor": "solid-js",
      "mean": 166656.08366800536,
      "p50": 139983,
      "p99": 842928,
      "opsPerSec": 6000.381012145313
    },
    {
      "workload": "creation-1to1000",
      "competitor": "s-js",
      "mean": 129211.86391912909,
      "p50": 107532,
      "p99": 724235,
      "opsPerSec": 7739.2274182027
    }
  ]
}
```
<!-- bench-data:end -->
