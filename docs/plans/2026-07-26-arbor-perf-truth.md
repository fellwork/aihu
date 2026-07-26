# `@aihu/arbor` performance: what is true, and what the gate should be

**Status:** ruling. Investigation complete; no bench baseline regenerated; no
tracked file outside this document modified.
**Date:** 2026-07-26
**Machine (all new local measurements):** Apple M5, macOS 26.5.0, Bun 1.3.8,
JSDOM 25.0.1, darwin/arm64, **load average 1.5–2.6 recorded around every
batch** (stated per table). Fresh `bun` process per repetition; mitata
`measure()` with `min_cpu_time: 2e9`, `warmup_samples: 5`, 5 pre-warmup calls —
i.e. the committed harness's own protocol with a 2× budget. Worktree at
`57202988` (origin/main at session start).

Every number below is tagged **[measured]** (this session, conditions stated),
**[CI-log]** (read from a GitHub Actions log, run id cited),
**[prior-doc]** (quoted from `docs/plans/2026-07-25-arbor-perf-bisect.md`, whose
own conditions apply — notably load 30–98), or **[assumed]**.

This document answers five questions the founder asked:

1. Why does the bisect doc say `update-1-of-10k-leaves` is **+26x** while a
   same-workload run last night measured **8.8x**?
2. What is arbor's real performance, under conditions we can defend?
3. What should the bench gate be?
4. What, if anything, is publishable?
5. Is a real-browser path required, and what would it take?

---

## 0. Ruling — TL;DR

| # | Question | Ruling |
| --- | --- | --- |
| 1 | 26x vs 8.8x | **Resolved, with evidence. Both are arithmetically correct and neither is a performance measurement.** Both divide by the same fictional denominator (the dead-binding 28.63 ns baseline row). The 26x numerator is the CI ubuntu runner (751.08 ns p50, run 30170519791); the 8.8x numerator is this M5 (241–253 ns p50, reproduced). The factor-of-three disagreement is exactly the measured M5↔CI hardware gap on this workload: 751.08 / 241.5 = **3.11x**. Cross-machine ratios against a checked-in baseline are meaningless — and the repo has been burned by this exact mechanism once before (see §1.4). |
| 2 | Real performance | A targeted update through **shipped `dist`** costs **~185 ns p50** in JSDOM on this machine — **1.10x the true vanilla floor** (a cached text node, 168 ns) and 6.4x faster than the bench's own strawman vanilla adapter. Valid for relative statements in JSDOM only. **The committed harness cannot measure `dist` at all today** — every attempt reproduces the dead-binding bug (§2.2), which this session's liveness probe caught twice. No competitor comparison is currently valid (§2.4). |
| 3 | Gate | Adopt bisect §5 R1–R7, plus two additions: **R0 — a mandatory binding-liveness assertion** (an update workload that performs 0 DOM writes/op must hard-fail the run, not report a number), and **R8 — gate on counted metrics (writes/op, moves/op) as first-class equalities**. Tiering: `update-1` and `mount-deep` gateable on `min` after R1; everything else report-only; `attr-thrash-100x100` **confirmed never-gate under any current configuration** (with one nuance, §3.3). `bench-arbor` red is the correct state until the baseline mechanism is replaced; do not regenerate `RESULTS.md`. |
| 4 | Publishable | **Counted metrics only.** "A 2-row swap in a 1000-row keyed list performs 4 DOM moves (was 1994)" is exact, machine-independent, and CI-pinned by a test. "One targeted update = one `nodeValue` write, O(1) in sibling count" likewise. Bundle sizes are gated. **No timing number and no competitor ratio is publishable today**, and none will be until a real browser produces one. |
| 5 | Real browser | **Required for any public timing claim.** The infrastructure (krausest js-framework-benchmark impl + workflow) already exists and is one fix from working: both historical "successful" runs benchmarked an **empty framework list** (every duration 0.00 ms, still green); the now-hardened workflow correctly discovers `aihu-v4.0.0-keyed` and fails only on a missing Chrome binary. Scope: one workflow step. |

---

## 1. The 26x / 8.8x resolution

### 1.1 The three numbers, with provenance

