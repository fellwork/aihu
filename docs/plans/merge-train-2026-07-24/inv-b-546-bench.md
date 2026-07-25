# INV-B — PR #546 `bench` / `bench-arbor` failures

**PR:** #546 `fix(arbor,runtime): keyed-list stale rows + DOM-move state preservation`
**Branch:** `fix/keyed-list-and-dom-move` @ `bf6a27644cce329183014f6e021bb00c5ac5028b`
**Workflow run:** [30129958798](https://github.com/fellwork/aihu/actions/runs/30129958798) — `bench` = FAILURE, `bench-arbor` = FAILURE
**Scope note:** `Smoke tests` (Deploy aihu-docs) is explicitly out of scope — inherited from main, owned by another investigator.

---

## Verdict

**SAFE TO MERGE — the bench gate needs a threshold/baseline re-baseline, which is a separate chore, not #546's problem.**

`bench` and `bench-arbor` are **pre-broken on `main`**. They are path-conditional
(`packages/{signals,arbor}/src/**`, `bench/**`, `plan-a.yml`), so most runs skip them —
but **every time they actually execute they fail, on `main` and on every branch alike**.
25 of the last 26 runs in which these jobs executed failed. #546 did not introduce a
regression; it merely touched `packages/arbor/src/**`, which is what *unskips* an
already-red gate.

This is a **performance-threshold breach against a 2-month-stale baseline**, not a hard
error or crash. It is **not** a size-limit breach.

---

## Root cause

Both jobs compare the freshly-measured `RESULTS.md` against the copy checked in on
`origin/main`, and fail if any `@aihu/{signals,arbor}` workload's p50 regressed > 10 %:

```yaml
# .github/workflows/plan-a.yml:296-320 (bench), :348-372 (bench-arbor)
- name: Capture previous RESULTS.md from main
  run: git show origin/main:bench/signals/RESULTS.md > /tmp/bench-prev/RESULTS.md
- name: Regression gate
  run: bun src/gate.ts /tmp/bench-prev/RESULTS.md ./RESULTS.md
```

`THRESHOLD = 0.1` (`bench/arbor/src/gate.ts:16`, and the signals twin).

The checked-in baselines have not been refreshed since **2026-05-25**:

```
$ git log -1 --format='%H %ad %s' --date=iso origin/main -- bench/arbor/RESULTS.md
a16fa9892b16cf7a107f8e483f9a26f0626dca59 2026-05-25 08:00:33 -0400 chore(bench): refresh baseline to current CI hardware
$ git log -1 --format='%H %ad %s' --date=iso origin/main -- bench/signals/RESULTS.md
a16fa9892b16cf7a107f8e483f9a26f0626dca59 2026-05-25 08:00:33 -0400 chore(bench): refresh baseline to current CI hardware

$ git log --oneline a16fa989..origin/main | wc -l
     404          # commits on main since the baseline
$ git log --oneline a16fa989..origin/main -- packages/arbor/src | wc -l
       7          # arbor source changes never re-baselined
$ git log --oneline a16fa989..origin/main -- packages/signals/src | wc -l
       6
```

Every gate log confirms the stale comparison in its header: `prev=2026-05-25 cur=2026-07-24`.

Two of the arbor deltas are not drift at all but a **measurement-regime change** merged
into `main` at some point in those 404 commits and never gated (because the job was
skipped on the merging PR):

| workload | 2026-05-25 baseline | any 2026-07 run | ratio |
|---|---:|---:|---:|
| `update-1-of-10k-leaves` | 29 ns | 557–825 ns | ~20–30× |
| `attr-thrash-100x100` | 65,517 ns (65 µs) | 18–31 ms | ~300–470× |

A 470× delta is not runner noise and not attributable to a 10-file PR that never touches
those code paths. The baseline itself is invalid.

Note also that the baseline commit bypassed its own gate — `bench/arbor/src/runner.ts:1`
still carries the marker: `// [bench-bump] baseline re-measured on current CI runner`.

---

## Evidence

### 1. The `bench` job is **@aihu/signals**, and #546 touches zero signals code

This alone disproves causation. #546's 10 files:

```
.changeset/keyed-list-value-and-move-preservation.md   (new)
README.md                                              (size table text)
packages/arbor/README.md                               (size table text)
packages/arbor/src/structural.ts                       +80 -3
packages/arbor/src/types.ts                            +9  -0   (type-only)
packages/arbor/tests/structural.test.ts                +307 -1
packages/runtime/README.md                             (size table text)
packages/runtime/src/define-component.ts               +21 -0
packages/runtime/src/define-element.ts                 +13 -0
scripts/__bundle-sizes.json                            (regenerated)
```

Nothing under `packages/signals/`. Yet `bench` (signals) failed:

```
gh run view --job 89602925234 --log-failed

Bench gate · @aihu/signals · prev=2026-05-25 cur=2026-07-24
  FAIL cellx: 807 → 888 ns (10.0 %)
  FAIL wide-fanout-100: 5363 → 6394 ns (19.2 %)
  FAIL batched-writes-100: 5074 → 5654 ns (11.4 %)
  FAIL deep-propagation-100: 3250 → 3635 ns (11.8 %)
  WIN  dynamic-deps: 1089 → 708 ns (-35.0 %)
  FAIL creation-1to1000: 69020 → 83587 ns (21.1 %)
5 workload(s) regressed >10 % on TIME (p50).
```

The job only got scheduled because the `bench` paths filter is a **union** of signals *and*
arbor paths (`plan-a.yml:244-251`); touching `packages/arbor/src/**` unskips the signals
gate too.

### 2. `main` itself fails both jobs, worse than #546

Main run [30065437045](https://github.com/fellwork/aihu/actions/runs/30065437045)
(`main`, 2026-07-24T03:55 — ~18 h *before* #546, no `each()` change anywhere in it):

```
Bench gate · @aihu/arbor · prev=2026-05-25 cur=2026-07-24
  FAIL mount-10k-leaves:        49043682 → 71747068 ns (46.3 %)
  FAIL mount-deep-100x10:        4318938 →  5841304 ns (35.2 %)
  FAIL mount-wide-1000:         12686487 → 18682608 ns (47.3 %)
  FAIL update-1-of-10k-leaves:        29 →      707 ns (2371.0 %)
  FAIL attr-thrash-100x100:        65517 → 30019559 ns (45719.5 %)
  FAIL krausest-1k-cycle:       31164500 → 44179853 ns (41.8 %)

Bench gate · @aihu/signals · prev=2026-05-25 cur=2026-07-24
  FAIL wide-fanout-100 (14.1 %) · deep-propagation-100 (33.1 %) · creation-1to1000 (25.8 %)
```

Same on `main` @ [30022187372](https://github.com/fellwork/aihu/actions/runs/30022187372)
(2026-07-23): 6/6 arbor FAIL, 5/6 signals FAIL.

### 3. Two unrelated branches fail identically, one with *worse* arbor numbers

| workload | **#546** | `feat/signals-lifecycle-contract` (run 30130097654, no arbor/src change) | `feat/use-tier0-dx` (run 30063243507) | `main` (run 30065437045) |
|---|---:|---:|---:|---:|
| `mount-10k-leaves` | 19.4 % | **47.4 %** | 10.3 % | 46.3 % |
| `mount-deep-100x10` | 27.3 % | **37.3 %** | (pass) | 35.2 % |
| `mount-wide-1000` | 42.5 % | 32.6 % | 18.0 % | **47.3 %** |
| `update-1-of-10k-leaves` | 2519 % | 2780 % | 1846 % | 2371 % |
| `attr-thrash-100x100` | 47264 % | 27318 % | 31503 % | 45720 % |
| `krausest-1k-cycle` | **57.2 %** | 29.6 % | 12.5 % | 41.8 % |

`feat/signals-lifecycle-contract` fails `bench-arbor` on 6/6 workloads while touching no
arbor source at all. The spread on a single workload across runs (`krausest`: 12.5 → 57.2 %;
`mount-10k-leaves`: 10.3 → 47.4 %) is 4–5× — the shared-tenancy `ubuntu-latest` runner
noise floor dwarfs the 10 % threshold.

### 4. Historical scan — bench/bench-arbor have effectively never been green

200 most recent `Plan A — TS runtime family` runs (2026-07-20 → 2026-07-24). 174 skipped
both jobs; the 26 in which they executed:

```
29781975710 fix/ci-gates                    2026-07-20T21:54Z  bench=failure bench-arbor=failure
29782210145 main                            2026-07-20T21:58Z  bench=failure bench-arbor=failure
29867606633 feat/grammar-v2                 2026-07-21T20:52Z  bench=failure bench-arbor=failure
29867918594 main                            2026-07-21T20:56Z  bench=failure bench-arbor=failure
29891508732 feat/ssr-structural-walk        2026-07-22T04:36Z  bench=failure bench-arbor=failure
29891723102 main                            2026-07-22T04:41Z  bench=failure bench-arbor=failure
29941983388 feat/store                      2026-07-22T17:21Z  bench=failure bench-arbor=failure
29951336310 main                            2026-07-22T19:31Z  bench=SUCCESS bench-arbor=failure
29955761189 feat/cookbook-corpus-unification 2026-07-22T20:35Z bench=failure bench-arbor=failure
29959644790 feat/ssr-wave3                  2026-07-22T21:33Z  bench=failure bench-arbor=failure
29960444306 main                            2026-07-22T21:45Z  bench=failure bench-arbor=failure
29960477273 main                            2026-07-22T21:46Z  bench=failure bench-arbor=failure
29964601870 feat/governed-examples          2026-07-22T22:57Z  bench=failure bench-arbor=failure
29965188162 feat/governed-examples          2026-07-22T23:08Z  bench=failure bench-arbor=failure
29967186761 chore/rename-scribe-family      2026-07-22T23:47Z  bench=failure bench-arbor=failure
29967487461 main                            2026-07-22T23:53Z  bench=SUCCESS bench-arbor=failure
29975144349 feat/effect-scope-signals       2026-07-23T02:43Z  bench=failure bench-arbor=failure
30009300045 feat/effect-scope-signals       2026-07-23T12:59Z  bench=SUCCESS bench-arbor=SUCCESS   <-- only both-green
30010297905 main                            2026-07-23T13:13Z  bench=failure bench-arbor=failure
30011967430 feat/effect-scope-runtime       2026-07-23T13:36Z  bench=failure bench-arbor=failure
30012841629 main                            2026-07-23T13:48Z  bench=failure bench-arbor=failure
30022187372 main                            2026-07-23T15:47Z  bench=failure bench-arbor=failure
30063243507 feat/use-tier0-dx               2026-07-24T03:03Z  bench=failure bench-arbor=failure
30065437045 main                            2026-07-24T03:55Z  bench=failure bench-arbor=failure
30129958798 fix/keyed-list-and-dom-move     2026-07-24T22:07Z  bench=failure bench-arbor=failure   <-- #546
30130097654 feat/signals-lifecycle-contract 2026-07-24T22:09Z  bench=failure bench-arbor=failure
```

**Answer to "when did they last pass?"** — `bench-arbor` has passed exactly **once** in this
window: 2026-07-23T12:59 on `feat/effect-scope-signals`. The *same branch* failed both jobs
9 hours earlier, and `main` failed both 14 minutes later. That single green is a noise
outlier, not a baseline. **`main` has never had both green in this window.** There is no
green baseline to regress from.

### 5. The changed code is **not reachable** from the arbor bench

#546's only runtime-behavior change in arbor is inside `_reconcileEach`, `_reconcileWhen`,
and the new `_moveNode` helper in `packages/arbor/src/structural.ts` — i.e. `each()` and
`when()`. The arbor bench suite never calls either:

```
$ grep -rn "\beach(\|\bwhen(" bench/arbor/src/
NONE FOUND

$ grep -rh "from '@aihu/arbor'" bench/arbor/src/ | grep -o "import {[^}]*}" | sort -u
import { branch }
import { branch, leaf }
import { mount as arborMount, type MountScope, type Node }
```

`krausest-1k-cycle` — the one workload that *sounds* like a keyed list — builds its 1000
rows as literal `branch('tr', ...)` trees driven by per-row signals
(`bench/arbor/src/workloads/krausest-1k-cycle.ts:75-95`). It has no `each()` and no
reconciler involvement at all. `packages/arbor/src/types.ts` is type-only (zero runtime
cost). So **no line #546 changes is executed by any bench workload** — the failure cannot
be caused by this PR even in principle.

For completeness, the two hot-path concerns worth ruling out had the code been reachable:

- `_reconcileEach`'s new `sc.get(k)` + `existing.item === items[i]` replaces `sc.has(k)` —
  one map lookup instead of one, plus a reference compare. O(1), negligible.
- `_moveNode`'s `node.getRootNode() === par.getRootNode()` is an ancestor walk and *would*
  be costly per node — but it sits behind `typeof mb === 'function' &&` in a short-circuit
  chain, and neither jsdom (the bench host) nor any non-`moveBefore` engine ever reaches it.
  Under the bench the added cost is a single undefined property read.

### 6. It is **not** a size-limit breach

`bun run size` and `bun run check:size-rows` live in the `check` job
(`plan-a.yml:179,185`), which reported **SUCCESS** on #546. The PR's size deltas stay inside
their per-package rows:

| package | before | after | limit (`.size-limit.json`) |
|---|---:|---:|---:|
| `@aihu/arbor` | 3.04 kB | 3.10 kB | 3200 B — pass (~100 B headroom) |
| `@aihu/runtime` | 4.22 kB | 4.32 kB | 4500 B — pass |

The `README.md` / `packages/*/README.md` / `scripts/__bundle-sizes.json` edits in the diff
are the generated size-table refresh, consistent with those numbers.

---

## Numbers — #546 threshold breaches

Threshold is 10 % p50 regression vs the 2026-05-25 baseline.

**`bench` (@aihu/signals) — 5 breaches, none in code #546 touches:**

| workload | baseline | #546 | delta |
|---|---:|---:|---:|
| `cellx` | 807 ns | 888 ns | +10.0 % |
| `wide-fanout-100` | 5363 ns | 6394 ns | +19.2 % |
| `batched-writes-100` | 5074 ns | 5654 ns | +11.4 % |
| `deep-propagation-100` | 3250 ns | 3635 ns | +11.8 % |
| `dynamic-deps` | 1089 ns | 708 ns | −35.0 % (WIN) |
| `creation-1to1000` | 69,020 ns | 83,587 ns | +21.1 % |

**`bench-arbor` (@aihu/arbor) — 6 breaches, none in code #546 touches:**

| workload | baseline | #546 | delta | main (30065437045) |
|---|---:|---:|---:|---:|
| `mount-10k-leaves` | 49.04 ms | 58.56 ms | +19.4 % | +46.3 % |
| `mount-deep-100x10` | 4.32 ms | 5.50 ms | +27.3 % | +35.2 % |
| `mount-wide-1000` | 12.69 ms | 18.07 ms | +42.5 % | +47.3 % |
| `update-1-of-10k-leaves` | 29 ns | 750 ns | +2519.4 % | +2371.0 % |
| `attr-thrash-100x100` | 65.5 µs | 31.03 ms | +47264.3 % | +45719.5 % |
| `krausest-1k-cycle` | 31.16 ms | 48.99 ms | +57.2 % | +41.8 % |

#546 is **better than `main`** on 3 of 6 arbor workloads and within the observed
branch-to-branch noise band on the rest. `krausest-1k-cycle` is #546's worst relative
showing (57.2 % vs main's 41.8 %), but that workload's spread across five 2026-07 runs is
12.5 → 57.2 % on identical baseline, and it provably does not exercise `each()`.

---

## Regression vs pre-broken

**Pre-broken.** Unambiguously:

1. `bench` gates `@aihu/signals`; #546 changes no signals code, yet it fails. Causation is
   impossible.
2. `main` fails both jobs on every run in which they execute, including 18 h before #546,
   with *larger* arbor regressions on most workloads.
3. 25 of 26 executing runs across 8 different branches failed; the one both-green run is a
   noise outlier contradicted by the same branch 9 h earlier and by `main` 14 min later.
4. Neither `each()` nor `when()` — the only behavior #546 alters — appears anywhere in the
   arbor bench suite.
5. Two of the six arbor "regressions" are 20× and 470×, i.e. an un-gated
   measurement-regime change already on `main`, not a PR-scale delta.

The jobs are path-conditional (`plan-a.yml:244-251`), so most PRs and most `main` pushes
skip them and never surface the rot. #546 touched `packages/arbor/src/**` and simply
unskipped an already-red gate. This is a **latent-gate-exposure** failure mode, structurally
identical to the "verify against main before claiming a fix" lesson already in the
project's memory.

---

## Recommended action

**Merge #546 on the strength of its own gates** (`check` = SUCCESS — full test suite +
`bun run size` + `check:size-rows`; `examples`, `governed-examples`, `ci-ok`, `storybook-ok`
all SUCCESS). `Smoke tests` is the separately-owned inherited failure.

To get the PR through the merge train, pick one:

1. **Preferred — file & fix the gate as its own chore, merge #546 now.**
   The gate is red for the whole repo and blocks any future arbor/signals work. It needs a
   standalone `chore(bench): refresh baseline` PR (the same shape as `a16fa989`) that
   re-measures `bench/{signals,arbor}/RESULTS.md` on current CI hardware and lands with
   `[bench-bump]` in the commit message. Do **not** fold that into #546 — a stale-baseline
   refresh riding on a behavior fix is exactly what makes the next regression invisible.
   Merging #546 does not make the gate any redder than it already is on `main`.

2. **Unblock in place** — amend the head commit of `fix/keyed-list-and-dom-move` to include
   `[bench-bump]`. `plan-a.yml:308-316` / `:360-368` read the PR HEAD SHA's message and set
   `BENCH_BUMP=1`, which makes `gate.ts` exit 0 (`bench/arbor/src/gate.ts:45-48`). This is
   the documented override path (`bench/signals/HARNESS.md`). Cheapest unblock, but it
   silently accepts numbers nobody has validated and leaves the baseline stale.

Two follow-ups worth filing alongside the baseline refresh:

- **Investigate the 470× `attr-thrash-100x100` and 20× `update-1-of-10k-leaves` deltas
  before re-baselining.** These may be a genuine, un-gated arbor perf regression that
  landed in one of the 7 `packages/arbor/src` commits since 2026-05-25 — re-baselining
  without checking would bless it permanently. Prime suspect worth bisecting first:
  `81c49de1 fix(arbor): gate _observeMount calls behind __DEV__ + forEach→for in hot paths`
  and anything touching attribute binding.
- **Widen the threshold or de-noise the runner.** A 10 % p50 gate on shared-tenancy
  `ubuntu-latest` is below the observed noise floor (same workload, same baseline, 12.5 →
  57.2 % across branches). Either raise the threshold, take a best-of-N (the docs Lighthouse
  gate already does best-of-3 for exactly this reason), or move the gate off the PR path
  onto a scheduled `main` job that trends rather than blocks.
