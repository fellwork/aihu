# Investigation Report — cellx perf gap (Phase 2.5)

**Investigator:** Iron Law applied
**Date:** 2026-04-27
**Branch:** `perf/signals-cellx-fix`
**Wip checkpoint:** `99ea2c8`
**Token budget posture:** within 80k input cap; 1 hypothesis confirmed, 3 others rejected with evidence; no rejection-limit check-in needed.

---

## Failure report

The Architect's spec at `.team/phase-2-5/cellx-fix-spec.md` §2.7 predicted
cellx p50 of **1.8–2.4 µs** based on this analytic model:

> 12 × lazy notify (layers 1–3, 4 each): bit-set + Set iteration of notify.
> No recompute, no equals, no allocation.
> 4 × eager notify at layer 4: same cost as current per-node …
> 1 × effect.run.

The implemented fix delivered cellx p50 = **5.71 µs** — a 39% improvement
over Phase 2's 9.39 µs (passes the 10% bench gate cleanly), but **2.4×
slower than the Architect's prediction** and **4.6× slower than alien-signals
(1.25 µs)**.

The wip-commit body at `99ea2c8` named four candidate causes (V8
megamorphism, Set iteration overhead, read() branch tax, structural
recompute miscount). This investigation tests each with empirical
evidence.

---

## Hypotheses tested

### H4 (CONFIRMED — primary root cause): cellx workload's actual recompute count is dramatically higher than 16

- **Prediction (if H4 true):** the Architect's count of "16 inner computeds + 1 effect = 17 body executions per op" understates the actual graph cascade. Each computed body should execute meaningfully more than once per signal write.

- **Test:** instrumented the cellx workload graph with per-node body-execution counters. File: `c:/git/fellwork/aihu/.team/phase-2-5/scratch/cellx-counter.ts`. Ran one src write, measured the delta on each computed and the effect.

- **Evidence:** per-op body-execution counts on **aihu @ `99ea2c8`**:

  | Layer | Per-node evals | Total per layer | Architect's model |
  |---|---:|---:|---:|
  | L1 (4 nodes) | 1 | 4 | 4 |
  | L2 (4 nodes) | 2 | 8 | 4 |
  | L3 (4 nodes) | 4 | 16 | 4 |
  | L4 (4 nodes) | 8 | 32 | 4 |
  | Effect | — | **32** | 1 |
  | **TOTAL** | | **92** | **17** |

  **5.4× more body executions than the analytic model predicted.**

  Comparison: same instrumentation on **alien-signals (1.25 µs p50)** — same graph, same `src(1)` op:

  | Layer | Per-node evals | Total |
  |---|---:|---:|
  | L1 (4 nodes) | 1 | 4 |
  | L2 (4 nodes) | 1 | 4 |
  | L3 (4 nodes) | 1 | 4 |
  | L4 (4 nodes) | 1 | 4 |
  | Effect | — | 1 |
  | **TOTAL** | | **17** |

  Alien hits the predicted-by-architect count exactly. Aihu runs 5.4× the work.

  Ordered execution trace (file: `c:/git/fellwork/aihu/.team/phase-2-5/scratch/cellx-trace.ts`) — first 24 lines of the 92-event log for one op:

  ```
  l4[0]   l3[0]   l2[0]   l1[0]   EFFECT
  l4[3]   EFFECT
  l4[2]   l3[3]   EFFECT
  l4[3]   EFFECT
  l4[1]   l3[2]   l2[3]   EFFECT
  l4[2]   EFFECT
  l4[2]   l3[3]   EFFECT
  ...
  ```

  The pattern is unmistakable: **the effect re-fires after every L4 cascade,
  and each effect re-firing reads all 4 L4, several of which are STALE and
  re-trigger their recompute chain**. Each L4 cascade then *re-cascades* to
  the effect.

  **Per-body-execution timing breakdown:**

  | Engine | Body execs / op | p50 / op | ns / body exec |
  |---|---:|---:|---:|
  | aihu | 92 | 5,710 ns | **62 ns** |
  | alien-signals | 17 | 1,250 ns | **74 ns** |

  Aihu is actually *faster per body-execution* than alien (~16% faster).
  The entire perf gap is explained by aihu doing 5.4× more bodies. This
  rejects the micro-overhead hypotheses (H1, H2, H3) as primary causes.