| figure | value | numerator source | denominator source |
| --- | ---: | --- | --- |
| baseline row | 28.63 ns | — | `bench/arbor/RESULTS.md:55` — recorded 2026-05-25 **on the CI ubuntu runner** (the baseline commit `a16fa989`'s own message: *"These numbers come from the runner's own uploaded artifact"*, plan-a.yml run 26398939328). Proven by the bisect experiment to be a **dead-binding no-op** — 0 DOM writes/op. |
| "+26x" | 26.23 | **[CI-log]** 751.08 ns p50, `update-1-of-10k-leaves × @aihu/arbor`, plan-a.yml run **30170519791** (branch `perf/reconcile-lis`, ubuntu runner, 2026-07-25T19:03:05Z) | same 28.63 ns |
| "8.8x" | 8.83 | 252.83 ns p50, this M5, load 1.44–1.98, 2026-07-26 (prior session) | same 28.63 ns |

### 1.2 Reproduction of the M5 numerator **[measured]**

5 fresh processes, committed harness untouched, binding liveness verified in
every process (the probe writes the signal once before timing and asserts the
DOM text changed), load 1.63→2.16:

```
p50: 237.24, 241.46, 240.98, 243.08, 248.31 ns   (median 241.5, spread 4.7 %)
min: 223.94, 227.70, 227.69, 228.73, 233.48 ns   (median 227.7, spread 4.3 %)
samples/process: 1901–2004
```

Last night's 252.83 ns sits within run-to-run variation of this. The M5
numerator is real.

### 1.3 The resolution

Both figures divide a real number by the same fictional one. They disagree
because the numerators come from **different machines**:

> 751.08 ns (CI ubuntu) / 241.5 ns (M5) = **3.11x**, and 26.23 / 8.83 = **2.97x**.

The "factor-of-three disagreement" is the hardware gap, measured on the same
workload, same code, within 24 hours. Nothing about the workload changed;
nothing regressed; no measurement is "wrong." The **comparison** was wrong: a
ratio whose numerator and denominator were produced on different machines is
not a quantity, and the bisect doc's +26x (CI/CI) and last night's 8.8x
(M5/CI) were never commensurable.

The M5↔CI factor is also **not a constant** you can correct for
**[measured / CI-log, same-day pairs]**:

| workload | CI p50 (run 30170519791) | M5 p50 (this session, load 1.5–2.6) | factor |
| --- | ---: | ---: | ---: |
| `update-1-of-10k-leaves` | 751.08 ns | 241.5 ns | 3.11x |
| `mount-10k-leaves` | 62.62 ms | 19.65 ms | 3.19x |
| `mount-deep-100x10` | 5.59 ms | 1.76 ms | 3.18x |
| `mount-wide-1000` | 17.86 ms | 4.67 ms | 3.82x |
| `krausest-1k-cycle` | 47.55 ms | 10.66 ms | 4.46x |
| `attr-thrash-100x100` | 27.09 ms | 4.71 ms | 5.75x |

3.1x to 5.8x depending on how GC-heavy the workload is. Any pipeline that
compares absolute numbers across machines — which is precisely what the
checked-in-baseline gate does whenever the runner hardware drifts — will
manufacture "regressions" of this magnitude. (Caveat, stated: the M5 side of
the krausest row includes PR #579's reconciliation change, which post-dates
the CI baseline era; the mount and update rows are unaffected by it.)

A second, subtler confirmation: the bisect doc measured `update-1` at
**460 ns min / 1035 ns p50** on this same M5 — at load 30–98 **[prior-doc]**.
This session, at load 1.5–2.6, the same cell measures **227.7 ns min /
241.5 ns p50**. Machine load inflated even the *minimum* by 2x, and on
`mount-10k-leaves` by 3.5x (62–68 ms loaded vs 17.7–18.3 ms quiet). The
brief's instruction to record load around every measurement is not hygiene
theater; it is half the explanation of every unexplainable number this repo
has produced.

### 1.4 This has happened before

`a16fa989`'s commit message (2026-05-25) explains why the baseline was
refreshed at all: *"Replace the 2026-05-08 baselines (measured on faster
hardware)… The runner is ~2x slower, so the stale baseline produced uniform
phantom regressions on every bench-running PR."* The repo hit the
cross-hardware-ratio failure in May, responded by refreshing the baseline —
and the refreshed numbers happened to be fiction for two rows because the
harness bindings were dead. The 26x/8.8x confusion is the same class of error
surfacing a third time. The fix is structural (§3), not another refresh.

**Verdict: discrepancy resolved. Retire ratio-to-checked-in-baseline as a
reportable quantity anywhere outside a single machine and a single session.**

