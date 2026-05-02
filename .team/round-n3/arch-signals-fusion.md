# Architecture Spec — Signals Fusion (Round N+3)

**Date:** 2026-05-01
**Architect:** auto (Mode 2, Round 2)
**Branch:** `feat/signals-n3-fusion`
**Branch base:** post-Compressor `main` (`f2c5ff9`)
**Decision:** **α — alien-style lazy**

---

## 0. TL;DR

This spec picks **α — alien-style lazy** for Round N+3 fusion. The deep-prop win in alien-signals comes from replacing scribe's eager fan-out settle pass (`for (const sub of visited) sub.recomputeIfNeeded?.()`) with `checkDirty` pull-on-demand at effect-drain time. Scribe already has `checkDirty` and the per-effect direct-dep settle loop wired in `drainEffectQueue`'s PENDING branch — α generalizes that path to be the SOLE settle path, then deletes the eager `visited[]` walk in `settleAndDrain`. The mark walk stays queued (effect-fire order unchanged); the K1c+ invariants are trivially preserved (no inline-fire, no markStack hazard, no error-accumulator threading); the byte profile is net-neutral or small recovery; the bench gain captures alien's actual win shape rather than a more aggressive design that adds correctness risk against a 14 B headroom. β is rejected as plausibly under-delivering on the 10% gate (modest gain on a workload dominated by the eager fan-out settle pass that β doesn't touch); γ is rejected on byte-budget risk and markStack-hazard surface area against criterion 4.

## 1. Variant decision and justification

### 1.1 Picked: α — alien-style lazy

**Mechanism summary:** Today's pipeline is two-phase mark-then-drain with an eager fan-out settle in between. `markOne` populates two arrays: `visited[]` (fan-out computeds, line 225/247) and `effectQueue[]` (effects, line 221/243). Then `settleAndDrain` runs, which does:

1. `for (const sub of visited) sub.recomputeIfNeeded?.()` — eager fan-out settle in DFS-discovery order (signal.ts:371).
2. `drainEffectQueue(errors)` — for each effect, IF `PENDING` was set (lazy linear path), run `checkDirty` + per-effect direct-dep settle + MARKED-recheck-after-settle, then `notify()`.

Alien's technique is to skip step 1 entirely and rely on the per-effect dep-settle in step 2 — pulling settles on demand from each effect's `depsHead` chain. The fan-out vs linear distinction at mark time collapses at settle time: both paths route through `checkDirty` + the direct-dep recompute loop. Scribe's `Computed.read()` does lazy-pull recompute (`computed.ts:127`), so when an effect's direct-dep `recomputeIfNeeded` runs `recompute` and the body `reads` an upstream STALE/PENDING computed, the upstream lazy-pulls itself — DI-1 holds transitively.

**Why this is faithful to alien-signals:** Director's mid-session note characterized α as "the real closest match to alien-signals." Alien queues effects via `notify(sub)` callback (`index.mjs:17–34`) and runs them in `flush()` (`index.mjs:208–225`); deep-prop wins come from `checkDirty` pull-on-demand (`system.mjs:143–209`) replacing eager fan-out settle. α adopts the latter while preserving scribe's stronger EI-1 (per-effect try/catch, AggregateError surface) which alien deliberately weakens.

