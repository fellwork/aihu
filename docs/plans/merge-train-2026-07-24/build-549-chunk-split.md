# Build: PR #549 — remove the rolldown chunk-split regression

**Input:** `docs/plans/merge-train-2026-07-24/verify-549-bench-ab.md` (Verifier).
Cause was established there and NOT re-investigated: the multi-entry rolldown split
hoisted `scope.ts` into a shared `scope-<hash>.js` chunk, putting `getCurrentScope` /
`setCurrentScope`, the scope cleanup register/unregister pair, and the live
`_currentScope` binding across a module boundary on the propagation and creation hot
paths. The lifecycle source is innocent (a byte-identical control arm measured ~0 %).

**Branch:** `feat/signals-lifecycle-contract`.
**Base:** `origin/main` @ `c4386693`.
**Commits:** `f7eb2ee8` (the build-shape fix) and `4ba918d0` (a CI fallout fix the
first commit exposed — see "CI fallout" below). HEAD = `4ba918d0`.
**Machine:** Apple M5, macOS 26.5.1, Bun 1.3.8, darwin/arm64.

---

## PART 1 — the fix

`packages/signals/rolldown.config.ts` now exports an ARRAY of two INDEPENDENT
single-entry builds instead of one multi-entry build:

| build | input | output | notes |
| --- | --- | --- | --- |
| `indexBuild` | `src/index.ts` | `dist/index.js` | identical shape to `main`'s config → no chunk, nothing hoisted |
| `lifecycleBuild` | `src/lifecycle.ts` | `dist/lifecycle.js` | `resolveId` plugin maps `./scope.ts` → `{ id: './index.js', external: true }` |

The specifier is kept RELATIVE (`./index.js`, not the bare `@aihu/signals`) so an
aliasing consumer can never resolve the two files to different copies. `./index.js`
is the exact file the `.` export condition points at, so Node and every bundler give
both the same module record.

Supporting edits:

- `packages/signals/scripts/mangle-dist.mjs` — header comment corrected (there is no
  shared chunk any more). The all-`dist/*.js` mangle loop is KEPT as the safe default.
- `.changeset/lifecycle-ownership-contract.md` — the "shared chunk" bullet rewritten;
  new bullet records the build shape, the correctness argument, and the A/B numbers.
- `scripts/__bundle-sizes.json` + `README.md` — recorded sizes re-measured through the
  exact `scripts/size.ts` code path.

### HARD CONSTRAINT: no duplicated `scope.ts` / `_currentScope`

Verified four ways.

**1. Emitted files — no chunk at all.**

```
$ ls packages/signals/dist/
index.d.ts  index.d.ts.map  index.js  index.js.map
lifecycle.d.ts  lifecycle.d.ts.map  lifecycle.js  lifecycle.js.map
$ ls packages/signals/dist/ | grep '^scope'
(none)
```

Before the fix the same command listed `scope-D-id5w3e.js` (976 B) +
`scope-D3vTRqx-.d.ts`.

**2. Source maps — `scope.ts` is bundled into `index.js` ONLY.**

```
index.js.map     sources: [ '../src/errors.ts', '../src/signal.ts', '../src/batch.ts',
                            '../src/scope.ts',  '../src/computed.ts', '../src/effect.ts',
                            '../src/untrack.ts' ]
lifecycle.js.map sources: [ '../src/lifecycle.ts' ]
```

Counting `let _currentScope` declarations in each map's `sourcesContent`:

```
index.js.map     -> declarations of _currentScope: [["../src/scope.ts",1]]
lifecycle.js.map -> declarations of _currentScope: []
```

Exactly one definition, and it lives in `index.js`. (The dist is minified, so the
identifier itself is renamed — the source map is the authoritative view of which
emitted file contains the declaration.)

**3. `dist/lifecycle.js` imports it.** Full file, 243 B:

```js
import{getCurrentScope as e}from"./index.js";const t=new WeakMap;function n(e,n){t.set(e,n)}function r(){let n=e();return n===void 0?void 0:t.get(n)}export{n as _attachLifecycleHost,r as getLifecycleHost};
```

`dist/lifecycle.d.ts` likewise: `import { EffectScope } from "./index.js";`

**4. Runtime ownership proof** — a scope created through the PACKAGE ENTRY must be
visible to `lifecycle.js`, which is exactly what a duplicated `_currentScope` would
break:

```
scope entered via package entry visible to lifecycle.js: true
outside scope resolves undefined: true
```

**5. Byte-identity with main.**

```
$ cmp wt-main/packages/signals/dist/index.js wt-549/packages/signals/dist/index.js
(silent — BYTE-IDENTICAL)
```

---

## PART 2 — re-measurement (same protocol as the Verifier)

