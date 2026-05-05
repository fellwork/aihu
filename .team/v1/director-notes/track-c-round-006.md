# Track C Round 6 Director-Note — Closure-Removal Investigation

**Date:** 2026-05-01
**Track:** C — Signals
**Plan:** 6.2 (Signals Deep-Chain Optimization)
**Predecessor:** Round 5 (H5 / Path C, branch `feat/v1-signals-6.2-phase2-h5 @ 62f737f`)
**Verifier report:** `.team/v1/verification-report-6.2-phase2-h5.md` (SOFT-MISS-BORDERLINE on perf, FAIL on memory)
**Investigator (H5):** `.team/v1/investigation-6.2-phase2-h5.md`
**Trigger for this round:** user decision 2026-05-01 to pursue **partial v2 closure-removal extraction in v1** (Option C from Team Lead surface). The H5 verifier surface flagged that per-instance method closures are the dominant memory cost; the user has authorised pulling that v2-scope work forward, contingent on the public-API surface holding.
**Authorisation status:** scope-shift authorised by user; this Director-note opens the investigation under fresh budget, then defers to the Investigator's quantitative analysis before any Architect spec.

---

## §0 Director caveat — read before continuing

The H5 round shipped correctness, structure, type-safety, all rank holds, and a clean bundle, but it **missed both load-bearing perf and memory targets**. The reason was not a mechanism failure: it was a **projection failure**. The Architect's H5 spec (§2.2) cited the Investigator's "≤ 2 KB hard target / ≤ 5 KB soft target" verbatim, but neither document quantified the per-Sub byte capacity of the M4 mechanism in isolation. Investigator §1.1 had already noted "H5 alone won't reach alien parity; that's a v2-scope redesign" — the destination ≤ 2 KB was set by the gap, not by the mechanism's reach.

**Round 6 must not repeat this.** The Investigator's role this round is **explicitly to quantify mechanism capacity before the Architect can copy a target**. See §"Honest framing for the user" at the bottom.

---

## §1 On-thesis assessment / scope-shift signal

### §1.1 Round 6 vs Phase 3 — call

**This is Phase 3.** I am opening Phase 3 of Plan 6.2 and naming this Round 6 of Track C overall (the round number is continuous; the phase number is per-plan).

Reasoning, citing the Phase 2 scope rules in `state-track-c.md` lines 194–199:

- **Phase 2's hypothesis space** was "tune the mark loop" (H1 linear chase, H4 outer/inner split, H5 typed Subscribers). H1 was subsumed by H4. H4 was merged. H5 was the memory-driven pivot inside Phase 2 because the Architect could carry the typed-Subscriber subclassing as a *memory* lever within the existing chase-loop frame.
- **Closure removal is a different problem.** It restructures the Subscriber's method-bearing pattern (computed.ts:55–87 `node: Subscriber = { notify() {...}, recomputeIfNeeded() {...} }`) into a static-dispatch model (see alien-signals' `createReactiveSystem({ update, notify, ...})` in `bench/signals/node_modules/alien-signals/esm/system.mjs:11–16`). That is **not** "tune the mark loop" — it is a structural change to how Subscribers carry behaviour.
- **Per the scope-shift rule** (`state-track-c.md` line 198 "Surface to user immediately if: alien-signals' algorithm requires a model change incompatible with aihu's effect-settled-in-mark contract — this would be a v2 redesign, not a v1 phase"), the trigger fired during H5 Round 5: the user has now overridden the v1/v2 boundary specifically for **closure removal**, while keeping the effect-settled-in-mark contract and public API intact. The override is partial and surgical; it does not unlock other v2 levers.
- Therefore I open **Phase 3** of Plan 6.2 — explicitly bounded to the closure-removal restructure — and reset all per-phase budgets accordingly.

### §1.2 Mode 1 vs Mode 2 — call

**This is Mode 2 (refactor mode), hard-stop at 5 Builder ↔ Verifier rounds.**

Reasoning:

- **Mode 1 (experiment loop)** rotates after 3 misses on the same hypothesis class. That is appropriate when the unknown is "which lever moves the workload" and rotation between levers is cheap.
- **Mode 2 (refactor)** is for structural rewrites where the success criterion is "the new shape compiles, passes tests, and lands within projection." Closure removal is structurally a refactor — a single mechanism (move methods to prototype or to module-static dispatch) applied across signal/computed/effect — not a search across hypotheses.
- Mode 2 is ALSO correct because the Investigator has already named the pattern (alien's static-callback dispatch) and the savings ceiling is bounded (~16 KB across 102 Subscribers per H5 investigation §1.1 closure footprint estimate; closing this delivers ~10 KB max). There is no "hypothesis to rotate to" — there is a known mechanism with a known ceiling.

**Practical consequence:** if the Builder ↔ Verifier loop fails to converge in 5 rounds, the Director surfaces "v1 cannot ship closure removal cleanly within bundle/perf budget" to the user. No rotation pivots within the round budget; we either land it or fall back to "ship H5 as relaxed soft-pass + defer closure work to v1.x or v2."

### §1.3 Iteration budget reset

**Reset to 0 / 5.** Per the scope-shift rule in the playbook §"Budget reset on scope shift", the budget resets when the substance shifts. Phase 3 has its own counter; it does not inherit Phase 2's H4+H5 round count.

**Stated explicitly for Team Lead:** Round 6 starts Phase 3 with `Builder↔Verifier counter = 0/5`. The counter only ticks when a Builder branch is shipped to a Verifier and a verification report is produced. Architect specs and Investigator reports do not consume budget.

---

## §2 What H5 actually shipped (post-Round-5 facts)

### §2.1 Performance (WSL2, three independent bench runs)

| Workload | aihu p50 | Target | Status | Citation |
|---|---:|---:|---|---|
| **deep-propagation-100** | **3.30 µs** (RESULTS.md), **3.37 µs** (3-run mean of medians) | ≤ 3.20 µs (relaxed) | **MISS** by 0.10–0.17 µs | Verifier §2 |
| cellx | 537.7 ns | ≤ 540 ns AND #1 | PASS (#1 vs preact 570, s-js 614, alien 671) | Verifier §2 |
| batched-writes-100 | 2.59 µs | ≤ 2.75 µs AND #1 | PASS (#1, 40 ns ahead of s-js) | Verifier §2 |
| dynamic-deps | 684.3 ns | ≤ 740 ns AND #1/#2 | PASS (#2 behind s-js by 82 ns) | Verifier §2 |
| wide-fanout-100 | 4.29 µs | ≤ 4.83 µs | PASS | Verifier §2 |
| creation-1to1000 | 78.40 µs | ≤ 76.2 µs | minor +2.2 µs over floor (no rank gate) | Verifier §2.headline + §9 #4 |

Headline: deep-prop-100 missed the relaxed 3.20 µs target by ~0.10 µs (RESULTS.md cell) to ~0.17 µs (3-run mean). H5's predicted ~150–250 ns improvement on the chase loop did not materialise on this WSL2 host (verifier §2 headline: "H5 not measurably faster than H4 same-hardware").

### §2.2 Memory (deep-propagation-100 buildHeapDelta)

| State | aihu deep-prop buildHeapDelta | Per-Sub (÷102) | Verdict |
|---|---:|---:|---|
| H4 baseline (architect-cited) | 10.24 KB | ~100 B | (baseline) |
| H4 baseline (verifier same-hardware re-bench at 378d494) | 10.20 KB | ~100 B | matches |
| **H5 (62f737f)** | **8.68 KB** | **~85 B** | reduction ~15% (1.52 KB freed) |
| ≤ 2 KB (HARD PASS, h5 §10.3) | needed | ≤ ~20 B | **MISS by 4.34×** |
| ≤ 5 KB (SOFT PASS, h5 §10.3) | needed | ≤ ~50 B | **MISS by 1.74×** |

Headline: H5 freed ~1.52 KB out of an ~8.34 KB gap to the soft target. **The H5 investigation §1.1 had already named the dominant cost as per-instance method closures (~80–150 B/Sub × 102 Subs = 8–15 KB) and explicitly disclaimed that H5 would close it.** The architect copied "≤ 2 KB" from the destination (gap to alien) rather than from the mechanism's reach (~1.6 KB). This is the projection failure Round 6 must not repeat.

### §2.3 Bundle (signals + arbor)

| Package | At H5 (62f737f) | Cap | Headroom |
|---|---:|---:|---:|
| `@aihu/signals` | **1679 B** raw-gz | 1850 B | **+171 B** |
| `@aihu/arbor` | **2133 B** raw-gz | 2200 B | **+67 B** |

Verifier §4 confirms both packages comfortably under cap. Note that this came in **lighter than the architect's H5 §10.2 projection of ~1834 B** thanks to the R6a (HAS_COMPUTED_DEPS removal) and R7 (mangler patterns) restructures stacked into the same Builder pass. **This is the only place where H5's projection landed better than predicted; it is also the headroom that Phase 3 must not consume incautiously.**

### §2.4 Shallow-rank holds + correctness

- **All shallow ranks held** (cellx #1, batched-writes-100 #1, dynamic-deps #2, per Verifier §2 headline).
- **327/327 repo tests pass** (vs 326/326 H4) — the +1 is the new MERGE-promotion test (H5 §9.3); test files appended-only, no modifications (Verifier AC-5).
- **H5 invariants DI-1 / CS-1 / SF-1 / RC-1 / MERGE-1 / MERGE-2 all PASS** (Verifier §1 + §8). These are non-negotiable carry-overs into Phase 3.

### §2.5 Open items the Verifier flagged for Round 6

Direct quotes from `verification-report-6.2-phase2-h5.md` §9:

1. **Memory gate FAIL (8.68 KB)** is the primary outstanding item. Verifier suggests "Link compaction (3-field Link + index-encoded prev/next) or **computed-closure flattening**" — the second is exactly Phase 3's mandate.
2. **Perf gate above relaxed 3.20 µs by ~0.10 µs**, with 156–171 B signals headroom available for one tactical pass.
3. Builder D3 "6 pre-existing test failures" claim was unreproduced — Verifier flagged as Builder-environment artefact.
4. `creation-1to1000` p50 +2.2 µs over 76.2 µs floor (no rank gate; flagged for monitoring) — Verifier hypothesises this is the `lastWave: 0` field initialisation cost on every signal/effect construction. Phase 3 should watch this metric — if closure removal introduces another per-construction field, this could regress further.
5. `@aihu/data` 1039 B over a 750 B cap — pre-existing v0 debt, orthogonal.
6. WSL2 baseline H4 perf is 3.30 µs (not the 3.41 µs cited in spec) — meaning H5's mechanism delivered "roughly net-zero time on this host." Architect must reconfirm bench-host calibration before Phase 3 sets perf targets.

---

## §3 The Round-6 substance question

**Can a closure-to-static-callback restructure ship in v1 without:**

1. **Breaking the typed Subscriber subclasses from H5.** DI-1 (diamond dedup), CS-1 (PENDING propagation), SF-1 (STALE coexists with PENDING on fan-out exit), RC-1 (RUNNING circular guard), MERGE-1 (≥2 deps ⇒ MERGE flag), MERGE-2 (signals/effects born Merge) must all hold. These are spec'd in `spec-6.2-phase2-h5.md` §4.1–§4.6 as inherited or new H5 invariants. They are not negotiable.
2. **Breaking the public API.** `signal()`, `computed()`, `effect()`, `batch()`, `untrack()`, `$state()`, `SignalCircularError`, `SignalError` factory signatures, return types, and class names stay identical (H5 §13.7 / Verifier AC-7). The Builder MUST treat `packages/signals/src/index.ts` as read-only at the export level.
3. **Breaking the bundle cap.** Signals 1850 B has 171 B headroom; arbor 2200 B has 67 B headroom. Closure removal MAY add bytes (class declarations, prototype methods, `kind` discriminator field, dispatch tables). Phase 3 must arrive with a quantitative bundle estimate before Architect spec.
4. **Breaking shallow-rank holds.** cellx #1, batched-writes-100 #1, dynamic-deps ≤ #2. The closure dispatch site is on the hot path of every notify/recompute call; a polymorphic dispatch could regress cellx.
5. **Requiring a Subscriber-shape change beyond what H5 already did.** H5 already added one bit (MERGE) and one slot (lastWave on MergeSubscriber). Phase 3 may NOT widen the Subscriber further beyond what is strictly needed for static dispatch. If the candidate mechanism needs an extra `kind` field or an extra `prototype` slot, that cost MUST be quantified in advance and offset by closure removal savings.

This is a "what is feasible in v1" question. The answer requires Investigator analysis before Architect can spec.

### §3.1 Director's preliminary read on the 5 criteria

Before the Investigator dispatches, the Director's prior on each criterion (to be confirmed or refuted by quantitative analysis):

1. **H5 invariants hold under K1 / K1c.** Likely YES. The invariants (DI-1, CS-1, SF-1, RC-1, MERGE-1, MERGE-2) are bit-arithmetic on `flags` and `lastWave`. They do not depend on whether `notify` lives on a per-instance closure or a prototype method. The MERGE classifier rule fires inside `linkAdd` (`signal.ts:128–131`) regardless of class shape. Investigator must verify this is mechanically true at all sites, not just at the bit-level.

2. **Public API holds.** Likely YES. The factories `signal()`, `computed()`, `effect()` are stable contracts — internally they may construct instances of `Computed`, `Effect`, `SignalHost` classes, but they continue to return tuples / read-fns / dispose-fns of the same shape. Errors (`SignalCircularError`, `SignalError`) stay as exported classes with the same names. Investigator should confirm by walking `packages/signals/src/index.ts` exports and verifying no transitive type leak.

3. **Bundle holds.** UNCERTAIN. K1c best case nets 0 to −20 B; expected case +20 to +50 B; worst case +60 to +100 B. Signals headroom is +171 B; arbor headroom is +67 B. **The arbor 67 B headroom is the binding constraint** — even a +50 B signals delta could flow through to +20 B in arbor (depending on tree-shaking effectiveness across the workspace). Investigator must compute both budgets, not just signals.

4. **Rank holds.** Likely YES. Closure removal does not introduce new dispatch in the chase loop's hot bit-arithmetic path. The EFFECT-branch already does a polymorphic-shape call (`runEffect`) that K1c does not perturb. Cellx's 537 ns hot loop is unlikely to regress unless the dedup gate gains a new branch — which it does not under K1c (the existing MERGE gate stays). **Risk is the cast removal could change V8 IC fingerprint** — unlikely but Investigator should verify with a Q5 dispatch-cost analysis.

5. **Subscriber-shape change minimal.** Likely YES under K1c. The shape changes are: (a) prototype pointer (no extra slot — it's part of JSObject header), (b) for the K1c subvariant, `lastWave` slot is now present on EVERY Computed (not just MergeComputed). Net Subscriber shape: same 7 fields as H5's MergeSubscriber for all computeds. **This costs ~16 B per linear computed × 100 computeds = ~1.6 KB** on deep-prop. **K1c offsets this with the ~15 KB closure removal — net ~13.4 KB freed.** Investigator must confirm the 1.6 KB regression is bounded.

These priors are NOT spec inputs. They are framing for the Investigator's agenda.

---

## §4 Hypothesis space for Round 6

Per H5 investigation §1.1 quantitative breakdown, **the dominant per-Subscriber memory cost is the per-instance closure-pair (`notify` + `recomputeIfNeeded`) carrying captured vars from the factory**. Estimated at ~80–150 B/Sub for computeds (closure footprint = JSFunction ~24 B + Context ~64 B for 6 captured vars + a second JSFunction ~24 B), ~32–80 B for effects (single closure with `node` capture), ~32 B for signal hosts (empty `notify` closure). Per H5 investigation §1.2: **~108 B/Sub × 102 Subs = ~11 KB on deep-prop**. Closing this is the Phase 3 prize.

The hypothesis space below ranks four candidate mechanisms by **(memory savings × compatibility) / bundle cost**, using the Investigator's per-Sub byte estimates as the quantitative anchor.

### §4.1 Hypothesis K1 — Prototype-method extraction (class-based Subscribers)

**Mechanism.** Replace per-instance `notify` / `recomputeIfNeeded` closure literals with prototype methods on a class hierarchy. Each Subscriber becomes an instance of either `LinearComputed`, `MergeComputed`, `Effect`, or `SignalHost`. Methods live on the prototype; per-instance state (cached value, factory `fn`, equals comparator, hasEffectSub flag) moves to instance fields. The factory functions `signal()`, `computed()`, `effect()` become `new`-instantiations that wire fields and return the public read/write tuple.

The H5 typing (`LinearSubscriber` / `MergeSubscriber`) becomes the actual class hierarchy — H5's interface split is the architectural seam Phase 3 widens.

**Expected memory savings per Subscriber (citing H5 inv §1.1 closure footprint estimate):**

- Computed: removes 2 × (JSFunction ~24 B + Context with 6 captured vars ~64 B) ≈ **~176 B/Sub freed**, replaced by ~24 B prototype-pointer slot already counted in JSObject header (no new fields). Net savings: **~150 B/Sub × 100 computeds = ~15 KB on deep-prop-100**.
- Effect: removes 1 closure × ~80 B (single `node` capture). Net savings: **~80 B/Sub**.
- SignalHost: removes 1 empty closure × ~24 B. Net savings: **~24 B/Sub**.
- **Total deep-prop-100 forecast: ~15 KB freed**, reducing 8.68 KB → potentially **NEGATIVE delta** (i.e. dispose-positive accounting like alien's −2.85 KB), since the prototype pointer is shared and recompute-cycle scratch is the same.

**Caveat:** the H5 investigation §1.1 estimate of "~108 B/Sub delta to alien" includes both closure cost AND ~8–16 B for the lastWave slot AND ~16–32 B for extra Subscriber field count vs alien. K1 closes the closure piece (~80–150 B/Sub) but not the field-count gap. Realistic post-K1 forecast: **deep-prop buildHeapDelta in the 0–3 KB band** (with high variance because closure-Context retention is non-deterministic across V8 builds). Investigator must refine.

**Expected time savings:**

- Prototype-method dispatch is **monomorphic** at the call site if every Subscriber on the chain has the same hidden class. With H5's Linear/Merge split now realised as actual classes, V8's inline-cache for `sub.notify()` becomes monomorphic per-class — same speed as the closure call.
- Possible **reduction** in chase-loop cost: the closure call inside `markOne`'s EFFECT branch (via `notify()`) currently goes through a per-instance JSFunction; a prototype call goes through a shared one with a stable hidden class. Marginal (likely <50 ns on deep-prop-100).
- **Risk on cellx:** the dedup gate at `signal.ts:185` (chase loop) does not currently call any method — only flag arithmetic. K1 doesn't add a call there. The polymorphic concern is at the EFFECT-branch enqueue (`effectQueue.push(sub)`) and at drainEffectQueue — both already polymorphic in the current code (effect vs computed branches). K1 does not introduce a new polymorphic site.

**Compatibility risk with H5 invariants.**

- DI-1: dedup check `(sub.flags & MERGE) && sub.lastWave === wave` is unchanged; classes don't affect it. ✓
- CS-1: PENDING propagation is bit arithmetic on `flags`; unchanged. ✓
- SF-1: STALE/PENDING coexistence is bit arithmetic; unchanged. ✓
- RC-1: RUNNING circular guard is bit arithmetic; unchanged. The check `if (sub.flags & RUNNING) throw new SignalCircularError()` does not move. ✓
- MERGE-1 / MERGE-2: MERGE flag remains; classifier rule (computed upgraded on 2nd dep) becomes a class-internal method `linkAdd` continues to flip the bit; whether the class is "structurally" MergeComputed at construction or "promoted" at runtime is an internal detail that does not affect bit semantics. ✓ — but the Investigator must verify that lazy promotion is compatible with prototype-based class dispatch. Specifically: can `LinearComputed` instance "become" `MergeComputed` after construction? V8 does not allow prototype reassignment on a hot object without deopt cost. Two valid sub-mechanisms:
  - **K1a: dual classes; promote by Object.setPrototypeOf** — fastpath in cellx but causes hidden-class transition (deopt cost on the merge node).
  - **K1b: single `Computed` class with both `lastWave` field (always present, init 0) and a `MERGE` flag bit; classes don't differ by shape, only by flag** — collapses H5's two interfaces back into one shape, costs ~16 B/computed back. Negates ~1.6 KB of H5's gain.
  - **K1c: single `Computed` class always carries `lastWave` (born with 0 SMI); MERGE flag still gates dedup** — same as K1b but explicitly: lastWave-from-birth on every computed. Memory cost: ~16 B × 100 = ~1.6 KB regression vs H5; closure savings: ~15 KB. Net: **~13.4 KB freed**. **Recommended sub-variant.**

**Public API impact:** none if factory functions preserve their signatures. `signal()`, `computed()`, `effect()` continue to return tuples / read-fns / dispose-fns. The CLASS is internal (`@internal` annotation); not exported.

**Bundle estimate.**

- Class declaration: `class Computed { constructor(fn, equals) {...}; notify() {...}; recomputeIfNeeded() {...} }` ≈ 80–120 B raw, ~50–70 B gz.
- Class declaration `class Effect`: ~50 B raw, ~30 B gz.
- Class declaration `class SignalHost`: ~30 B raw, ~20 B gz.
- Removal of inline closure literals from `computed()` / `effect()` / `signal()` factories: **−80 to −120 B raw** (the closure bodies move to methods; net is roughly neutral but tends to compress better in gz because methods can be mangled identically across instances).
- **Net bundle estimate: −10 to +30 B gz.** Within signals 171 B headroom comfortably IF Investigator confirms gz compression behaves as estimated. Builder must verify on first build.

**Compatibility with arbor's 67 B headroom.** Arbor bundles signals; if signals net-positive bytes flow through, arbor headroom shrinks. Investigator must check whether method declarations propagate (likely yes, +10–20 B in arbor at worst). 67 B headroom is tight.

**Ranking score (memory_savings × compatibility / bundle_cost):** **~13.4 KB × 0.85 / 30 B ≈ 380** — top rank.

### §4.2 Hypothesis K2 — Module-level static callbacks dispatch (alien model)

**Mechanism.** The alien-signals model (per `bench/signals/node_modules/alien-signals/esm/system.mjs:11–16`): a single module-level `update(sub)` and `notify(sub)` function. Subscribers carry **only data** — no methods. Dispatch is per Subscriber kind via the existing `flags` bits (EFFECT vs not-EFFECT) or a new `kind` field.

```js
// pseudocode (NOT spec — illustrative only)
function notify(sub) {
  if (sub.flags & DISPOSED) return
  if (sub.flags & RUNNING) throw new SignalCircularError()
  if (sub.flags & EFFECT) runEffect(sub as EffectNode)
  // else: computed has no notify body anyway
}
function recomputeIfNeeded(sub) {
  // unified body, dispatched on (sub.flags & EFFECT) or kind field
}
```

**Expected memory savings.** Same closure-removal magnitude as K1 (~15 KB on deep-prop-100). But the **mechanism leaves no per-instance methods at all** — Subscribers are pure data records.

**Expected time savings.** Possibly **better** than K1 on cellx because static functions are call-site monomorphic at the module level (V8's static-resolution path is cheaper than virtual dispatch). However, the dispatcher needs to branch on EFFECT vs computed inside the static `notify`, which is the same work the closure body did inline. **Net: ~0 time delta vs K1.**

**Compatibility risk with H5 invariants.** Same as K1 (bit-arithmetic invariants unaffected). One difference: the per-instance `recomputeIfNeeded` closure currently captures `cached`, `hasCached`, `eq`, `equals`, `hasEffectSub` from the factory scope. Moving to a static function requires **moving these into instance fields on the Computed Subscriber**:

- `cached: T` — already lives in factory closure; would become a slot.
- `hasCached: boolean` — closure → slot.
- `equals: ((a,b)=>boolean) | false` — closure → slot.
- `hasEffectSub: boolean` — closure → slot.
- `recompute: () => T` — currently a closure-body function; would become either an inline body in the static dispatcher or a method-per-instance (defeats the purpose) or a top-level `executeRecompute(sub)` function reading sub fields.

**This is the critical sub-question.** If the Computed Subscriber has to carry 4 new fields (~32 B) to make static dispatch work, **K2 partially undoes its own memory win**:

- Closure savings: ~150 B/Sub.
- New field cost: ~32 B/Sub (4 × 8 B slots, plus possible Context for `recompute` if not inlined).
- Net per Sub: ~118 B saved. Over 100 computeds: ~11.8 KB freed (vs K1's 13–15 KB).

K2 saves slightly less than K1 (partial-class) and adds dispatcher complexity. **K1c subvariant carries similar field cost; K2 net is roughly equivalent to K1 with similar caveats.**

**Public API impact:** none (factories preserve signatures).

**Bundle estimate.**

- Module-level `notify` / `recomputeIfNeeded` / `runEffect` static functions: ~80–100 B raw, ~50–60 B gz.
- Subscriber field initializations now in factory: roughly net-zero vs the closure literals they replace.
- Removal of closure literals: similar to K1.
- **Net: −10 to +40 B gz.** Slightly heavier than K1 because the static dispatcher's branching is harder to mangle.

**Ranking score:** **~11.8 KB × 0.80 / 40 B ≈ 235** — second rank.

### §4.3 Hypothesis K3 — Hybrid: prototype methods + closure factory shrink

**Mechanism.** K1 + a parallel pass to shrink the surviving factory closures (e.g., consolidate the `recompute` closure inside computed() into a method body that reads `node.fn` and `node.equals` from instance fields, freeing the Context allocation). This is K1 plus the field-promotion piece from K2.

**Expected memory savings.** Maximum theoretical close to alien parity (~13–14 KB freed). But:

- Adds 4 instance fields per computed (~32 B/Sub × 100 = 3.2 KB regression vs K1).
- Removes the recompute Context (~64 B/Sub × 100 = 6.4 KB freed beyond K1).
- Net beyond K1: ~3.2 KB additional freed. **Forecast post-K3: deep-prop buildHeapDelta near alien (−2.85 KB) territory.**

**Expected time savings.** Same as K1; possibly +30–80 ns from removing Context allocation pressure during build.

**Compatibility risk.** Higher than K1 because it adds field promotions on a hot construct path. Risks regressing `creation-1to1000` (already +2.2 µs over floor per Verifier §9 #4).

**Public API impact:** none.

**Bundle estimate.** K1 + K2's static-dispatch overhead = ~+30–50 B gz. Tighter against the 171 B headroom.

**Ranking score:** **~14 KB × 0.70 / 50 B ≈ 196** — third rank.

**Director call:** treat K3 as "K1 with a backlog item." Ship K1 first; if K1 lands clean and headroom allows, the field-promotion piece can be a Phase 4 follow-up.

### §4.4 Hypothesis K4 — Move closures into Link, not Subscriber

**Sketch.** If 102 Subscribers × ~108 B = ~11 KB but Links are differently sized, can the notify capture move there?

**Why this fails.**

- Link count on deep-prop-100 = 101 (one per chain hop). Subscriber count = 102. Roughly equal.
- Link is currently 6 fields (`signal.ts:13–19`); it has no `notify` slot.
- Moving the closure into Link adds ~30 B/Link × 101 Links = ~3 KB cost.
- Each Subscriber would need to call out to its INBOUND Link's notify — but a Subscriber receives marks from MULTIPLE inbound Links (in fan-in). Which Link's notify do you run? The semantics are wrong.
- The factory closures capture **per-Subscriber** state (cached value for computed, fn for effect), not per-edge state.

**Verdict: REJECT.** The closure logically belongs to the Subscriber, not to the edge. Moving it to Link does not match the semantics. (The Investigator may briefly mention K4 to confirm rejection but should not spend cycles on it.)

### §4.5 Anything else the Investigator should evaluate

1. **K5 — WeakMap-keyed method dispatch.** Reject in advance for the same reason H5 §3.2 rejected M2 (Map dedup): WeakMap.get is 5–10× slower than direct field access; rank break on cellx. Do not pursue.
2. **K6 — JIT-friendly constructor template.** Investigate whether `Object.create(prototype)` + field assignment (no class syntax) ships smaller than `class { constructor() {...} }` in the bundle. This is a tactical bundle question, not a hypothesis class. Builder concern.
3. **K7 — `recompute` as a method vs as a closure body.** If K1 lands with `recomputeIfNeeded` as a method, `recompute` (the inner closure that binds `fn` and updates `cached`) should also be evaluated for promotion to a method. This is the K3 pathway — call out as a "secondary mechanism" the Investigator should size separately.

### §4.6 Hypothesis ranking summary

| Rank | Hypothesis | Memory saved (deep-prop) | Time delta | Compat risk | Bundle delta gz | Score |
|---|---|---:|---:|---|---:|---:|
| **1** | **K1 (K1c subvariant)** prototype methods, single Computed class | **~13.4 KB** | ~0–50 ns | LOW | −10 to +30 B | **~380** |
| 2 | K2 module-level static callbacks | ~11.8 KB | ~0 ns | MED (field promotion needed) | −10 to +40 B | ~235 |
| 3 | K3 hybrid prototype + closure shrink | ~14 KB | ~30–80 ns | MED-HIGH (creation-1to1000 risk) | +30–50 B | ~196 |
| — | K4 closures-on-Link | n/a | n/a | semantic mismatch | n/a | REJECT |

**Investigator's job is to refine these estimates with mechanism-specific math, not to copy them.** See §"Honest framing for the user" at the bottom.

---

## §5 Acceptance bar — Round 6

### §5.1 Perf gates

**Decision: hold the relaxed ≤ 3.20 µs target as the deep-prop hard pass band, with a 3.30 µs soft band.**

Reasoning:

- H5 sat at 3.30–3.37 µs; the relaxed target was 3.20 µs. Closure removal is forecast to deliver **memory** wins primarily, with **at most ~0–80 ns** time gain (per K1 / K2 estimates above). It is unrealistic to tighten back to ≤ 3.00 µs.
- Tightening to ≤ 3.20 µs is achievable IF the closure removal also clears constant-factor overhead in the chase loop's EFFECT-branch dispatch (notify call replaced by static or prototype dispatch). Investigator must size this.
- Softening to "no worse than H5 (≤ 3.40 µs)" would be premature surrender — closure removal is supposed to nudge time positive, not be net-neutral.

| Workload | Hard pass | Soft pass | Fail |
|---|---|---|---|
| **deep-propagation-100 p50** | **≤ 3.20 µs** | 3.20–3.30 µs | > 3.30 µs |
| cellx p50 | ≤ 540 ns AND #1 | 540–560 ns AND #1 | rank break or > 560 ns |
| batched-writes-100 p50 | ≤ 2.75 µs AND #1 | 2.75–2.86 µs AND #1 | rank break or > 2.86 µs |
| dynamic-deps p50 | ≤ 740 ns AND ≤ #2 | 740–820 ns AND ≤ #2 | rank break or > 820 ns |
| wide-fanout-100 p50 | ≤ 4.83 µs | 4.83–5.15 µs | > 5.15 µs |
| creation-1to1000 p50 | ≤ 78 µs | 78–82 µs | > 82 µs (note: H5 at 78.40 µs already; Phase 3 must not regress further) |

**Surface to user if:** Investigator forecasts deep-prop p50 outside 3.10–3.30 µs band, OR cellx forecast outside #1 with ≤ 540 ns. Either signals the mechanism is unsuitable for v1.

### §5.2 Memory gates

**Re-set the bar with realistic projections this time. Don't repeat the H5 mistake.** The Investigator's own quantitative analysis must be the source of truth. Suggested provisional bands (Architect must verify after Investigator quantifies K1c capacity):

| Workload buildHeapDelta | Hard pass | Soft pass | Fail |
|---|---|---|---|
| **deep-propagation-100** | **≤ 2 KB** | 2–4 KB | > 4 KB |
| cellx | ≤ 0 B (no regression) | ≤ +500 B | ≥ +1 KB |
| wide-fanout-100 | ≤ 38 KB (no regression vs H5) | ≤ +5 KB | ≥ +10 KB |
| batched-writes-100 | ≤ −500 B (i.e. dispose-positive) | ≤ +500 B | ≥ +1 KB |
| dynamic-deps | 0 B (unchanged) | ≤ 0 B | ≥ +500 B |
| creation-1to1000 | 0 B (unchanged) | ≤ 0 B | ≥ +500 B |

**Critical instruction to Architect:** before adopting "≤ 2 KB" as hard target, the Investigator must confirm that the K1c mechanism's freed-bytes ceiling exceeds 6 KB (i.e., the mechanism has at least 1.5× margin over the gap between H5's 8.68 KB and the 2 KB target). If the mechanism's ceiling is below ~10 KB, ratchet the hard target up to ≤ 4 KB and ratchet the soft target to ≤ 6 KB.

**This is the playbook fix for the Round 5 failure mode.** Numbers must be defended by mechanism, not copied from destination.

### §5.3 Bundle gates

**Caps unchanged: 1850 B signals, 2200 B arbor.**

Headroom heading into Phase 3:

- **Signals: +171 B** (H5 closing position).
- **Arbor: +67 B** (H5 closing position; signals propagation).

Closure removal has uncertain bundle impact:

- **Best case (K1 with strong gz compression of identical methods):** −10 to −30 B net (closures gone, methods compress better).
- **Expected case (K1c with 4 new fields per Computed):** +20 to +50 B net.
- **Worst case (K2 + dispatcher + field promotions):** +60 to +100 B net.

**Surface to user if:** Architect spec arrives with bundle estimate > +120 B (signals) or > +50 B (arbor). At those numbers we are at headroom edge with no room for Builder slop. Either Investigator finds a tighter mechanism or we surface for a cap raise discussion.

**Builder discipline:** every commit on the Phase 3 branch must include `bun run build && size-limit` in the self-test loop. No commit lands locally without bundle check. (Same rule as H5 + R7 — proven workable.)

### §5.4 Shallow-rank holds

**Same as Round 5:**

- **cellx #1** (current p50 537.7 ns; lead 33 ns over preact). Floor 540 ns.
- **batched-writes-100 #1** (current p50 2.59 µs; lead 40 ns over s-js). Floor 2.75 µs.
- **dynamic-deps ≤ #2** (current p50 684 ns; behind s-js by 82 ns; ahead of preact by 184 ns). Floor 740 ns.

If any of these break, surface to user immediately (this is a Surface-to-User #4 trigger from Round 5; carries forward).

### §5.5 Public API — hard invariant

Spec instruction the Architect must adopt verbatim:

> **Phase 3 closure removal MUST NOT change the public signatures of `signal()`, `computed()`, `effect()`, `batch()`, `untrack()`, `$state()`, OR the names `SignalCircularError` / `SignalError`. `packages/signals/src/index.ts` exports must be byte-identical to H5 (Verifier AC-7 baseline). Any internal class introduced (`Computed`, `Effect`, `SignalHost`, etc.) must NOT be exported. The factory functions retain their current shape; their bodies change but their signatures and return types are pinned.**

This is also Verifier discipline: the bidirectional check at AC-7 ("public API surface unchanged") is non-negotiable.

### §5.6 Test surface — append-only

H5 §13.1 ("test files modified ⊆ {append-only}") and Verifier AC-5 (test files appended-only) carry forward. Phase 3 may **add** tests — for example, a test that asserts the Computed prototype has `notify` as an own property and that no per-instance closure exists — but may not modify any existing test.

---

## §6 Routing decisions

### §6.1 Researcher 1 — Investigator (sequential, Iron Law)

**Iron Law:** No fix code, no Architect spec, no Builder dispatch until the Investigator's `.md` is on disk and answers the questions below. Quantitative answers only — no narrative without numbers.

**Brief:** Read `bench/signals/node_modules/alien-signals/esm/system.mjs` (the static-callback pattern) and the H5 sources at `feat/v1-signals-6.2-phase2-h5 @ 62f737f`. Quantify aihu's per-Sub closure cost at the slot level; evaluate K1 (a/b/c sub-variants), K2, K3, K4 mechanisms with concrete byte / time / bundle estimates.

**Output:** `.team/v1/investigation-closure-removal.md` answering:

1. **Q1 — Closure footprint per Subscriber, by class.** For each of `signal()`, `computed()`, `effect()` factories, count exact slot-by-slot per-instance memory cost: JSFunction objects, Context objects (with captured-var counts), in-object property slots. Cite specific lines in `signal.ts:420–430` (host), `computed.ts:55–87` (computed node), `effect.ts:54–67` (effect node). Provide a table similar to investigation-6.2-phase2-h5 §1.1.
2. **Q2 — K1 mechanism capacity.** For K1c specifically (single Computed class, lastWave-from-birth, MERGE flag still gates dedup): how many bytes does this free per Subscriber? On deep-prop-100, what is the mechanism's *ceiling* (max possible savings) and *floor* (minimum savings under pessimistic V8 retention)? Justify both with V8 sizing data.
3. **Q3 — K2 mechanism capacity.** Same questions for the static-dispatch model. Identify the field-promotion cost (which closure-captured vars must move to instance fields) and net savings.
4. **Q4 — K1 vs K2 bundle delta.** For each, compute: (a) raw byte cost of class declarations or static functions; (b) raw byte savings from removing closure literals; (c) gz compression ratio assumption. Provide a confidence interval.
5. **Q5 — Hot-path dispatch cost.** Does prototype dispatch (K1) vs static dispatch (K2) change the cost of the chase-loop's EFFECT-branch handling? Specifically, does the inline-cache for `sub.notify()` stay monomorphic, and does that affect cellx's 537 ns?
6. **Q6 — H5 invariant compatibility per mechanism.** Walk DI-1, CS-1, SF-1, RC-1, MERGE-1, MERGE-2 (per `spec-6.2-phase2-h5.md` §4) and confirm whether each is preserved, adapted, or threatened under K1 and K2. For MERGE-1 specifically (lazy promotion in linkAdd), evaluate whether prototype reassignment is needed (K1a vs K1b vs K1c). Recommend the safe sub-variant.
7. **Q7 — `creation-1to1000` impact.** H5 left this 2.2 µs over its 76.2 µs floor (Verifier §9 #4). K1 / K2 may add field initialisations on every signal/effect construction. Quantify the per-construction cost delta and verify it stays within the soft pass band (≤ 82 µs).
8. **Q8 — Recommendation.** Pick ONE primary mechanism. Justify with the (memory_savings × compatibility) / bundle_cost ratio.

**Iteration budget for Investigator:** 1 round. If the report is incomplete, Director redirects with specific gaps; does not consume Builder budget.

### §6.2 Researcher 2 — Architect (after Investigator)

**Brief:** From the Investigator's recommended mechanism, write `spec-6.2-phase3-closures.md` (or your chosen filename — Team Lead's call on naming). Match the format of `spec-6.2-phase2-h5.md` (numbered AC, named invariants, no-regression matrix, bundle budget, forbidden modifications).

**Sub-targets (must be embedded in the spec):**

- All H5 invariants DI-1 / CS-1 / SF-1 / RC-1 / MERGE-1 / MERGE-2 hold (cite spec-6.2-phase2-h5 §4 directly; do not re-derive).
- No public API change (cite §5.5 of this Director-note).
- Bundle within signals 1850 B / arbor 2200 B caps; quantify expected delta with confidence interval; if estimate trends > 70% of headroom, surface bundle escalation **upfront** (do not wait for Builder).
- Concrete memory + perf projections backed by the Investigator's quantitative analysis. **The spec MUST explicitly state: "Memory target X KB is set by mechanism capacity floor of Y bytes (Investigator §Q2/§Q3); margin = Z×."** This is the explicit fix for the Round 5 projection failure.
- Branch off `feat/v1-signals-6.2-phase2-h5 @ 62f737f` to preserve H5 + R6a + R7 wins. Branch name: Team Lead's call (suggested: `feat/v1-signals-6.2-phase3-closures` or similar).

**Iteration budget for Architect:** 1 round. If the spec is incomplete or repeats the destination-copy projection error, Director redirects.

### §6.3 Researcher 3 — Builder (after Architect)

**Brief:** Implement on a new branch off `feat/v1-signals-6.2-phase2-h5 @ 62f737f`. Self-test gates on every commit:

- `bun test` in `packages/signals` — must remain at ≥327 (no regression on test count).
- `bun run build` in `packages/signals` — bundle must stay ≤ 1850 B gz.
- `bun run build` in `packages/arbor` — bundle must stay ≤ 2200 B gz.
- Diff scope discipline: only files named in the Architect spec touched. No drive-by refactors.

Builder MUST report:

- Per-commit bundle measurement (raw + gz).
- Test count delta (always positive or zero).
- Any deviation from spec called out explicitly with a `D#` label (matching H5 reporting style).

**Iteration budget for Builder:** participates in the 5-round Builder ↔ Verifier hard cap.

### §6.4 Researcher 4 — Verifier (after Builder)

**Brief:** WSL2 environment (Bun 1.3.8, mitata 1.0.34, same as H5 verification).

**Bidirectional checks:**

1. AC checklist matching the Architect spec (PASS / FAIL per AC).
2. Perf table: 6 workloads × p50, p99, ops/s, rank.
3. Memory table: 6 workloads × buildHeapDelta, peak-malloc, dispose-residual. **All 36 cells populated.**
4. Bundle table: signals + arbor raw-gz vs cap.
5. Correctness: full `bun run test` from root (≥327 expected).
6. **Drive-by audit:** every diffed file traces to a spec section. Zero collateral edits.
7. **Bidirectional spec-vs-impl audit table:** like H5 §8. Each spec item: implemented? where? evidence.
8. **Projection verification:** explicitly compare measured numbers to Architect spec's projections. If Architect predicted "≤ 2 KB memory" and Verifier measures 5 KB, the **discrepancy is itself a Verifier finding** that must surface. (This is the Round 5 lesson institutionalised.)

**Iteration budget for Verifier:** participates in the 5-round Builder ↔ Verifier hard cap. If Verifier finds projection miss > 2× on memory or > 0.15 µs on perf, **does NOT auto-fail** — instead, surfaces to Director for re-evaluation. Some misses are mechanism-realistic (e.g., V8-build variance). Only rank breaks and AC failures auto-fail.

---

## §6.5 K1c walkthrough — site-by-site against H5 §3.2

This section is **not** a spec. It is a Director-level sanity check that K1c is mechanically plausible against the named H5 adaptation sites, so the Investigator can ground the formal analysis. The Architect must not copy this — it is illustrative.

H5's spec §3.2 enumerated five adaptation sites (plus a sixth chase-inner site introduced by H4). Phase 3 / K1c interacts with each:

### §6.5.1 Site A — markOne outer-loop dedup (`signal.ts:185` post-H5)

**Current code (H5):**

```
if (!(sub.flags & DISPOSED) && (!(sub.flags & MERGE) || (sub as MergeSubscriber).lastWave !== wave)) {
  if (sub.flags & RUNNING) throw new SignalCircularError()
  if (sub.flags & MERGE) (sub as MergeSubscriber).lastWave = wave
  ...
}
```

**Under K1c:** if every Computed instance carries `lastWave: 0` from birth (regardless of MERGE bit), the type-cast `(sub as MergeSubscriber)` is no longer needed — the field is shape-stable. Site A becomes:

```
if (!(sub.flags & DISPOSED) && (!(sub.flags & MERGE) || sub.lastWave !== wave)) {
  if (sub.flags & RUNNING) throw new SignalCircularError()
  if (sub.flags & MERGE) sub.lastWave = wave
  ...
}
```

The MERGE-flag gate stays — it is still the dedup classifier. The `(sub as MergeSubscriber)` cast is removed (cosmetic, not a semantic change). DI-1 invariant unchanged.

**Bytes:** −10 to −20 B raw (cast removal), ~−5 B gz.

### §6.5.2 Site B — markOne outer-loop write (same line)

Same as Site A. Cast removal only.

### §6.5.3 Site C — drainBatch lastWave patch (`signal.ts:373–381` post-H5)

**Current code (H5):**

```
for (let l = sub.depsHead; l !== null; l = l.nextDep) {
  if (l.dep.recomputeIfNeeded === undefined && (l.dep.flags & MERGE) && (l.dep as MergeSubscriber).lastWave !== wave) {
    (l.dep as MergeSubscriber).lastWave = wave
  }
}
```

The site detects "is dep a signal host?" via `recomputeIfNeeded === undefined`. **Under K1c, this detection breaks if K2-style static dispatch is chosen** (because static dispatch removes `recomputeIfNeeded` from the instance entirely). For K1 (prototype methods), `recomputeIfNeeded` is on the prototype, so `=== undefined` is FALSE for Computed instances and TRUE for SignalHost / Effect — but only if SignalHost prototype does not declare `recomputeIfNeeded`. Architect must verify.

**Mitigation:** introduce a `kind` field or a `HOST` flag bit that distinguishes signal-host from computed/effect explicitly. The `recomputeIfNeeded === undefined` idiom is a Phase 1 hack that K1 should retire.

**This is a Surface-to-User candidate during Architect spec** if the Architect finds the kind-field cost > 8 B/Sub.

### §6.5.4 Site D — checkDirty signal-source detection (`signal.ts:278` post-H5)

Same as Site C — `recomputeIfNeeded === undefined` detection. Same mitigation.

### §6.5.5 Site E — effect-pool reuse SMI sentinel (`effect.ts:53` post-H5)

**Current code (H5):**

```
node.flags = EFFECT | MERGE
node.lastWave = 0
node.fn = fn
```

**Under K1c:** if `Effect` is a class, pool reuse is `pool.pop()` returning a `EffectInstance`; the constructor was already run. Reset becomes:

```
node.flags = EFFECT | MERGE
node.lastWave = 0
node.fn = fn
// no other fields to reset; class invariants hold
```

**Critical question: is the `disposed` closure flag on the pool's dispose closure replaced?** Currently `effect.ts:73–74` keeps `let disposed = false` as a per-dispose-closure local. K1c with class-based Effect may move this to an instance field, but the comment in `effect.ts:75–77` notes:

> "Closure-local `disposed` flag is the only guard needed: a node enters `pool` only inside this same closure's body, so a recycled node cannot re-enter this closure with `disposed === false`."

**This is a subtle correctness invariant.** If K1c moves `disposed` to an instance field, **the same node could be disposed twice across pool reuse** (two separate dispose-closures captured the same node, both flip the field). Investigator must confirm: does the closure-local `disposed` need to stay closure-local even under K1c, or can it be an instance field?

**Recommendation: keep `disposed` as a closure-local on the dispose function returned by `effect()`. The dispose function itself remains a closure (its identity is the public API contract — it's the return value of `effect()`). Only the `notify` and `recomputeIfNeeded` methods on the instance move to the prototype/class.**

### §6.5.6 Site F — chase-inner dedup (post-H4 `signal.ts:200–203` per H5 §3.2 closing paragraph)

Same transformation as Site A. Cast removal; MERGE gate unchanged.

### §6.5.7 Summary of site impact

| Site | Pre-K1c | Post-K1c | Bundle delta gz | Risk |
|---|---|---|---:|---|
| A | type cast required | cast removable | −5 B | none |
| B | type cast required | cast removable | −5 B | none |
| C | `recomputeIfNeeded === undefined` detection | needs `kind` or `HOST` flag | +5 to +15 B | medium (correctness) |
| D | same as C | same as C | already counted in C | medium |
| E | flag + lastWave + fn reset | same; verify `disposed` closure stays local | 0 B | low (correctness if `disposed` moves) |
| F | type cast required | cast removable | −5 B | none |

**Net K1c site-impact bundle delta: −5 to +5 B gz** (bounded by the kind-field decision in C/D).

The **dominant K1c cost is the class declaration itself** (~50–70 B gz per class × 3 classes ≈ 150–210 B gz worst case), offset by the **closure-literal removal in factories** (~80–120 B gz freed). The Investigator's Q4 must compute this net precisely.

---

## §7 Continuity check

H5 shipped:
- 1.56 KB freed memory on deep-prop-100 (10.20 → 8.68 KB).
- ~110 ns NOT delivered on time (predicted, not realised on this WSL2 host).
- Bundle came in MUCH lighter than predicted (1679 B vs 1834 B projected) thanks to R6a + R7. **The +156 B "spare" is real headroom Phase 3 can spend.**

**The continuity question: is there hidden technical debt from H5 that closure removal needs to address?**

Audit, citing H5 sources at 62f737f:

1. **Effect pool reset SMI sentinel** (`effect.ts:51` `node.lastWave = 0`). Clean. No debt.
2. **MERGE flag at `0x040`** (the existing 0x040 hole). Clean. No collisions per Verifier D1.
3. **R6a HAS_COMPUTED_DEPS removed** (Verifier confirmed 0 hits). Clean.
4. **R7 mangler patterns** for `.dep` / `.sub` / `.fn`. Phase 3 will introduce class field names (`fn`, `equals`, `cached`, `hasCached`, `hasEffectSub`, `lastWave`, `flags`, `subsHead`, `subsTail`, `depsHead`, `depsTail`). **Architect must verify R7 mangler covers any new field names introduced by class promotion**. If new fields are added (K2 or K3), the mangler may need extension. This is a real continuity item — do not skip it.
5. **`recomputeIfNeeded?` is optional on Subscriber interface** (`signal.ts:32`). H5 left it optional because EffectNode does not assign it. K1 must reconcile: if `LinearComputed` and `MergeComputed` both have it as a method, but `Effect` and `SignalHost` do not, the prototype chain or class hierarchy must encode this. **Investigator must answer**: does the dispatch site `l.dep.recomputeIfNeeded?.()` (`signal.ts:286–287` cascade-suppression settle, untouched by H5) handle the new class shapes correctly? If `Effect` and `SignalHost` don't have the method, the optional-call still works (`?.` short-circuits on undefined), but V8's IC may go megamorphic. Bench impact: probably zero, but verify on cellx.
6. **`signal()` host has `notify() {}` (empty closure)** (`signal.ts:432` at H5). Phase 3 should remove this entirely. Hosts are never notify()'d — they are sources, not sinks. The empty closure is dead code (~24 B/host × 100K signals in arbor lifecycle = real bytes). Investigator should call this out as a free byte-saving in K1's bundle estimate.

**Verdict: H5 is a clean foundation with one piece of low-hanging fruit (signal-host empty notify) Phase 3 should clean up in passing.**

---

## §8 Iteration budget for this session

**Per Mode 2: hard-stop at 5 Builder ↔ Verifier rounds in Phase 3.**

**Counter resets to 0 / 5 due to scope shift** (per playbook §"Budget reset on scope shift").

The 5 rounds are Builder ↔ Verifier loop iterations. They do NOT consume:
- Investigator round (1, separate budget).
- Architect round (1, separate budget).
- Director-note rounds (this one and any subsequent re-routing).

If Builder ↔ Verifier hits 5/5 without converging on hard pass, **Director surfaces "v1 cannot ship closure removal cleanly within bundle/perf budget" to user**. Two valid resolutions at that point:

1. Ship H5 as-is (relaxed soft-pass on perf, accept the 8.68 KB memory deviation as a v1.x roll-forward).
2. Raise the bundle cap to 1900 B signals / 2250 B arbor and ship Phase 3 at the soft band.

The user makes that call, not the Director.

---

## §9 Surface-to-user triggers (UPDATED for Round 6)

Surface immediately if any of:

1. **K1, K2, K3, K4 all infeasible in v1** — Investigator concludes none can land within bundle / perf / public-API constraints. This is the "Phase 3 cannot ship" signal; user must decide fall-back (ship H5 as-is, raise budgets, or defer to v2).
2. **Bundle delta > +120 B signals or > +50 B arbor** in any Architect spec or Builder commit. This consumes too much headroom; needs cap escalation.
3. **Closure removal regresses cellx ≥ 5 ns OR drops below #1.** The closures had hot-path inlining benefit; if removing them breaks cellx, the mechanism is unsuitable. (This is the Round 5 carry-over Surface-to-User #4 trigger.)
4. **Architect's projection vs Verifier's measurement misses by > 2× on memory OR > 0.15 µs on perf** — pause and re-investigate. Do NOT continue Builder rounds with a known bad projection. (This is the Round 5 lesson institutionalised.)
5. **Memory hits ≤ 2 KB (success — verify and ship).** This is a positive surface — confirm with extra bench runs and ship.
6. **Public API change required** to make the mechanism work (e.g., factory signature change, exported class, added export). This is a **hard veto from §5.5**; cannot proceed without explicit user authorisation.
7. **Builder ↔ Verifier counter hits 5/5** without convergence to hard or soft pass. Director surfaces fall-back options as in §8.
8. **`creation-1to1000` regresses past 82 µs** — the H5 baseline was already 78.40 µs over the 76.2 µs floor; closure removal must not push it further. (This is a Round 6 NEW trigger.)

---

## §10 Honest framing for the user

**Read this paragraph before any Architect spec is written.**

H5 didn't hit its memory target because the projection was wrong, not because the mechanism failed. The Investigator (`investigation-6.2-phase2-h5.md` §1.1) had explicitly stated:

> "H5 will not on its own close the entire 10.24 KB delta. It addresses the lastWave-related allocation pressure (~1–3 KB/graph). Closing the rest requires moving from per-instance method closures to a shared dispatch mechanism, which is a v2-scope redesign."

The Architect (`spec-6.2-phase2-h5.md` §1.1, citing the same investigation) acknowledged this in writing:

> "H5 closes the lastWave piece of the memory delta but per-instance method closures on every Subscriber are the dominant cause and they are a v2 redesign."

But then in §10.3 the same Architect set memory hard target ≤ 2 KB / soft target ≤ 5 KB **without re-deriving these from the M4 mechanism's actual capacity**. The numbers were copied from the *destination* (gap to alien parity ≈ 11 KB; targets set to "what would be alien-competitive") rather than from the *mechanism* (typed-Subscriber lastWave-slot removal frees ~1.6 KB; therefore landing target ≈ 8.6 KB). The Verifier (§3 headline) then measured exactly the mechanism's reach: **8.68 KB**, ~1.5 KB freed from H4's 10.20 KB.

**Round 6 must not make the same mistake.**

The institutional fix:

1. **Investigator** quantifies the mechanism's per-Sub byte capacity in isolation (Q2, Q3 above). Numbers must be defended at the slot level, not the closure-pair level.
2. **Architect** sets memory targets at `mechanism_capacity × 0.6 to 0.8` (i.e., expecting 60–80% capture, not 100%, to absorb V8 retention non-determinism). If `mechanism_capacity = 13 KB`, target band is 6–8 KB freed, landing 0.7–2.7 KB delta. **The spec MUST state this multiplier explicitly and justify it.**
3. **Verifier** explicitly compares measurement to mechanism prediction (§6.4 step 8 above). A miss > 2× is a **finding**, not just a fail.

This is a process correction, not a blame assignment. The Round 5 work was structurally sound; the projection chain was the failure mode. Phase 3's Investigator and Architect must own the mitigation.

The user authorised closure removal in v1 because **closure removal is the dominant memory mechanism**. If Phase 3 lands K1c at the predicted ~13 KB freed, deep-prop buildHeapDelta arrives at or near alien parity (−2.85 KB territory), and v1 ships a memory-competitive signals package. That is the prize. It is achievable, but only if the projection discipline holds.

---

## §10.5 Alien-signals reference — what the Investigator must read

**File:** `bench/signals/node_modules/alien-signals/esm/system.mjs`
**Pattern:** static-callback dispatch via `createReactiveSystem({ update, notify, unwatched })`.

Lines 11–16 (the entry point):

```js
export function createReactiveSystem({ update, notify, unwatched, }) {
    return {
        link,
        unlink,
        propagate,
        checkDirty,
        shallowPropagate,
    };
```

The framework user (alien-signals' `index.mjs`) passes in `update` and `notify` as **module-level functions** at system-creation time. The system's `propagate` (line 95+) dispatches by calling `notify(sub)` directly — no `sub.notify()` virtual call, no per-instance method.

Alien's Subscriber shape (`index.mjs:77–105`):

- signal: `{ currentValue, pendingValue, subs, subsTail, flags }` — 5 fields.
- computed: `{ value, subs, subsTail, deps, depsTail, flags, getter }` — 7 fields.
- effect: `{ fn, subs, subsTail, deps, depsTail, flags }` — 6 fields.

**No `notify`. No `recomputeIfNeeded`. No `update`.** Behaviour lives at the module level; instances are pure data.

**The H5 investigation §1.1 already cited this** — the closure-pair pattern is what aihu carries that alien does not. K1 (prototype methods) is the OOP-flavoured path to the same destination; K2 (module-level static functions) is the direct port of alien's pattern.

The Investigator should:

1. Read alien's full `system.mjs` and understand how `propagate`, `checkDirty`, `shallowPropagate` route through the static `notify(sub)` and `update(sub)` callbacks.
2. Compare the dispatch overhead per call site between alien's static call and aihu's per-instance closure call.
3. Determine whether K2 (module-level static, alien-port) ships smaller or larger than K1 (prototype methods) in the gz bundle. The static-function path may compress better because there are fewer object-literal contexts; the prototype-method path may compress better because methods inside `class { }` are shorter syntactically than module-level `function notify(sub) { }` declarations. **This is empirical and bench-dependent.**

---

## §10.6 Risk register

Carrying forward Round 5 risks that are still active, plus Round 6 NEW risks:

| ID | Risk | Severity | Mitigation | Owner |
|---|---|---|---|---|
| R-A | Round 5 projection failure repeats (Architect copies destination as target) | **HIGH** | §10 framing; explicit multiplier rule (target = mechanism_capacity × 0.6–0.8) | Architect |
| R-B | Bundle headroom consumed by K1c class declarations (signals) | MED | §5.3 surface trigger at +120 B; Builder per-commit size-limit check | Builder + Verifier |
| R-C | cellx rank break from polymorphic dispatch site | MED | §5.4 hold; Surface-to-User #4 trigger | Verifier |
| R-D | `recomputeIfNeeded === undefined` detection breaks under prototype inheritance (Sites C, D) | MED | §6.5.3 `kind` field or `HOST` flag mitigation | Investigator + Architect |
| R-E | `disposed` closure-local on dispose() inadvertently moved to instance field — double-dispose correctness break | LOW (specific) | §6.5.5 keep `disposed` closure-local | Architect (explicit spec note) |
| R-F | `creation-1to1000` further regression past 82 µs | LOW | §5.1 perf gates; per-Sub field count cap | Investigator + Verifier |
| R-G | Builder ↔ Verifier hits 5/5 without convergence | MED | §8 fall-back options surfaced to user | Director |
| R-H | NEW: K1c lazy-promotion (computed Linear→Merge) prototype-reassignment cost | MED | §4.1 K1c subvariant: born-with-lastWave avoids prototype reassignment entirely | Investigator |
| R-I | NEW: V8 monomorphic IC at the dispatch site fragments across multiple class shapes | LOW | Investigator Q5 quantifies | Investigator |
| R-J | NEW: WSL2 bench-host calibration drift (H4 baseline 3.30 vs spec-cited 3.41) | LOW | Verifier reconfirms baseline before perf comparison | Verifier |

---

## §11 Closing direction to Team Lead

Sequential routing:

1. **Now:** dispatch Investigator with the §6.1 brief. 1 round. Iron Law.
2. **After investigation lands:** Director (next round-note, possibly Round 6.5 if needed) reviews investigation against §3 substance question. If GO, Architect dispatched.
3. **After Architect spec:** Director reviews spec for the §10 projection-discipline check. If GO, Builder dispatched.
4. **Builder ↔ Verifier loop:** counter starts at 0/5; Mode 2 hard-stop at 5.
5. **Surface conditions:** §9 triggers — Director surfaces immediately, does not wait.

**Branch off `feat/v1-signals-6.2-phase2-h5 @ 62f737f`**. Branch name: Team Lead's call.

**Naming:** I have called this "Phase 3" of Plan 6.2. State-track-c.md round-history table: this is Round 6 of Track C. Future spec / investigation / verification reports should use `phase3` in their filenames (suggestions: `investigation-closure-removal.md`, `spec-6.2-phase3-closures.md`, `verification-report-6.2-phase3.md`). Final naming: Team Lead's call.

---

## §12 What the next director-note will assess

Round 7 (or Round 6.5 if intermediate) Director-note will assess:

1. **Investigator's report** against §6.1 brief. Specifically:
   - Are Q1–Q8 answered with quantitative grounding (slot-level, not narrative)?
   - Does Q2/Q3 quantify mechanism capacity in isolation, separate from "gap to alien"?
   - Is Q8's recommendation defensible given the (memory × compatibility) / bundle ratio?
2. **Whether to dispatch Architect.** Conditions for GO:
   - Investigator picks one mechanism (not "both look good").
   - Bundle estimate has a confidence interval, not a point estimate.
   - All 6 H5 invariants traced through the chosen mechanism.
   - `recomputeIfNeeded === undefined` detection (Sites C/D) has a named mitigation.
3. **Surface conditions if NO-GO:**
   - Investigator concludes K1, K2, K3, K4 all infeasible → user surface, fall-back to ship H5 as relaxed-soft-pass.
   - Investigator finds new closure-cost diagnosis (e.g. "the dominant cost is NOT closures, it's X") → re-investigation round.

Round 7 (after Architect spec) will assess:

- Spec format matches `spec-6.2-phase2-h5.md`.
- Memory targets justified by mechanism capacity × multiplier (per §10).
- Bundle estimate with confidence interval.
- Forbidden modifications list explicitly carries forward H5 §13.1–§13.7 plus new Phase 3 entries.

Round 8 (after first Builder commit) will assess:

- Diff scope discipline (no drive-by).
- Bundle delta within Architect's confidence interval.
- Test count delta non-negative.

Each Verifier round consumes 1/5 of the Builder ↔ Verifier budget.

---

## §13 Director sign-off

**Phase 3 GO.** Mode 2. Iteration budget reset to 0/5. Investigator dispatched first per §6.1.

**Branch off `feat/v1-signals-6.2-phase2-h5 @ 62f737f`** to preserve H5 + R6a + R7 wins (1.65 kB / 2.12 kB closing position; 327 tests; all H5 invariants).

**Public API hard veto** (§5.5) is the one constraint that overrides any other consideration. If a mechanism cannot work without changing `index.ts` exports, surface to user before continuing.

**The Round 5 lesson is the dominant process input for Round 6.** Numbers must be defended by mechanism, not by destination. The Architect spec MUST state the multiplier (mechanism_capacity × 0.6–0.8) explicitly.

**Hypothesis ranking:**
1. **K1c** (single Computed class, lastWave-from-birth, prototype methods) — top rank, ~13.4 KB freed, low compatibility risk, −10 to +30 B bundle.
2. K2 (module-level static dispatch, alien-port) — second rank, ~11.8 KB freed.
3. K3 (K1 + closure-shrink hybrid) — third rank, ~14 KB freed but creation-1to1000 risk.
4. K4 (closures-on-Link) — REJECT (semantic mismatch).

**Top risk:** R-A (projection failure repeats). Mitigation: §10 explicit framing.

**End of director-note.**