---

## 2. What arbor's real performance is

### 2.1 The valid measurements **[measured]**

All rows: `update-1-of-10k-leaves`, this M5, JSDOM 25.0.1, Bun 1.3.8, fresh
process per rep, 2 s CPU budget, binding liveness verified per process, load
recorded 1.5–2.6. "src" = `packages/*/src` via the committed tsconfig paths;
"dist" = the built, minified, property-mangled artifact.

| arm | reps | p50 (median) | min (median) | notes |
| --- | ---: | ---: | ---: | --- |
| arbor **src, dev** (harness as committed) | 5 | **241.5 ns** | 227.7 ns | what CI and every prior number measures |
| arbor src, `NODE_ENV=production` | 3 | 246 ns | 231 ns | no delta — `__DEV__` costs sit on signal *creation*, not the update path |
| arbor **dist** (+ signals src, prod; see §2.2) | 5 | **185.2 ns** | 173.2 ns | the closest currently-runnable proxy for shipped code |
| vanilla, as committed (`span.textContent = v`) | 3 | 1545 ns | 1489 ns | the adapter README calls this "the theoretical minimum" (`vanilla.ts:6`, `update-1-of-10k-leaves.ts:26-27`); it is 9.2x off the actual floor |
| **vanilla, competent** (cached Text node, `nodeValue = v`) | 3 | **168.3 ns** | 159.7 ns | the true floor |

Supporting cells (arbor src/dev, same protocol): `attr-thrash-100x100`
p50 4.71 ms (min spread across processes 0.25 %), `krausest-1k-cycle` p50
10.66 ms / min 9.08–9.21 ms, `mount-10k-leaves` p50 19.65 ms,
`mount-deep-100x10` p50 1.76 ms, `mount-wide-1000` p50 4.67 ms.

### 2.2 The harness cannot measure `dist` today — and the attempt reproduces the original fabrication

Two configurations were tried, and **both silently produced the dead-binding
no-op** — caught only because this session's driver asserts DOM liveness:

1. Bench tsconfig paths → both packages' `dist`: **INERT, 16.1 ns p50**
   (29,458+ samples of a subscriber-less signal write — the 2026-05-25
   fabrication mechanism, reproduced on demand).
2. Paths removed, pure node_modules resolution: **INERT again**. Root cause:
   Bun applies `packages/arbor/tsconfig.json`'s `paths` to imports made *by
   arbor's own `dist/index.js`*, so arbor-dist's `import '@aihu/signals'`
   resolves to `packages/signals/src/index.ts` while the workload's import
   resolves to `packages/signals/dist/index.js`. Two module instances, effect
   subscribed on one, signal written on the other. Verified directly:
   `import.meta.resolve('@aihu/signals')` from `packages/arbor/dist/` returns
   `packages/signals/src/index.ts`.

The only live in-workspace configuration is the hybrid (arbor → dist, signals
→ src) used in §2.1 row 3. Measuring true dist+dist requires an environment
where workspace tsconfigs cannot reach: **pack the tarballs and install them
into an isolated bench directory** — which is also the only arrangement that
measures what users actually install. That is the R6 fix, scoped: a
`bench/arbor` script that runs `bun pm pack` on signals+arbor, installs into a
temp dir with the harness sources copied in, and runs there. Estimated at a
day including CI wiring **[assumed]**.

Two mitigating facts from the measurements: dev-vs-prod is a no-op on the
update path (§2.1 row 2), and src-vs-dist is worth 24 % on this workload
(241.5 → 185.2 ns) — so the committed harness *overstates* arbor's cost
relative to shipped code. The direction of the error is at least honest.

### 2.3 The defensible statements

Under stated conditions (JSDOM, Bun, M5, quiet machine, liveness-verified):

- **A targeted text update through shipped arbor costs ~185 ns — about 1.10x
  the true vanilla floor** (cached text node, 168 ns). Through bench-measured
  source, 241.5 ns ≈ 1.44x the floor. The entire framework tax on the hot
  update path is **tens of nanoseconds**. That is a genuinely good result and
  it needs no strawman to look good.
- The 6.4x advantage over the committed vanilla adapter (1545/241.5) is real
  arithmetic against a **mislabeled** opponent: the adapter re-assigns
  `element.textContent` per op, which JSDOM implements as child-list teardown.
  A competent vanilla implementation caches the text node. The old 122x, the
  bisect doc's 12x, and this 6.4x are all measurements of the *strawman gap*,
  not of arbor; the load and machine of the day set the exponent.
