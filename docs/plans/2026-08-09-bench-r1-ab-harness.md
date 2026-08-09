# R1 — same-job A/B bench harness

**Contract:** `C-FEL-BENCH-R1-AB-HARNESS`
**Status:** design doc — the first deliverable in R1's own stated order, and the
only one due now.
**Supersedes the mechanism condemned in:** `bench/signals/HARNESS.md`
§ "D1 — RESOLVED 2026-08-08".

> Deliverable order, from the D1 decision, unchanged here:
> **design doc → dual-arm harness → statistic swap (`p50` → `min`) → CI budget →
> re-tier the workloads against in-band control-arm evidence → only then delete
> the `continue-on-error` lines and promote the gates into `ci-ok`.**
>
> D1 also records that no sub-piece was found independently shippable *and*
> independently valuable: each exists to make the next one's number
> interpretable. Nothing below changes that. Do not land a partial R1.

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

### 3.1 Three arms, one job, one runner

Every gated run measures **three** arms and compares within the run:

| arm | tree | purpose |
|---|---|---|
| **BASE** | merge base of the PR | the reference |
| **HEAD** | PR head | the thing under review |
| **CONTROL** | merge base *again* | the in-band noise floor |

The verdict comes from two deltas:

```
observed  = HEAD    vs BASE      # what we want to know
noise     = CONTROL vs BASE      # what this runner can resolve today
```

`CONTROL` is the whole point and is what distinguishes R1 from "run both arms in
one job". It is a **second independent measurement of identical code**, so its
delta is pure instrument error. It converts the threshold from a constant
somebody guessed into a quantity this run measured.

### 3.2 The decision rule — abstain, don't guess

```
if |noise| >= THRESHOLD:          -> ABSTAIN (exit 0, loudly)
elif observed > max(THRESHOLD, k * |noise|):  -> FAIL
else:                             -> PASS
```

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

### 3.6 Statistic: `p50` → `min`

`min` is the least-contaminated estimator available here. Every source of noise
on a CI runner is additive and one-directional — preemption, interrupts, GC,
frequency scaling all make a sample *slower*, never faster. The minimum is the
sample least polluted by them; `p50` averages the pollution in.

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
   workloads. Report-only rows do not need three arms — measure them once, on
   HEAD, purely as log context. This alone removes most of the multiplier.
2. **Cut `min_cpu_time` per cell, raise repetition count.** `min` improves with
   *more independent samples*, not longer single runs; the current
   `min_cpu_time: 1_000_000_000` (1 s/cell) is tuned for stable `p50`. Shorter
   cells × more reps is strictly better for the statistic R1 uses, at similar
   total cost.
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
6. **Promote**: remove `continue-on-error`, add to `ci-ok`'s `needs` **and its
   result loop** — being in `needs` alone does nothing, per the palette hole
   documented in `plan-a.yml`, and `bun run check:gate-wiring` enforces the
   pairing. Delete `fitness.json` handling and the committed-baseline paths.

Steps 2–5 all ship advisory. That is not timidity: it is how the abstention rate
and control-arm distribution get measured under real load before anything can
block a merge.

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

1. **`k`** in §3.2 — start at 2, or derive it entirely from §5's distributions
   and hard-code nothing?
2. **Is `mount-deep-100x10` measurable at all?** It is gate-tier today on the
   condemned mechanism's authority. §5 may well drop it.
3. **`C-FEL-BENCH-REBASELINE-MEASURED`** — confirm it is moot under R1 rather
   than assuming it lapses; it is governance-gated and `needs C-FEL-409`, and
   that ordering was called load-bearing.
4. **Does signals need a workload tier at all?** arbor has one; signals gates
   all six. Given 2 of 6 drift past threshold on a no-op, signals probably needs
   tiering more than arbor does.