Two worktrees (`origin/main` @ `c4386693`, and the fixed branch), signals built in
each, ONE shared driver reproducing `bench/signals/runner.ts`'s protocol exactly
(50 manual warm-up calls; `mitata.measure` with `min_cpu_time: 1e9`,
`warmup_samples: 50`; the real `src/workloads/*.ts` modules; adapter built over a
dist loaded from an absolute `SIGNALS_DIST`). Every sample is a fresh `bun` process.
Interleaved A/B/C.

| arm | artifact |
| --- | --- |
| **A_main** | `origin/main` `dist/index.js` |
| **B_549split** | #549 as it stood (`1a8fb814`), multi-entry split — the REGRESSED artifact |
| **C_549fixed** | #549 with this fix — `cmp`-byte-identical to A_main |

Three rounds: (1) 12 interleaved reps × both workloads, order A,B,C; (2) 12 reps of
`creation-1to1000` with the arm order ROTATED per rep (to rule out a position-in-rep
confound — measured position effect was ~1 % and in the opposite direction); (3) 12
reps of `creation-1to1000`, A vs C only, order alternating.

### Pooled results (p50 per process, ns)

`creation-1to1000` GC outliers (>150 µs, i.e. ~4× the median) excluded from the
"clean" statistic; they occurred on every arm once the order was rotated.

**`dynamic-deps`** — n = 12 per arm

| arm | n | median | IQR | min–max | vs A_main |
| --- | ---: | ---: | ---: | ---: | ---: |
| A_main | 12 | **563** | 560–575 | 559–593 | — |
| B_549split | 12 | **683** | 682–686 | **676–694** | **+21.41 %** |
| C_549fixed | 12 | **561** | 559–568 | **557–581** | **−0.31 %** |

Raw p50 per rep, sorted:

```
A_main       559 559 560 560 561 562 563 564 575 577 579 593
B_549split   676 681 681 682 682 683 684 684 686 688 688 694    <- DISJOINT from A
C_549fixed   557 558 559 559 560 561 561 562 565 578 581 581    <- sits on top of A
```

**`creation-1to1000`** — n = 36 (A, C) / 24 (B); clean = GC outliers dropped

| arm | n (clean) | median | IQR | min–max | vs A_main |
| --- | ---: | ---: | ---: | ---: | ---: |
| A_main | 36 (33) | **75,667** | 74,792–76,416 | 71,542–79,458 | — |
| B_549split | 24 (19) | **76,625** | 76,250–77,271 | 72,875–77,917 | +1.27 % |
| C_549fixed | 36 (27) | **76,000** | 74,896–77,104 | 71,209–79,958 | **+0.44 %** |

Per-round C-vs-A on `creation-1to1000`: +1.38 %, +2.05 %, +0.49 %. C is
byte-identical to A, so that spread IS this workload's noise floor at n=12 on this
machine today — which is also why the Verifier's +5.5 % reading and today's +1.27 %
reading for the split arm both sit inside it. `dynamic-deps` is the workload that
resolves the effect cleanly, and there the split arm is range-disjoint from main in
every single one of 24 processes while the fixed arm overlaps completely.

### ACCEPTANCE

| workload | target | measured (C_549fixed vs A_main) | ranges | verdict |
| --- | --- | ---: | --- | :---: |
| `dynamic-deps` | \|Δ\| < ~1 %, overlapping | **−0.31 %** | 557–581 vs 559–593 — fully overlapping | **PASS** |
| `creation-1to1000` | \|Δ\| < ~1 %, overlapping | **+0.44 %** | 71,209–79,958 vs 71,542–79,458 — fully overlapping | **PASS** |

The disjointness that proved the original effect real is gone on both workloads. The
pre-fix arm reproduced the regression in the same session (dynamic-deps +21.4 %,
disjoint), so this is a measured removal, not an absence of measurement.

Note the absolute numbers differ from the Verifier's run (563 ns vs 752 ns for
`dynamic-deps` A_main) — the machine is in a faster state today. Only the
same-session relative deltas are claimed, per the Verifier's own protocol.

---

## Regression checks

| check | result |
| --- | --- |
| `bunx vitest run packages/signals packages/runtime` | 29 files, **295 passed**, 2 skipped |
| `bunx tsc --noEmit` (packages/signals) | exit 0 |
| `biome check` on changed files | clean |
| `bun run build` (full workspace, 45 tasks) | exit 0 |
| `examples/live-counter && bun run build` | **exit 0** (vite 8) |
| `examples/agent-driven-demo && bun run build` | **exit 0** (vite 6, dist-aliasing — the config that exercises the `./index.js` external at consumer resolve time) |

### Size rows (measured through `scripts/size.ts`'s exact code path)