- **Verdict:** **CONFIRMED** as the primary root cause.

#### Why the model under-counted: the diamond glitch storm

Tracing the cascade explains the 5.4× multiplier. The implementation's
notify+recompute is **interleaved depth-first**, not staged. When src
writes:

1. `src.write` calls `l1[0].notify` first.
2. `l1[0].notify` (lazy) → marks `l1[0]` STALE → iterates subs `{l2[0], l2[3]}` (recursing depth-first).
3. The cascade descends to `l4[0].notify` (eager, first L4 reached). Eager path:
   - `recompute()` runs `l4[0]`'s body. Body reads `l3[0]` (STALE → recomputes; pulls `l2[0]`, `l1[0]`, src) and `l3[1]` (NOT YET STALE — `l1[1]`'s cascade hasn't happened — cache hit on stale data).
   - `recompute()` clears `l4[0]`'s STALE bit at the end.
   - Eager path then **iterates `[...subs]` and calls `effect.notify()` → `effect.run()`**.
   - Effect body reads `l4[0]` (cache hit) **and l4[1], l4[2], l4[3] — none of which are STALE yet**, but l4[1] has stale upstream values. Effect runs its body to completion. **Effect run #1.**
4. Cascade unwinds back up. Continues iterating subs of `l3[0]` → calls `l4[3].notify`. `l4[3]` is **NOT STALE** (its bit was never set by an earlier cascade), so the `if (STALE) return` short-circuit does *not* fire. Eager path runs again on `l4[3]` → recomputes → cascades → **effect.run #2**.
5. Cascade unwinds further. `l1[0]`'s subs continue to `l2[3].notify`, which cascades down through `l3[2]`, `l3[3]`, hitting `l4[2]`, `l4[3]` again. `l4[3]` was just recomputed and its STALE bit was cleared by `recompute()`. So when this cascade reaches `l4[3].notify`, STALE is unset → **L4[3] recomputes a second time** → cascades to effect again.

The pattern repeats across the depth-first cascade until every L4 has been visited 8 times = **32 L4 recomputes and 32 effect runs per op**, with proportional multipliers on L3 (16) and L2 (8).

#### Why the architect's design didn't prevent this

The architect's hybrid design preserves Phase 2's invariant that
`recompute()` clears STALE on completion (`computed.ts:51`). The eager
path therefore *always* re-runs on a subsequent `notify()` to the same
node, because the STALE-already-set short-circuit only fires while STALE
is still set. In a diamond, the cascade reaches each terminal L4 multiple
times (once via each of its parent L3 subs); the first visit clears
STALE, every later visit re-fires the entire eager path.

This mirrors the **classic "diamond glitch"** that algorithms like alien-
signals' two-phase mark/sweep, Solid's batched scheduler, or @preact's
generation counters explicitly prevent. Aihu's depth-first immediate-
cascade has no such protection.

The Builder's wip-commit body partially anticipated this — quoting from
`99ea2c8`:

> The diamond test in spec §4.3 originally asserted "exactly once per
> signal write" (l2*=2, effectRuns=2). That count is unachievable on the
> 2-layer-without-lazy-buffer test shape — the classic diamond glitch
> fires …

The Builder concluded "cellx itself avoids the glitch via 3 lazy layers
between source and the eager terminal layer" — that conclusion is
**empirically wrong**: the lazy layers help with body-eval suppression at
non-terminal layers (L1/L2/L3 ratios 1:2:4 are bounded by the diamond's
structural fanout, not by per-write re-firing), but the glitch fires
hardest *at the eager terminal layer* exactly because L4 has multiple
parent paths and the eager path re-fires per parent visit. The Phase 2.5
fix moved the glitch from "everywhere" to "concentrated at L4 + the
effect", which is a smaller (39% improvement) but not architectural fix.

---

### H1 (REJECTED): V8 megamorphic inlining of two-path notify()

- **Prediction (if H1 true):** if V8 treats `notify()` as megamorphic at
  the call site (because the two branches behave very differently),
  per-notify cost should be elevated regardless of which branch runs.
  The wide-fanout-100 workload, where every computed has
  `hasEffectSub === true` (single-effect-per-computed), should pay the
  megamorphic cost despite only ever taking one branch.

