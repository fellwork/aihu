# Spec — Plan 6.2 Phase 3: K1c+fn-promotion (Closure-to-Prototype Conversion)

**Author:** Architect (Track C, Round 6, Phase 3)
**Date:** 2026-05-01
**Status:** READY FOR BUILDER
**Plan:** 6.2 Phase 3
**Predecessor:** `.team/v1/spec-6.2-phase2-h5.md` (extends; STACKS on H5 — does **not** override §4 invariants; updates §13.3 and §13.5 narrowly per §13 below).
**Director-note:** `.team/v1/director-notes/track-c-round-006.md` (substance §3, hypothesis space §4.1 K1c, R-A multiplier §10, projection-failure mitigation §0).
**Investigation:** `.team/v1/investigation-closure-removal.md` (Q1 closure footprint; Q2 K1c+fn-promotion mechanism capacity; Q3 HOST flag verdict; Q4 V8 dispatch analysis; Q5 bundle delta; Q6 H5 invariant compatibility — ALL six invariants PRESERVED).
**Verification of predecessor:** `.team/v1/verification-report-6.2-phase2-h5.md` (H5 baseline: deep-prop p50 3.30 µs / buildHeapDelta 8.68 KB on WSL2; signals 1679 B / arbor 2133 B at `62f737f`).
**Branch:** `feat/v1-signals-6.2-phase3-closures` (off H5 head `62f737f`).
**Authorisation:** user-authorised v2 closure-removal pull-forward 2026-05-01 (Director-note §1.1); the public API hard-pin (§8) is the boundary.