**Why this is the right pick under the four criteria:** Net-neutral or small byte recovery (deletes eager-settle loop, may delete `visited[]` push sites and `clearVisited` visited-loop; preserves all queueing/draining/error-threading shapes that already fit). Trivially preserves all five K1c+ invariants because no inline-fire is introduced. Bench gain captures alien's measured deep-prop win shape rather than a riskier design. Topology-blind because the per-effect settle path runs the SAME work for fan-out and linear chains — just lazily — so wide-fanout-100 doesn't regress (today's fan-out path also reaches `recomputeIfNeeded` once per fan-out node via the eager loop; α reaches it once per fan-out node via the per-effect dep-walk lazily; total work is identical, only ordering differs).

### 1.2 Justification against the four criteria

| Criterion | Target | Expected delivery | Risk |
|---|---|---|---|
| Deep-prop p50 ≥ 10% | ≤ 90 % of post-Compressor pre-fusion baseline (Builder measures live) | **α delivers the alien win shape directly.** Today's eager-settle pass walks `visited[]` in DFS pre-order, calling `recomputeIfNeeded` on every fan-out computed; on a deep chain with single-fan-out hops each hop hits the same path. α deletes that walk and lets `checkDirty` short-circuit on equality-stable hops, avoiding `recomputeIfNeeded` work where the chain is provably clean. Expected gain: at least matches alien's relative shape on `deep-propagation-100` (Scout report §2.2 + §1 cite alien at 3.06 µs vs scribe 4.02 µs in the Scout's run — a ≥ 10 % gain is achievable with α's algorithm change alone). | LOW |
| Topology-blind (no >5% regression elsewhere) | wide-fanout-100, cellx, batched-writes-100, dynamic-deps, creation-1to1000 within ±5% | **wide-fanout-100:** today's eager-settle does one `recomputeIfNeeded` per fan-out node; α does one per direct-dep-of-each-effect (net same count when each fan-out node has effect-subs). cellx is the canonical equality-stable cascade — α preserves shallowClear cascade-suppression at `Computed.recomputeIfNeeded` (computed.ts:84) called from the per-effect direct-dep loop, and the post-settle MARKED recheck (signal.ts:338) suppresses unnecessary effects. batched-writes-100, dynamic-deps, creation-1to1000 — α touches `settleAndDrain` and `drainEffectQueue` only; creation/linkAdd/dispose paths are unchanged, so creation-1to1000 is byte-stable. | LOW |
| Bytes ≤ 1970 B (14 B headroom) | ≤ 1970 B | **Sub-totals (estimate, Builder verifies live):** delete eager-settle loop (`for (const sub of visited) sub.recomputeIfNeeded?.()` at signal.ts:371) ≈ −15 B post-min. Delete `settleAndDrain` function boundary (inline its single call at signal.ts:517 to call `drainEffectQueue` directly + `throwEffectErrors`) ≈ −10 B. Optionally delete `visited[]` array + `markOne` `visited.push(sub)` × 2 sites + `clearVisited` visited-loop ≈ −30 B if pursued. Per-effect dep-settle becomes unconditional (removing the `if (sub.flags & PENDING)` gate at signal.ts:327) — costs ≈ +5 B but enables fan-out path to hit the same site. Net estimate: **−15 to −50 B**. Well within 14 B headroom. | LOW |
| K1c+ invariants preserved | DI-1, CS-1, SF-1, RC-1, EI-1 | **All five trivially preserved** — see §3. No mark-walk shape change; no inline-fire site introduced; markStack discipline unchanged; error accumulator threading unchanged (`drainEffectQueue` line 322 stays as-is). DI-1 re-derives via the existing per-effect direct-dep loop + lazy upstream pull through `Computed.read()`. | LOW |

**No criterion requires a surface to Director.** All four hit comfortably under α.

### 1.3 Why not the other two variants

**β rejected — plausibly under-delivers the 10 % deep-prop gate.** β inlines the body of `drainEffectQueue` into the tail of `propagateMark` (or into `signal.write` after `propagateMark` returns). The per-effect dep-settle algorithm is **unchanged** — the eager `visited` walk still runs (today's signal.ts:371). β's gain is the function-call boundary deletion (≈ 20–50 B byte recovery, maybe a tiny perf nudge from avoiding the iterator allocation in `for (const sub of visited)`). On `deep-propagation-100` the eager-settle pass IS the dominant cost — alien wins by deleting it, not by collapsing function boundaries. Director's mid-session note agrees: "modest deep-prop gain (smaller than α because the dep-settle algorithm is unchanged — only the function-call boundary disappears)." Rejected because criterion 1 (≥ 10 % deep-prop) is at risk.

**γ rejected — byte-budget risk + markStack hazard surface against criterion 4.** γ pushes per-effect `checkDirty + dep-settle + MARKED-recheck + try{notify}catch` into `markOne`'s EFFECT branches at lines 221 and 243. Director's mid-session estimate: "+30–80 B before deletions; net post-deletion ambiguous; TIGHT vs 14 B headroom." Beyond the byte risk, γ requires:

- **markStack save/restore protocol** at the inline-fire site to handle the case where an effect's `notify()` body writes a signal mid-walk, recursing into `propagateMark → markOne` while the outer `markOne` has live entries on the module-level `markStack` (Scout §3 RC-1, Q3).
- **Module-level `errors[]`** with explicit reset/throw at wave-start/wave-end sites to thread error accumulation across the inline-fire boundary (Q4).
- **Re-entrancy decision** between spawn-fresh-wave and defer-to-inner-queue (Q5), with an associated invariant proof.

Each of those is a surgical correctness concern; together they constitute the "biggest invariant surgery" Director flagged. With 14 B headroom and 6 pinned tests in the danger zone, γ is the path of highest risk-to-reward against α's faithful low-risk port. **Acknowledgement of markStack hazard:** γ's inline-fire creates a re-entrancy hazard where the inner wave's `propagateMark` would push onto the same module-level `markStack` while outer `markOne` has live entries that have not yet popped — without explicit save/restore (`markStack.length = saved` after `notify` returns or throws), the outer iteration would consume the inner wave's pushes and corrupt the outer DFS order, AND the inner pushes would not be cleaned up if the outer abnormally terminated. This is the same hazard Scout flagged in §3 RC-1; α evaporates it entirely by keeping the queued mark+drain shape.

## 2. Code-shape spec for the Builder

### 2.1 Functions to add / delete / modify

| Function | Today | After spec | Mechanism note |
|---|---|---|---|
| `markOne` (signal.ts:198–261) | outer-inner split, `visited.push(sub)` × 2 sites at fan-out | **Modified — `visited.push(sub)` calls deleted; STALE-set unchanged.** | Mark walk is otherwise byte-identical: dedup at top, MERGE wave-stamp, RUNNING check, MARKED set, EFFECT branch unchanged (still `effectQueue.push(sub); continue`/`break`). Fan-out branch sets STALE but no longer pushes to `visited[]`. **Builder option:** if the byte savings from removing `visited.push` are < 10 B and a side analysis shows lingering MARKED on fan-out computeds breaks any test, retain `visited[]` purely as a flag-clear list at wave-end. See §7 open question. |
| `propagateMark` (signal.ts:265–267) | calls `markOne` per direct sub | **Unchanged.** | — |
| `settleAndDrain` (signal.ts:370–375) | two-pass: eager visited settle, then drain, then throw | **Replaced — body becomes `drainEffectQueue(errors); throwEffectErrors(errors)`.** Or function boundary deleted; call sites at signal.ts:517 and the equivalent in `drainBatch` inline `drainEffectQueue + throwEffectErrors`. | The eager visited-loop is the load-bearing deletion. Dep-settle moves entirely to the per-effect path in `drainEffectQueue` (which already exists today, just gated by `PENDING`). |
| `drainEffectQueue` (signal.ts:322–352) | per-effect: PENDING-gated checkDirty + direct-dep settle + MARKED-recheck; then notify+try/catch | **Modified — PENDING gate removed; checkDirty + direct-dep settle + MARKED-recheck become unconditional (run for every queued effect).** | Today's PENDING gate was the lazy-linear optimization (line 327); under α the gate disappears because there is no eager pre-settle to skip. CS-1 cascade-suppression preserved by the existing `if (!(sub.flags & MARKED)) continue` at line 338. Per-effect try/catch + `errors` push at line 341–349 unchanged; `effectQueue.length = 0` at line 351 unchanged. |
| `throwEffectErrors` (signal.ts:359–363) | post-drain throw site | **Unchanged.** | EI-1 mechanism preserved bit-identical. Builder may inline if byte-cheaper. |
| `effectQueue` (module-level array, signal.ts:104) | typed array of `Subscriber` | **Unchanged.** | Queue still receives effects from `markOne` lines 221/243 in mark-discovery DFS pre-order. |
| `clearVisited` (signal.ts:379–384) | clears MARKED+PENDING on visited and effectQueue | **Modified or deleted.** If `visited[]` deleted: function reduces to `effectQueue` flag-clear loop (or inlines into `signal.write` finally). If `visited[]` retained for flag-clear only: function unchanged. | Builder picks based on byte profile. |
| `visited` (module-level array, signal.ts:103) | populated by `markOne` fan-out branches | **Deleted (preferred) OR retained for flag-clear only.** | See §7. |
| `checkDirty` (signal.ts:288–314) | walks PENDING deps backward to find Dirty signal source | **Unchanged.** Already correct shape; α uses it from the now-unconditional per-effect pre-settle. | — |
| `Computed.recomputeIfNeeded` (computed.ts:73–94) | settle gate: `STALE | PENDING` triggers; `hasEffectSub === false` early-returns | **Unchanged.** | Lazy upstream pull works through `recompute()` → `fn()` → `read()` → `recompute()` chain at computed.ts:127. |
| `signal.write` finally (signal.ts:518–520) | calls `clearVisited` | **Unchanged or simplified per `visited[]` decision.** | — |
| `drainBatch` (signal.ts:392–431) | calls `markOne` per drainList sub, then `for visited recompute`, then `drainEffectQueue` | **Modified — eager `for (const sub of visited) sub.recomputeIfNeeded?.()` at signal.ts:421 deleted. Per-iteration `visited.length = 0` at signal.ts:423 deleted if `visited[]` is fully removed.** | Symmetry with the `signal.write` rewrite — same eager-loop deletion at the batched call site. |

### 2.2 Acceptance contract for each modified function

**`markOne(root)` — modified**
- **Input:** `root: Subscriber` — the node to start marking from. Module-level `wave` in current state.
- **Output:** void. Side effects: marks reachable subs with `MARKED` (and `STALE | PENDING` per the Option D split), pushes effects to `effectQueue`, **no longer pushes computeds to `visited[]`** (assuming `visited[]` is deleted; otherwise unchanged).
- **When called:** from `propagateMark` (signal.ts:266) and `drainBatch` (signal.ts:419).
- **Must NOT do:** must not invoke `notify()` inline, must not call `recomputeIfNeeded`, must not allocate per-call closures.
- **Constraint:** mark-walk DFS order from each entry must remain identical to today (same effect-fire order at drain).

**`drainEffectQueue(errors)` — modified**
- **Input:** `errors: unknown[]` — accumulator passed in by caller. Module-level `effectQueue[]` populated by mark walk.
- **Output:** void. Side effects: for each non-disposed, MARKED effect: (a) call `checkDirty(sub)` — short-circuit + clear MARKED if clean; (b) walk `sub.depsHead` and call `recomputeIfNeeded?.()` on every PENDING|STALE direct dep; (c) re-check MARKED (cascade-suppression gate); (d) clear MARKED, call `notify?.()`, push thrown error to `errors`. After loop: `effectQueue.length = 0`.
- **When called:** from the (now-inlined or shimmed) wave-end site after `propagateMark` returns; also from `drainBatch` per iteration.
- **Must NOT do:** must not throw — error isolation is per-effect; aggregation is `throwEffectErrors`'s job. Must not assume `visited[]` is populated.
- **Constraint:** **DI-1 proof obligation lives here** — the per-effect direct-dep settle loop combined with `Computed.read()`'s lazy-pull-on-STALE/PENDING is the SOLE mechanism settling the dep tree before `notify` runs.

**`settleAndDrain` — replaced or deleted**
- **If replaced:** body becomes literally `drainEffectQueue(errors); throwEffectErrors(errors)` with `errors: unknown[]` allocated locally. Behavior: drain effects, surface errors. Same as today minus the visited-loop.
- **If deleted:** call sites inline the two-line replacement.
- **Builder picks** based on byte profile. The function name `settleAndDrain` becomes semantically misleading after the visited-loop deletes (no settle in this name); slight preference for deletion + inline.

### 2.3 Module-level state: surviving / new

| State | Today | After spec |
|---|---|---|
| `markStack` (signal.ts:196) | typed array of `Subscriber` | **Unchanged.** No save/restore needed (no inline-fire). |
| `effectQueue` (signal.ts:104) | typed array of `Subscriber` | **Unchanged.** |
| `visited` (signal.ts:103) | typed array of `Subscriber` | **Deleted (preferred); retained as flag-clear list (fallback if §7 surfaces a regression).** |
| `errors` | per-call closure, allocated in `settleAndDrain` (line 372) and `drainBatch` (line 394) | **Unchanged.** No need to promote to module-level (no inline-fire). |
| `wave` (signal.ts:112) | monotonic counter | **Unchanged.** |
| `_dirtyMark` / wave-counter | none beyond `wave` | **No new counter.** SF-1 dedup mechanism unchanged. |

## 3. K1c+ invariant preservation

### 3.1 DI-1 — Dependency Invariant

**Status:** **RE-DERIVED** — single mechanism instead of today's two-step (eager visited-walk + lazy per-effect-walk). Proof obligation explicit.

**Mechanism (post-fusion):** When `drainEffectQueue` reaches an effect, it walks the effect's `depsHead` chain. For each direct dep with `(STALE | PENDING)`, it calls `dep.recomputeIfNeeded?.()`. `Computed.recomputeIfNeeded` (computed.ts:73–94) calls `recompute()` if `STALE | PENDING` and `hasEffectSub`. `recompute()` runs `this.fn()`. `fn()` reads upstream deps via their `read()` function. `Computed.read()` (computed.ts:120–132) lazy-recomputes on `STALE | PENDING` (line 127). Therefore by the time `recompute()` returns, every transitive upstream dep has been settled in inverse-topological order.

**Proof obligation:**

1. Direct deps of an effect are reached via `depsHead` walk (signal.ts:335) — this is the existing PENDING-branch loop, now unconditional.
2. Lazy upstream pull through `Computed.read()` resolves the transitive chain — mechanism unchanged from today's PENDING-branch.
3. Cascade suppression (`shallowClear` in `Computed.recomputeIfNeeded`) clears MARKED on direct subs when an upstream computed equality-stably recomputes; the post-settle re-check `if (!(sub.flags & MARKED)) continue` (signal.ts:338) honors the suppression for the current effect.

**Test that pins it:** `effect.test.ts:124–141` (fan-out fire), `effect.test.ts:197–238` (20 000-deep chain — load-bearing for transitive lazy-pull), `properties.test.ts` (cellx structural correctness), `computed.test.ts` (equality-stable suppression).

**Subtle case:** today's eager fan-out settle walks `visited[]` in DFS pre-order from the source signal. Under α the per-effect direct-dep walk runs from each effect's `depsHead`, which is the order the effect read its deps during initial `fn()` execution. For fan-out where two effects share a common upstream computed, the second effect's `recomputeIfNeeded` short-circuits because the first effect's call already cleared `(STALE | PENDING)` via `recompute`. Net work is the same; ordering differs. **No test pins inter-effect upstream-recompute order.**

### 3.2 CS-1 — Cascade Suppression

**Status:** **PRESERVED-TRIVIALLY** — mechanism unchanged.

**Mechanism (post-fusion):** When `Computed.recomputeIfNeeded` runs `recompute()` and the new value equality-matches the previous (computed.ts:83–86), it calls `shallowClear(this.subsHead)` (signal.ts:274–280) which clears MARKED on direct effect subs and STALE+MARKED on direct computed subs. In `drainEffectQueue` after the per-effect direct-dep settle loop, the gate `if (!(sub.flags & MARKED)) continue` (signal.ts:338) skips suppressed effects. **Identical to today.** The only change is that this gate now runs unconditionally (not just on PENDING-arrived effects); gates suppress cascade for any effect whose upstream just stabilized.

**Proof obligation:** none beyond preservation. Today's signal.ts:338 path runs on every PENDING effect; under α it runs on every effect (PENDING or otherwise). Cascade suppression strictly broadens, never weakens.

**Test that pins it:** `computed.test.ts` cellx and equality-stable tests; `bench/signals/src/workloads/cellx.ts` TOTAL = 17 invariant.

### 3.3 SF-1 — Single-Fire

**Status:** **PRESERVED-TRIVIALLY** — mechanism unchanged.

**Mechanism (post-fusion):**

1. **Wave-counter dedup at mark** (signal.ts:217, 219, 239, 241) — MERGE-flagged subs dedup at `lastWave === wave`. Unchanged.
2. **MARKED gate at fire** (signal.ts:325, 340) — drainEffectQueue clears MARKED before calling `notify()`; a duplicate queue entry hits the gate and skips. Unchanged.

**Proof obligation:** the unconditional checkDirty + per-effect direct-dep settle now runs for every queued effect, but the MARKED gate at the entry of the loop body (`if (!(sub.flags & MARKED)) continue` at line 325) and the post-settle re-check (line 338) both still fire. SF-1 holds.

**Test that pins it:** `effect.test.ts:124–141` (each effect runs exactly once on each setN).

### 3.4 RC-1 — Re-Entrancy Containment

**Status:** **PRESERVED-TRIVIALLY** — mechanism unchanged.

**Mechanism (post-fusion):**

- **Non-batched re-entrancy:** an effect body that writes a signal during `notify()` recurses into `signal.write` (signal.ts:494) → `batchDepth === 0` branch → `wave++` + `propagateMark + drainEffectQueue + throwEffectErrors` (the post-α replacement of `settleAndDrain`). The inner wave runs to completion. `markStack` is empty by the time `notify()` is called (mark walk completed before `drainEffectQueue` started), so no save/restore is needed. **Identical to today.**
- **Batched re-entrancy:** inner write goes to `enqueueIfNeeded → batchQueue.push`; `drainBatch`'s outer `while (batchQueue.length > 0)` loop picks it up next iteration. `MAX_BATCH_ITERATIONS = 100` caps cycles. **Unchanged.**

**markStack save/restore protocol:** **NONE NEEDED.** α does not introduce inline-fire; mark walk completes before `notify()` is called.

**Proof obligation:** Today's `markStack` discipline (try/catch at signal.ts:257–260 trims on throw) handles the abnormal-completion case for the mark walk itself. After `propagateMark` returns, `markStack.length === 0` (or === `baseLen` of caller, but no caller exists outside `propagateMark`); a re-entrant wave starts from a clean stack. **No new invariant introduced.**

**Test that pins it:** `batch.test.ts:83–109` (effect that writes inside flush extends the same batch); `effect.test.ts:76–85` (direct self-write throws SignalCircularError). Both must stay green.

### 3.5 EI-1 — Error Isolation

**Status:** **PRESERVED-TRIVIALLY** — mechanism unchanged.

**Mechanism (post-fusion):** Per-effect try/catch at `drainEffectQueue` lines 341–349 stays bit-identical. Errors push to the `errors: unknown[]` accumulator allocated in the wave-start site (today's `settleAndDrain` line 372 and `drainBatch` line 394). After drain completes, `throwEffectErrors(errors)` (signal.ts:359–363) surfaces a single direct throw or multi-error AggregateError.

**Order pin:** Scout flagged EI-1 order is NOT pinned (`effect.test.ts:192` uses `.sort()`). α preserves the SEMANTIC shape (per-effect catch + AggregateError) without depending on a specific order. The order in `errors[]` matches `effectQueue` push order under α — same as today.

**Proof obligation:** none beyond preservation. The try/catch site is unchanged.

**Test that pins it:** `effect.test.ts:143–168` (sibling effects survive boom), `effect.test.ts:170–195` (two booms → AggregateError).

## 4. Effect-firing order

α preserves today's effect-firing order: `effectQueue` push order, which is mark-walk DFS pre-order (head→tail per fan-out sub list, depth-first per linear chain). Tests that touch order:

- `effect.test.ts:124–141` — checks both effects ran (`a` and `b` both incremented); does NOT pin which fired first. Order under α: same as today.
- `effect.test.ts:170–195` — sorts AggregateError messages before assertion; does NOT pin order.
- `batch.test.ts:83–109` — the writing effect runs before the reading effect in batched flow; α preserves this because batched re-enqueue mechanism is unchanged.

**No effect-firing order test would fail under α.** No new test required to pin order semantics.

## 5. Scout's open questions Q3, Q4, Q5 — resolutions

### Q3 — markStack safety under inline-fire re-entrancy

**Resolution:** **EVAPORATES under α.** No inline-fire site is introduced. Mark walk completes (markStack drains to empty) before any `notify()` is called. Re-entrant signal writes during `notify()` start fresh waves with empty `markStack`. **No save/restore protocol needed.**

### Q4 — Error accumulator threading: module-level vs threaded param

**Resolution:** **NEITHER — keep today's per-call closure allocation.** Today's `errors: unknown[]` is allocated once at the top of `settleAndDrain` (signal.ts:372) and once at the top of `drainBatch` (signal.ts:394), then passed as a parameter to `drainEffectQueue`. Under α this stays bit-identical. Module-level state for errors is unnecessary because there is no inline-fire site to thread errors through. **Bytes saved: zero (already optimal).** Type safety: maintained.

### Q5 — Re-entrancy spawn-fresh-wave vs defer-to-inner-queue

**Resolution:** **PRESERVES TODAY'S BEHAVIOR.** Non-batched re-entrant write spawns a fresh wave (signal.ts:512 `wave++`); batched re-entrant write enqueues to `batchQueue`. Both paths are unchanged because α does not introduce inline-fire. No deferred-write list is added.

## 6. Test expectations

### 6.1 Existing tests that MUST stay green

The 6 Scout-flagged tests + the standard-suite contract:

1. `packages/signals/tests/effect.test.ts:143–168` — "thrown effect does not strand siblings" (EI-1).
2. `packages/signals/tests/effect.test.ts:170–195` — "two thrown effects in one wave surface as AggregateError" (EI-1 multi).
3. `packages/signals/tests/effect.test.ts:197–238` — "20000-level computed chain does not overflow stack" (DI-1 transitive lazy-pull, the load-bearing α regression risk).
4. `packages/signals/tests/batch.test.ts:83–109` — "effect that writes inside flush extends the same batch" (RC-1 batched).
5. `packages/signals/tests/effect.test.ts:76–85` — "direct self-write inside an effect throws SignalCircularError" (RUNNING flag check).
6. `packages/signals/tests/batch.test.ts:111–132` — "pathological cycle inside batch throws SignalCircularError" (MAX_BATCH_ITERATIONS).

Plus the full standard suite (334 tests / current count): `signal.test.ts`, `computed.test.ts`, `effect.test.ts`, `batch.test.ts`, `properties.test.ts`, `state.test.ts`, `untrack.test.ts`, `deep-chain.test.ts`. Builder runs `bun run test --filter @scribe/signals` and confirms 100 % green.

### 6.2 New tests Builder MUST add

**For α — DI-1 transitive lazy-pull regression test.** The 20 000-deep test (`effect.test.ts:197–238`) already covers depth pathology, but α's algorithmic shift to per-effect-only settle (no eager visited-walk) merits an explicit smaller-scale assertion that an effect reading two equality-stable computeds does NOT fire. Specify the test shape (NOT the implementation):

- **Test name:** `'α regression: per-effect direct-dep settle suppresses fire on equality-stable upstream'`
- **Setup:** A signal `[n, setN]` initialized to 1. Two computeds: `c1 = computed(() => n() * 0)` and `c2 = computed(() => c1())` (so `c1` is equality-stable on any nonzero `n`). An effect reads `c2()` and increments a counter.
- **Action:** initial registration runs the effect once; then `setN(2)`.
- **Assertion:** counter remains at 1 (effect did NOT re-fire because `c1` recomputed to the same `0`, triggering shallowClear which suppressed `c2`'s STALE+MARKED, which in turn suppressed the effect's MARKED — caught at the post-settle re-check at signal.ts:338).
- **Why this would fail without α's per-effect-settle path:** if the per-effect direct-dep loop didn't run (e.g., a refactor accidentally left it gated by the deleted PENDING flag), the effect's MARKED would never be cleared by `shallowClear` because `shallowClear` runs from `Computed.recomputeIfNeeded` which never executes; the effect would fire spuriously.

**Builder may rely on this regression existing if a similar test is already in `computed.test.ts` for cellx-shape suppression.** Builder may skip adding if the existing cellx tests pin the same invariant; in that case the spec is satisfied by §6.1.

### 6.3 Tests that may need updates

**None.** α preserves all observable contracts. No test update is proposed.

## 7. Open questions for Builder

1. **Is `visited[]` deletable, or must it be retained as a flag-clear list?** Today, `clearVisited` (signal.ts:379–384) clears `MARKED | PENDING` on every visited computed at wave-end. If `visited[]` is deleted, the only mechanism that clears MARKED on a fan-out computed that did NOT have an effect subscriber is its next `Computed.recompute()` call (computed.ts:111 clears `RUNNING | STALE | MARKED | PENDING`). For a fan-out computed with no effect-subs, MARKED can linger across waves. This is benign because: (a) MARKED is only checked at `drainEffectQueue` (line 325, 338) which only iterates effects, never computeds; (b) re-marking with `|=` is idempotent. **Builder verifies by running the full test suite with `visited[]` deleted; if all 334 tests pass, prefer deletion (≈ 30 B savings). If a test surfaces a regression, retain `visited[]` as a flag-clear list and call out which test pinned it — Verifier will adjudicate whether the regression is a genuine invariant or an over-tight test assertion.**

2. **Per-effect dep-settle loop: gate or unconditional?** Today's loop (signal.ts:335–337) runs only when `sub.flags & PENDING` is set (line 327). Under α it must run unconditionally (the gate is removed). Builder confirms this by reading the assembled `drainEffectQueue` body — there must be NO `if (sub.flags & PENDING)` gate around the depsHead walk after the rewrite. The `sub.flags &= ~PENDING` at line 328 stays (clears PENDING when present; no-op when not).

3. **`drainBatch` symmetry.** Today's `drainBatch` (signal.ts:392–431) has its own eager `for (const sub of visited) sub.recomputeIfNeeded?.()` at line 421. α deletes this for the same reason as the `signal.write` path. Builder applies the same deletion at this site; ensures `visited.length = 0` at line 423 is also deleted if `visited[]` is fully removed.

## 8. Anti-patterns the Builder must avoid

- **DO NOT touch lines 1–199 or 436+** of `packages/signals/src/signal.ts` (Compressor's territory; bit-identical post-Compressor).
- **DO NOT touch `.size-limit.json`.** If the rewrite blows 1970 B, surface to Director; do not raise the limit.
- **DO NOT delete or weaken existing tests.** Adding the new α regression test from §6.2 is encouraged.
- **DO NOT design topology-dependent dispatch** (Learning #41). Verify with Verifier's bench gate (no > 5 % regression on any current workload). The α design itself is topology-blind by construction (single per-effect path for both fan-out and linear chains), but Builder must run the full bench suite to confirm.
- **DO NOT raise the bench-environment variance issue (Q7) by cross-referencing cached `RESULTS.md` numbers** — every measurement is on the Builder's machine in the same hour-window per Director's mid-session note Decision 4 Q7. Pre-flight: run baseline immediately before applying changes; post-flight: run again immediately after; do not cross-reference cached numbers from a different machine or different session.
- **DO NOT verbatim-copy alien-signals function bodies.** alien is MIT-licensed; verbatim copy requires attribution which is incompatible with scribe's runtime-package in-house policy (Learning #10). Architectural inspiration from public source-reading is fine; verbatim copy is not. Builder writes scribe's `checkDirty` (already present and correct) and per-effect dep-settle loop (already present and correct in the PENDING branch) by reference to the existing scribe code, not by transcription from `alien-signals/esm/system.mjs`.
- **DO NOT specify mechanism for things that aren't load-bearing** (Learning #3). The for-loop vs while-loop choice in the per-effect dep-walk, identifier names, micro-syntax — those are the Builder's call. The load-bearing contract is: per-effect direct-dep settle runs unconditionally; eager `for (const sub of visited)` is deleted; effect-fire order matches today; all five K1c+ invariants hold.

---

## Final checklist before pushing the spec

- [x] Variant pick stated in §1.1 with 1-2 paragraph rationale
- [x] All four criteria addressed in §1.2 table (no FAIL-without-surface)
- [x] All five K1c+ invariants addressed in §3 with proof obligations
- [x] All three Architect-routed open questions (Q3, Q4, Q5) resolved in §5
- [x] Effect-firing order stated in §4 with test citations
- [x] Anti-patterns list in §8 (Builder will read this first)
- [x] No source-file modifications (Architect is read-only on code)