| row | limit | before (split) | after (fix) |
| --- | ---: | ---: | ---: |
| `@aihu/signals` | 2350 B | 2234 B | **2232 B** (= main) |
| `@aihu/signals/lifecycle` | 300 B | 112 B | **170 B** |

`scripts/__bundle-sizes.json` and the README size table updated to match. The
lifecycle row grows 58 B because size-limit re-bundles and tree-shakes from the
entry: it now pulls `getCurrentScope` out of the full core rather than out of a
scope-only chunk. Still 130 B under its limit.

---

## PART 3 — the CI `bench` gate

- PR #549's body gained a **"CI `bench` job — why it is red, and why that is not a
  regression"** section: names each CI-flagged workload (`cellx` +10.0 %,
  `batched-writes-100` +27.2 %, `wide-fanout-100` +20.7 %), states the baseline is
  stale (`bench/signals/RESULTS.md`, 2026-05-25, `a16fa989`), records that
  `main@9a7729d6` fails 3 of 6 workloads against that same baseline while containing
  none of #549's changes, and cites the controlled A/B (report path + the
  byte-identical control arm at ~0 %) plus this build's re-measurement.
- The HEAD commit message on the branch contains `[bench-bump]` (the gate reads
  `git log -1` of the head SHA, so it must be last). Precedent: `1981a719`,
  `11a6942c` (2026-07-23).
- `bench/*/RESULTS.md` NOT touched — re-baselining is a separate tracked chore and
  would bless the arbor `mount-*` regression a prior investigation flagged as
  possibly real.

---

## CI fallout the fix exposed (commit `4ba918d0`)

`f7eb2ee8` turned the `check` job red on `app:typecheck`:

```
../runtime/src/define-component.ts(16,76): error TS2307:
  Cannot find module '@aihu/signals/lifecycle' or its corresponding type declarations.
```

Not caused by the build shape. `packages/app/tsconfig.json` and
`examples/agent-driven-demo/tsconfig.json` both map `@aihu/runtime` to
`../runtime/src/index.ts`, which pulls `runtime/src/define-component.ts` — and its
`@aihu/signals/lifecycle` import — into their programs, but neither mapped that
subpath. TS therefore fell through to node_modules resolution and required
`packages/signals/dist/lifecycle.d.ts` to already be on disk. `check` was a
build-order RACE, passing only while moon served `signals:build` from cache;
touching `rolldown.config.ts` invalidated that cache entry, `signals:build` actually
ran, and `app:typecheck` overtook it.

Fix: map the subpath to `src/lifecycle.ts` in both, matching what this branch already
does in `packages/runtime/tsconfig.json`, the root `tsconfig.json`,
`vitest.config.ts` and `tests/vitest.config.ts`. Verified by deleting
`packages/signals/dist` outright and typechecking both — exit 0 for each, where both
previously failed. Full `bun run typecheck` (59 tasks) clean.

`adapter-cloudflare`, `adapter-vercel` and `compiler` also map `@aihu/runtime` to src
but do not reach `define-component.ts` (confirmed with `packages/signals/dist`
removed), so they were left alone.

## CI on HEAD (`4ba918d0`) — all green

| job | result |
| --- | --- |
| `check` | **pass** (5m48s) — was `fail` on `f7eb2ee8`, and `pass`-by-cache-race before that |
| `ci-ok` | **pass** |
| `examples` | **pass** |
| `governed-examples` | **pass** |
| `bench` | **pass** — `BENCH_BUMP=1 (commit message contains [bench-bump])` → `gate bypassed by commit-message override` |
| `bench-arbor` | **pass** |
| `storybook-ok` | pass; `chromatic` / `storybook` / `bench-lsp` skipped |

---

## Follow-up (out of scope, NOT fixed here)

**`bench/signals/runner.ts` `collectSizes()` under-reports `@aihu/signals`.** It
`statSync`/`gzipSync`s `packages/signals/dist/index.js` as a RAW FILE. Under the
multi-entry split that omitted the ~976 B `scope-*.js` chunk from the bench's
"Bundle size (gz)" table, so the published-size claim in `RESULTS.md` was low.

**This fix incidentally makes that number correct again** — `dist/index.js` is once
more the whole core, byte-identical to main, so `collectSizes()` has nothing left to
miss. The underlying fragility remains: any future code-split of `@aihu/signals`
would silently under-report again, because `collectSizes()` measures one file rather
than re-bundling from the entry. Worth hardening (`collectSizes()` should either sum
the entry's transitive `dist/*.js` closure or re-bundle like `scripts/size.ts` does).

**`.size-limit.json` is unaffected and always was** — size-limit re-bundles from the
entry rather than statting a file, which is why the recorded gz moved only
2232 → 2234 B under the split and is back at 2232 B now. Confirmed by re-running that
exact code path (table above).