- All of this is JSDOM-relative. `HARNESS.md:8-13` says so; FEL-409's "valid
  for regression detection only, never for public claims" stands.

### 2.4 The competitor table is not a comparison

Full adapter audit (this session, file:line in the audit notes; summary):

| adapter | status today | post-fix status |
| --- | --- | --- |
| solid-js | **BROKEN everywhere** — Bun resolves the `node` export condition → solid's *server* build (`dist/server.js` throws "Client-only API…"). Fix is config-only: `--conditions=browser`. | Still SUBOPTIMAL: adapter uses hyperscript (solid's slowest authoring path, `solid.ts:4-7`) instead of `solid-js/html`'s template-clone path, discards `render()`'s disposer (`solid.ts:58-64` — scopes leak, DOM accumulates across ops), and never `batch()`es bulk writes. |
| @vue/runtime-dom | **BROKEN everywhere** — `app.mount()` does an unguarded `container instanceof SVGElement`; `jsdom-host.ts:35-40` never exposes `SVGElement`. Fix: one line. | Update cells remain **invalid**: the adapter times only `ref.value = v` (`vue.ts:68-70`); Vue's patch flushes on a microtask *outside* the timed op, and in krausest the unmount lands before the flush so the update phase never executes. Needs `nextTick` awaits + `NODE_ENV=production` (it currently loads Vue's dev build). |
| lit-html | attr-thrash **BROKEN** — the workload binds `.dataset=${attrs}` (`attr-thrash-100x100.ts:129,140`); `dataset` is a getter-only accessor in JSDOM *and* real browsers. Workload bug, not lit's cost. | update-1 SUBOPTIMAL — no `guard()` around 9,999 static parts, so lit pays an O(n) dirty-check walk per op that a lit author would elide. |
| preact | runs | SUBOPTIMAL on update workloads — no `@preact/signals`, which is preact's own answer to fine-grained updates; the bench measures worst-idiom whole-tree `render()` per op. |
| vanilla | runs | mislabeled floor (§2.3). |

Two of five competitors error on every workload; two more are measured against
their worst idiom; the floor is 9x off. **The RESULTS.md competitor matrix is
the 122x error with more names on it, and nothing sourced from it may be
published.** Fixing all of the above is one config flag, one global, one
adapter rewrite (solid), two workload fixes (lit `.dataset`, vue `nextTick`),
and one policy decision (preact signals) — roughly 2–3 days **[assumed]** —
and is a precondition for ever printing a comparison table again.

---

## 3. Gate policy

### 3.1 Current state, verified

- Gate: p50-vs-checked-in-baseline, 10 % threshold (`gate.ts:17,72-78`),
  1 s CPU budget (`runner.ts:56`). Baseline: two rows fiction, one missing
  its update phase (bisect §1).
- `bench-arbor` is **deliberately excluded from the required `ci-ok` check**
  (`plan-a.yml:229-234`: "they fail on noise rather than real regressions").
  Red is currently the *designed* state, not an accident. Constraint honored:
  nothing here proposes making it green by regeneration.
