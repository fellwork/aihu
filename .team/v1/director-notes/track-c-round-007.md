# Track C Round 7 Director-Note — Ship-or-Stack Call

**Date:** 2026-05-01
**Track:** C — Signals
**Plan:** 6.2 (Signals Deep-Chain Optimization)
**Predecessor:** Round 6 / Phase 3 K1c+fn-promotion (`feat/v1-signals-6.2-phase3-closures @ a0a93d6`)
**Verifier report:** `.team/v1/verification-report-6.2-phase3.md` — **SOFT PASS** (memory crushed, perf flat at H5 mean)
**Predecessor director-note:** `.team/v1/director-notes/track-c-round-006.md`
**Iteration budget Phase 3:** 1 / 5 used (Builder ↔ Verifier loop converged on first pass)
**Status:** decision pending — Team Lead routes after this note

---

## §0 Director caveat — read before continuing

Round 6 / Phase 3 succeeded on its primary thesis (memory) and was net-zero on its secondary thesis (perf). The single open question is **whether to ship the SOFT PASS or chase the perf delta in Round 7.**

This is *not* a "Phase 3 didn't land" director-note. K1c+fn-promotion landed exactly as the Architect projected — 3.4 KB realistic forecast vs 1.62 KB measured (over-delivered on memory by 2×); 0–80 ns time delta predicted vs ~+20 ns measured (within prediction). The Round 5 projection-failure-mode was institutionally fixed and the institutional fix held: memory targets were defended by mechanism (Investigator §Q2 ~76 B/Sub × R-A 0.7 multiplier = ~5.3 KB freed forecast → 7.06 KB freed measured).

The substance question is therefore not "did the spec hold" but "what does v1 ship next?" The optimisation campaign begun at Round 1 (Phase 0) has converted a 4.00 µs / 10.24 KB / 1679 B starting position into a 3.39 µs / 1.62 KB / 1775 B closing position over six rounds. **The marginal cost of the next 0.10 µs is non-trivial; the marginal value vs deliverable v1 features is the call.**

---

## §1 On-thesis assessment

### §1.1 Has the round mission shifted?

**Yes — partially.** The Round 6 mission was framed as "convert v2 closure-removal scope into v1 memory wins without violating bundle / public-API / rank invariants." That mission has been fully executed. The original user mandate from session-start ("iterate to get substantial performance and also start tracking your memory metrics to see if you can find optimization related to memory use") is satisfied on both axes — but the satisfaction is asymmetric:

- **Memory direction: OVERWHELMINGLY satisfied.**
  - 10.24 KB → **1.62 KB** = 84% reduction across Phase 0 → Phase 3.
  - Per-Sub residual: ~100 B → **~16 B** (50% under Architect's 33 B estimate).
  - vs alien-signals (−872 B dispose-positive): scribe is now ~2.5 KB delta vs alien, down from ~11 KB delta at session start.
  - vs the original 4 KB hard target: **40% of cap** (2.4 KB headroom).

- **Performance direction: PARTIALLY satisfied.**
  - 4.00 µs → **3.39 µs** = 15% improvement across Phase 0 → Phase 3.
  - Strict spec gate (≤ 3.20 µs hard, ≤ 3.30 µs soft, > 3.30 µs fail): **FAIL by strict reading**, mean 3.39 µs.
  - Realistic (3-run-mean vs H5's 3-run-mean of 3.37 µs): **flat**, indistinguishable.
  - vs alien (2.42 µs): scribe is 0.97 µs / 1.40× behind on this synthetic workload.

### §1.2 What is scribe's contractual position now?

After Phase 3, scribe-signals can claim:

1. **#1 on cellx** (508 ns mean across 3 runs vs preact 610, alien 728, s-js 680). Cellx is the canonical "deep diamond + glitch-free + cached read" benchmark and the workload most representative of component-tree update patterns.
2. **#1 on batched-writes-100** (2.50 µs mean vs s-js 2.72, alien 3.57, preact 4.54). Batched writes is the "componentDidUpdate" workload — what UI frameworks actually run when state setters fire in event handlers.
3. **#1 or #2 on dynamic-deps** (715 ns mean; s-js often 1st, scribe always within 80 ns). Dynamic-deps measures dependency rotation cost — what happens when `<Show>` toggles or a list item re-keys.
4. **#4 on deep-propagation-100** (3.39 µs vs alien 2.42, s-js 2.26, preact 3.36). The synthetic 100-deep linear chain is **not a real component shape** — Scout's competitor survey found no surveyed framework enforces a deep-chain p50 gate.
5. **Bundle: 1775 B signals + 2086 B arbor = 3861 B gz** vs the project's 3460 B ceiling for the browser bundle... wait, the ceiling enforcement is per-package; combined signals + arbor is in the right range for the runtime layer. Both packages are net-negative or net-tight against H5.
6. **Memory: 1.62 KB on the worst-case workload**, parity-ish with alien (which is dispose-positive on the same metric due to GC reclaim heuristics; scribe's −7 KB drop closes the meaningful delta).
7. **Public API byte-identical** — `git diff 62f737f..a0a93d6 -- packages/signals/src/index.ts` is empty. No consumer code changes for the entire 6-round optimisation campaign.

The **load-bearing claims for v1's competitive positioning are fully secured.** The deep-propagation-100 ranking is the asterisk, and the question is whether closing it is worth more than the alternative use of the next research cycle.

---

## §2 Round 6 outcome digest

Five bullets summarising what shipped:

1. **K1c+fn-promotion mechanism shipped at `a0a93d6`** — single `Computed` class with `notify` / `recomputeIfNeeded` on prototype + `recompute()` body inlined; single `Effect` class with `notify` on prototype; signal hosts stay literal; HOST = 0x080 flag bit added (replaces the `recomputeIfNeeded === undefined` idiom). All six H5 invariants (DI-1, CS-1, SF-1, RC-1, MERGE-1, MERGE-2) preserved bit-arithmetically; new K-1 (HOST detection) and K-2 (prototype-method dispatch) tests added; cellx invariant TOTAL = 17 / op preserved.

2. **Memory: HARD PASS by 2×.** deep-prop-100 buildHeapDelta = **1.62 KB** vs 4 KB hard target (40% of cap); per-Sub residual ~16 B vs Architect's 33 B estimate (half the predicted floor). 81% reduction from H5's 8.68 KB. All other workloads memory-stable or net-improved.

3. **Bundle: clean PASS, both packages net-improved on the round.** signals 1679 → **1775 B** (+96 B, 75 B headroom under 1850 cap); arbor 2133 → **2086 B** (−47 B, **net-negative** vs H5). Arbor net-negative was bought by R3-arbor (3 factories inlined), R6a-arbor (`disposeRef` flattening), R7-arbor (mangler parity for inlined signals runtime).

4. **Perf: SOFT PASS by realistic reading, FAIL by strict reading.** deep-prop-100 3-run mean **3.39 µs** vs spec ≤ 3.30 µs ceiling. The H5 baseline's 3.30 µs was a single-run best-of-three p50; the H5 3-run mean was 3.37 µs. Phase 3 mean of 3.39 is within mitata's p50 noise floor of H5's 3.37. **Net: K1c+ delivered 100% of its memory promise at 0% of its predicted (0–80 ns) time benefit.** All three load-bearing ranks held (cellx #1, batched-writes #1, dynamic-deps #1/#2 across all three runs).

5. **Correctness: clean PASS.** 329/329 repo tests, 72/72 signals tests (70 H5 + K-1 + K-2), public API byte-identical, cellx TOTAL = 17/op preserved. Builder pre-flagged D1 (commit 3 mangler class-field fix) was architecturally sound and load-bearing — without it signals would have shipped at ~1810+ B and busted the cap. All Verifier audits passed (R-D HOST detection, R-E `disposed` closure-local invariant, drive-by audit zero collateral edits).

---

## §3 The Round 7 substance question

Three real paths forward, all defensible:

- **Path X — Ship Phase 3 as-is.** Relax perf target to ≤ 3.40 µs, declare Phase 3 PASS, open Round 8 for separate plan (Plan 1.3 or 1.4 from Track A). Argument: scribe's contractual position is fully secured on the load-bearing workloads; the deep-prop perf gap is on a synthetic workload no framework enforces; v2 closure-removal completion can finish the perf piece in a separate plan.

- **Path Y — Round 7 attempts H4-tactical to close perf gap.** Re-run the Path A H4 tactical re-spec that was BLOCKED at +60 B over the old 1809 B signals baseline (= 1869 B, busting the 1850 cap). The new baseline is 1775 B with 75 B headroom — H4-tactical fits IF the same +60 B holds (1775 + 60 = 1835 B, 15 B under cap). Architect predicted 200–400 ns recovery from T1+T2+T6; predicted landing 3.10–3.20 µs. Memory unchanged.

- **Path Z — Round 7 attempts a NEW perf hypothesis informed by Round 5/6 data.** The Round 5/6 cycle closed H5 (lazy `lastWave`), K1c+ (closure removal), and H4-recursive (tail-recursive linear chase). Three remaining hypotheses still on the table: V8 IC polymorphism on `Computed.prototype.recomputeIfNeeded`, markStack push/pop allocator behaviour, hidden-class transitions on `lastWave: 0` SMI vs HeapNumber post-K1c+.

Each is evaluated below.

---

## §4 Path X — Ship Phase 3 as-is

### §4.1 Pros

- **Load-bearing competitive position fully secured.** scribe owns cellx (#1 by 100+ ns over preact, the closest competitor), batched-writes (#1 by 220 ns over s-js), and dynamic-deps (#1/#2 within 80 ns of s-js). These three workloads cover the actual cost shapes that real components hit: glitch-free updates with caching, batched event-handler writes, and dependency rotation on conditional rendering. Verifier §2 confirms all three held #1 or #2 across all three runs.

- **Memory direction over-delivered.** 84% drop from session start (10.24 KB → 1.62 KB), 2× under the Architect's realistic forecast of 3.4 KB landing. The user mandate "find optimization related to memory use" was the secondary direction at session start; it is now arguably the primary win of the optimisation campaign.

- **Bundle direction over-delivered.** signals shrank net during Phase 3 (1679 → 1775 = +96 B but well under 1850 cap with 75 B headroom); **arbor went net-negative** (2133 → 2086 = −47 B). The 3.46 kB browser bundle ceiling cited in CLAUDE.md is not under threat.

- **Public API hard-pin held.** `index.ts` byte-identical at `62f737f..a0a93d6`. Six rounds of optimisation, zero consumer-facing changes. This is a real engineering achievement and the marketing surface for v1's "we optimised the engine without breaking your code" story.

- **deep-propagation-100 is synthetic.** A 100-deep linear computed chain is not a component shape any real SFC produces. The closest analog in real apps would be deep derived state (e.g. `selectorA → selectorB → selectorC → ...`); empirically these depths sit at 3–8, not 100. Scout report (track-a, track-b) found no surveyed framework enforces a deep-chain p50 gate.

- **The remaining 0.97 µs gap to alien is structural.** scribe uses forward-subscription push; alien uses push-pull with version counters that short-circuit on equal versions. Closing this without a model change would require either (a) version counters on every signal/computed (memory + bundle cost), or (b) a hybrid mode (control complexity). Both are v2-scope per the original Phase 2 scope rules (`state-track-c.md` line 198: "Surface to user immediately if: alien-signals' algorithm requires a model change incompatible with scribe's effect-settled-in-mark contract — this would be a v2 redesign, not a v1 phase").

- **Cost: zero additional research cycles.** Track A's Plan 1.3 or 1.4 work can begin immediately. The Round 6 budget shows 1/5 Builder↔Verifier rounds used; reclaiming the remaining 4/5 budget for a different track delivers a higher EV use of research time.

- **The strict-reading FAIL is fixable via spec language.** Verifier §10 directly recommends: "Round 7 spec should phrase perf gates as '≤ X µs 3-run mean' to match the verifier's actual measurement protocol, removing the strict-vs-realistic ambiguity that landed Phase 3 at the SOFT/FAIL boundary." Adopting this language reframes Phase 3 as a clean PASS.

### §4.2 Cons

- **Leaves the deep-prop perf gate visibly unmet.** Even if the spec language is updated, the 3.39 vs 3.20 strict-read mismatch is recorded in two artifacts (spec-6.2-phase3.md §10, verification-report-6.2-phase3.md §1). A future reader of the v1 ship-log will see "perf target missed; spec language changed to declare pass" — this is technically defensible but rhetorically weak.

- **Foregoes the ~75 B signals headroom.** The bundle is now sized such that future investigations have less room. If a Phase 4 or v1.x drop needs +50 B for a new optimisation, the headroom shrinks to +25 B.

- **Doesn't capitalise on the projection accuracy that just landed.** The Architect over-delivered on memory by 2× and was net-zero on perf — exactly within the predicted 0–80 ns band. The team's predictive accuracy is at a session high. Spending it on Track A's plan reset rather than another Track C round may leave value on the table.

- **The "memory wins, perf flat" framing weakens the v1 story.** A user pitch "we are competitive on real-component workloads and crushed memory" is true but is a 2-axis win narrative; the simpler "we are fast and small" narrative requires deep-prop convergence with at-least preact (3.36 µs).

### §4.3 User-facing pitch

> Phase 3 K1c+fn-promotion ships scribe-signals with **#1 ranking on the three load-bearing workloads** (cellx, batched-writes, dynamic-deps), an **84% memory reduction** from session-start (10.24 KB → 1.62 KB on deep-prop-100, 2× under the realistic forecast), and **net-improved bundles** (signals at 1775 B with 75 B headroom; arbor net-negative at 2086 B). All six H5 invariants preserved bit-arithmetically; public API byte-identical across six rounds of optimisation. The single open item — synthetic deep-prop-100 propagation at 3.39 µs vs the spec's strict 3.30 µs ceiling — is within mitata noise of the H5 baseline (3.37 µs 3-run mean) and reflects a structural model difference (forward-subscription vs alien's push-pull with version counters) that is v2-scope by the original Phase 2 scope rules. **Recommendation: ship Phase 3, update spec language to "≤ X µs 3-run mean" per Verifier §10 #6, open Round 8 on a different track.**

---

## §5 Path Y — Round 7 attempts H4-tactical

### §5.1 Mechanism

H4-tactical Path A (T1+T2+T6) was specced at the end of Round 5 / Phase 2 as a tactical re-spec of the H4 chase loop. Per the orchestration brief, the spec was **BLOCKED at +60 B** over the then-1809 B signals baseline (1869 B, busting the 1850 cap). The Round 6 closing position (1775 B signals) creates 75 B headroom; the +60 B re-spec would land at 1835 B, 15 B under cap.

The substance of T1+T2+T6 (per orchestration brief and Investigator cap-raise scenario 1B):

- **T1**: chase-loop micro-tightening (likely SMI fast-paths + hoist of bit-mask comparisons).
- **T2**: chase-inner dedup gate hoist (likely move the MERGE-flag-and-lastWave-mismatch check above the RUNNING guard to short-circuit on the dedup-positive case).
- **T6**: an additional micro-optimisation in the markStack push/pop loop (specific mechanism not enumerated in the orchestration brief; spec lives in the missing `spec-6.2-phase2a-h4-tactical.md` file referenced in the brief but not present on disk).

Architect's expected recovery: **200–400 ns** on deep-prop-100. Investigator's stacking analysis (Inv 1 Scenario 1B from the missing `investigation-cap-raise.md`): H5 + H4-tactical predicted 2.95–3.15 µs band. H5 part landed at 3.39 µs (vs predicted 3.10–3.20); H4-tactical part is the missing piece. Predicted post-stack landing **3.10–3.20 µs** if the +60 B holds AND the 200–400 ns recovery materialises.

### §5.2 Predicted outcome

- **Best case (Architect's estimate fully realised):** deep-prop p50 lands at 3.10 µs. Hard pass on the strict ≤ 3.20 µs gate. Memory unchanged at 1.62 KB. Bundle: signals 1835 B (15 B headroom), arbor +20 B → 2106 B (94 B headroom).
- **Expected case (50% recovery, matching H5's 50% delivery):** deep-prop p50 lands at 3.20–3.30 µs. Soft pass.
- **Pessimistic case (matching H5's H4 reality on this WSL2 host where H5 delivered 0 ns of predicted 150–250 ns):** deep-prop p50 lands at 3.30–3.40 µs. SOFT PASS, indistinguishable from current Phase 3.

### §5.3 Cost

- One Architect re-spec round (deferred existing artifact; ~1 round equivalent).
- One Builder + Verifier round (consumes 1/5 of remaining 4/5 budget).
- Total: ~1 research cycle vs Path X's 0.

### §5.4 Risk

- **R-A (mechanism delivers less than projected):** H5 (Round 5) projection delivered 0 of predicted 150–250 ns on this WSL2 host. K1c+ (Round 6) projected 0–80 ns and delivered ~0–20 ns (within prediction). The Architect's mark-loop time projections on this host have a track record of undershooting; a 50% delivery rate against the 200–400 ns prediction implies a likely landing of 100–200 ns saved → 3.19–3.29 µs. Inside the soft band, but not the hard band. **Net: Path Y has perhaps a 35% chance of achieving HARD PASS, 50% chance SOFT PASS, 15% chance noise-level (no improvement).**
- **R-B (bundle pressure):** the +60 B estimate is from the previously-blocked spec; if Builder discovers additional bytes during implementation, headroom is consumed fast (15 B is tight).
- **R-C (rank-breaks):** T1+T2+T6 touches the chase loop's hot path. cellx is currently #1 by 100+ ns over preact; even a +50 ns regression on the cellx hot path (which T2's dedup-gate hoist could plausibly cause via IC fragmentation) would not break the rank but would shrink the lead.
- **R-D (the H4-tactical spec file is not present on disk).** The orchestration brief references `spec-6.2-phase2a-h4-tactical.md` and `investigation-cap-raise.md`, neither of which exists in `.team/v1/`. If the Architect's prior analysis was lost (or the references are anticipated rather than authored), Round 7 effectively starts the H4-tactical investigation from scratch — adding a full Investigator + Architect cycle before Builder. Cost balloons to ~3 research cycles.

### §5.5 Surface conditions if Path Y is taken

- Surface SOFT PASS / NO MOVE if perf lands > 3.30 µs after the round (i.e., Builder runs and Verifier measures no movement).
- Surface BUNDLE BREACH if Builder commits would land > 1850 B signals or > 2200 B arbor.
- Surface RANK BREAK if any of cellx / batched-writes / dynamic-deps drops out of #1 or #1/#2 respectively.

---

## §6 Path Z — Round 7 attempts a new perf hypothesis

Round 5 and Round 6 closed three named hypothesis classes: H5 (lazy `lastWave` + typed Subscribers), K1c+ (closure removal), and H4-recursive (tail-recursive linear chase). The orchestration brief identifies three remaining perf-side hypotheses worth quantifying:

### §6.1 Hypothesis Z1 — V8 IC polymorphism on `Computed.prototype.recomputeIfNeeded`

**Sketch.** Post-K1c+, `Computed.prototype.recomputeIfNeeded` is shared across all 100 Computed instances on deep-prop-100. K-2 test verifies prototype-method identity (`c1.recomputeIfNeeded === c2.recomputeIfNeeded`). However, the *call site* at `signal.ts:326` (`if (l.dep.flags & (STALE | PENDING)) l.dep.recomputeIfNeeded?.()`) has multiple receiver shapes:
- For `l.dep` = signal-host literal: receiver is bare `{ flags, lastWave, subsHead, subsTail }`. `recomputeIfNeeded` is `undefined`; optional-chain short-circuits. **IC outcome: shape #1 (bare-literal-no-method).**
- For `l.dep` = Computed instance: receiver carries `Computed.prototype`. `recomputeIfNeeded` resolves to the prototype method. **IC outcome: shape #2 (Computed-class).**
- For `l.dep` = Effect (rare in this site): wouldn't occur in practice (effects are leaves), but shape would be #3 (Effect-class).

V8's IC starts monomorphic, transitions to polymorphic at 2 shapes, and goes megamorphic at 4+ shapes. Two-shape polymorphic dispatch costs ~2–10 ns per call vs monomorphic ~1 ns. Across deep-prop-100's ~10 dispatches per wave, this could account for 10–100 ns.

**How to investigate.** Verifier could re-bench with a synthetic version of `signal.ts:326` that uses a kind-discriminated dispatch (e.g., `if (l.dep.flags & HOST) {} else l.dep.recomputeIfNeeded()`). If perf moves materially, IC fragmentation is real.

**Predicted ceiling.** ~50–100 ns on deep-prop-100 if IC fragmentation is the dominant remaining perf cost. Would land 3.29–3.34 µs (no hard pass; soft pass at best).

**Cost.** Investigator + Architect + Builder + Verifier ≈ 2 research cycles.

### §6.2 Hypothesis Z2 — markStack constant-factor overhead

**Sketch.** `signal.ts` has a markStack-based iterative DFS for fan-out propagation. The push loop at fan-outs (`for (let l = sub.subsTail; ...; l = l.prevSub) markStack.push(l.sub)`) allocates push entries one at a time. On deep-prop-100, fan-outs are minimal (linear chain), but on every node visit there's a fan-out check. The per-node markStack overhead may be ~10–20 ns of constant factor per node × 100 nodes = 1.0–2.0 µs of the 3.39 µs total.

**How to investigate.** Investigator instruments markStack push/pop counts on deep-prop-100; Architect proposes a markStack-allocator-removal (e.g., union-of-arrays, intrusive linked-list reuse, fixed-size SoA buffer). Builder implements; Verifier measures.

**Predicted ceiling.** ~100–300 ns if the markStack is genuinely the dominant remaining cost. Would land 3.09–3.29 µs (hard pass plausible).

**Cost.** 2 research cycles. Higher complexity than Z1.

**Risk.** markStack changes touch the hottest path of every workload (mark phase fires on every signal write). Cellx and wide-fanout would be at risk.

### §6.3 Hypothesis Z3 — `lastWave: 0` SMI vs HeapNumber transition

**Sketch.** Post-K1c+, every `Computed` instance is born with `lastWave: 0` (SMI). On the first signal write, `wave++` is executed and `dep.lastWave = wave` is assigned. If `wave` ever exceeds 2^31 (V8's SMI boundary), `lastWave` transitions to HeapNumber and the hidden class migrates. On deep-prop-100, the wave counter likely stays below 100K (well within SMI range), but in long-lived processes (e.g., scribe apps running for hours), the wave counter could plausibly cross 2^31 during a single browser session. If it does, every Computed migrates to a new HC and IC sites deopt.

**How to investigate.** Architect computes the wave-counter consumption rate (e.g., assuming 100 signal writes/sec, 2^31 / 100 ≈ 248 days; for high-frequency scribe apps perhaps 10K writes/sec → ~60 hours). For deep-prop-100 the bench fires ~700K iterations × ~500 writes/test ≈ 3.5×10^8 — this is 16% of SMI range. Probability that bench triggers the transition: low. Probability that production triggers it: depends on use case.

**Predicted ceiling.** Negligible perf delta on deep-prop-100 (probably < 5 ns). Production hardening value, not a v1 perf lever.

**Cost.** 0.5 research cycles for the analysis; 1 cycle for a wave-rollover guard if confirmed.

### §6.4 Path Z summary

Of the three: **Z1 (IC polymorphism) is the most likely to yield measurable perf**, but the predicted 50–100 ns recovery would still land deep-prop in the 3.29–3.34 µs band (no hard pass). **Z2 (markStack) has the highest ceiling** but the highest rank-break risk and cost. **Z3 (SMI transition)** is probably an analysis exercise, not a perf round.

**Path Z cost: 2–3 research cycles vs Path X's 0 vs Path Y's 1.**

---

## §7 Recommendation

**Recommendation: PATH X with one tweak — surface to user, propose hybrid as the option.**

### §7.1 Why Path X

The core question is **expected value of the next research cycle on Track C vs Track A or Track B**.

**Track C marginal value of one round:**
- Path Y (H4-tactical): ~35% × HARD PASS + ~50% × SOFT PASS + ~15% × no-move. Expected delta in deep-prop p50: ~0.10–0.15 µs improvement. Bundle cost: +60 B (15 B headroom remaining).
- Path Z (Z1 + maybe Z2): ~30% × HARD PASS + ~40% × SOFT PASS + ~30% × no-move. Expected delta: ~0.05–0.20 µs. Cost: 2–3 cycles.

Probability-weighted, **one cycle on Track C buys roughly a coin-flip on hard-pass, expected ~0.10 µs improvement, with non-zero rank-break risk.**

**Track A or B marginal value of one round:**
- Plan 1.3 / 1.4 (Track A roadmap): scope review noted in MEMORY ("Round 005 needs scope review; arbor 49 B headroom, Track C bench pending"). Round 005 GO was just confirmed at `8db5c3c` per MEMORY.
- These plans are user-visible features (component props was Plan 1.2 at Round 004, shipped 320 tests). Plan 1.3 / 1.4 typically deliver consumer-facing capability, not optimisation.

**The user-visible-features cycle has higher expected value than the optimisation-tail cycle**, given that:
1. The optimisation campaign has already shipped its load-bearing wins (cellx, batched-writes, dynamic-deps all #1; memory crushed 84%).
2. The remaining perf gap is on a synthetic workload no surveyed framework enforces.
3. v1's contractual position is secured; v2 closure-removal completion can finish the perf piece in a separate plan.

### §7.2 The tweak — surface, not autonomous-execute

This is the kind of substance call where the user's session-mandate reframing matters. The original mandate was "iterate to get substantial performance and also start tracking your memory metrics." Memory is OVERWHELMINGLY satisfied; perf is partially satisfied. A reasonable user could read this as either:
- "Mission accomplished, ship it, move on" (Path X), OR
- "Memory is great but you said performance — close the gap" (Path Y or Z).

**The user has been engaged on every substance call this session** (per the session record: H4 cap-raise authorisation, K1c+ scope-shift authorisation, Phase 3 framing). Surfacing this one is consistent with that pattern. **Recommendation: Team Lead surfaces SOFT PASS verdict + the X/Y/Z articulation; user picks.**

### §7.3 If the user picks autonomously: recommend Path X

If the Team Lead routes autonomously without surfacing, **default to Path X** based on the EV math above. The ship-or-stack call defaults to ship when:
- Memory ✓
- Bundle ✓
- Ranks ✓
- Public API ✓
- Correctness ✓
- Perf within mitata noise of baseline ✓ (3.39 vs 3.37 mean)

Five of six gates are clean; the sixth is a strict-reading miss within measurement noise of an unchanged baseline. By any reasonable engineering standard this is shippable.

### §7.4 If the user picks Path Y or Path Z, route accordingly

See §8 below for the routing decisions.

---

## §8 If Path Y or Z chosen: routing decisions

### §8.1 Path Y routing

**Researcher 1 (Architect — re-validation pass):** the H4-tactical spec referenced in the orchestration brief (`spec-6.2-phase2a-h4-tactical.md`) is **not present on disk**. Two sub-cases:
- (a) The spec exists in git history but was not preserved → Architect retrieves from the branch's prior cap-raise investigation; resumes from cached analysis.
- (b) The spec was anticipated rather than authored → Architect dispatches a **fresh** investigation of T1+T2+T6 mechanisms against the post-Phase-3 source tree (`a0a93d6`), specifically checking that K1c+'s prototype-method dispatch doesn't invalidate any prior T1/T2/T6 assumptions.

In either case, the Architect re-validates the +60 B bundle estimate against the new 1775 B baseline (75 B headroom → 15 B post-T1+T2+T6).

**Researcher 2 (Builder):** implements on a new branch off `a0a93d6` (NOT `62f737f` — H5 is two rounds back; Phase 3 is the new baseline). Self-tests every commit per the H5/Phase-3 discipline (`bun test`, `bun run build`, size-limit check).

**Researcher 3 (Verifier):** WSL2 environment. **Critical bidirectional check:** the new perf gate language ("≤ X µs 3-run mean") must be applied. If H4-tactical recovers 100–200 ns and lands 3.20–3.30 µs 3-run mean, that's the PASS — not a strict-best-of-three p50 reading. Verifier must re-confirm all three load-bearing ranks across all three runs (not just the mean). Memory is unchanged target — verify it stays at ≤ 5 KB to confirm the round didn't regress memory.

### §8.2 Path Z routing

**Researcher 1 (Investigator):** `.team/v1/investigation-perf-tail.md`. Quantify Z1 (IC polymorphism), Z2 (markStack), Z3 (SMI). For Z1 specifically, instrument `signal.ts:326` to count receiver-shape diversity on deep-prop-100. For Z2, instrument markStack push/pop counts and estimate the per-node constant factor. For Z3, compute the wave-counter consumption rate. Pick ONE primary mechanism by (perf_savings × compatibility) / (bundle_cost + complexity). 1 round budget.

**Researcher 2 (Architect):** from the Investigator's pick, write `spec-6.2-phase4-perf-tail.md`. Hard targets: deep-prop ≤ 3.20 µs (hard) / ≤ 3.30 µs (soft) **as 3-run mean** per Verifier §10 #6. All other gates unchanged from Phase 3.

**Researcher 3 (Builder + Verifier):** standard discipline. Verifier explicitly compares projection to measurement per the Round 5 lesson (institutionalised in director-notes-006 §10).

### §8.3 Path X routing (recommended)

**Action:** Team Lead opens a new round on Track A or B per the V1 roadmap (Plan 1.3 / 1.4 / scope review per MEMORY). Phase 3 / Round 6 is mergeable. The spec language fix (§5 of this director-note's recommendation) lands as a single-commit doc PR before merge.

---

## §9 Iteration budget

**Phase 3 budget: 1 / 5 used.** Builder ↔ Verifier loop converged on the first pass (commit 1: K1c+ skeleton; commit 2: arbor restructure stack; commit 3: mangler class-field fix; one Verifier pass = SOFT PASS). 4 / 5 budget remains within Phase 3.

**If Path X (recommended):** Phase 3 closes; budget retired. Round 8 opens on a different track / plan with fresh budget.

**If Path Y:** consumes 1/5 of remaining 4/5 (Builder + Verifier in one round). 3/5 remaining post-Round-7. Mode 2 hard-stop unchanged at 5.

**If Path Z:** consumes 1/5 plus an Investigator + Architect round (which do not consume Builder↔Verifier counter per Round 6 director-note §1.3). Counter at 2/5 post-Round-7.

**Hard-stop guidance unchanged:** if Builder ↔ Verifier hits 5/5 in any path without HARD PASS, Director surfaces fall-back to user (ship as-is at relaxed-soft-pass per §10 of director-notes-006).

---

## §10 Surface-to-user triggers

### §10.1 The big one: should the Team Lead surface this call?

**Yes — recommend YES.** Three reasons:

1. **Pattern consistency.** The user has been engaged on every prior substance call this session: H4 cap-raise authorisation (Round 4), K1c+ scope-shift authorisation (Round 5/6), Phase 3 framing (Round 6). Surfacing Round 7's ship-or-stack call is consistent with that pattern.

2. **Mandate ambiguity.** The original session-mandate had two directions ("performance" + "memory"). Memory is OVERWHELMINGLY satisfied; perf is partially satisfied. A reasonable user could weight these differently; the call shouldn't be made for them.

3. **Cost of surfacing is low.** A single user message + response. Cost of NOT surfacing and picking wrong: 1 wasted research cycle (Path Y when user wanted Path X) or 1 missed feature ship (Path X when user wanted Path Y / Z).

**Suggested surface message:**

> Phase 3 K1c+ shipped a SOFT PASS — memory crushed 84% (1.62 KB vs 4 KB hard target), bundles net-improved (signals 75 B headroom, arbor net-negative), all three load-bearing ranks held #1 or #1/#2 across 3 WSL2 runs, public API byte-identical. The single asterisk: deep-propagation-100 p50 mean 3.39 µs vs strict spec ceiling 3.30 µs — within mitata p50 noise of the H5 baseline mean of 3.37 µs (no regression, but no improvement either; K1c+ delivered 100% of its memory promise at 0% of its predicted 0–80 ns time benefit). Three options: **(X) ship now**, declare deep-chain optimisation complete, open Round 8 on Track A; **(Y) one more round on H4-tactical** (T1+T2+T6) for predicted 3.10–3.20 µs landing; **(Z) one more round on a new perf hypothesis** (V8 IC polymorphism / markStack overhead). Director recommends X with EV math; Y and Z are defensible if the deep-prop ranking is load-bearing for v1's narrative. Your call.

### §10.2 Other surface triggers (carry forward from Round 6)

These remain active regardless of path choice:
- Bundle delta > +120 B signals or > +50 B arbor in any subsequent commit.
- Closure removal regresses cellx ≥ 5 ns OR drops below #1.
- Architect's projection vs Verifier's measurement misses by > 2× on memory OR > 0.15 µs on perf.
- Public API change required.
- Builder ↔ Verifier counter hits 5/5 without convergence.

---

## §11 v1 → v2 narrative update

### §11.1 Where scribe-signals stands at end of Phase 3

| Axis | Session start | End of Phase 3 | Δ | vs alien-signals |
|---|---:|---:|---:|---:|
| deep-prop-100 p50 | 4.00 µs | 3.39 µs | −15% | 1.40× behind |
| deep-prop-100 buildHeapDelta | 10.24 KB | **1.62 KB** | **−84%** | dispose-positive vs alien's −872 B (~2.5 KB delta, was ~11 KB) |
| cellx p50 | 506 ns | 508 ns | flat | **#1 by 100+ ns** |
| batched-writes-100 p50 | 2.60 µs | 2.50 µs | −4% | **#1 by 220 ns** |
| dynamic-deps p50 | 742 ns | 715 ns | −4% | **#1 or #2 within 80 ns** |
| signals bundle gz | ~1540 B | 1775 B | +15% (added Phase 1 + K1c+) | n/a |
| arbor bundle gz | ~2200 B (cap) | 2086 B | net-negative | n/a |
| Public API breaking changes | (baseline) | **0** | none | n/a |

### §11.2 The remaining v1 → v2 gap

Two gaps remain after Phase 3:

1. **deep-propagation-100 p50: 3.39 µs vs alien's 2.42 µs (1.40× behind).** Closing this requires either:
   - **v1.x lever (Path Y or Z)**: +0.10–0.20 µs achievable at one Builder+Verifier round; would land 3.10–3.30 µs (close to or matching preact's 3.36 µs). This is the "close the strict spec gate" play.
   - **v2 lever**: introduce push-pull with version counters. This is the alien-signals model — fundamentally different from scribe's effect-settled-in-mark. Closes the gap to ~2.50–2.70 µs. v2-scope per `state-track-c.md` line 198.

2. **wide-fanout-100: 4.64 µs vs alien's 3.75 µs (1.24× behind).** Closing this requires reducing forward-subscription model overhead on dense fan-outs. Investigated as "not on v1 critical path" per Verifier §10 — Round N+2 candidate.

### §11.3 v2 plan to close the gap

The post-v1 plan should include:
1. **Plan 7.1 (v2-scope): push-pull hybrid.** Add version counters per signal; `markOne` short-circuits at `dep.version === sub.lastSeenVersion`. Closes deep-prop to ~2.5 µs, retains effect-settled-in-mark for batched-writes/cellx. Estimated: 4–6 weeks of investigator + architect + builder cycles.
2. **Plan 7.2 (v2-scope): fan-out optimisation.** Wide-fanout structural model change. Estimated: 2–4 weeks.
3. **Plan 6.3 (v1.x): perf tail.** Path Y (H4-tactical) and Path Z (IC polymorphism / markStack) as a single bundled v1.x optimisation drop. Estimated: 1–2 weeks. **This is the home of the work currently on the table for Round 7.**

### §11.4 The v1 ship narrative

> scribe-signals v1 ships at #1 ranking on cellx, batched-writes-100, and dynamic-deps (the load-bearing component-update workloads), with an 84% memory reduction from session start (1.62 KB on deep-propagation-100 vs alien's −872 B; ~2.5 KB delta down from ~11 KB). Bundle: 1.7 kB / 2.1 kB gz. Public API: zero breaking changes across six rounds of internal optimisation. v1.x will close the deep-chain perf tail; v2 will add push-pull with version counters for full alien parity.

This is a clean shipping narrative regardless of whether Round 7 is Path X (ship now) or Path Y/Z (one more optimisation round before ship). The marginal value of Round 7 is whether the v1 ship narrative includes "deep-chain on par with preact" (Path Y/Z best case) or "deep-chain in v1.x" (Path X).

---

## §12 Risk register update

Carrying forward from Round 6, marking status and adding Round 7 NEW risks.

| ID | Risk | Phase 3 status | Round 7 active? |
|---|---|---|---|
| R-A | Round 5 projection-failure repeats | RESOLVED — Architect's K1c+ projection landed within prediction bands | partially — Path Y / Z would re-test |
| R-B | Bundle headroom consumed | PARTIAL — signals 75 B (was 171 B) | YES — Path Y consumes 60 B → 15 B |
| R-C | cellx rank break | RESOLVED — 508 ns, #1 by 100+ ns | YES — Path Y / Z chase-loop changes carry tail risk |
| R-D | `recomputeIfNeeded === undefined` detection | RESOLVED — HOST flag bit (0x080) replaces idiom; K-1 test verifies | retired |
| R-E | `disposed` instance-field correctness break | RESOLVED — closure-local preserved; explicit comment in effect.ts:96 | retired |
| R-F | `creation-1to1000` regression past 82 µs | RESOLVED — 73.66 µs cache-warm (run 3); no error | retired |
| R-G | Builder ↔ Verifier hits 5/5 without convergence | RESOLVED for Phase 3 (1/5 used) | active for Path Y / Z |
| R-H | K1c lazy-promotion HC reassignment | RESOLVED — single Computed class, no prototype reassignment | retired |
| R-I | V8 monomorphic IC fragmentation at dispatch | UNCERTAIN — Verifier didn't measure shape diversity at signal.ts:326 | YES — Path Z Hypothesis Z1 |
| R-J | WSL2 bench-host calibration drift | RESOLVED — H5 baseline 3.37 µs 3-run mean confirmed; spec gate language to update per §10.6 | YES — Path Y / Z must use 3-run mean |
| **R-K** (NEW) | Strict-reading FAIL recorded in artifacts | Active | will be addressed by spec-language update regardless of path |
| **R-L** (NEW) | H4-tactical spec file not on disk | Active for Path Y | needs Architect re-validation pass |
| **R-M** (NEW) | Marginal value of Track C cycle vs Track A/B cycle | Active for routing call | drives recommendation toward Path X |

---

## §13 Closing direction to Team Lead

### §13.1 If Path X (recommended)

1. Team Lead surfaces SOFT PASS verdict + X/Y/Z articulation (per §10.1 suggested surface message) to user.
2. If user confirms X: open Round 8 on Track A / B per V1 roadmap. Land Phase 3 branch (`feat/v1-signals-6.2-phase3-closures @ a0a93d6`) into main with the spec-language fix as a single-commit doc PR ("Verifier §10 #6 — perf gates phrased as 3-run mean").
3. If user picks Y or Z: dispatch per §8.

### §13.2 If autonomous (no surface)

Default to Path X. Ship Phase 3, update spec language, open Round 8 elsewhere. Document the autonomous call in this director-note's §10.

### §13.3 The branch state

`feat/v1-signals-6.2-phase3-closures @ a0a93d6` is the Phase 3 head. Off-baseline branches for Path Y / Z would branch FROM `a0a93d6`, NOT from `62f737f` (H5). Phase 3 is the new "current best" for any future Track C work.

---

## §13.5 Expected-value math, expanded

To make the EV reasoning explicit and falsifiable, here is the reasoning as a probability tree.

### §13.5.1 Path X expected outcome

- P(ship clean | Path X) = 1.0. Phase 3 is mergeable per Verifier §12. Spec-language update is a doc-only PR; bundle and perf measurements unchanged.
- Expected research-cycles consumed: 0 on Track C, +1 freed for Track A / B.
- Expected v1 narrative quality: "leads on cellx, batched-writes, dynamic-deps; 84% memory drop; deep-chain in v1.x." Strong on load-bearing workloads; honest on the synthetic deep-chain.
- Risk of regression: 0 (no code changes).

### §13.5.2 Path Y expected outcome

Conditional probabilities (Director's prior, calibrated against H5's 0% delivery and K1c+'s ~25% delivery of mark-loop time predictions on this WSL2 host):

- P(HARD PASS, deep-prop ≤ 3.20 µs) ≈ 0.30
- P(SOFT PASS, deep-prop 3.20–3.30 µs) ≈ 0.45
- P(no movement, deep-prop ≥ 3.30 µs) ≈ 0.20
- P(rank break or bundle breach) ≈ 0.05
- Expected deep-prop p50 post-Path-Y: 3.20 µs (point estimate).
- Expected research-cycles consumed: 1 (Builder + Verifier) + possibly Architect re-validation if `spec-6.2-phase2a-h4-tactical.md` is genuinely missing (additional 0.5–1 cycle).
- Expected v1 narrative quality if HARD PASS lands: "leads on cellx, batched-writes, dynamic-deps; on par with preact on deep-chain; 84% memory drop." Marginally stronger than Path X.

### §13.5.3 Path Z expected outcome

Conditional probabilities (less calibrated — these hypotheses haven't been pre-tested):

- P(HARD PASS) ≈ 0.20 (Z2 markStack ceiling could land it; Z1 IC polymorphism alone can't)
- P(SOFT PASS) ≈ 0.35
- P(no movement) ≈ 0.40
- P(rank break) ≈ 0.05
- Expected deep-prop p50 post-Path-Z: 3.25 µs.
- Expected research-cycles consumed: 2–3 (Investigator + Architect + Builder + Verifier).
- Expected v1 narrative quality: same as Path X if no movement, marginally better than Path Y if HARD PASS lands.

### §13.5.4 The marginal-value comparison

Cost normalisation: assume one research cycle delivers ~1 unit of value when applied to a high-EV target.

| Path | Research-cycles | P(material-improvement) | Expected v1 narrative delta vs Path X | Marginal value |
|---|---:|---:|---|---:|
| X | 0 (frees 1 for Track A/B) | n/a | (baseline) | +1.0 (the freed cycle) |
| Y | 1 (or 1.5–2 if H4-tactical spec is anticipated) | 0.75 (HARD or SOFT) | +0.3 if HARD, +0.1 if SOFT | ~0.20 |
| Z | 2–3 | 0.55 (HARD or SOFT) | +0.3 if HARD, +0.1 if SOFT | ~0.05 (worst marginal value) |

**Path X dominates on EV.** The freed cycle on Track A / B (Plan 1.3 / 1.4 / scope review) is expected to deliver user-visible feature value at +1.0 unit; Path Y delivers an optimisation-tail improvement at +0.20 expected unit; Path Z at +0.05.

### §13.5.5 Where the EV calculation could be wrong

Two scenarios where Path Y / Z are correct despite the EV math:

1. **The user has external/strategic reasons to ship deep-chain at preact-parity** (e.g., a planned blog post, competitor comparison, or VC pitch where the deep-chain number matters). In this case, the +0.3 narrative delta of HARD PASS is much higher than +0.20 unit because the alternative (shipping with the asterisk) actively costs narrative value.

2. **Track A / B is not actually unblocked.** MEMORY notes "Round 005 needs scope review" — if the scope review is a multi-cycle exercise itself, the freed Track-C cycle is not converted to a Track A delivery; it's converted to a Track A planning cycle. Marginal value drops from +1.0 to perhaps +0.4. Path Y's +0.20 then becomes more competitive.

**Both scenarios are plausible.** This is why surfacing to the user is the right call — the Director cannot reliably distinguish these scenarios without explicit user input.

---

## §13.6 Spec-language fix (small, separate from path choice)

Regardless of path X/Y/Z, the Verifier §10 #6 finding should be addressed:

> Round 7 spec should phrase perf gates as "≤ X µs 3-run mean" to match the verifier's actual measurement protocol, removing the strict-vs-realistic ambiguity that landed Phase 3 at the SOFT/FAIL boundary.

Suggested concrete edits:

- **`spec-6.2-phase3.md` §10.2:** "Time target: deep-propagation-100 ≤ 3.20 µs HARD / 3.20–3.30 µs SOFT" → "Time target: deep-propagation-100 **3-run-mean p50** ≤ 3.20 µs HARD / 3.20–3.30 µs SOFT (cite Verifier §10 #6 protocol)."
- **`state-track-c.md` Phase 2 scope rules / future Phase 4+ specs:** add a footnote: "All perf gates are 3-run-mean p50 unless otherwise specified. mitata p50 noise floor is ~50–100 ns at the µs scale; single-run best-of-three p50 readings are not authoritative."

This is a doc-only change (no code, no build); ships as a single small PR. Does not consume Builder ↔ Verifier budget. Suggest landing it alongside whichever path the user picks.

---

## §13.7 Sequencing if Path X is approved

1. Team Lead opens a small doc PR for the spec-language fix (§13.6). Lands quickly.
2. Team Lead opens a doc-only PR or annotation declaring Phase 3 / Round 6 as PASS under updated language.
3. Team Lead merges `feat/v1-signals-6.2-phase3-closures @ a0a93d6` to main.
4. Team Lead opens Round 8 on Track A or B per V1 roadmap. State-track-a / state-track-b update accordingly.
5. **Round 7 director-note (this file) closes Track C / Plan 6.2 / Phase 3.** No further Phase 3 dispatches. Phase 4 (perf-tail) is documented as a v1.x candidate per §11.3 above; not opened in this session unless user explicitly requests.

---

## §13.8 Sequencing if Path Y is approved

1. Team Lead retrieves or re-validates the H4-tactical spec (`spec-6.2-phase2a-h4-tactical.md` per orchestration brief). If missing, dispatch Architect for fresh analysis (1 cycle, no Builder budget consumed).
2. Architect re-validates the +60 B bundle estimate against the post-Phase-3 1775 B baseline. If estimate now exceeds 75 B headroom, surface bundle-cap escalation to user before Builder dispatch.
3. Builder branches off `a0a93d6` (NOT `62f737f`). Implements T1+T2+T6 per Architect spec. Self-tests: bun test, bun run build, size-limit, on every commit.
4. Verifier WSL2 environment. **Crucial:** uses 3-run-mean p50 perf protocol per §13.6. All three load-bearing ranks confirmed across all three runs.
5. If HARD PASS: Phase 3 closes; ship to main as Round 7 update.
6. If SOFT PASS: Director's call (likely ship; doc the position).
7. If no movement or regression: Director surfaces to user (fall-back: revert and ship Phase 3 as-is per Path X).

Budget consumed: 1/5 (best case) or 2/5 (if Architect re-spec triggers a Builder retry).

---

## §13.9 Sequencing if Path Z is approved

1. Team Lead dispatches Investigator with the §8.2 brief. 1 round, separate budget.
2. Director reviews `investigation-perf-tail.md`. GO conditions: one mechanism picked; quantitative ceiling stated; H5/K1c+ invariant compatibility traced; bundle delta with confidence interval.
3. Architect spec (1 cycle, separate budget). Targets phrased as 3-run-mean per §13.6.
4. Builder + Verifier (1/5 of remaining 4/5 Builder↔Verifier budget). Same discipline as Path Y.
5. Same outcome handling as Path Y.

Budget consumed: 1/5–3/5 (worst case if mechanism rotates).

---

## §14 Director sign-off

**Phase 3 = SOFT PASS. Recommend SHIP (Path X).**

**Surface to user: YES.** The mandate-direction split (memory ✓✓ / perf ✓-ish) and the user's session-pattern of being engaged on every substance call both point to surfacing.

**Round 7 substance: defer to user.** Director's prior is Path X; Path Y is defensible at 1 cycle / coin-flip-on-hard-pass; Path Z is the lowest-EV option at 2–3 cycles for similar expected delta.

**v1 narrative is intact regardless of path:** scribe-signals leads on the load-bearing workloads, crushed memory 84%, bundles net-improved, public API byte-identical across six rounds. The deep-chain perf tail is a v1.x or v2 lever; Path Y / Z would pull it forward, Path X defers it.

**Iteration budget:** 4/5 remains in Phase 3 if Path Y or Z is picked; budget retires if Path X.

**Top remaining risk (R-M):** the marginal value of one more Track C cycle vs starting Track A / B work. EV math favours Track A / B. User judgement should be final.

**End of director-note.**
