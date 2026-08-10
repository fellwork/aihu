# R1 — same-job A/B bench harness

**Contract:** `C-FEL-BENCH-R1-AB-HARNESS`
**Status:** design doc — **REVISED 2026-08-09** after an external practice review.
Two of the original six design elements were wrong and the stated ENDPOINT was
wrong; see § 0. The first deliverable in R1's own stated order, and the only one
due now.
**Supersedes the mechanism condemned in:** `bench/signals/HARNESS.md`
§ "D1 — RESOLVED 2026-08-08".

> Deliverable order, from the D1 decision, **amended by § 0**:
> **design doc → dual-arm harness → statistic swap (`p50` → `median` + a
> significance test, NOT `min`) → CI budget → re-tier against permutation-derived
> noise evidence → confirm the timing gates STAY advisory, and move enforcement
> to counted metrics.**
>
> D1 wrote the last two steps as "delete the `continue-on-error` lines and
> promote the gates into `ci-ok`". That endpoint is abandoned — see § 0.3. D1's
> *decision* (both timing gates ship red today) is untouched; only the
> destination changed.
>
> D1 also records that no sub-piece was found independently shippable *and*
> independently valuable: each exists to make the next one's number
> interpretable. Nothing below changes that. Do not land a partial R1.

---

## 0. Revision 0→1 — what changed, and why

The first draft was reviewed against published practice (Chromium Pinpoint,
Mozilla Perfherder, rustc-perf, LLVM, MongoDB, ClickHouse, DuckDB, TypeScript,
Preact, Android Jetpack) and against the measurement literature. Four elements
survived. Two did not, and the intended endpoint did not.