- The escape hatch is routine: the most recent arbor-touching PR (#579) ran
  the gate under `BENCH_BUMP=1` **[CI-log run 30170519791]**.

### 3.2 Policy

Adopt bisect §5 **R1–R7** unchanged (same-job A/B vs merge base; `min`
statistic; ≥5 fresh interleaved processes; sign-test consistency; tiering;
measure a declared artifact; demote `[bench-bump]`). Two additions from this
session's findings:

- **R0 — liveness is a precondition, not a result.** Every update-class
  workload must assert ≥1 real DOM mutation per op before timing begins, and
  the runner must **hard-fail** (not report a number) when the assertion
  fails. The 28.63 ns baseline, the 65.52 µs attr-thrash row, the 122x claim,
  and both of this session's INERT dist attempts share one mechanism: a
  harness that will happily time a no-op. A five-line probe caught it twice
  in one evening. This is the single highest-value change in this document.
- **R8 — counted metrics as first-class gate rows.** `nodeValue` writes/op,
  `setAttribute` calls/op, DOM moves per reconciliation are exact integers
  with zero variance; `packages/arbor/tests/structural.test.ts:1088` already
  pins moves-per-swap = 4 as a unit test. Equality gates on counts catch the
  regressions that matter (algorithmic ones) with none of the noise problems
  of §3.3.

### 3.3 Tiering, and the `attr-thrash` verdict

| workload | tier | basis |
| --- | --- | --- |
| `update-1-of-10k-leaves` | **GATE** (after R1+R0) | thousands of samples; 4.7 % p50 / 4.3 % min cross-process spread at low load [measured] |
| `mount-deep-100x10` | GATE on `min` | 1000+ samples at 2 s budget; 2.6 % spread [measured] |
| `mount-10k-leaves`, `mount-wide-1000`, `krausest-1k-cycle` | report-only | ~100–400 samples; fine on a quiet machine (1.7–3.3 % spread [measured]) but CI budget yields ~12–16 samples on the heaviest and CI load is uncontrolled |
| `attr-thrash-100x100` | **never-gate — confirmed**, with nuance | see below |

The nuance the prior verdict missed: `attr-thrash` is **not intrinsically
unstable**. On a quiet machine at a 2 s budget it is the *most* stable heavy
workload measured (min spread 0.25 %, p50 spread 2.3 % across processes
[measured]). Its 16x range in the bisect data was budget (~10 samples) × load
(30–98). But the gate runs on CI, where neither is controllable, its baseline
row is fiction, and its cost model (10,000 signal writes + 10,000 JSDOM
`setAttribute`s per op, GC-dominated) makes it the workload most sensitive to
environment. Under the current configuration — any current configuration —
the never-gate verdict **stands**. Revisit only after R1–R3 have landed and
two weeks of A/B runs show CI-side spread under the threshold; do not
grandfather it in.

### 3.4 What to do with `RESULTS.md`

Nothing, until R1 lands. Under R1 the file stops being a gate input entirely
and becomes a dated, conditions-stamped report artifact. Regenerating it
today would (a) canonise dev-mode source measurements as "the numbers,"
(b) destroy the record of the incident, and (c) rebless a competitor matrix
that §2.4 shows is unfit. The standing STOP holds.

---

## 4. What is publishable

### 4.1 Publishable now, conditions stated

- **"A 2-row swap in a 1000-row keyed list performs 4 DOM moves (previously
  1994)."** Exact, machine-independent, enforced as an equality by
  `packages/arbor/tests/structural.test.ts:1088` on every CI run. Condition
  to state: counted at the DOM API boundary in JSDOM; move *count* is
  environment-independent even though move *cost* is not.
- **"A targeted text update is one `nodeValue` write on a cached Text node —
  O(1) in sibling count."** Mechanism claim, verified by instrumentation
  (1 write/op, bisect §1 table) and by the sibling-count sweep (bisect §2,
  arms A vs D). No timing attached.
- **Bundle sizes** per `.size-limit.json` rows — already gated per PR.

### 4.2 Not publishable

Any timing from this harness (JSDOM, dev-mode source, one machine); any
competitor ratio (§2.4); anything downstream of `RESULTS.md`; and any ratio
whose numerator and denominator were measured on different machines (§1).

### 4.3 The general principle

**Prefer counted metrics to timings for public claims.** Counts are exact,
reproducible on any machine, cheap to CI-gate as equalities, and immune to
every failure mode this incident chain exhibited — load, hardware drift,
statistic choice, dead bindings (a dead binding makes a count go to *zero*,
which screams, rather than making a timing go *down*, which flatters). The
4-vs-1994 claim is a better marketing sentence than 122x ever was, and it is
true. Timings become publishable only when produced in a real browser, in
production builds, with conditions printed next to the number (§5).

---

## 5. The real-browser path

**Required?** Yes — for any public timing number. JSDOM has no layout, no
paint, a non-browser DOM implementation (its `textContent` setter cost is why
the strawman gap exists at all), and `HARNESS.md:186-199` already disclaims
it. Nothing in §2 changes that; §2's numbers are for engineering decisions
and regression detection.

**What exists [CI-log, verified this session]:**

- A complete krausest js-framework-benchmark implementation
  (`bench/js-framework-benchmark/keyed/aihu/`) and a `workflow_dispatch`
  workflow (`.github/workflows/js-framework-benchmark.yml`).