- **Test:** compare wide-fanout-100 p50 to aihu before the fix.
  Phase 2 baseline (per `RESULTS.md` git history): `wide-fanout-100`
  p50 ~= 10.19 µs. Post-fix: 8.97 µs. Wide-fanout *improved* 12%.

- **Evidence:** if megamorphism were taxing the call site, wide-fanout
  would have regressed (it pays the lookup cost without gaining the
  lazy-path saving). Instead, it improved by 12% — the boolean check
  is being inlined cleanly. Additionally, the per-body-execution
  cost calculation under H4 (`aihu = 62 ns/body, alien = 74 ns/body`)
  shows aihu is faster per call than alien, ruling out a
  general per-call overhead from megamorphism.

- **Verdict:** **REJECTED.** The hot-path notify() call is not
  megamorphism-taxed. The wide-fanout improvement also suggests V8 is
  monomorphizing the call site (or the cost is below the noise floor).

---

### H2 (REJECTED): Set iteration overhead in the lazy path

- **Prediction (if H2 true):** the `for (const sub of subs)` allocates an
  iterator object per notify call. In cellx's deep diamond, this fires
  ~12 times for the lazy successful notifies plus more for the
  short-circuited paths. If iterator allocation cost is meaningful,
  removing it (or replacing with an array-backed sub list) should
  meaningfully shrink the per-op time.

- **Test:** quantitative ceiling check. The lazy path fires across
  4 L1 + 4 L2 + 4 L3 = 12 successful lazy notifies per op (plus ~12
  short-circuited, which exit before the iterator). Conservatively:
  even if Set iterators cost 100 ns each (they cost ~10 ns in practice
  on V8/JSC), 12 × 100 ns = 1,200 ns = **1.2 µs maximum** contribution
  to the per-op time. Total per-op time is 5.71 µs; gap to predicted
  is 3.31 µs minimum, gap to alien is 4.46 µs.

- **Evidence:** even at the pessimistic ceiling, Set iteration
  cannot account for the gap. The dominant cost is the **5.4× extra
  body executions** (H4), which by themselves explain ~4.5 µs of
  the gap (62 ns × (92 − 17) extra body executions = 4.65 µs). That
  matches the gap to alien (5.71 − 1.25 = 4.46 µs) within ~5%.

- **Verdict:** **REJECTED** as primary cause. May be a marginal
  contributor (~5–10% of the gap) but cannot explain the 2.4×
  prediction-miss alone.

---

### H3 (REJECTED): Eager-path `read()` branch tax

- **Prediction (if H3 true):** the new `read()` adds two extra checks
  per call: `if (!subs.has(observer))` and `(observer.flags & EFFECT)`.
  If `read()` is hit hard during cellx, this branch tax matters.

- **Test:** count `read()` invocations during one cellx op. With the
  92 body executions confirmed in H4, the read count is bounded as
  follows. Each computed body reads ≤ 2 deps. 92 - 32 (effect runs)
  = 60 computed-body executions × 2 reads = ~120 computed-read calls.
  Plus 32 effect runs × 4 reads of L4 = 128 read calls. Plus L1's reads
  of `src` (signal, not computed) ~4 × 1 = 4. Total computed-`read()`
  calls ≈ **248 per op**.

- **Evidence:** the H4 numbers already confirm aihu runs at ~62 ns
  per body-execution (including all the read() overhead). Even if the
  branch tax adds 5 ns per read (a generous overestimate — it's a
  Set.has() lookup which is ~3-4 ns hot in V8 plus a single bit-AND),
  248 reads × 5 ns = 1,240 ns = **1.24 µs ceiling** contribution. As
  with H2, this is below the 4.5 µs gap. Furthermore, the wide-fanout
  workload also pays this branch tax on every read and *improved* by
  12% — if the branch were a meaningful tax, wide-fanout would not
  have improved.

- **Verdict:** **REJECTED** as primary cause. May be a marginal
  contributor.

---

## Root cause

**The cellx workload has a diamond glitch that the implemented design
does not prevent.** Specifically:

1. The eager path on `computed.notify()` calls `recompute()`, and
   `recompute()` clears the `STALE` bit on completion (`computed.ts:51`).

2. The notify cascade is depth-first interleaved with recompute: when
   the cascade reaches a terminal L4 node, that node eager-recomputes,
   cascades to the effect, and the effect runs. Then the cascade unwinds
   and continues to other L4 nodes — which were never STALE-marked
   because their cascade hasn't yet arrived — so they too eager-recompute
   on first visit.