| element | v0 | v1 |
|---|---|---|
| Same-job BASE/HEAD A/B | keep | **keep** — this is the "duet" procedure, [ICPE '20](https://arxiv.org/abs/2001.05811), 2.3–12.5× accuracy gain |
| Interleaving, rotated arm order | keep | **keep** — documented best practice |
| Fresh process per cell | keep | **keep** — JMH forks by default for this reason |
| Drop the git-committed baseline | keep | **keep** |
| CONTROL arm (base measured twice) | core of the design | **REPLACED** — § 3.1 |
| Statistic `p50` → `min` | core of the design | **REVERSED** — § 3.6 |
| Endpoint: promote to blocking | § 6 step 6 | **ABANDONED** — § 6 |

### 0.1 `min` was wrong, and wrong in a way specific to this harness

v0 argued that "every source of noise on a CI runner is additive and
one-directional … so the minimum is the least-contaminated estimator." **The
premise is false in the direction that matters.** Turbo Boost and idle
neighbours produce *speed spikes*; the fast tail is exactly where contamination
lands, and `min` is a pure estimator of the fast tail. `pytest-benchmark`'s FAQ
documents precisely this ("*When Turbo Boost kicks in you may see 'speed
spikes' — and you'd get this strange outlier `Min`*").

Worse, and decisive here: **`min` is an order statistic, and this harness is
time-boxed rather than count-boxed.** `bench/signals/src/runner.ts` sets
`min_cpu_time: 1_000_000_000` with the comment "*mitata's defaults adapt sample
count to CPU time*". `E[min]` falls monotonically with sample count, so the
FASTER arm collects more samples in its one second and earns a lower minimum
**for that reason alone**. A min-based gate in this harness would manufacture
speedups on HEAD and mask regressions. That is not a tuning error, it inverts
the instrument.

No surveyed tool with an automated comparison gates on `min` — Criterion.rs,
google/benchmark, hyperfine, Go `benchstat`, Node core and ClickHouse all use a
significance test. Note the pro-`min` position is not fringe
([Chen & Revels, HPEC '16](https://arxiv.org/abs/1608.04295)), but every
precondition its model assumes — fixed frequency, dedicated hardware, equal N —
fails on shared CI with a JIT.

### 0.2 The CONTROL arm was the right instinct with the wrong instrument

A/A measurement is well established ([Laaber et al., EMSE 2019](https://link.springer.com/article/10.1007/s10664-019-09681-1):
"*always perform A/A testing*"), but as **offline calibration**, not as a third
arm inside every gating run. No prior art was found for the latter, and it has
two defects: it costs 50 % more CI time, and `|CONTROL − BASE|` is a **single
draw** from the noise distribution — a threshold set from one draw abstains when
unlucky and gates when lucky, with no control over either rate.

The same quantity is available **free from the two arms already measured**, by
permuting the arm labels on the pooled samples. ClickHouse's
[`eqmed.sql`](https://github.com/ClickHouse/ClickHouse/blob/master/ci/jobs/scripts/perf/eqmed.sql)
is the reference implementation, ~40 lines, commented "*Randomization test for
the median difference between the two versions*".

### 0.3 The endpoint was wrong: this stays advisory

**No major project hard-blocks a PR on wall-clock microbenchmarks.** The one
organization that tried it at scale published the failure. MongoDB ran this
exact design — pairwise comparison against a threshold — and reported
([Daly et al., ICPE '20](https://arxiv.org/abs/2003.00584)) "*up to 99 %*" false
positives and "*100 tickets in the first project reduced down to 1 useful
ticket*", concluding "*there is no way we could adjust a common threshold*".

Android Jetpack states it directly: "*Don't block submitting a patch based on
results — just consider the results during code review*", and "*Benchmarks are
like flakey tests*". Chromium, Mozilla, Rust, LLVM, Go, TypeScript, Preact and
Node.js are all advisory; esbuild, Bun, Vite, Svelte and React have no timing
gate at all. The two projects that do block on wall time gate a **suite-level
aggregate** (ClickHouse: >10 distinct queries; DuckDB: suite geomean), never a
single benchmark.

Our own numbers say the same thing. 2 of 6 workloads drifting past 10 % on a
no-op is a ~33 % per-workload false-positive rate; across six workloads that is
a **~91 % chance of at least one spurious FAIL per run**.

So R1 ships advisory and **stays** advisory. Deliverable 6 changes from "promote
into `ci-ok`" to "confirm it should not be promoted". This is not a retreat from
rigour — the rigour moves to § 6.1, where it belongs.

### 0.4 Where the teeth actually go — and we already built it

`bench/arbor/src/counts.ts` is the correct gate and its docblock already has the
reasoning: "*Counts, not timings, for anything that gates. DOM writes/op … are
exact integers with zero variance — machine-independent, load-independent,
statistic-independent. And they fail in the right direction: a dead binding
sends a count to ZERO, which screams, where it sends a timing DOWN, which
flatters.*"

External practice agrees: Firefox blocks landing on counted reflows, Rails ships
`assert_queries_count`, and every major signals library asserts exact
recomputation counts as correctness tests.

**The signals analogue is already half-built.** `packages/signals/src/signal.ts`
maintains `runVer`, a monotonic counter incremented once per computed
recompute / effect run. Exposing it under `__DEV__` yields an exact,
machine-independent "reactive recomputations per workload" metric for
`deep-propagation-100`, `wide-fanout-100`, `dynamic-deps` and
`batched-writes-100` — the signals equivalent of arbor's DOM-writes gate, and
the thing that should carry enforcement.

---

## 1. The defect, stated precisely

Both timing gates compare **a number measured now** against **a number measured
on another machine on another day, committed to git**. That comparison has no
error bars, so it cannot distinguish a regression from the runner it landed on.

D1's measurements, not restated in full here:

- **signals** — same commit, same quiet machine, zero code changes, back to
  back: **2 of 6 workloads exceed the gate's own 10 % threshold.** Prior
  cross-CI measurement put the drift at 19–31 %.
- **arbor** — same commit, minutes apart: `krausest-1k-cycle` moved from
  **−60.5 % to +31.2 %**, a ~90-point swing on unchanged code.

The gate threshold is 10 %. The instrument's own noise is larger than the effect
it is built to detect. **No baseline refresh fixes this**, which is why
regenerating `RESULTS.md` is a standing STOP and why a measured `fitness.json`
was rejected: both leave the comparison cross-run.

R1's premise: **make the two numbers commensurable by measuring them in the same
job, on the same runner, in the same minutes** — and then prove that claim
in-band, per run, rather than asserting it.

---

## 2. Verified ground truth

Established by reading the current harness, because two of these contradict
assumptions in the existing docs.

| fact | evidence |
|---|---|
| `bench` (signals) never reaches a comparison | `loadFitness` throws `ENOENT`; `bench/signals/fitness.json` has never existed |
| `bench-arbor` timing fails on a fiction row | committed baseline dated 2026-05-25; two rows recorded dead bindings (0 DOM writes/op) |
| arbor's runner **does** emit `min` | `bench/arbor/src/runner.ts:68,138,152` — table header is `mean \| min \| p50 \| p99 \| ops/s` |
| arbor's committed baseline has **no** `min` column | `bench/arbor/RESULTS.md` header is `mean \| p50 \| p99 \| ops/s` — this is why `gate.ts` still compares `p50` (`gate.ts:31-34`) |
| **signals' runner does not emit `min` at all** | `bench/signals/src/runner.ts:98-101` maps only `stats.avg / p50 / p99` |
| mitata exposes `min` | arbor reads `stats.min` from the same `measure()` call |
| arbor gate tier | `GATE_WORKLOADS = ['update-1-of-10k-leaves','mount-deep-100x10']`, `NEVER_GATE = ['attr-thrash-100x100']`, `THRESHOLD = 0.1` |

> **Correction to D1.** D1 describes the statistic swap as adopting "`min`,
> which the runner already emits". That is true of **arbor** and **false of
> signals** — the signals runner never reads `stats.min`. The swap is therefore
> *not* symmetric across the two harnesses: arbor needs a baseline that carries
> the column it already produces, signals needs the field added to the runner
> first. Small, but it is a hidden extra step in a deliverable list that reads
> as one item.

---

## 3. Design

### 3.1 Two arms, one job, one runner

Every gated run measures **two** arms and compares within the run:

| arm | tree | purpose |
|---|---|---|
| **BASE** | merge base of the PR | the reference |
| **HEAD** | PR head | the thing under review |

> **v0 had a third CONTROL arm** (the merge base measured twice) to supply a
> per-run noise floor. Removed — § 0.2. The noise floor is still measured
> in-band, but derived from the two arms already collected rather than paid for
> with a 50 % longer job.

The verdict comes from the samples themselves, not from a delta of medians:

```
observed = median(HEAD) - median(BASE)
p        = permutation test: pool all samples, reshuffle the arm labels N times,
           count how often |median difference| >= |observed|
```

The permutation distribution **is** the noise floor, and unlike a single
CONTROL-vs-BASE draw it is an estimate of the whole distribution rather than one
sample from it. ClickHouse's `eqmed.sql` is the reference implementation.

### 3.2 The decision rule — abstain, don't guess

```
if p >= ALPHA:                    -> not distinguishable from noise
    if attempts < CAP:            -> RESAMPLE (collect more, re-test)
    else:                         -> ABSTAIN (exit 0, loudly)
elif |observed| < MIN_EFFECT:     -> PASS (significant but too small to care)
elif observed > 0:                -> REPORT REGRESSION (advisory, exit 0)
else:                             -> PASS
```

Two changes from v0. A **minimum effect size** sits alongside significance,
because with enough samples a statistically significant 0.4 % is still noise you
do not want to act on. And abstention now **resamples first**: Chromium
Pinpoint's `UNKNOWN` state routes to `AddAttempts` with a hard cap before it
concludes "couldn't reproduce a difference", and ClickHouse and DuckDB both
re-run flagged benchmarks rather than ruling on the first pass. Abstain-then-
resample is strictly better than abstain-immediately and costs nothing on the
common path, where most PRs resolve first time.

Three properties, each deliberate:

- **Abstention is a first-class outcome.** A runner too noisy to resolve the
  threshold produces "this run cannot tell you", not a coin flip. Under the
  old mechanism that same condition produced a confident red.
- **Abstain exits 0.** A gate that reds when it cannot measure retrains
  everyone to ignore red — exactly the failure `continue-on-error` was papering
  over. Abstention must be visible in the log and countable, not blocking.
- **`k * |noise|` floors the threshold at the measured noise.** A 10 % rule on
  a runner resolving ±8 % is not a 10 % rule. Start `k = 2`; set it from
  §5 evidence, not taste.

**Abstention rate is itself a monitored signal.** If runs abstain often, R1 has
not delivered — that is the honest report, and it is visible rather than hidden
in flake. Emit it per run and review before promotion (§6).

### 3.3 Interleaving

Do **not** run BASE fully, then HEAD, then CONTROL. Runner performance drifts
over a job (thermal, noisy-neighbour, cache state), and block ordering aliases
that drift directly onto the arm that ran last.

Interleave at the **(workload, arm)** cell level, rotating arm order per
repetition:

```
rep 1:  W1[BASE] W1[HEAD] W1[CTRL]   W2[BASE] W2[HEAD] W2[CTRL] ...
rep 2:  W1[HEAD] W1[CTRL] W1[BASE]   W2[HEAD] W2[CTRL] W2[BASE] ...
rep 3:  W1[CTRL] W1[BASE] W1[HEAD]   ...
```

Rotation matters: fixed order within a rep gives one arm the cold-cache slot
every time, which is a systematic bias the control arm would then *absorb* and
mask. Aggregate per (workload, arm) across reps.

### 3.4 Fresh process per cell

Each cell runs in a **fresh process**. Same-process measurement of two builds is
not comparable — JIT state, GC pressure, and monomorphic call-site history from
arm A contaminate arm B, and the contamination is directionally biased toward
whichever ran first.

This is also why D1 rejected `repeat.ts` as a fitness source: it measures
**within-process** variance and the gate then licenses **cross-process,
cross-day** comparisons with it. R1's control arm measures the variance R1
actually uses — same process model, same job, same runner.

### 3.5 Worktree + dependency isolation

Two trees must coexist:

```
$RUNNER_TEMP/bench-base   # git worktree at merge base
$RUNNER_TEMP/bench-head   # git worktree at PR head   (CONTROL reuses bench-base)
```

Each needs its **own** `node_modules` and its **own build output**. A shared
install silently resolves one arm's package against the other's build — the
class of bug where the gate reports on code that was never in that arm.

- `bun install --frozen-lockfile` per worktree. The lockfiles may legitimately
  differ between base and head; that difference is part of what is being
  measured.
- Build each arm with its own `bun run --filter <pkg> build`.
- **Assert the arms are actually different** before measuring: if
  `sha256(base build output) == sha256(head build output)`, the PR does not
  touch the measured artifact and the gate should **skip** with that reason
  stated, not measure noise and call it a verdict.

`CONTROL` reuses the `bench-base` worktree and its build. It must **not** be a
copy of BASE's *measurements* — the entire value is that it is measured again.

### 3.6 Statistic: `p50` → median + a significance test

> **v0 specified `min` here and was wrong** — § 0.1 has the full correction.
> Briefly: the fast tail is contaminated too (Turbo Boost, idle neighbours), and
> `min` is an order statistic while this harness is **time-boxed**, so the faster
> arm collects more samples and earns a lower minimum for that reason alone.
> A min-based gate here inverts the instrument.

Compare **medians with a permutation test** (§ 3.1) plus a minimum effect size.
This is what every surveyed tool with an automated comparison does: Criterion.rs
(bootstrapped t-test), google/benchmark and Go `benchstat` (Mann-Whitney U),
hyperfine and Node core (Welch's t), ClickHouse (permutation on the median
difference).

**If any `min` is reported at all, pin sample counts exactly equal across arms
first** — otherwise the numbers are not comparable, for the reason above.

Per §2 this is **not** one change:

- **arbor** — the runner already emits `min`. Needed: a baseline carrying the
  column. Under R1 there is no committed baseline at all, so this resolves
  itself; `gate.ts:31-34`'s stated blocker disappears with the mechanism.
- **signals** — `min` must first be added to `runner.ts` (`stats.min` alongside
  `stats.avg/p50/p99`) and to the results table.

Keep emitting `mean/p50/p99` in the reports. They are useful context for a human
reading a run; they simply stop being the gate input.

### 3.7 What gets deleted, not filled in

R1 replaces rather than supplements:

- `bench/signals/fitness.json` — the whole `loadFitness` mechanism goes. It was
  a cross-run licence derived from within-run variance; R1 measures the right
  variance in-band, so there is nothing left for it to license. **Do not create
  this file** at any point during R1; doing so re-establishes the mechanism
  being removed.
- **Committed-baseline comparison** in both `gate.ts` files. `RESULTS.md` stays
  as a human-readable artifact and a historical record; it stops being a gate
  input. That also ends the standing "do not regenerate RESULTS.md" hazard —
  regenerating it can no longer move a gate.
- `C-FEL-BENCH-REBASELINE-MEASURED` becomes **moot**, not satisfied. There is no
  baseline to re-measure. Worth confirming explicitly with whoever owns that
  contract rather than assuming it lapses.

---

## 4. CI budget

Three arms replace one, and each cell is a fresh process. The naive cost is
>3× — that must be paid for deliberately, not absorbed by raising a timeout.

Current shape: `bench` is `timeout-minutes: 45`, `continue-on-error: true`, and
path-filtered (`needs.changes.outputs.bench == 'true'`), so it already runs only
on signals/bench changes. The same is true of `bench-arbor`. **The path filter is
the existing budget control and it stays.**

Levers, in the order they should be spent:

1. **Gate-tier workloads only in the A/B path.** arbor already tiers to two
   workloads. Report-only rows do not need both arms — measure them once, on
   HEAD, purely as log context. This alone removes most of the multiplier.
2. **Raise the sampling budget before touching architecture.** Our measured
   ~33 % per-workload false-positive rate implies a CV near **7.3 %** — roughly
   2.7× the 2.66 % that CodSpeed published for GitHub-hosted runners, and we
   measured ours on a *quiet dev box*. That gap is most likely the harness, not
   the machine: `min_cpu_time: 1_000_000_000` (1 s/cell) with mitata's
   `k_min_samples = 12` floor is a small sample budget. **Measure the noise
   floor first** (§ 5) — sampling may be a bigger lever than the architecture,
   and it is far cheaper to try.
3. **Only then** consider a longer timeout.

Measure the real cost during the harness build and record it here. Do not
promote into `ci-ok` (§6) without a measured runtime, because a gate that
routinely times out is a gate that fails on unrelated diffs — the exact disease
being cured.

---

## 5. Re-tiering, and the evidence that licenses it

Current tiers were assigned against the condemned mechanism, so they inherit its
credibility. After the harness exists but **before** promotion, re-derive them
from control-arm data:

1. Run the harness on **no-op PRs** (base == head) across ≥ 2 weeks of real CI,
   capturing the control-arm delta per workload per run. This is the same
   evidence standard D1 set for reopening its own decision — deliberately, so
   the bar to trust R1 is the bar D1 set to distrust its predecessor.
2. Per workload, compute the control-arm delta distribution. A workload is
   **gate-eligible** only if its p95 control delta sits comfortably below the
   threshold it would gate at.
3. Workloads that fail that test are report-only. If a *currently* gate-tier
   workload fails it, it drops — R1 is allowed to shrink the gate tier, and
   discovering that a workload was never gateable is a result, not a setback.

**No workload is promoted on the argument that R1 ought to be quieter.** The
control arm is not a claim; it is the measurement.

---

## 6. Rollout, and how it can fail visibly

Strict ordering, each step landing separately:

1. **This design doc.**
2. **Dual-arm harness**, `continue-on-error` still on, gate still advisory.
   Emits observed / noise / verdict, changes nothing about merges.
3. **Statistic swap** — `min` added to the signals runner (§3.6); arbor switches
   its comparison. Still advisory.
4. **CI budget** measured and tuned (§4). Still advisory.
5. **Re-tier** from ≥ 2 weeks of control-arm evidence (§5). Still advisory.
6. **Confirm it stays advisory**, and delete `fitness.json` handling and the
   committed-baseline paths. `continue-on-error` **stays on** and the timing
   gates stay out of `ci-ok` — § 0.3.

Every step ships advisory, and the last one keeps it that way. That is not
timidity; it is the industry's settled answer, and our own measured noise says
the same thing.

### 6.1 Where the rigour goes instead

Abandoning the blocking endpoint would be a retreat if nothing replaced it.
Something does — see § 0.4. Enforcement moves to metrics that are exact:

- **arbor** already has it: `counts.ts`, exact DOM writes/op, no bypass.
- **signals** needs the analogue: expose `runVer` (`packages/signals/src/signal.ts`)
  under `__DEV__` and assert exact reactive-recomputation counts per workload.
  Zero variance, machine-independent, and it fails in the right direction — a
  dead binding drives a count to zero, which screams, where it drives a timing
  down, which flatters.

**That is the deliverable worth doing first if R1 is ever deprioritised.** It is
smaller than R1, it blocks legitimately, and it catches the class of bug that
made the arbor baseline invalid in the first place.

**Rollback** is clean through step 5 — the gate is advisory throughout, so
reverting is deleting code nothing depends on. After step 6, rollback is
re-adding `continue-on-error` and removing the two `ci-ok` lines.

### What would falsify R1

Stated up front so it cannot be rationalised later:

- **Control-arm deltas stay near the threshold.** Then same-job measurement did
  not buy enough resolution, and the honest outcome is a *smaller gate tier* or
  no timing gate at all — not a larger `k`.
- **Abstention rate is high.** The gate is then mostly silent, and "mostly
  silent" must be reported as the result rather than tuned away.
- **Cost is not containable** within the path-filtered budget. Then gate-tier
  shrinks further.

A timing gate that honestly covers two workloads beats one that claims to cover
nine and is ignored. That is the same conclusion D1 reached from the other
direction.

---

## 7. Explicitly out of scope

- The **counted-metric gate** (`bench/arbor/src/counts.ts`) — exact,
  machine-independent equalities, no bypass. It is the trustworthy signal and R1
  does not touch it.
- Per-package **size gates** and **`bench-lsp`**.
- `[bench-bump]` — stays the audited override for a real gate-tier regression.
  R1 must not be built such that abstention becomes a substitute for it.

---

## 8. Open questions for review

1. **`ALPHA` and `MIN_EFFECT`** in § 3.2, and the resample `CAP`. All three
   should come from § 5's measured distributions rather than from taste.
   (v0 asked about `k`, which no longer exists.)
2. **Is `mount-deep-100x10` measurable at all?** It is gate-tier today on the
   condemned mechanism's authority, and § 5 may well drop it. Lower stakes now
   that nothing blocks on the answer — but still worth knowing, because a
   workload whose noise floor swallows any plausible effect is costing CI time
   to produce no information.
3. **`C-FEL-BENCH-REBASELINE-MEASURED`** — confirm it is moot under R1 rather
   than assuming it lapses; it is governance-gated and `needs C-FEL-409`, and
   that ordering was called load-bearing.
4. **Does signals need a workload tier at all?** arbor has one; signals gates
   all six. Given 2 of 6 drift past threshold on a no-op, signals probably needs
   tiering more than arbor does.

5. **Should we just use instruction counting instead?** The deterministic answer
   to all of this is counting retired instructions rather than measuring time —
   SQLite reports Cachegrind "*repeatable to 7 or more significant digits*"
   against wall-clock "*scarcely repeatable beyond one significant digit*", and
   `rustls` blocks CI at a **0.20 %** threshold on instruction counts. CodSpeed
   offers a Callgrind simulation mode, free for OSS, on plain `ubuntu-latest`,
   and **SolidJS 2 — a signals library plus a DOM library in one monorepo, our
   exact shape — runs it on every PR**. Known caveats: it forces V8 tier-up for
   determinism (Node.js removed forced optimization from its own benchmarks as
   unrepresentative), and instruction counts shifted ~1.6 % between AMD and
   Intel runners via glibc cache-size dispatch. Worth 20 same-commit runs to see
   whether the sub-1 % variance claim holds for reactive-graph workloads —
   nobody appears to have published that.