- Its two historical "successful" runs (25469085950 of 2026-05-07,
  30162344830 of 2026-07-25) benchmarked an **empty framework list** —
  `Frameworks that will be benchmarked []`, every benchmark `0.00 ms`,
  PlausibilityCheck "successful run", green check. The harness scanner
  silently skips framework dirs lacking a `package-lock.json`. **A green
  run of this workflow has never once produced a number.**
- The workflow has since been hardened (synthesized lockfile, explicit
  discovery assertion, empty-list grep → hard fail). The latest run
  (30166543005, 2026-07-25T16:54) got through discovery —
  `Frameworks that will be benchmarked [ 'aihu-v4.0.0-keyed',
  'vanillajs-keyed' ]` — and failed on exactly one thing:
  `Browser was not found at the configured executablePath
  (/snap/bin/chromium)`.

**Scope to first real number:** one workflow step (install Chrome/Chromium on
the runner or point webdriver-ts at the preinstalled Chrome via
`--chromeBinary`), then a dispatch run (~90 min ceiling per the workflow's
timeout). Cosmetic fix alongside: the staged `frameworkVersion` currently
reads `4.0.0` [CI-log], which is not a real runtime version. Per the
workflow's own header note, CI numbers are for regression detection;
headline-grade numbers should come from the same harness run on a quiet local
machine, conditions printed. Recommendation: land the browser fix, obtain the
first aihu-vs-vanillajs krausest table, and only then reopen the
"what do we say publicly" question with real data on the table (FEL-408/417).

---

## 6. Appendix — method and raw data

Driver (scratch, not committed): a single-cell runner importing the committed
`jsdom-host.ts`, `competitors/`, `workloads/` unmodified, selecting one
(workload, competitor) cell by env var, with two additions over `runner.ts`:
a pre-timing DOM-liveness probe for update workloads (write once, assert the
document text changed, restore) and JSON emission of `min/p50/avg/p99/samples`
plus `NODE_ENV`. The `vanilla-cached` arm builds the same 10k-span tree as the
committed vanilla branch but keeps a reference to leaf[0]'s Text node and
writes `nodeValue` per op.

Raw per-process results (ns unless noted; every line one fresh process):

```
update-1 × arbor src dev      p50 237.24 241.46 240.98 243.08 248.31 | min 223.94 227.70 227.69 228.73 233.48 | load 1.63→2.16
update-1 × arbor src prod     p50 245.88 245.77 249.11                | load ≈2.2
update-1 × arbor dist+src     p50 185.17 186.24 185.53 181.23 184.41 | min 173.10 176.36 173.44 170.91 173.25 | load 2.4→2.6
update-1 × arbor dist+dist    INERT (16.01–16.30 p50; liveness probe failed; NOT a measurement)
update-1 × vanilla committed  p50 1572.36 1533.39 1545.05             | load ≈2.2
update-1 × vanilla cached     p50 164.28 172.61 168.25 | min 157.07 161.23 160.83
attr-thrash × arbor src dev   p50 (ms) 4.813 4.709 4.705 | min 4.438 4.427 4.439 | load 2.3–2.5
krausest × arbor src dev      p50 (ms) 10.664 10.960 10.607 | min 9.207 9.121 9.078 | load 2.0–2.4
mount-10k × arbor src dev     p50 (ms) 19.534 19.871 19.653 | min 17.683 18.269 18.251 | load 1.7→2.2
mount-deep × arbor src dev    p50 (ms) 1.741 1.756 1.787 | min 1.630 1.637 1.638
mount-wide × arbor src dev    p50 (ms) 4.670 4.591 4.731 | min 4.099 4.136 4.195 | load →1.54
```

CI reference lines quoted from plan-a.yml run 30170519791 (job 89711256370,
ubuntu, 2026-07-25T19:00–19:03Z): update-1 751.08 ns · mount-10k 62.62 ms ·
mount-deep 5.59 ms · mount-wide 17.86 ms · attr-thrash 27.09 ms · krausest
47.55 ms (all p50, gate's own 1 s-budget configuration; run executed under
`BENCH_BUMP=1`).

Machine sharing: other agents were active in this repo during the session in
`packages/cli/**` and `packages/css-engine/**`; load averages stayed 1.5–2.6
around every batch above (recorded before/after each), and no batch was
retained if load moved materially during it. The `a16fa989` tree itself was
not re-executed (it cannot resolve `@aihu/signals` under current tooling);
all claims about it are quoted from the bisect doc's single-variable
experiment, which this document treats as proven.