3. After an L4 has recomputed once (and cleared its STALE bit), a *later*
   cascade arrival at the same L4 finds it not-STALE, so the
   `if (STALE) return` short-circuit at `computed.ts:61` does not fire.
   The L4 sets STALE again and re-runs its full eager path — recompute,
   equals, cascade to effect.

4. The cascade is depth-first interleaved with recompute, so each src
   write triggers a chain reaction whose body-execution count grows
   with cascade depth in a diamond. In cellx, the graph fan-in is 2 at
   every level (each Lk node has 2 Lk-1 parents). The measured per-node
   eval counts double per layer:
   - L1: **1 eval per node × 4 nodes = 4 total** (matches model — only one parent: `src`)
   - L2: 2 evals per node × 4 nodes = 8 total
   - L3: 4 evals per node × 4 nodes = 16 total
   - L4: 8 evals per node × 4 nodes = **32 total**
   - Effect: **32 runs** (one per L4 cascade arrival)

   Confirmed in `c:/git/fellwork/aihu/.team/phase-2-5/scratch/cellx-counter.ts`
   and corroborated by the order-trace at
   `c:/git/fellwork/aihu/.team/phase-2-5/scratch/cellx-trace.ts`.

   The doubling-per-layer is the structural signature of the diamond
   glitch: each `notify()` arrival at an already-recomputed L4 finds
   STALE cleared, runs the eager path again, reads its 2 parents (one
   STALE, one not), recomputes the STALE one (which itself recurses).
   The result is a binary-tree-shaped recompute storm whose root is the
   terminal L4 layer.

5. **The architect's spec §2.7 model assumed each computed runs at most
   once per signal write.** That assumption is correct for *linear chains*
   (where Phase 2's tests live) and for *fan-out* graphs (wide-fanout-100,
   where each computed has only one parent). It is **wrong for diamond
   graphs** — the cellx benchmark.

**Quantification:**

- Predicted body executions: 17 / op
- Actual body executions: 92 / op
- Multiplier: **5.4×**
- Predicted p50: 1.8–2.4 µs
- Actual p50: 5.71 µs
- Per-body-execution speed: 62 ns/eval (aihu), 74 ns/eval (alien)
- Gap explained by H4 alone: (92 − 17) × 62 ns = **4.65 µs** ≈ aihu-vs-alien gap of 4.46 µs.

The gap is **fully explained by the work multiplier**. Aihu's per-call
overhead is competitive; the design just does ~5.4× more work than
necessary on diamond graphs.

---

## Recommended fix scope (NOT a fix design)

The Investigator role does not propose fix designs. The Architect should
explore options around:

1. **A glitch-free scheduling model.** The current design's
   "depth-first immediate cascade with `recompute()`-clears-STALE"
   semantics is structurally vulnerable in diamonds. The Architect
   should consider one of the standard glitch-free strategies, in
   approximate increasing order of size cost:
   - **Two-phase mark/propagate (alien-signals, S.js).** First pass:
     traverse the cascade marking STALE bits without recomputing
     anything. Second pass: schedule effects to run; effects pull
     through STALE chain via `read()`, recomputing each computed at
     most once. Requires a graph-traversal phase the current design
     lacks.
   - **Generation/version counter (Preact, MobX).** Each signal carries
     a write-version. Each computed caches `(value, lastSeenVersion)`.
     Reads fast-path when version matches; otherwise pull-and-validate.
     No notify cascade at all for stale propagation.
   - **Topological ordering with batched effect scheduling (Solid,
     Vue's scheduler).** The notify cascade enqueues effects in a
     scheduler; effects run after the cascade settles and pull through
     stable values. Requires the scheduler crate that arbor-resident
     telemetry was already considering.

2. **Whether the Phase 2.5 spec's structural goal can be reached without
   a full algorithmic rewrite.** A bounded improvement might come from:
   - Tracking which computeds have already cascaded in *this notify
     wave* (a generation counter on the wave) and using that, not the
     STALE bit, as the "already-visited" predicate. Cost: ~1 word per
     computed, one increment per signal write.
   - Refusing to clear the STALE bit during the eager path's
     `recompute()` until the cascade settles. (Hairy — requires care
     not to break the read-driven recompute path.)

3. **Whether to revise the Phase 2.5 perf target.** The current
   implementation delivers 39% improvement and passes the bench gate.
   It is 4.6× off alien-signals; closing that gap requires the
   algorithmic rewrite in (1). If the Team Lead's roadmap doesn't
   prioritize that rewrite for Phase 2.5, the realistic perf ceiling
   on the current design is approximately **5.0–5.7 µs** (where we
   are now). The hard target of 2.6 µs from the spec is unreachable
   without addressing the work multiplier.

The Architect's spec model in §2.7 is sound for linear and fan-out
graphs; the model needs to be **extended with a diamond-specific work-
multiplier estimate** before predicting cellx-shape perf in any future
spec.

---

## Tested-and-rejected hypotheses (full record)

Three rejected with evidence trail above:
- **H1 (V8 megamorphic notify):** rejected by wide-fanout-100 *improving*
  12% post-fix; if megamorphism were taxing the call site, wide-fanout
  would have regressed.
- **H2 (Set iteration overhead):** rejected by ceiling analysis — even at
  100 ns/iterator (10× realistic), the contribution is ≤1.2 µs, can't
  span the 4.5 µs gap.
- **H3 (read() branch tax):** rejected by ceiling analysis (~1.2 µs) and
  by wide-fanout's improvement despite paying the same tax.

Within the 3-rejection limit per orchestration plan §4. No check-in
required.

---

## Confidence in root cause

**HIGH.** Evidence:

1. Empirical body-execution counts on aihu (92/op) and alien (17/op)
   measured with the same instrumented graph. Files preserved at
   `c:/git/fellwork/aihu/.team/phase-2-5/scratch/cellx-counter.ts` and
   `cellx-counter-alien.ts`.
2. The work multiplier (5.4×) directly explains the perf gap to within
   5% (4.65 µs predicted from work, 4.46 µs measured gap to alien).
3. Per-body-execution timing (62 ns aihu vs. 74 ns alien) rules out
   per-call micro-overhead as a cause.
4. Order-trace evidence (`cellx-trace.ts`) shows the exact glitch
   mechanism: effect re-firing per L4 cascade, with each effect run
   pulling fresh recomputes through the chain.
5. The Builder's own commit body at `99ea2c8` independently noticed
   diamond-glitch in the spec §4.3 test fixture — partially confirming
   the same structural issue.

**Caveats:**

- The 92-execution count is per-build deterministic on this implementation;
  small refactors to iteration order could shift the multiplier slightly
  but not change the algorithmic class of the problem.
- I did not run a full V8 CPU profile (the `--cpu-profile` path), because
  the body-count evidence is conclusive enough that profiling would only
  refine attribution within the H4 cause, not change the root-cause finding.
  If the Team Lead wants %-attribution per node-execution-vs-other-cost for
  a follow-up perf-budget conversation, that profile is still available.

---

## Files referenced (all absolute paths)

- `c:/git/fellwork/aihu/.team/phase-2-5/cellx-fix-spec.md` — the spec being investigated (§2.7 is the model that's wrong)
- `c:/git/fellwork/aihu/packages/signals/src/computed.ts` — implementation (line 51 clears STALE; line 61 short-circuits on STALE)
- `c:/git/fellwork/aihu/packages/signals/src/effect.ts` — effect node (always EFFECT bit set; eager path in computed.notify always cascades to it)
- `c:/git/fellwork/aihu/bench/signals/src/workloads/cellx.ts` — the diamond workload (4×4 grid, fanin-2 per node, terminal effect reads all 4 L4)
- `c:/git/fellwork/aihu/bench/signals/RESULTS.md` — the 5.71 µs measurement
- `c:/git/fellwork/aihu/.team/phase-2-5/scratch/cellx-counter.ts` — aihu instrumentation (preserved for reproducibility)
- `c:/git/fellwork/aihu/.team/phase-2-5/scratch/cellx-counter-alien.ts` — alien-signals comparison instrumentation
- `c:/git/fellwork/aihu/.team/phase-2-5/scratch/cellx-trace.ts` — execution-order trace

---

## What this report does NOT do (per Iron Law)

- It does not propose a specific fix design. The Architect owns that.
- It does not modify the implementation files. The wip checkpoint is preserved.
- It does not assert the perf target is reachable in Phase 2.5. That is a
  Team Lead decision informed by this report.