**Target workload:** `deep-propagation-100` (residual 8.68 KB buildHeapDelta after H5; 102 Subs × ~85 B/Sub residual dominated by per-instance method closures).
**Memory target (REALISTIC, mechanism-grounded):** `deep-propagation-100` `buildHeapDelta` ≤ 4 KB **HARD pass** / ≤ 5 KB **SOFT pass**. NOT alien parity (−872 B). Mechanism capacity caps landing at ~3.3 KB realistic — see §10.3.
**Time target:** `deep-propagation-100` ≤ 3.20 µs HARD / 3.20–3.30 µs SOFT (carry H5's relaxed band; K1c+ is memory-driven, perf delta is incidental).
**Stretch:** ≤ 2 KB landing (alien-parity territory) — NOT in scope; requires v2 redesign (additional mechanisms beyond K1c+).

**Hypothesis selected:** **K1c+fn-promotion** — single `Computed` class with prototype-method `notify` + `recomputeIfNeeded`; `recompute()` body inlined into the `recomputeIfNeeded` prototype method; `fn`, `cached`, `hasCached`, `equals`, `hasEffectSub` promoted to instance fields. Single `Effect` class with prototype-method `notify`. Signal hosts stay literal. HOST detection via new `HOST = 0x080` flag bit (replaces `recomputeIfNeeded === undefined` idiom).

**K1, K2, K3, K4 status:** REJECTED in favour of K1c+. Investigator §Q2 ranked K1c+fn-promotion #1 by (memory_savings × compatibility) / bundle_cost. K1c-pure was second-best; the Architect's call (per §3.4 below) is K1c+ because the bundle headroom comfortably permits the additional ~15–30 B for field promotion AND the mechanism captures ~76 B/Sub vs K1c-pure's ~33 B/Sub.

**Critical framing (per orchestration brief and Director §0):** the H5 round failed because the Architect copied a destination memory target (≤ 2 KB) without checking the mechanism's actual capacity. **This spec does not repeat that mistake.** Per Investigator §Q2:

> Per-Sub savings (post-settle) under K1c+fn-promotion: ~76 B/Sub × 100 Computeds = ~7.6 KB freed (raw mechanism ceiling).
> Realistic capacity with R-A 0.7 multiplier (per Director §10 and §0 anti-projection-failure mitigation): ~7.6 × 0.7 = ~5.3 KB freed.
> Realistic memory landing: 8.68 KB − 5.3 KB ≈ **~3.4 KB** (or up to ~3.4 KB allowing for measurement noise).

The acceptance target (§10.3) is set FROM the realistic capacity, not from the alien-parity destination. Targets below ~3.3 KB are not achievable from K1c+ alone; they require additional mechanisms (e.g. v2 redesign or a follow-on Phase 4 lever).

---

## §1 Problem statement

### §1.1 What H5 closed and what it left behind

Per `verification-report-6.2-phase2-h5.md` §3 and Investigator (Phase 3) §Summary:

| State | scribe deep-prop buildHeapDelta | Per-Sub (÷102) | Verdict |
|---|---:|---:|---|
| H4 baseline (architect-cited) | 10.24 KB | ~100 B/Sub | (baseline) |
| **H5 closing (62f737f)** | **8.68 KB** | **~85 B/Sub** | H5 freed 1.56 KB (the lastWave Slot piece) |
| Alien (reference) | −872 B (dispose-positive) | n/a | reference target |

H5 closed contributor (2) — the `lastWave` field-slot semantics — saving ~1.6 KB. **Contributor (1) — per-instance method closures (`notify`, `recomputeIfNeeded`, `recompute`) on every Computed plus their captured `Context` objects — remained untouched at H5**, accounting for ~9 KB of post-settle residual.

Per Investigator §Q1:

- Each Computed at H5 carries 2 × JSFunction (~24 B each) + Context (~16 B header + 7 captured-var slots × 8 B = 72 B) + a third `recompute` JSFunction (~24 B retained transitively via Context).
- Gross per-Computed closure footprint: **~144 B**. Post-settle survival (after 3× gc): **~68 B/Sub** of closure-attributable residual.
- Of the ~85 B/Sub measured residual, **~68 B is closure-attributable** (the K1c+ mechanism target); ~17 B is in-object slot survivors and hidden-class metadata.

### §1.2 Why K1c+fn-promotion (not K1, K2, K3, K4)

Per Investigator §Q2, §Q3, §Q5, §Q6 + Director §4 hypothesis ranking:

- **K1c-pure** (only `notify` and `recomputeIfNeeded` move to prototype; `recompute` stays a closure): saves ~33 B/Sub post-settle. Realistic landing ~6.4 KB. **Falls short of the 4 KB hard target.**
- **K1c+fn-promotion** (additionally inline `recompute()` body into the prototype `recomputeIfNeeded` method; promote the 5 captured factory locals to instance fields): saves ~76 B/Sub post-settle. **Realistic landing ~3.4 KB. Achieves the soft target with margin.**
- **K2** (module-level static callbacks à la alien): equivalent capacity to K1c+ (~11.8 KB ceiling) but adds dispatcher complexity and bundle cost; Investigator ranking score 235 vs K1c+'s ~380.
- **K3** (K1 + K2 hybrid): theoretical max but exceeds bundle headroom on arbor; Director §4.3 already deferred to "Phase 4 follow-up if K1c+ headroom permits."
- **K4** (closures-on-Link): semantic mismatch (Investigator §4.4); REJECTED.

Per Investigator §Recommendation: **target K1c+fn-promotion**. This spec mechanises K1c+ only.

### §1.3 The R-A multiplier (anti-projection-failure)

Per Director §0 (§"Director caveat") and §10 (R-A mitigation):

> The Architect must apply mechanism_capacity × 0.6–0.8 multiplier when setting acceptance targets. Do not copy destination numbers from upstream documents without checking the multiplier.

Per Investigator §Q2 §"Total deep-prop projection" and §"Director §4.1's '13.4 KB freed' recalibration":

- Theoretical raw closure ceiling: ~150 B/Sub × 100 = ~15 KB.
- Post-settle slice (gross-to-post-settle ~0.45 ratio): ~76 B/Sub × 100 = ~7.6 KB.
- R-A multiplier (×0.7): ~7.6 × 0.7 = **~5.3 KB realistic freed.**
- Predicted memory landing: 8.68 − 5.3 = **~3.4 KB realistic.** (Pessimistic floor ~3 KB; optimistic best ~2.7 KB.)

The §10.3 hard target (≤ 4 KB) is set BELOW the realistic landing for slack. The soft target (≤ 5 KB) is the realistic landing. The fail line (> 5 KB) is "we lost ground vs. the mechanism's reach." **This is the playbook fix for the Round 5 projection-failure.**

---

## §2 Hypothesis (K1c+fn-promotion)

### §2.1 Statement

> Replace the per-instance `notify` / `recomputeIfNeeded` / `recompute` closures on every Computed (and `notify` on every Effect) with **prototype methods** on a single `Computed` class and a single `Effect` class. Promote the closure-captured factory locals (`fn`, `cached`, `hasCached`, `equals`, `hasEffectSub` for Computed; `fn` for Effect) to **instance fields**. Inline the `recompute()` body directly into `Computed.prototype.recomputeIfNeeded`, eliminating the third closure entirely. Keep signal hosts as literal objects (no methods to dedup; no class needed). Replace the `recomputeIfNeeded === undefined` idiom at Sites C/D with a new `HOST = 0x080` flag-bit detection. Preserve all six H5 invariants (DI-1, CS-1, SF-1, RC-1, MERGE-1, MERGE-2) bit-arithmetically.

### §2.2 Expected magnitude (realistic, R-A applied)

Per Investigator §Q2 + §1.3 above:

- **Memory:** ~76 B per Computed × 100 Computeds = ~7.6 KB raw mechanism capacity. Realistic post-settle landing (×0.7): ~5.3 KB freed. Forecast `buildHeapDelta` post-K1c+: **~3.4 KB** (pessimistic 3.0 KB / optimistic 2.7 KB).
- **Time:** Per Investigator §Q4, prototype-method dispatch is monomorphic (single Computed class shape) and V8's IC for prototype methods matches closure-call cost within ±2 ns per call. Per-call delta on the chase loop's notify / recomputeIfNeeded sites: 0 ± 2 ns. Per-wave delta on deep-prop-100 (~3–10 dispatch sites per wave): −50 ns to +20 ns. **Forecast deep-prop-100 p50 post-K1c+: 3.20–3.30 µs (within H5's relaxed band, possibly marginally improved).**
- **Cellx:** Investigator §Q4 verdict — IC fingerprint unchanged on the closure-removal path. Forecast: **+0–10 ns** (well inside the 540 ns floor; rank held).
- **Other workloads:** unchanged path; no measurable delta. `creation-1to1000` may regress slightly due to 5 extra field initialisations per Computed constructor (+5–15 ns/construct × 1000 ≈ +5–15 µs across the bench, i.e. +0.1–0.3 µs per bench iteration — well within 82 µs soft floor; Investigator §Q2 §"creation-1to1000 regression risk").

### §2.3 Why K1c+fn-promotion (not K1c-pure)

Per Investigator §Q2 §"K1c+fn-promotion (recompute eliminated)" + §Recommendation:

- K1c-pure realistic landing: ~6.4 KB. Misses 4 KB hard target by ~2.4 KB.
- K1c+ realistic landing: ~3.4 KB. Hits soft target with ~1.6 KB margin.
- Bundle cost delta K1c+ vs K1c-pure: +15 to +30 B gz signals (per §10.1 below). Within signals 171 B headroom comfortably. Within arbor 67 B headroom IF arbor propagation behaves as estimated.
- Compatibility risk: identical (Investigator §Q6 walk: all six H5 invariants PRESERVED under both K1c-pure and K1c+).

The Architect's call: **K1c+fn-promotion** because the bundle headroom permits it AND the mechanism captures more than 2× the post-settle savings of K1c-pure for a ~15–30 B gz cost.

---

## §3 Mechanism — Prototype-method conversion

### §3.1 Class declarations

Per Investigator §Q2 §"K1c-pure total" + §"K1c+fn-promotion":

**Single `Computed<T>` class.** All Computed Subscribers are instances. Single hidden-class chain shared across all Computeds (no Linear/Merge subclass split — H5's two structural shapes collapse back into one shape carrying `lastWave: 0` from birth, accepting the +8 B in-object slot per previously-Linear Computed; this is the K1c subvariant trade per Director §4.1).

The class carries:

- **Instance fields (slot owners):**
  - `flags: number` (initialised `STALE` at construction; bit-field for run-state, dedup classifier, role).
  - `subsHead: Link | null`, `subsTail: Link | null` (forward edges).
  - `depsHead: Link | null`, `depsTail: Link | null` (back edges).
  - `lastWave: number` (initialised `0` SMI; carried by every Computed for shape-stability — H5's MergeSubscriber-only field is now universal on Computed; ~+8 B/Computed cost vs H5).
  - `fn: () => T` (the user's getter, was a closure capture; **promoted to instance field** under K1c+fn-promotion).
  - `cached: T | undefined` (the cached computed value, was a closure capture; **promoted**).
  - `hasCached: boolean` (cached-vs-uninitialised flag, was a closure capture; **promoted**).
  - `equals: ((a: T, b: T) => boolean) | false` (equality comparator, was a closure capture; **promoted**).
  - `hasEffectSub: boolean` (whether this computed's downstream sub set includes any effect; was a closure capture; **promoted**).
- **Prototype methods (shared across all Computed instances; no per-instance closure footprint):**
  - `notify(): void` — body matches the previous `notify` closure body verbatim; reads `this.flags`; throws `SignalCircularError` if `this.flags & RUNNING`; no-op if `this.flags & DISPOSED`. (Computeds otherwise have no notify body — this method exists for the polymorphic shape match with Effect.)
  - `recomputeIfNeeded(): void` — body matches the previous `recomputeIfNeeded` closure body verbatim, with the inlined `recompute()` body where the closure was previously invoked. Reads `this.flags`, `this.lastWave`, `this.fn`, `this.cached`, `this.hasCached`, `this.equals`, `this.hasEffectSub`; bit-mutates `this.flags` per RC-1's `try/finally` clear of `(RUNNING | STALE | MARKED | PENDING)`; sets `this.cached`, `this.hasCached` after a successful recompute.

**Single `Effect` class.** All Effect Subscribers are instances. Single hidden-class chain.

The class carries:

- **Instance fields:**
  - `flags: number` (initialised `EFFECT | MERGE` at construction).
  - `subsHead/subsTail/depsHead/depsTail: Link | null`.
  - `lastWave: number` (initialised `0`; effects are always Merge per H5 MERGE-2).
  - `fn: () => void` (the user's effect callback; **promoted to instance field**).
- **Prototype method:**
  - `notify(): void` — body matches the previous Effect notify closure body verbatim; throws on RUNNING; no-op on DISPOSED; otherwise calls `runEffect(this)` (the existing top-level helper at `effect.ts:30–39` — already module-static, no closure conversion needed).

**Signal hosts stay as literal objects.** Per Investigator §Q3 §"K1c with prototype methods" caveat and §Recommendation:

> If signal-hosts stay as plain literals (no prototype beyond `Object.prototype`), then `recomputeIfNeeded === undefined` remains correct under K1c. But that's a fragile dependency. The cleaner approach is to detect host-vs-non-host via an explicit mechanism.

The Architect adopts the Investigator's recommendation: signal hosts remain literal objects (no class wrapper, no prototype method) AND the `recomputeIfNeeded === undefined` idiom at Sites C/D is REPLACED by an explicit `HOST = 0x080` flag bit (§3.3 below). This decouples role detection from prototype-chain coincidence and is robust under future inheritance.

The signal-host literal carries:

- `flags: MERGE | HOST` (was `MERGE` at H5; the new `HOST` bit explicitly classifies this Subscriber as a signal source).
- `subsHead/subsTail/depsHead/depsTail/lastWave` per H5.
- **NO `notify` literal method** (the H5 `notify(): void {}` empty closure is REMOVED — Investigator §Q5 §"Empty `notify` on Host removed" saves ~5 B gz). Signal hosts are never the target of a `sub.notify()` call site (`drainEffectQueue` only iterates effects; the chase's `cur.flags & EFFECT` branch ensures only effects reach notify). The empty closure was dead weight.

### §3.2 Per-Sub closure removal — site-by-site

Per Investigator §Q1 + §Q2 + Source-read manifest (computed.ts:33–87, effect.ts:43–73):

| Site | Closure at H5 | Removed under K1c+ | Replacement |
|---|---|---|---|
| **CL-1** | `computed.ts:61–64` `notify()` per-instance closure | YES | `Computed.prototype.notify` shared method |
| **CL-2** | `computed.ts:65–86` `recomputeIfNeeded()` per-instance closure | YES | `Computed.prototype.recomputeIfNeeded` shared method (with inlined recompute body — see CL-3) |
| **CL-3** | `computed.ts:42–50` `recompute` factory-local closure | YES (under fn-promotion) | Body inlined into the `recomputeIfNeeded` prototype method; reads `this.fn`; clears flags in `try/finally` per RC-1 |
| **CL-4** | `effect.ts:62–66` `notify()` per-instance closure on fresh effects | YES | `Effect.prototype.notify` shared method |
| **CL-5** | `effect.ts:43–52` pool-reuse path (the `notify`/`recomputeIfNeeded` references on the recycled literal) | YES | Pool reuse becomes "reset instance fields on the recycled `Effect` instance" — see §3.5 below |
| **CL-6** | `signal.ts:436` host literal `notify(): void {}` empty closure | YES | REMOVED outright; no replacement (signal hosts are never notify-called) |
| **CL-7** | `effect()`'s returned `dispose` function (`effect.ts:74–95`, captures `disposed` boolean) | **NO — STAYS A CLOSURE** | Per Investigator §R-E + §6.5.5: `disposed` MUST stay closure-local because dispose is part of the public API contract; pool reuse correctness depends on `disposed === false` not surviving a recycle. **Forbidden modification per §13 below.** |

The closure-Context backing the captured locals (`computed.ts:33–55` factory scope) collapses entirely under K1c+: every captured local has either been promoted to an instance field (CL-3 fn-promotion) or moved into the prototype-method body (where `node` becomes `this`). With `recompute`'s closure removed, no surviving closure references the Context, and V8's gc reclaims it. This is the source of the additional ~50 B/Sub post-settle saving over K1c-pure (Investigator §Q2 §"K1c+fn-promotion total: ~33 + 49 − 6 = ~76 B/Sub").

### §3.3 HOST flag — replacing `recomputeIfNeeded === undefined`

Per Investigator §Q3 §"Alternative 2 — `HOST` flag bit" + §"Recommendation: HOST flag bit (Alt-2)":

**Bit allocation.** The H5 flag space is:

- `RUNNING = 0x001`
- `DISPOSED = 0x002`
- `QUEUED = 0x004`
- `STALE = 0x008`
- `EFFECT = 0x010`
- `MARKED = 0x020`
- `MERGE = 0x040` (H5 addition)
- **`HOST = 0x080` (NEW under K1c+)** — the gap between `MERGE = 0x040` and `PENDING = 0x100`. Currently free; no bit-space refactor needed.
- `PENDING = 0x100`

**Setter rule (set-once classifier).** `HOST` is set on signal-source Subscribers AT CONSTRUCTION and never cleared. Like `MERGE`, it is a one-way classifier bit. `clearVisited`, `shallowClear`, and `recompute()`'s `finally` block do NOT touch it (RC-1 mask is unchanged: `(RUNNING | STALE | MARKED | PENDING)`).

**Construction sites:**

- `signal.ts` host literal: `flags: MERGE | HOST` (H5 had `flags: MERGE`).
- `computed.ts` Computed class constructor: `this.flags = STALE` (NO HOST bit).
- `effect.ts` Effect class constructor: `this.flags = EFFECT | MERGE` (NO HOST bit).

**Detection sites (replacing the H5 `recomputeIfNeeded === undefined` idiom):**

- **Site C** — `signal.ts:355–359` `drainBatch` lastWave patch (post-H5 line numbers). The H5 condition `if (l.dep.recomputeIfNeeded === undefined && (l.dep.flags & MERGE) && (l.dep as MergeSubscriber).lastWave === wave) return true` becomes `if ((l.dep.flags & HOST) && l.dep.lastWave === wave) return true`. The MERGE check is subsumed by HOST (signal hosts always carry HOST AND MERGE; a non-MERGE-non-HOST node never enters this branch because the `recomputeIfNeeded === undefined` H5 idiom was equivalent to "this is a signal host"). The `(l.dep as MergeSubscriber)` cast is REMOVED (per Investigator §Q5 §"Cast removals at Sites A, B, F" — ~−15 B gz across three sites).
- **Site D** — `signal.ts:373–381` `checkDirty` deps walk (post-H5 line numbers). Same idiom replacement: `if ((dep.flags & HOST) && (dep.flags & MERGE)) { ... if (m.lastWave !== wave) m.lastWave = wave; ... }` — but with the cast removed since every Subscriber now carries `lastWave` (Computeds via the K1c shape collapse; Effects already; Hosts already). Simplifies to `if ((dep.flags & HOST)) { if (dep.lastWave !== wave) dep.lastWave = wave; ... }`.

**Net detection-site delta (per Investigator §Q5):** `−6 B gz × 2 sites = −12 B gz` (the `flags & HOST` check is 6 chars shorter than `recomputeIfNeeded === undefined`).

### §3.4 fn-promotion — inlining the recompute body

Per Investigator §Q2 §"K1c+fn-promotion (recompute eliminated)":

The H5 `recompute` closure (`computed.ts:42–50`) contains the RC-1 try/finally frame:

```
[H5 sketch — illustrative]
const recompute = (): T => {
  node.flags |= RUNNING
  const prev = setCurrentObserver(node)
  try { return fn() }
  finally {
    setCurrentObserver(prev)
    node.flags &= ~(RUNNING | STALE | MARKED | PENDING)
  }
}
```

Under K1c+, this body moves verbatim INTO `Computed.prototype.recomputeIfNeeded`. Specifically, the H5 `recomputeIfNeeded` closure body (lines 65–86) currently INVOKES `recompute()` at one site; under K1c+, that invocation is replaced by inline execution of the recompute body (read `this.fn`, set/clear `this.flags`, write `this.cached`, write `this.hasCached`).

**Inline scope:** the inlined body runs ONLY where `recompute()` was previously invoked — it does NOT replicate at every entry to the method. The `recomputeIfNeeded` method's existing structure (the early-out checks for STALE/PENDING and the equals-cascade short-circuit) is preserved unchanged; only the `recompute()` call is replaced by inline body.

**Why this saves ~50 B/Sub post-settle (Investigator §Q2):**

- `recompute` JSFunction object: ~−9 B/Sub post-settle.
- Shared Context (~72 B gross at H5 retained transitively via `recompute`'s closure): ~−40 B/Sub post-settle (with `recompute` gone, no surviving closure references the Context; gc reclaims it).
- Cost: 5 new instance fields (`fn`, `cached`, `hasCached`, `equals`, `hasEffectSub`) × 8 B in-object × ~0.15 post-settle survival ratio = ~+6 B/Sub post-settle.
- Net: −9 − 40 + 6 = ~−43 B/Sub additional vs K1c-pure. Plus K1c-pure's ~33 B/Sub savings. **Total K1c+: ~76 B/Sub post-settle saved.**

**RC-1 preservation:** Investigator §Q6 §RC-1 walked this:

> Under K1c+fn-promotion (recompute moves into a method body), the same logic moves verbatim into `Computed.prototype.recomputeIfNeeded`. The `try { ... } finally { sub.flags &= ~(...) }` block is equally callable as a method as as a closure — V8 doesn't care about the lexical wrapper. The `setCurrentObserver(node)` call still works because `node` becomes `this` in a method context.

The flags-clear mask in `finally` is **unchanged**: `(RUNNING | STALE | MARKED | PENDING)`. NEITHER `MERGE` NOR `HOST` is in the mask — both are one-way classifier bits.

### §3.5 Effect pool reuse under classes

The H5 effect pool (`effect.ts:21–22`, `MAX_POOL = 8`) recycles Subscribers to avoid allocation churn. Under K1c+:

- Pool stores `Effect` class instances (not literal objects).
- On reuse (the path at H5 `effect.ts:43–52`): reset `node.flags = EFFECT | MERGE`, `node.lastWave = 0`, `node.fn = newFn`, clear `node.subsHead/subsTail/depsHead/depsTail`. **No `notify` reassignment** — `notify` is on the prototype, not an own property, and never gets stale.
- The `disposed` flag in the dispose closure (CL-7) MUST stay closure-local — the dispose function is created fresh on every `effect()` call and pinned to that specific call's closure. A recycled `Effect` instance gets a NEW dispose closure on its next `effect()` call. This is unchanged from H5.

### §3.6 What K1c+ does NOT change

Per Investigator §Q6 §"All PRESERVED":

- **`runEffect`** at `effect.ts:30–39` — already a top-level (module-static) function; no closure conversion needed. Unchanged.
- **`linkAdd`** at `signal.ts:111–137` — top-level function; bit-set on `sub.flags |= MERGE` for MERGE-1 lazy promotion works on a class instance identically to a literal. Unchanged.
- **Cascade-suppression settle** at `signal.ts:285–287` — UNCHANGED. The settle walks `effect.depsHead` calling `dep.recomputeIfNeeded?.()`. Under K1c+, `recomputeIfNeeded` resolves through Computed.prototype for Computed deps; resolves to `undefined` for signal-host deps (which have no prototype method). Optional chain `?.` semantics identical: V8 implements both as `Tagged != undefined` test.
- **`recompute()` finally-block flag clear** — clears `(RUNNING | STALE | MARKED | PENDING)`, never `MERGE` or `HOST`.
- **`shallowClear`** (`signal.ts:230–236`), **`clearVisited`** (`signal.ts:325–330`) — UNCHANGED. Do not touch `MERGE` or `HOST`.
- **The H4 chase loop's outer/inner split** — UNCHANGED. K1c+ does not modify markOne / fastChase.
- **The H5 type-guard structure** — the `(sub.flags & MERGE)` dedup gate at sites A/B/chase-inner stays bit-identical to H5. K1c+ does NOT remove the MERGE dedup.
- **Public API surface.** `index.ts` not modified. `class Computed` and `class Effect` are `/** @internal */` to their respective source files; not re-exported. (See §8 for the hard-pin.)

---

## §4 Named invariants (must hold post-implementation)

These are the invariants the Builder must preserve and the Verifier must check. The six H5 invariants are **inherited unchanged**; K1c+ adds two new invariants for the prototype-method conversion + HOST flag.

### §4.1 DI-1 — Diamond Invariant 1 (inherited from spec-6.2-phase2-h5.md §4.1)

> **DI-1.** For any Subscriber N reached during a wave W, the work performed by `markOne` (or the inner fast-chase) on N is a no-op if `N.lastWave === W` AND `N.flags & MERGE`. The first arrival sets `N.lastWave = W` and proceeds; subsequent arrivals at N within W are dropped.

**Refinement under K1c+:** unchanged. The `(sub.flags & MERGE)` dedup gate at sites A/B/chase-inner is bit-identical to H5. **K1c+ does NOT remove the MERGE gate.** The collapse of H5's two structural shapes back into one Computed shape (with `lastWave` always present) means the gate is now dispatching on a flag bit only (no `lastWave` slot absence on Linear computeds), but the semantic dedup behaviour is identical.

**Verdict (Investigator §Q6 §DI-1):** PRESERVED. Bit arithmetic on `flags` is unchanged.

### §4.2 CS-1 — Cascade-Suppression Invariant 1 (inherited)

> **CS-1.** The mark phase MUST set PENDING on every visited Subscriber, including interior computeds AND the terminal effect. The dep-graph topology (`subsHead`, `subsTail`, `depsHead`, `depsTail`) is not mutated by mark.

**Refinement under K1c+:** unchanged. `sub.flags |= MARKED | PENDING` works on a class instance identically to a literal. Per Investigator §Q6 §CS-1: PRESERVED.

### §4.3 SF-1 — STALE-Supersedes-PENDING (inherited)

> **SF-1.** When the inline chase exits at a fan-out boundary, the node carries `MARKED | PENDING` from the chase's stamp step. The fan-out exit then sets `cur.flags |= STALE`. Both bits coexist.

**Verdict (Investigator §Q6 §SF-1):** PRESERVED.

### §4.4 RC-1 — Reentrancy of `recomputeIfNeeded` (inherited; CRITICAL UNDER K1c+)

> **RC-1.** `recompute()`'s finally-block clears `(RUNNING | STALE | MARKED | PENDING)` on every recompute completion. K1c+ does NOT add `MERGE` or `HOST` to that mask.

**Refinement under K1c+:** the `recompute()` closure body is INLINED into `Computed.prototype.recomputeIfNeeded` per §3.4. The `try { ... } finally { this.flags &= ~(RUNNING | STALE | MARKED | PENDING) }` block moves verbatim. The `setCurrentObserver(this)` call at the start binds `this` instead of the closure-captured `node`. **No semantic change.** Per Investigator §Q6 §RC-1: PRESERVED.

**Builder MUST NOT:** modify the flags-clear mask. In particular, MERGE and HOST are NOT to be cleared in `finally`. Both are one-way classifier bits per §4.5, §4.6, §4.7, §4.8.

**The SignalCircularError throw** at the start of `Computed.prototype.notify` and `Effect.prototype.notify` (the `if (this.flags & RUNNING) throw new SignalCircularError()` early-out) is the H5 closure-body-throw moved to a method-body-throw. Same flag-test logic; no semantic change.

### §4.5 MERGE-1 — Merge-Bit Coverage (inherited from H5 §4.5)

> **MERGE-1.** For every Subscriber S reachable from a signal host via a path of length ≥ 2 deps converging at S, `S.flags & MERGE !== 0` MUST hold from the moment the second dep edge is attached.

**Refinement under K1c+:** unchanged. `linkAdd` (top-level function in `signal.ts`) flips the MERGE bit on a class instance identically to a literal. Per Investigator §Q6 §MERGE-1: PRESERVED.

### §4.6 MERGE-2 — Merge-Bit Construction Eagerness (inherited from H5 §4.6)

> **MERGE-2.** Signal hosts and effect Subscribers are constructed with `flags & MERGE !== 0`. Computeds are NOT constructed with MERGE; they are upgraded by `linkAdd` per MERGE-1.

**Refinement under K1c+:** signal-host literal carries `flags: MERGE | HOST` (was `flags: MERGE` at H5). Effect class constructor sets `this.flags = EFFECT | MERGE`. Computed class constructor sets `this.flags = STALE` (NO MERGE). Per Investigator §Q6 §MERGE-2: PRESERVED.

**Builder MUST NOT:** set MERGE or HOST on Computeds at construction. If MERGE is pre-set, the lazy promotion savings vanish and DI-1 over-deduplication may silently mask correctness violations. If HOST is pre-set, role detection at Sites C/D misclassifies Computeds as signal sources (correctness break).

### §4.7 K-1 — HOST-Bit Detection (NEW under K1c+)

> **K-1.** Signal-source Subscribers are identified at runtime by `(sub.flags & HOST) !== 0`. The H5 idiom `recomputeIfNeeded === undefined` is REPLACED at Sites C and D. No other code path may use `recomputeIfNeeded === undefined` to detect signal hosts post-K1c+.

**Source:** Investigator §Q3 §"Recommendation: HOST flag bit (Alt-2)" + §Q3 §"One algorithmic outline".

**Why it holds:** §3.3 setter rule — signal hosts get `HOST` at literal construction; Computeds and Effects do NOT. The bit is set-once and never cleared (not in RC-1 mask, not in `clearVisited`, not in `shallowClear`).

**Why it is necessary:** under K1c+, Computed instances have `recomputeIfNeeded` on the prototype — `instance.recomputeIfNeeded` resolves to a non-undefined JSFunction. The H5 idiom would misclassify all Computeds as "not signal hosts" (still correct on Computeds) BUT would also misclassify Effect instances (which DON'T carry `recomputeIfNeeded` on their prototype) as "signal hosts" if Effects ever appeared at Sites C/D. Per Investigator §Q3 §"recomputeIfNeeded === undefined under K1c": "effects don't carry `recomputeIfNeeded` either... but effects are never on the dep-side of a Link." This is subtle and brittle. The HOST flag makes detection intentional and robust.

**Builder MUST:**
- Set `HOST` in the signal-host factory literal (`signal.ts:430` per H5 line numbers): `flags: MERGE | HOST`.
- Replace BOTH detection sites (Site C at `signal.ts:355–359`, Site D at `signal.ts:373–381` per H5 line numbers) with `(dep.flags & HOST)`.
- NOT use `(sub.flags & HOST)` anywhere ELSE — it is purely a Site-C/D classifier. Other role detections continue to use `(sub.flags & EFFECT)`.

### §4.8 K-2 — Prototype-Method Sharing (NEW under K1c+)

> **K-2.** All `Computed` instances share `Computed.prototype.notify` and `Computed.prototype.recomputeIfNeeded`. All `Effect` instances share `Effect.prototype.notify`. No per-instance `notify` or `recomputeIfNeeded` own-property exists on any Subscriber instance post-K1c+.

**Source:** Investigator §Q2 + §Q4 §"Hidden-class fragmentation".

**Why it holds:** §3.1 class declarations. Methods are declared in the `class Computed { notify() {...} recomputeIfNeeded() {...} }` syntax, which V8 represents as prototype properties. The constructor body assigns instance fields ONLY (no `this.notify = function() {...}`). Pool reuse (§3.5) does NOT reassign `notify` either.

**Why it is necessary:** if an instance ever gets its own `notify` or `recomputeIfNeeded` (e.g. via `node.notify = (...) => {...}` accidentally), the method becomes a per-instance closure again, the K1c+ savings vanish, AND the hidden-class chain fragments (one shape per instance with own-property override, breaking the Computed-class IC monomorphism per Investigator §Q4).

**Builder MUST:**
- Declare `notify` and `recomputeIfNeeded` ONLY in the class body, never assigned to `this` inside the constructor.
- The §9.3 prototype-dispatch test (below) verifies `a.notify === b.notify` for two Computed instances, catching this regression.

---

## §5 Changes to packages/signals/src

### §5.1 `signal.ts`

Six sites change. All other content is bit-identical to H5 (`62f737f`).

| Lines (post-H5) | Content | Change under K1c+ |
|---|---|---|
| 22–43 | `Subscriber` typed shapes (`LinearSubscriber` / `MergeSubscriber` discriminated union) | **CHANGED.** The H5 typed split COLLAPSES back into a single `Subscriber` interface (or a class-friendly equivalent). The class-instance shape carries `lastWave` from birth on every Computed; the discriminated union is no longer load-bearing because both Linear and Merge Computed shapes are now identical. The interface declaration is replaced by class-instance types: `Subscriber = Computed<unknown> \| Effect \| SignalHost`. **This narrowly extends H5's §13.4 override.** |
| 46–59 | Flag constants | **CHANGED.** Add one constant: `const HOST = 0x080` (the existing hole between `MERGE = 0x040` and `PENDING = 0x100`). All other constants unchanged. |
| 111–137 | `linkAdd` | **NO CHANGE.** The MERGE-1 lazy promotion line `if (sub.depsHead !== null) sub.flags |= MERGE` remains identical. Class-instance vs literal makes no semantic difference. |
| 168 | `markStack` declaration | **NO CHANGE.** |
| 170–217 | `markOne` outer phase + inner chase | **NO CHANGE.** The H5 `(sub.flags & MERGE)` dedup gates remain. Sites A/B/chase-inner are bit-identical to H5. |
| 230–236 | `shallowClear` | **NO CHANGE.** Does not touch `lastWave`, `MERGE`, or `HOST`. |
| 244–264 | `checkDirty` (incl. site D) | **CHANGED at site D.** Per §3.3: replace `dep.recomputeIfNeeded === undefined && (dep.flags & MERGE)` with `(dep.flags & HOST)`. Remove the `(dep as MergeSubscriber)` cast (every Subscriber now carries `lastWave`). |
| 272–298 | `drainEffectQueue` incl. cascade-suppression settle at `:285–287` | **NO CHANGE.** §13.2 protected step. The optional-chain `dep.recomputeIfNeeded?.()` at the settle resolves through Computed.prototype for Computeds; resolves to `undefined` for signal hosts (which have no prototype method). Per §3.6. |
| 316–321 | `settleAndDrain` | **NO CHANGE.** |
| 325–330 | `clearVisited` | **NO CHANGE.** Does not touch `MERGE` or `HOST`. |
| 338–372 | `drainBatch` incl. lastWave patch (site C, ~`:355–359`) | **CHANGED at site C.** Per §3.3: replace `l.dep.recomputeIfNeeded === undefined && (l.dep.flags & MERGE)` with `(l.dep.flags & HOST)`. Remove the `(l.dep as MergeSubscriber)` cast. The semantic behaviour is preserved — signal hosts always carry HOST AND MERGE. **NOTE: this narrowly extends H5's §13.3 update.** |
| 413–466 | `signal()` factory + `write()` | **CHANGED at host literal.** Set `flags: MERGE | HOST` (was `flags: MERGE` at H5). The empty `notify(): void {}` literal method (CL-6) is REMOVED. `lastWave: 0`, `subsHead/subsTail/depsHead/depsTail` initialisation unchanged. The `wave++` and `host.lastWave = wave` lines in `write()` (around `:457`) are preserved unchanged. |

The Builder's diff in `signal.ts` should touch ONLY: the Subscriber type declarations, the flag-constants block (one new line), `checkDirty` site D, `drainBatch` site C, and the signal-host factory literal. Any other modified line is an unauthorised drive-by per Director-note §"Researcher 5: Verifier — Bidirectional check".

### §5.2 `computed.ts`

The factory body undergoes substantial restructuring. The factory `computed(fn, options?)` continues to return a `Read<T>` function with byte-identical signature (no public API change per §8). The factory body changes are:

- **REMOVED:** the per-instance `node: LinearSubscriber = { ..., notify() {...}, recomputeIfNeeded() {...} }` literal (lines ~55–87 at H5).
- **REMOVED:** the `recompute` factory-local closure (lines ~42–50 at H5).
- **REMOVED:** the factory-local `cached`, `hasCached`, `eq` (intermediate), `equals`, `hasEffectSub` bindings.
- **ADDED:** a `class Computed<T>` declaration (at module scope, NOT inside the factory body). The class declaration is a single module-level construct — V8 emits the prototype's hidden class once and shares it across all instances.
- **ADDED:** the factory body now executes `const node = new Computed<T>(fn, equals)` (the constructor sets all instance fields).
- **PRESERVED:** the `read = (): T => { ... }` closure at H5 line ~89 (this is the Read<T> public-API return value; it's a distinct closure that captures `node` and is part of the public contract; per Investigator §R-E and §6.5.5 the Read closure stays a closure).

The class declaration and prototype methods replicate the H5 behaviour line-for-line (§3.1, §3.4). RC-1 and SignalCircularError logic (§4.4) move from closure body into method body unchanged.

### §5.3 `effect.ts`

Two structural changes plus one literal change.

| Lines (post-H5) | Content | Change under K1c+ |
|---|---|---|
| 21–22 | `MAX_POOL = 8`, pool array | **NO CHANGE** (pool stores Effect class instances; same MAX_POOL). |
| 28–38 | `runEffect` top-level helper | **NO CHANGE.** Already module-static; not a closure. |
| 41–73 | `effect()` factory body (fresh construction + literal) | **CHANGED.** The literal `node: Subscriber = { ..., notify() {...} }` is REMOVED. Replaced with `const node = pool.length > 0 ? pool.pop()! : new Effect(fn)`. The `Effect` class constructor sets `this.flags = EFFECT | MERGE`, `this.lastWave = 0`, `this.fn = fn`, etc. |
| 43–52 | Pool reuse path (the recycled-instance reset) | **CHANGED.** Replace the H5 reset block with `node.flags = EFFECT | MERGE; node.lastWave = 0; node.fn = fn; node.subsHead = node.subsTail = node.depsHead = node.depsTail = null`. **No `notify` reassignment** (it's on the prototype). The `lastWave = 0` reset (was the H5 `lastWave = 0` per spec-6.2-phase2-h5 §5.2 site E) is preserved bit-identically — `0` is still the SMI sentinel. |
| 54–67 | Effect literal (was the fresh-construction literal) | **REMOVED.** Replaced by `new Effect(fn)`. The H5 `flags: EFFECT | MERGE`, `lastWave: 0` are now constructor body assignments. |
| 74–95 | Returned `dispose` function with closure-local `disposed` boolean | **NO CHANGE.** Per Investigator §R-E: the `disposed` flag MUST stay closure-local. The dispose closure is part of the public API contract; pool-reuse correctness depends on `disposed === false` not surviving a recycle. **Forbidden modification per §13.4 below.** |

### §5.4 `index.ts`

**NO CHANGE.** Public API surface is BYTE-IDENTICAL to H5. Per §8 hard-pin below.

`class Computed` and `class Effect` are `/** @internal */` to their respective source files; not re-exported. The new `HOST` flag constant MAY be exported as `/** @internal */` for the §9.2 K-1 detection test (with a re-export through a test-only path); it MUST NOT appear in the public API.

---

## §6 Algorithm pseudocode (mechanism level only)

The pseudocode below shows K1c+'s prototype-method dispatch shape and the HOST detection at Sites C/D. It is at branch-level granularity, NOT implementation. Lines marked `[K1c+]` are new under K1c+; everything else is bit-identical to spec-6.2-phase2-h5.md §6.

```
class Computed<T>:
  fields: flags, subsHead, subsTail, depsHead, depsTail, lastWave,
          fn, cached, hasCached, equals, hasEffectSub                [K1c+ — instance fields]

  prototype.notify():                                                [K1c+ — shared method]
    if this.flags & DISPOSED: return
    if this.flags & RUNNING: throw new SignalCircularError()

  prototype.recomputeIfNeeded():                                     [K1c+ — shared method;
                                                                     fn-promotion: recompute body
                                                                     inlined here]
    // existing H5 STALE/PENDING gating preserved
    if !(this.flags & (STALE | PENDING)): return
    // ...H5 equality-cascade short-circuit preserved...
    this.flags |= RUNNING                                            [RC-1 entry]
    const prev = setCurrentObserver(this)
    try:
      const next = this.fn()                                         [inlined recompute body]
      if !this.equals(this.cached, next):
        this.cached = next
        this.hasCached = true
        // propagate to subs (H5 path)
    finally:
      setCurrentObserver(prev)
      this.flags &= ~(RUNNING | STALE | MARKED | PENDING)            [RC-1 mask — UNCHANGED]

class Effect:
  fields: flags, subsHead, subsTail, depsHead, depsTail, lastWave, fn  [K1c+]

  prototype.notify():                                                [K1c+ — shared method]
    if this.flags & DISPOSED: return
    if this.flags & RUNNING: throw new SignalCircularError()
    runEffect(this)                                                  [unchanged top-level helper]

signal() factory:                                                    [K1c+ — literal preserved]
  return literal { flags: MERGE | HOST,                              [K1c+ — HOST bit added]
                   subsHead, subsTail, depsHead, depsTail,
                   lastWave: 0 }                                     [no notify literal — CL-6 removed]

drainBatch site C:                                                   [K1c+ — HOST replaces idiom]
  if (l.dep.flags & HOST) and l.dep.lastWave === wave: return true
  // (H5 had: if l.dep.recomputeIfNeeded === undefined &&
  //                       (l.dep.flags & MERGE) && (l.dep as MergeSubscriber).lastWave === wave)

checkDirty site D:                                                   [K1c+ — HOST replaces idiom]
  if (dep.flags & HOST):
    if dep.lastWave !== wave: dep.lastWave = wave
  // (H5 had: if dep.recomputeIfNeeded === undefined &&
  //                       (dep.flags & MERGE)) { (dep as MergeSubscriber)... })
```

**Total K1c+ additions:** one `HOST` flag constant, one bit-set at the host literal (`| HOST`), two detection-site rewrites (C and D), two class declarations replacing factory literals (Computed, Effect). All inside the `feat/v1-signals-6.2-phase3-closures` branch off `62f737f`.

**Note 1.** The `markOne` / `fastChase` paths are UNCHANGED from H5. K1c+ does NOT modify the chase loop itself; the `(sub.flags & MERGE)` dedup gates at sites A/B/chase-inner remain bit-identical to spec-6.2-phase2-h5.md §6.

**Note 2.** The cascade-suppression settle (`signal.ts:285–287`) calls `dep.recomputeIfNeeded?.()` — under K1c+, this resolves through `Computed.prototype.recomputeIfNeeded` for Computed deps, and resolves to `undefined` for signal-host deps (which have no class wrapper, no prototype method). Optional-chain semantics preserved.

**Note 3.** The signal-host literal change (`flags: MERGE | HOST`, `notify` removed) means the host's hidden class shifts by one slot (HOST flag set + notify slot removed). This is a one-time hidden-class transition during initial signal()-factory inlining; V8 caches the new shape and all subsequent host literals share it (single class, monomorphic).

---

## §7 PENDING / cascade-suppression preservation (UNCHANGED FROM H5)

**Inherited verbatim from `spec-6.2-phase2-h5.md` §7.** K1c+ modifies neither PENDING-set sites nor the cascade-suppression settle at `signal.ts:285–287`. Specifically:

| Element | Status under K1c+ |
|---|---|
| PENDING set per-hop on every interior computed (chase line 6) | UNCHANGED. K1c+ does not touch the chase. |
| PENDING set on terminal effect (chase terminal-effect exit) | UNCHANGED. Effect is class-instance, lastWave field still present. |
| PENDING + STALE coexistence on fan-out exit (SF-1) | UNCHANGED. |
| PENDING cleared by `recompute()` finally (now in `Computed.prototype.recomputeIfNeeded`) | **MOVED TO METHOD BODY but mask unchanged.** Per §3.4 + §4.4. |
| PENDING cleared by `clearVisited` (`signal.ts:325–330`) | UNCHANGED. MERGE and HOST not in mask. |
| PENDING cleared by `drainEffectQueue` (`signal.ts:278`) | UNCHANGED. |
| PENDING retention on direct deps via `checkDirty` (Phase-1 deviation #1) | UNCHANGED. |
| Cascade-suppression settle at `signal.ts:285–287` | **PROTECTED. NO MODIFICATION** per §13.2 below. |

Investigator §Q6 site-by-site verdict: ALL PRESERVED.

---

## §8 Public API hard-pin (NEW section)

Per Director-note §3 criterion 2 + §5.5:

> **Phase 3 closure removal MUST NOT change the public signatures of `signal()`, `computed()`, `effect()`, `batch()`, `untrack()`, `$state()`, OR the names `SignalCircularError` / `SignalError`. `packages/signals/src/index.ts` exports must be byte-identical to H5 (Verifier AC-7 baseline).**

### §8.1 The hard-pinned exports (verbatim)

The H5 `index.ts` (read at `62f737f`) is:

```
export { batch } from './batch.ts'
export type { ComputedOptions } from './computed.ts'
export { computed } from './computed.ts'
export type { Dispose, EffectFn } from './effect.ts'
export { effect } from './effect.ts'
export { SignalCircularError, SignalError } from './errors.ts'
export type { Read, Signal, SignalOptions, Write } from './signal.ts'
export { signal } from './signal.ts'
export type { State } from './state.ts'
export { $state } from './state.ts'
export { untrack } from './untrack.ts'
```

Every line MUST be byte-identical post-K1c+. Verification approach (Verifier AC-7):

```
git show 62f737f:packages/signals/src/index.ts > /tmp/index-h5.ts
diff packages/signals/src/index.ts /tmp/index-h5.ts
# Output MUST be empty (zero diff lines).
```

### §8.2 Internal classes are NOT exported

`class Computed`, `class Effect`, the `HOST` flag constant — all carry `/** @internal */` JSDoc and are NOT re-exported from `index.ts`. They MUST NOT appear in any public type definition either.

`HOST` MAY be re-exported via a test-only internal helper for §9.2 (the same pattern H5 used for MERGE per spec-6.2-phase2-h5.md §13.7). The test-only path does not surface to the public API.

### §8.3 Factory return-type stability

- `signal<T>(initial: T, options?: SignalOptions<T>): Signal<T>` — return tuple shape unchanged.
- `computed<T>(fn: () => T, options?: ComputedOptions<T>): Read<T>` — return-fn shape unchanged.
- `effect(fn: EffectFn): Dispose` — return dispose-fn shape unchanged.

Internal class instantiation is opaque to consumers — `signal()` continues to return a literal-backed tuple; `effect()` continues to return a dispose closure (`disposed` boolean stays closure-local per §13.4 below); `computed()` continues to return a Read function.

### §8.4 Surface-to-User obligation (PRE-BUILDER)

This spec does NOT introduce a public API change. Per Director-note §3 criterion 2 ("Public API holds. Likely YES"), no surface-to-user is required for §8. **The Architect's status report MUST explicitly confirm "public API byte-identical, verified by index.ts diff plan in §8.1"** so the user sees the verification approach.

---

## §9 Tests

### §9.1 Existing tests pass unchanged

All H5 existing tests in `packages/signals/tests/` — including `signal.test.ts`, `computed.test.ts`, `effect.test.ts`, `batch.test.ts`, `state.test.ts`, `properties.test.ts`, `deep-chain.test.ts` (with the H5 §9.3 MERGE-promotion test), and the cellx-counter scratch — pass without modification. Builder MUST NOT edit any test file. Per §13.1.

If any existing test fails after K1c+ lands, the Builder MUST diagnose the regression (likely a K-1, K-2, RC-1, MERGE-1, or MERGE-2 violation) before pushing. **Tests are NOT to be modified to accommodate K1c+ under any circumstance.**

The Phase-2 property tests (depth-parameterised glitch-freedom at 1/5/10/100/500; depth-100 c50 equality cascade) are inherited unchanged. They MUST pass under K1c+. The depth-100 + depth-500 cases exercise the linear-chain prototype-method dispatch; the equality-cascade test exercises the cascade-suppression settle (effect → Computed-class dep → `recomputeIfNeeded` prototype method invocation).

### §9.2 NEW: K-1 HOST-flag detection test

**File:** `packages/signals/tests/deep-chain.test.ts` — append (do not create a new file).

**Mandate:** verifies K-1 directly. The test confirms that:

(a) Signal-source Subscribers carry the `HOST` flag bit at construction.
(b) Computed and Effect Subscribers do NOT carry the `HOST` flag bit at construction.
(c) The `HOST` bit is preserved across waves (not cleared by RC-1's mask, not cleared by `clearVisited`, not cleared by `shallowClear`).

**Pseudocode shape (Builder implements verbatim):**

```
import { HOST } from '../src/signal'  // /** @internal */ for test access;
                                      // or via test-only re-export path.

it('K-1: signal hosts carry HOST; computeds and effects do not', () => {
  // (a) signal host carries HOST | MERGE
  const [src, setSrc] = signal(0)
  const srcNode = (src as any).__node ?? /* internal accessor */
  expect((srcNode.flags & HOST) !== 0).toBe(true)

  // (b) computed does NOT carry HOST
  const c1 = computed(() => src() + 1)
  let observed = -1
  const dispose1 = effect(() => { observed = c1() })
  const c1Node = (c1 as any).__node ?? /* same accessor */
  expect((c1Node.flags & HOST) === 0).toBe(true)

  // (b) effect does NOT carry HOST
  let runs = 0
  const dispose2 = effect(() => { runs++; void src() })
  const effNode = /* effect-internal accessor */
  expect((effNode.flags & HOST) === 0).toBe(true)

  // (c) HOST preserved after a wave
  setSrc(5); setSrc(7)
  expect((srcNode.flags & HOST) !== 0).toBe(true)

  dispose1(); dispose2()
})
```

**Why this catches K1c+ regressions:**
- (a) failure: signal-host literal omits `| HOST`, breaking K-1 detection at Sites C/D — load-bearing for memo correctness on the cascade-suppression settle.
- (b) failure: Computed or Effect constructor accidentally sets HOST → role misclassified at Site C/D, causing chase-loop dedup to skip on a non-host node (correctness break).
- (c) failure: someone added HOST to RC-1's flags-clear mask, breaking the one-way classifier rule.

### §9.3 NEW: K-2 prototype-method dispatch test

**File:** `packages/signals/tests/deep-chain.test.ts` — append (do not create a new file).

**Mandate:** verifies K-2 directly. The test confirms that:

(a) Two Computed instances share the SAME `notify` reference (i.e., it's a prototype method, not a per-instance own property).
(b) Two Effect instances share the SAME `notify` reference.
(c) Two Computed instances share the SAME `recomputeIfNeeded` reference.
(d) The `notify` and `recomputeIfNeeded` properties are NOT own-properties on a Computed instance (they live on the prototype).

**Pseudocode shape (Builder implements verbatim):**

```
it('K-2: notify and recomputeIfNeeded live on prototype, shared across instances', () => {
  // (a, c) two computeds share their methods
  const [s1] = signal(0), [s2] = signal(0)
  const c1 = computed(() => s1())
  const c2 = computed(() => s2())
  // Force construction
  const dispose1 = effect(() => void c1())
  const dispose2 = effect(() => void c2())
  const c1Node = (c1 as any).__node, c2Node = (c2 as any).__node
  expect(c1Node.notify).toBe(c2Node.notify)                  // (a) shared
  expect(c1Node.recomputeIfNeeded).toBe(c2Node.recomputeIfNeeded)  // (c) shared

  // (b) two effects share their notify
  let r1 = 0, r2 = 0
  const dispose3 = effect(() => { r1++ })
  const dispose4 = effect(() => { r2++ })
  const e3Node = /* effect-internal accessor */
  const e4Node = /* effect-internal accessor */
  expect(e3Node.notify).toBe(e4Node.notify)                  // (b) shared

  // (d) notify is not an own property
  expect(Object.prototype.hasOwnProperty.call(c1Node, 'notify')).toBe(false)
  expect(Object.prototype.hasOwnProperty.call(c1Node, 'recomputeIfNeeded')).toBe(false)

  dispose1(); dispose2(); dispose3(); dispose4()
})
```

**Why this catches K1c+ regressions:**
- (a, b, c) failure: Builder accidentally assigned `this.notify = function() {...}` inside the constructor — collapses the prototype-sharing optimisation and the K1c+ memory savings vanish. Verifier MUST re-bench and observe ≥ 8 KB landing (regression to H5) if this fires.
- (d) failure: same root cause; explicit own-property check.

### §9.4 cellx body-count invariant guard (HARD GATE — inherited)

**Run `bun .team/phase-2-5/scratch/cellx-counter.ts`. The output MUST print TOTAL = 17.** Inherited verbatim from spec-6.2-phase2-h5.md §12. Most likely K1c+-introduced violations:

1. **K-1 misfire.** HOST not set on signal hosts → Site C/D misclassifies → cascade-suppression settle skips a real signal source → effect re-emits on the second wave entry → TOTAL = 18.
2. **K-2 leak.** Per-instance `notify` accidentally assigned → not a correctness bug per se but Verifier observes memory landing > 5 KB (mechanism didn't take); flag for re-spec.
3. **RC-1 mask drift.** If Builder adds MERGE or HOST to the `finally` flags-clear mask → role bits cleared after first recompute → subsequent waves misroute via Sites C/D → cellx body-count TOTAL diverges (likely TOTAL = 18 or higher).

### §9.5 Smoke check — runner.ts and memory.ts

Per Director-note §"Researcher 4: Builder — Self-test gates":

1. `cd bench/signals && bun src/runner.ts` — completes without error.
2. `bun --expose-gc bench/signals/src/memory.ts` — completes without error and `RESULTS.memory.json` regenerated.

The Builder does NOT interpret bench numbers (Verifier's job). The memory bench MUST be re-run as part of K1c+ — the entire premise of the spec is the deep-prop-100 buildHeapDelta closure.

---

## §10 Bundle / Perf / Memory budget

### §10.1 Bundle estimate (concrete, ±5 B)

**Authoritative current state** (post-H5, head `62f737f`, Verifier-measured):

| Package | gz size | Cap | Headroom |
|---|---:|---:|---:|
| `@scribe/signals` | **1679 B** | 1850 B | **+171 B** |
| `@scribe/arbor` | **2133 B** | 2200 B | **+67 B** |

#### 10.1.1 K1c+ byte addition estimate — table

Per Investigator §Q5:

**Added bytes (signals):**

| Item | gz delta | Notes |
|---|---:|---|
| `class Computed { constructor(fn, equals) {...}; notify() {...}; recomputeIfNeeded() {...} }` | **+60 to +80 B** | constructor body + 2 methods, mangled |
| `class Effect { constructor(fn) {...}; notify() {...} }` | **+30 to +45 B** | shorter than Computed |
| `HOST = 0x080` constant declaration | +5 B | high gz compressibility |
| HOST literal at host (`flags: MERGE | HOST`) | +3 B | one new token |
| **Subtotal added** | **+98 to +133 B** | |

**Removed bytes (signals):**

| Item | gz delta | Notes |
|---|---:|---|
| `computed()` factory closure literals (notify, recomputeIfNeeded bodies) | **−140 B** | the largest single removal |
| `effect()` factory closure literal (notify body) | **−35 B** | |
| `signal()` empty `notify(): void {}` literal (CL-6) | **−5 B** | |
| Detection-site shortenings at Sites C and D (`recomputeIfNeeded === undefined` → `flags & HOST`) | **−12 B** | 6 B each × 2 sites |
| Cast removals at Sites A, B (the H5 `(sub as MergeSubscriber)` → `sub`) | **−15 B** | 3 sites in the chase + Sites C/D |
| **Subtotal removed** | **−207 B** | |

**Net signals delta: −207 + 133 = −74 B gz (best-case)**, **+71 B gz (worst-case bound from Investigator §Q5).**

#### 10.1.2 Concrete net estimate

Per Investigator §Q5 §"Net bundle estimate":

| Scenario | Estimated gz | Headroom remaining (cap 1850) |
|---|---:|---:|
| **K1c+ best case** (closures dominate; classes mangle tightly) | **−74 to −20 B**, signals 1605–1659 B | +191 to +245 B |
| **K1c+ expected case** (Architect's call) | **+10 B (±5 B)**, signals ≈1689 B | **+161 B** |
| **K1c+ worst case** (class boilerplate harder to compress) | **+71 B**, signals 1750 B | +100 B |

**Architect's call: state the EXPECTED estimate at +10 B gz (±5 B), with worst-case escalation trigger at +95 B gz (3-σ pessimistic upper bound).**

All scenarios fit comfortably within the 171 B signals headroom. **No signals escalation.**

#### 10.1.3 Arbor cascade

Per Investigator §Q5 §"Arbor headroom check":

| Scenario | Arbor gz | Headroom (cap 2200) |
|---|---:|---:|
| **K1c+ expected** (signals +10 B → arbor +5 B propagation) | ≈2138 B | +62 B |
| **K1c+ high** (signals +30 B → arbor +15 B) | ≈2148 B | +52 B |
| **K1c+ worst** (signals +71 B → arbor +30 B) | ≈2163 B | +37 B |

**Verdict: FITS in expected/high cases. Tightens but fits in worst case.**

**Builder discipline (per Director §5.3 + Investigator §R-B):** every commit on the Phase 3 branch MUST include `bun run build && size-limit` in the self-test loop. No commit lands locally without bundle check. (Same rule as H5 + R7 — proven workable.)

**Pre-trigger surface (Investigator §R-B + §R-A surface):** if the Builder's first commit lands arbor at ≥ +50 B gz (i.e., uses 75% of the 67 B headroom in one pass), the Builder STOPS and surfaces to Architect BEFORE continuing. This is conservative margin to preserve room for any Verifier re-bench adjustments.

### §10.2 Perf gates

| Workload | Hard pass | Soft pass | Fail |
|---|---|---|---|
| **deep-propagation-100 p50** | **≤ 3.20 µs** | 3.20–3.30 µs | > 3.30 µs OR rank break |
| cellx p50 | ≤ 540 ns AND #1 | 540–560 ns AND #1 | rank break or > 560 ns |
| batched-writes-100 p50 | ≤ 2.75 µs AND #1 | 2.75–2.86 µs AND #1 | rank break or > 2.86 µs |
| dynamic-deps p50 | ≤ 740 ns AND ≤ #2 | 740–820 ns AND ≤ #2 | rank break or > 820 ns |
| wide-fanout-100 p50 | ≤ 4.83 µs | 4.83–5.15 µs | > 5.15 µs |
| creation-1to1000 p50 | ≤ 78 µs | 78–82 µs | > 82 µs (H5 at 78.40 µs already; Phase 3 must not regress further) |

**State explicitly: K1c+ is memory-driven, not perf-driven.** The 0–80 ns time delta predicted by Investigator §Q4 is incidental. The acceptance is dominated by memory + ranks. A 0-ns time landing (i.e., deep-prop p50 at ≈3.30 µs, the H5 baseline) is acceptable as a soft pass IF memory hits ≤ 5 KB. A perf regression > 3.30 µs is a fail regardless of memory landing.

### §10.3 Memory gates (REALISTIC TARGETS — Investigator-grounded)

| Workload buildHeapDelta | Hard pass | Soft pass | Fail |
|---|---|---|---|
| **deep-propagation-100** | **≤ 4 KB** | 4–5 KB | > 5 KB OR > 8.68 KB H5 baseline (regression) |
| cellx | ≤ 0 B (no regression vs H5 0 B) | ≤ +500 B | ≥ +1 KB |
| wide-fanout-100 | ≤ 38.19 KB (no regression vs H5) | ≤ +5 KB | ≥ +10 KB |
| batched-writes-100 | ≤ 1.17 KB (no regression vs H5) | ≤ +500 B | ≥ +1 KB |
| dynamic-deps | 0 B (unchanged) | ≤ 0 B | ≥ +500 B |
| creation-1to1000 | 0 B (unchanged) | ≤ 0 B | ≥ +500 B |

**Justification (each tier with Investigator §Q2 cite):**

- **Hard target ≤ 4 KB:** Investigator §Q2 §"Total deep-prop projection" predicts K1c+fn-promotion realistic landing at ~3.4 KB (R-A 0.7 multiplier applied to ~7.6 KB raw mechanism capacity). The hard target is set BELOW the realistic landing for slack — if the mechanism delivers as projected, the Verifier observes a HARD pass. If V8 retention is more pessimistic than projected (×0.6 multiplier), realistic landing ~4.0 KB — borderline hard pass.
- **Soft target ≤ 5 KB:** Investigator §Q2 §"K1c+fn-promotion total: ~76 B/Sub" with R-A 0.7 = ~5.3 KB freed. The soft target is the realistic landing (8.68 − 5.3 = ~3.4 KB) plus a 1.6 KB buffer for measurement noise / V8 build variance.
- **Fail line > 5 KB:** if K1c+ lands above 5 KB, the mechanism captured less than the post-settle slice it was sized for. This signals either a Builder implementation regression (e.g., per-instance `notify` leaked) OR that the post-settle ratio is more pessimistic than the Investigator's gross-to-post-settle estimate (~0.45). Either way, it's "we lost ground vs. the mechanism's reach" and the Director surfaces.
- **Fail line > 8.68 KB (H5 baseline) regression:** trivially a regression vs H5 — even worse than no-op.

**Critical instruction (Director §5.2 + §0):** the targets above were set FROM the Investigator's mechanism-grounded numbers (post-settle 33–76 B/Sub from Q1 slot-walk × R-A 0.7), NOT from upstream destination numbers (alien parity). **This is the playbook fix for the Round 5 projection-failure.** Numbers must be defended by mechanism, not copied from destination.

**Confirm-the-cause check (Verifier — per Investigator §Q2 §"Direct comparison to alien"):** compute `(scribe.buildHeapDelta − alien.buildHeapDelta) / 102` per Subscriber on `deep-propagation-100` post-K1c+. Pre-K1c+ ~85 B/Sub. **Target post-K1c+: ≤ 35 B/Sub.** If post-K1c+ the per-Sub delta is still ~60 B, the closure removal didn't take fully and Builder should re-inspect (likely K-2 violation: per-instance method leak). The Verifier reports this number explicitly in `RESULTS.md`.

### §10.4 Shallow-rank gates (UNCHANGED FROM H5)

- **cellx #1** (current p50 537.7 ns; lead 33 ns over preact). Floor 540 ns.
- **batched-writes-100 #1** (current p50 2.59 µs; lead 40 ns over s-js). Floor 2.75 µs.
- **dynamic-deps ≤ #2** (current p50 684 ns; behind s-js by 82 ns; ahead of preact by 184 ns). Floor 740 ns.

If any of these break, surface to user immediately (Surface-to-User #4 trigger from Round 5; carries forward).

---

## §11 Risks

### §11.1 Arbor bundle headroom (binding constraint)

**Risk:** arbor 67 B headroom is the binding constraint per Investigator §R-B. Worst-case K1c+ propagation lands arbor at +30 B gz delta = ~2163 B (+37 B headroom), within cap but with no slack.

**Mitigation:** per §10.1.3 — Builder runs `bun run build && size-limit` after every commit on both `@scribe/signals` AND `@scribe/arbor`. Pre-trigger surface at +50 B gz arbor delta; hard escalation at +67 B gz.

**Residual risk:** arbor exceeds cap → §15.2 conditional escalation.

### §11.2 `disposed` closure-local pin (Investigator §R-E)

**Risk:** moving the `disposed` boolean (in `effect()`'s returned dispose function, `effect.ts:74–95`) from closure-local to instance field would BREAK pool-reuse correctness. Per Investigator §6.5.5: a recycled node CANNOT re-enter the dispose closure with `disposed === false` if the boolean lives on the instance — it would be true from the previous lifecycle.

**Mitigation:** §13.4 below — `disposed` MUST stay closure-local. Builder MUST NOT promote it to a field. Forbidden modification.

**Residual risk:** none if §13.4 is honoured.

### §11.3 Per-call dispatch perf (Investigator §R-G + §Q4)

**Risk:** prototype-method dispatch may not match closure-call dispatch on V8 inline caches. Specifically, IC fingerprinting may fragment if the Computed-class hidden chain is fragile.

**Mitigation:** Investigator §Q4 verdict — IC fingerprint stays monomorphic under K1c+ because all Computed instances share one shape (collapsing H5's two-shape Linear/Merge split). Per-call delta is 0 ± 2 ns. Cellx hot path is unaffected because `linkAdd` and `recompute` (the two functions on cellx's hot path) are NOT on the K1c+ dispatch boundary.

**Residual risk:** unexpected V8 deopt under inheritance changes; Verifier detects via cellx rank gate (≤ 540 ns AND #1).

### §11.4 Bundle delta worst-case (Investigator §R-H)

**Risk:** if class-declaration mangling is harder than expected, signals worst case lands at +71 B gz (vs +10 B expected). Headroom +100 B remains, but propagation to arbor could be +30 B (vs +5 B expected).

**Mitigation:** per-commit bundle check (§10.1.3). Pre-trigger surface at +95 B gz signals OR +50 B gz arbor.

**Residual risk:** worst-case propagation eats arbor headroom; §15.2 escalation.

### §11.5 `creation-1to1000` regression risk (Investigator §Q2 + Verifier §9 #4)

**Risk:** K1c+ adds 5 instance-field assignments to every Computed constructor (~5 × 8 B in-object = 40 B). Per Verifier H5 §9 #4, H5 already left creation at +2.2 µs over its 76.2 µs floor. Adding 5 fields adds ~5–15 ns/construct (V8 hidden-class transition amortised). On 1000 constructions: +5–15 µs total, but the bench measures per-graph (1 effect + N computeds), not per-construction. Realistic delta: +0.1–0.3 µs per graph creation; well within 82 µs soft band.

**Mitigation:** Verifier explicitly re-benches creation-1to1000 and reports.

**Residual risk:** if Verifier observes > 82 µs, surface — likely indicates Builder added MORE fields than spec (e.g., promoted `dispose` or other closure-locals).

### §11.6 V8 tier-up timing risk (LOW — inherited)

mitata's warmup samples should provide steady-state numbers. Verifier relies on p50, not p99.

### §11.7 try/catch boundary risk (LOW — inherited)

The H5 try/catch frame at `signal.ts:173, 213` must remain. K1c+ does not modify it. The RC-1 try/catch in `recomputeIfNeeded` moves from closure-body to method-body (§3.4) but the structural frame is the same; existing circular-error tests detect any drift.

### §11.8 Arbor restructure offset (NEW — user direction 2026-05-01)

**Risk:** arbor delta may exceed +30 B gz IF class declarations propagate broadly through arbor's bundle. Per user direction 2026-05-01: "relax arbor constraint if fixes can be applied to arbor and restore performance" — the user authorised arbor restructuring in parallel.

**Mitigation:** per §13.5 below — IF arbor delta > +30 B AND Round 6 includes arbor restructure providing ≥ 30 B savings, NET delta ≤ 0 → no cap raise. IF NET > 0 (arbor restructure can't offset): escalate.

**Residual risk:** if arbor restructure is out-of-scope for Round 6, the +30 B worst case still fits (2163 B ≤ 2200 B); no immediate breach.

---

## §12 cellx body-count invariant guard (HARD GATE — inherited; TOTAL = 17)

> **Run `bun .team/phase-2-5/scratch/cellx-counter.ts`. The output MUST print TOTAL = 17. Any other value is FAIL — halt, debug, do not push.**

Inherited verbatim from spec-6.2-phase2-h5.md §12. The cellx body-count invariant is the empirical guard for diamond correctness across H5 + K1c+.

Most likely K1c+-introduced violations (in order of probability):

1. **K-1 misfire.** HOST not set at signal-host literal → Site C/D misclassifies → cascade-suppression settle skips a real signal source → effect re-emits → TOTAL = 18.
2. **K-2 leak.** `notify` accidentally per-instance → not a counter violation per se, but Verifier observes memory > 5 KB.
3. **RC-1 mask drift.** Builder added MERGE or HOST to the `finally` clear mask → role bits cleared → next-wave Site C/D dispatches wrong → TOTAL diverges.
4. **MERGE-1 misfire (inherited).** linkAdd's MERGE upgrade fires on wrong condition → cellx merge node Linear → TOTAL = 18.

---

## §13 Forbidden modifications (UPDATED from spec-6.2-phase2-h5.md §13)

These are HARD lines. Builder violation = revert and re-spec.

### §13.1 No existing test file may be modified — STILL HOLDS

Inherited from spec-6.2-phase2-h5.md §13.1. All test files (the H5 state) remain bit-identical. The new K-1 + K-2 tests in §9.2, §9.3 are APPENDED to `deep-chain.test.ts`, not edited into existing tests.

### §13.2 No modification to `signal.ts:285–287` (cascade-suppression settle) — STILL HOLDS

Inherited from spec-6.2-phase2-h5.md §13.2. The protected step is unmodified by K1c+; the optional-chain `dep.recomputeIfNeeded?.()` resolves through Computed.prototype seamlessly.

### §13.3 `drainBatch` lastWave patch (`signal.ts:355–359`) — UPDATED for HOST flag

**Predecessor §13.3** of spec-6.2-phase2-h5.md updated the original H4 prohibition to permit a defensive `(l.dep.flags & MERGE)` guard at site C. **K1c+ NARROWLY UPDATES this further** by replacing the H5 detection idiom with `(l.dep.flags & HOST)` per §3.3. The semantic behaviour is preserved — signal hosts always carry HOST AND MERGE.

**Builder MUST:** the patch's behavior MUST remain bit-identical from the Verifier's perspective (signal-source dedup at `lastWave === wave` early-exit). The HOST detection IS the H5 MERGE detection plus an explicit role classifier; it does NOT change which deps trigger the early return. If the Verifier reports the patch firing for any non-HOST dep, K1c+ has a K-1 violation — surface immediately.

### §13.4 `disposed` closure-local pin (NEW under K1c+) — STILL HOLDS as forbidden

Per Investigator §R-E and §6.5.5: the `disposed` boolean in `effect()`'s returned dispose function (`effect.ts:74–95`) MUST stay closure-local. The dispose closure is part of the public API contract; pool-reuse correctness depends on `disposed === false` not surviving a recycle.

**Builder MUST NOT:** promote `disposed` to an instance field on the Effect class. If the Builder believes it must move, surface to Architect — this is a §15 hard escalation.

### §13.5 Bundle cap raise — UPDATED with arbor restructure net-zero condition

**Predecessor §13.5** of spec-6.2-phase2-h5.md reads:
> *"§13.5 No bundle cap raise without explicit user approval — STILL HOLDS"*

This spec **NARROWLY UPDATES** §13.5 per user direction 2026-05-01:

> The arbor cap MAY be raised under the following condition: arbor must be optimized in parallel — Round 6 includes arbor restructuring; if arbor delta exceeds +30 B AND arbor restructure provides ≥ 30 B savings, NET delta ≤ 0 — no cap raise needed. If NET > 0, escalate.

**Specifically:** the Architect does NOT pre-approve an arbor cap raise. The path is:

1. Builder lands K1c+ on signals; checks arbor.
2. If arbor delta ≤ +30 B gz: no escalation; arbor fits at ≤ 2163 B / 2200 B cap.
3. If arbor delta > +30 B gz AND a parallel arbor restructure provides ≥ 30 B savings (NET ≤ 0): no cap raise, ship.
4. If arbor delta > +30 B gz AND no offset available (NET > 0): SURFACE TO ARCHITECT, who surfaces to user with explicit options (Option B cap raise per H5 §15.2 carries forward as escalation, NOT pre-approval).

The user's direction does NOT permit Builder to unilaterally edit `.size-limit.json` for arbor. Hard escalation gate remains.

### §13.6 No restructuring of try/catch frame in markOne — STILL HOLDS

Inherited from spec-6.2-phase2-h5.md §13.6. The H4 try/catch at `signal.ts:173, 213` remains. K1c+'s prototype-method moves do not enter the markOne frame.

### §13.7 No public API change — STILL HOLDS (re-stated in §8)

Inherited from spec-6.2-phase2-h5.md §13.7. Per §8 hard-pin: `index.ts` MUST be byte-identical to H5. `class Computed`, `class Effect`, `HOST` all `/** @internal */`.

### §13.8 No own-property `notify` or `recomputeIfNeeded` (NEW K-2 enforcement)

Builder MUST NOT assign `this.notify = function(...) {...}` or `this.recomputeIfNeeded = function(...) {...}` inside any constructor. The methods MUST live on the prototype. The §9.3 test enforces this empirically.

---

## §14 Deliverables checklist (Builder)

The Builder ships a single PR on `feat/v1-signals-6.2-phase3-closures` (off H5 head `62f737f`) with the following deliverables.

### §14.1 Source changes

- [ ] **`packages/signals/src/signal.ts`** — five edits (Subscriber type collapse to single shape; `HOST = 0x080` constant; site C HOST detection rewrite; site D HOST detection rewrite; signal-host factory literal `flags: MERGE | HOST` + remove empty `notify(): void {}`). NO other lines modified.
- [ ] **`packages/signals/src/computed.ts`** — `class Computed<T>` declaration; factory body rewritten to `new Computed(fn, equals)`; closure literals + `recompute` factory-local closure REMOVED. RC-1 try/finally moves from closure body into `recomputeIfNeeded` prototype method body verbatim. The `read = (): T => {...}` Read function preserved as a closure (public API contract).
- [ ] **`packages/signals/src/effect.ts`** — `class Effect` declaration; factory body rewritten to `new Effect(fn)` (or pool reuse with field reset); closure literals REMOVED. The dispose closure preserved with `disposed` boolean closure-local (§13.4).
- [ ] **`packages/signals/src/index.ts`** — NO change. Byte-identical to H5.

### §14.2 Test additions

- [ ] **`packages/signals/tests/deep-chain.test.ts`** — appended with TWO new tests:
      - K-1 HOST-flag detection test per §9.2.
      - K-2 prototype-method dispatch test per §9.3.
- [ ] No modification to any existing test (§13.1).

### §14.3 Self-test gates before push

- [ ] `bun test` in `packages/signals/` — all H5 existing tests + §9.2 + §9.3 new tests pass (expected: H5-baseline count + 2 new tests).
- [ ] `bun typecheck` from repo root — no type errors. The class-instance Subscriber types MUST type-check cleanly across all packages (`@scribe/arbor`, `@scribe/runtime`, `@scribe/agent`).
- [ ] `bun run build` from repo root — completes without error.
- [ ] `bun scripts/size.ts` from repo root — both `@scribe/signals` ≤ 1850 B AND `@scribe/arbor` ≤ 2200 B. **Run on every commit, not just the final commit.** If arbor exceeds +50 B gz delta in any single commit → §15.2 conditional surface; if cap exceeded → §15.3 hard escalation; do NOT push.
- [ ] `cd bench/signals && bun src/runner.ts` — completes without error. Builder does NOT interpret bench numbers.
- [ ] `bun --expose-gc bench/signals/src/memory.ts` — completes without error; `RESULTS.memory.json` regenerated.
- [ ] `bun .team/phase-2-5/scratch/cellx-counter.ts` — prints **TOTAL = 17** (HARD GATE — §12).
- [ ] `git show 62f737f:packages/signals/src/index.ts > /tmp/index-h5.ts && diff packages/signals/src/index.ts /tmp/index-h5.ts` — empty diff (HARD GATE — §8.1).

### §14.4 Commit hygiene

- [ ] One commit per logical unit. Recommended sequence:
  1. `feat(signals): HOST=0x080 flag bit + site C/D detection (spec §3.3, §4.7, §5.1)`
  2. `feat(signals): Computed class + prototype methods + fn-promotion (spec §3.1, §3.4, §5.2)`
  3. `feat(signals): Effect class + prototype notify (spec §3.1, §5.3)`
  4. `feat(signals): signal-host literal flags MERGE | HOST + remove empty notify (spec §5.1)`
  5. `test(signals): K-1 + K-2 property tests (spec §9.2, §9.3)`
- [ ] Commit body cites `spec-6.2-phase3.md §X.Y` for each change.
- [ ] No commit modifies tests + source in the same commit (preserves audit trail).
- [ ] `bun run build && size-limit` in EVERY commit's self-test (per §11.4).

### §14.5 Pre-push verification

- [ ] All §14.3 gates green.
- [ ] `git diff 62f737f...HEAD --stat` shows changes ONLY in:
      - `packages/signals/src/signal.ts`
      - `packages/signals/src/computed.ts`
      - `packages/signals/src/effect.ts`
      - `packages/signals/tests/deep-chain.test.ts` (two tests appended)
- [ ] No accidental edits to `packages/signals/src/index.ts`, `.size-limit.json`, or any other file.
- [ ] Verify K-2 empirically: `Object.getPrototypeOf(c1Node) === Object.getPrototypeOf(c2Node)` for two computed instances.

### §14.6 Verifier handoff

- [ ] Push to `feat/v1-signals-6.2-phase3-closures`. Open PR.
- [ ] PR description cites this spec file at `.team/v1/spec-6.2-phase3.md` and summarizes Builder's diff vs spec ACs (e.g., "AC §3.3 site C implemented at signal.ts:355 with `(l.dep.flags & HOST)` guard; cast removed").
- [ ] PR description includes self-test results AND post-K1c+ size-limit numbers for both signals and arbor.
- [ ] PR description names the §13.3 / §13.5 narrow updates and the §8 public-API hard-pin verification (zero-diff `index.ts`) explicitly so the Verifier audits.
- [ ] PR description reports per-Sub buildHeapDelta for deep-prop-100 (Investigator §Q2 confirm-the-cause check).

---

## §15 Escalations

### §15.1 Bundle escalation for signals — NOT REQUIRED

Per §10.1.2, K1c+ is estimated at +10 B gz against 171 B headroom on signals (post-H5 baseline 1679 B). **No `🔴 ESCALATE TO USER` condition triggered for signals** in expected, high, or worst case.

### §15.2 Arbor cascade — CONDITIONAL ESCALATION

🟡 **CONDITIONAL ESCALATION:** if `bun scripts/size.ts` reports `@scribe/arbor` > +30 B gz delta after K1c+ lands, the Builder STOPS and surfaces to Architect with the following options:

> **Option A.** Investigate arbor's tree-shaking. The K1c+ class declarations may be inlined into arbor's bundle; verify via rolldown's `--inspect` or equivalent.
>
> **Option B.** Apply parallel arbor restructure for ≥ 30 B savings (per user direction 2026-05-01 + §13.5 net-zero condition). If NET ≤ 0: ship without cap raise.
>
> **Option C.** If Option A and Option B both fail: HARD ESCALATE TO USER per §13.5 — the user's net-zero condition is not met; cap raise discussion.

**Architect's expectation:** arbor lands at +5 to +15 B gz delta in expected case (2138–2148 B / 2200 B cap), within headroom comfortably.

### §15.3 If K1c+ misses memory soft target (> 5 KB)

Per Director-note §10 and §0 anti-projection-failure:

- **1st miss (memory soft band 4–5 KB):** Director's call. Likely ship; informational confirmation via Investigator §Q2 confirm-the-cause check.
- **1st miss (memory hard fail > 5 KB):** mechanism captured less than its post-settle slice. Likely cause: K-2 violation (per-instance method leak). Builder re-inspects; if still > 5 KB after fix, surface to user that v1 K1c+ alone doesn't reach 4 KB; v2 redesign or Phase 4 stack required.
- **1st miss (memory landing > 8.68 KB H5 baseline):** HARD FAIL. Regression vs H5. Builder reverts; Architect re-specs.

### §15.4 If K1c+ misses perf hard target (> 3.30 µs)

Per Director-note §10.2 + §15:

- **Soft miss (3.20–3.30 µs):** soft pass; ship-as-soft-pass with `[bench-bump]` justification.
- **Hard fail (> 3.30 µs):** rank-break-equivalent on deep-prop. Likely cause: V8 IC fragmentation (Investigator §R-G). Builder investigates; Architect re-specs if needed.

### §15.5 If shallow-rank break (cellx not #1, batched-writes-100 not #1, or dynamic-deps > #2)

🔴 **HARD ESCALATE TO USER.** Surface-to-User #4 trigger from Round 5; carries forward.

### §15.6 If existing test must be modified (forbidden)

🔴 **HARD ESCALATE TO USER.** Per §13.1.

### §15.7 If `signal.ts:285–287` cascade-suppression settle must be modified (forbidden)

🔴 **HARD ESCALATE TO USER.** Per §13.2.

### §15.8 If `disposed` closure-local must be promoted (forbidden)

🔴 **HARD ESCALATE TO USER.** Per §13.4 + Investigator §R-E.

### §15.9 If public API surface (`index.ts`) must change (forbidden)

🔴 **HARD ESCALATE TO USER.** Per §13.7 + §8 hard-pin.

### §15.10 If invariants DI-1, CS-1, SF-1, RC-1, MERGE-1, MERGE-2, K-1, K-2 cannot be preserved

🔴 **HARD ESCALATE TO USER.** Per Investigator §Q6 §"All PRESERVED" — these are non-negotiable. Any verified violation indicates the mechanism does not fit v1; surface for v2 redesign discussion.

### §15.11 If bundle landing > +95 B gz signals or > +50 B gz arbor on any commit (Investigator §R-A surface)

🟡 **CONDITIONAL ESCALATION TO ARCHITECT.** Builder STOPS, reports current bundle to Architect for re-evaluation. NOT a user surface (yet); Architect may approve continuation or re-spec.

---

## §16 Summary table — files touched

| File | Change | Lines affected | §-reference |
|---|---|---|---|
| `packages/signals/src/signal.ts` | Subscriber type collapse to single shape; `HOST = 0x080` constant; site C/D HOST-flag rewrite + cast removal; signal-host literal `flags: MERGE | HOST` + remove empty `notify` | ~15–25 lines net change | §5.1, §3.3, §4.7 |
| `packages/signals/src/computed.ts` | `class Computed<T>` declaration; factory body rewritten to class instantiation; closure literals + `recompute` REMOVED; RC-1 + recompute body inlined into `Computed.prototype.recomputeIfNeeded` | ~50–80 lines net change | §5.2, §3.1, §3.4 |
| `packages/signals/src/effect.ts` | `class Effect` declaration; factory body rewritten; closure literals REMOVED; pool reuse uses field reset; dispose closure preserved with `disposed` closure-local | ~30–50 lines net change | §5.3, §3.1, §3.5 |
| `packages/signals/src/index.ts` | NO change. Byte-identical to H5. | 0 | §8 |
| `packages/signals/tests/deep-chain.test.ts` | Append two tests: K-1 HOST detection (§9.2) + K-2 prototype-method dispatch (§9.3) | ~+80 lines appended | §9.2, §9.3 |

**No other files modified.** Per §13.

---

## §17 References

- Director-note: `.team/v1/director-notes/track-c-round-006.md`
- Predecessor spec: `.team/v1/spec-6.2-phase2-h5.md` (extended; §13.3 and §13.5 narrowly updated)
- Predecessor verification: `.team/v1/verification-report-6.2-phase2-h5.md`
- Investigation: `.team/v1/investigation-closure-removal.md` (Q1–Q6 + Recommendation: K1c+fn-promotion)
- Source state: `feat/v1-signals-6.2-phase2-h5 @ 62f737f`
- Reference framework: `bench/signals/node_modules/alien-signals/esm/system.mjs` (static-callback dispatch — K2 model NOT pursued here; K1c+ is the OOP-flavoured port of equivalent capacity)

---

## Architect's status report

**Spec:** `.team/v1/spec-6.2-phase3.md`
**AC count:** 8 named invariants (DI-1, CS-1, SF-1, RC-1, MERGE-1, MERGE-2 inherited from H5; K-1, K-2 new under K1c+).
**Bundle estimate:** signals +10 B gz expected (worst +71 B); arbor +5 B gz expected (worst +30 B). Both within respective headroom.
**Memory target:** ≤ 4 KB hard pass / ≤ 5 KB soft pass. Justification: Investigator §Q2 K1c+fn-promotion realistic landing ~3.4 KB after R-A 0.7 multiplier on 7.6 KB raw mechanism capacity. **NOT alien parity — the mechanism's realistic capacity caps memory landing at ~3.3 KB; targets below this require additional mechanisms (v2 redesign or Phase 4 stack).**
**Public API hard-pin verification:** `index.ts` byte-identical to H5; verified by `git show 62f737f:packages/signals/src/index.ts | diff` against post-K1c+ source — must produce empty diff (Verifier AC-7 baseline).
**Escalations expected:** none unconditional. Conditional escalations: §15.2 (arbor > +30 B gz with no offset), §15.3 (memory > 5 KB), §15.4 (perf > 3.30 µs), §15.5 (rank break), §15.11 (per-commit bundle pre-trigger).
**§13.3 / §13.5 narrow updates:** noted; do not constitute spec breaks. §13.5 explicitly states the user's "arbor restructure net-zero" condition does NOT pre-approve a cap raise.
