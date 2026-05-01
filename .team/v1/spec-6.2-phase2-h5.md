# Spec — Plan 6.2 Phase 2 Path C: H5 Typed Subscriber (Memory-Driven)

**Author:** Architect (Track C, Round 5, Path C)
**Date:** 2026-05-01
**Status:** READY FOR BUILDER
**Plan:** 6.2 Phase 2 Path C
**Predecessor:** `.team/v1/spec-6.2-phase2.md` (H4 — merged at `378d494`).
H5 **STACKS on top of** H4; the H4 80-ns gain is preserved. This spec
explicitly **overrides §13.4** of the predecessor (Subscriber interface
unchanged) — see §8 below.
**Director-note:** `.team/v1/director-notes/track-c-round-005.md`
(specifically §"Hypothesis space" §H5 + §"No-regression matrix" + §"Memory
gates").
**Investigation:** `.team/v1/investigation-6.2-phase2-h5.md` (M4 verdict;
Q4 NEEDS ADAPTATION; Q5 PRESERVED).
**Verification of predecessor:** `.team/v1/verification-report-6.2-phase2.md`
(H4 baseline 3.41 µs WSL2 p50, all shallow ranks held).
**Branch:** `feat/v1-signals-6.2-phase2-h5` (off H4 head `378d494`).
**Authorisation:** user-authorised Path-C pivot 2026-05-01; the Architect
must surface the §8 spec override before Builder ships (per Investigator §R1
+ Director-note §"Surface-to-user triggers" #6).

**Target workload:** `deep-propagation-100` (residual 3.41 µs after H4)
**Memory target (NEW):** `deep-propagation-100` `buildHeapDelta` ≤ 2 KB
(was 10.24 KB pre-H5, vs alien −872 B; closing the lastWave-related slice).
**Time target (carry-over):** ≤ 3.00 µs p50 (hard pass), 3.00–3.10 µs
(soft pass per Director-note tolerance band), 3.16–3.26 µs (Investigator
forecast).
**Stretch:** ≤ 2.55 µs p50 (alien parity — NOT in scope; requires algorithmic
redesign per Investigator §Q1).

**Hypothesis selected:** H5 / Mechanism **M4** — typed `LinearSubscriber` /
`MergeSubscriber` subclasses gated by `MERGE = 0x040` flag.
**M1, M2, M3 status:** REJECTED. See Investigator §3 ranking; this spec
mechanises M4 only.

**Critical framing (per orchestration brief):** H5 alone is forecast to
land deep-prop-100 at **3.16–3.26 µs** — a SOFT PASS at best, not a hard
pass against the 3.00 µs target. The Director's Round 6 will decide
whether to ship soft-pass, raise the target, or stack with another
optimization. **This spec's job is to ship the H5 mechanism cleanly; the
SHIP decision is downstream.**

---

## §1 Problem statement

### §1.1 Memory delta on the deep-propagation workload

Per the verification of H4 and the Investigator's §1 measurement
(`investigation-6.2-phase2-h5.md` §"Summary" + §1.1):

| Workload | scribe.buildHeapDelta | alien.buildHeapDelta | Delta | Per-Sub |
|---|---:|---:|---:|---:|
| `deep-propagation-100` | **+10.24 KB** | **−872 B** | **+11.10 KB** | **~108 B/Sub** (over 102 Subs) |
| `cellx` | 0 B | 0 B | 0 B | n/a (small graph; gc reclaims pre-settle) |

The 102-Subscriber linear chain (1 signal + 100 computeds + 1 effect)
carries ~108 B/Sub more retained heap than alien's equivalent topology.
Investigator §1.1 attributes the delta to two distinct contributors:

1. **Per-instance method closures (`notify`, `recomputeIfNeeded`)** on
   every Subscriber — primary contributor (~80–150 B/Sub). **NOT
   addressable by H5.** This is a v2 redesign.
2. **`lastWave` field-slot semantics**, especially the
   `effect.ts:51` `Number.NaN` reset that forces a Double-typed hidden-
   class slot — secondary contributor (~16 B/Sub of slot footprint plus
   build-time HeapNumber allocation pressure). **Addressable by H5.**

H5 closes contributor (2). It does **not** address contributor (1). Per
Investigator §R2, the Architect must explicitly tell the user this:

> *"H5 closes the lastWave piece of the memory delta but per-instance
> method closures on every Subscriber are the dominant cause and they
> are a v2 redesign."*

This is Surface-to-User trigger #5 ("Memory data shocks the hypothesis
space — alien parity requires algorithmic change"). It is informational,
not a permission gate.

### §1.2 Time delta after H4

H4 left `deep-propagation-100` at **3.41 µs** (verification report
2026-04-30; WSL2). Target is ≤ 3.00 µs. Residual gap: **~410 ns**.

Per Investigator §3.6, H5/M4 saves ~150–250 ns on the chase loop's
linear-hop path by removing two operations per hop (the `lastWave`
read at `signal.ts:185` and the `lastWave = wave` write at line 187)
across 99 linear hops. Forecast: **3.16–3.26 µs** — a soft pass, not
a hard pass. The remaining ~200 ns is most likely the `recompute()`
chain walk (Investigator §Q3 closing; Phase-2 spec §11.7), which is
out of scope for H5.

### §1.3 Why H5 is the Path-C pivot (not H1, not Phase 3)

- **H1 (linear-chase tightening) ⊂ H4.** Already shipped at `378d494`.
  No further H1 lever exists without re-engineering the chase loop —
  diminishing returns relative to bundle cost.
- **Phase 3 (`recompute()` walk redesign).** Out of scope per Director-
  note. Larger change, no investigation contract.
- **H5 / M4.** Investigated and convinced; user-authorised; closes a
  visible memory gap; nudges time at the same time. Right size.

---

## §2 Hypothesis (H5 / M4)

### §2.1 Statement

> Split the `Subscriber` interface into two structural shapes —
> **`LinearSubscriber`** (no `lastWave` field) and **`MergeSubscriber`**
> (carries a stable SMI `lastWave` field initialised to 0 at
> construction). Gate the dedup path on a new flag bit
> **`MERGE = 0x040`** (the existing hole in the bit allocation per
> Investigator §3.3). Signal hosts and effect nodes are **always
> Merge** at construction; computeds start **Linear** and are upgraded
> to Merge inside `linkAdd` the first time a second inbound dep edge
> attaches (i.e. at the moment they become a fan-in target). Linear
> nodes never read or write `lastWave` and therefore never carry that
> slot in their hidden class.

### §2.2 Expected magnitude (citation)

Per Investigator §Q3 M4 + §6.2:

- **Memory:** ~16 B per linear Subscriber × 100 linear computeds in the
  deep-prop workload = **~1.6 KB saved per graph**, plus elimination
  of the effect-pool HeapNumber pressure from `effect.ts:51` (NaN seed).
  Forecast `buildHeapDelta` post-H5: **≤ 2.0 KB** (hard target),
  **≤ 5.0 KB** (soft target).
- **Time:** ~2 ns × 99 linear hops = **~150–250 ns** recovered on
  `deep-propagation-100`. Forecast post-H5: **3.16–3.26 µs** — soft
  pass at best.
- **Cellx:** Investigator §6.2 forecasts a +0–15 ns *cost* (one extra
  flag-test branch in the dedup gate), well inside the 540 ns floor.
  Rank held.
- **Other shallow workloads:** unchanged path; no measurable delta.

### §2.3 Why M4 (not M1, M2, M3)

Investigator §3 ranks M4 #1; M1 (per-Link) reject (negligible savings,
breaks diamond); M2 (Map dedup) reject (rank break on cellx); M3 (flag-
bit cycling) reject (wrap-around fragility). This spec mechanises M4
only. Builder MUST NOT substitute another mechanism.

---

## §3 Mechanism — Typed Subscriber subclasses

### §3.1 Reference: Investigator §Q3 §3.4

The mechanism is named M4 in Investigator §3.4 ("Typed Subscriber
subclasses (Linear vs Merge)"). Its key features:

1. **Two structural shapes.** `LinearSubscriber` carries the existing
   six pointer/method fields plus `flags`; **no `lastWave` slot**.
   `MergeSubscriber` is `LinearSubscriber` plus a single `lastWave: number`
   field initialised to 0 (an SMI value — V8 stores it in the slot
   without HeapNumber boxing).
2. **One flag bit.** `MERGE = 0x040` (the existing 0x040 hole between
   `EFFECT = 0x020` and `MARKED = 0x080`; Investigator §3.4). Set
   eagerly at construction for signals and effects; set lazily inside
   `linkAdd` for computeds when a second dep edge attaches.
3. **Type-guarded dedup.** The chase-loop dedup at `signal.ts:185` (post-
   H4 location) becomes a two-step check: first `(sub.flags & MERGE)`,
   then — only inside the Merge branch — `(sub.lastWave === wave)`.
   Linear nodes skip both the read and the write.
4. **One-way classifier.** The MERGE bit is **never cleared** by the
   runtime. `clearVisited` (`signal.ts:325–330`), `shallowClear`
   (`signal.ts:230–236`), and `recompute()`'s finally-block
   (`computed.ts:51`) all leave it untouched. This is by design
   (Investigator §4.3) — once a node has fan-in shape, it keeps it.

### §3.2 The five adaptation sites (post-H4 line numbers)

H4 already restructured `markOne` into outer + inner phases. H5 adapts
five sites that read or write `lastWave`. Investigator §4.2 enumerated
each; this spec mirrors that enumeration:

| Site | Post-H4 location | Pre-H5 behavior | H5 adaptation |
|---|---|---|---|
| **A** | `signal.ts:185` outer-loop dedup | `if (!(sub.flags & DISPOSED) && sub.lastWave !== wave)` | Branch: only enter the lastWave check if `sub.flags & MERGE`. Linear nodes fall through to flag-stamp without dedup (DI-1 vacuously satisfied — they have exactly one inbound mark per wave). |
| **B** | `signal.ts:187` outer-loop write | `sub.lastWave = wave` | Conditional on MERGE. Linear nodes never write. |
| **C** | `signal.ts:357` drainBatch lastWave patch | `if (l.dep.recomputeIfNeeded === undefined && l.dep.lastWave !== wave) l.dep.lastWave = wave` | Field is present (signal hosts are always Merge). Add a defensive `(l.dep.flags & MERGE)` guard for shape-locking; mechanism unchanged. |
| **D** | `signal.ts:261` checkDirty signal-source | `if (dep.recomputeIfNeeded === undefined && dep.lastWave === wave) return true` | Same as C — signal hosts are always Merge; field is present. |
| **E** | `effect.ts:51` pool reuse reset | `node.lastWave = Number.NaN` | Replace with **a stable SMI sentinel**. Spec value: `0`. (Wave is initialised to `1` in `signal.ts` and only increments — `lastWave === 0` will never collide with a live wave. Use of `0` keeps the slot SMI-typed and matches the construction default for new MergeSubscriber.) |

The chase-inner dedup (post-H4, `signal.ts` chase iteration body — the
`if (cur.lastWave === wave) return` near the top of the chase) is a
**sixth adaptation site** introduced by H4. It is treated identically
to site A: gate on `(cur.flags & MERGE)`. See §6 for the integrated
pseudocode.

### §3.3 The `linkAdd` MERGE upgrade

Per Investigator §Q5 §5.2 — the classifier rule:

> A `MergeSubscriber` is any node with **≥ 2 inbound dep edges**, OR
> a signal host, OR an effect.

Implementation in `linkAdd` (`signal.ts:111–137`):

- Construction-time: signal hosts and effects set `flags |= MERGE`
  in their respective factory literals (see §5.1).
- Lazy upgrade for computeds: inside `linkAdd(dep, sub)`, **before**
  appending the new edge to `sub.depsHead/depsTail`, check whether
  `sub.depsHead !== null` (i.e. sub already has at least one dep
  edge attached). If so, set `sub.flags |= MERGE`. The upgrade is
  idempotent — re-setting the bit on an already-Merge sub is a no-op.

**Why "second edge", not "second sub"?** The dedup happens on the SUB
side — i.e. marks propagate FROM dep TO sub. Two deps with the same
sub means the sub will receive two `markOne()` calls in the same wave
(one per dep that gets propagated). Investigator §5.2 walked this
explicitly; the criterion is `depsHead.length ≥ 2` (informally — in
the linked-list representation, "depsHead is non-null at the moment a
new edge would be appended").

### §3.4 Hidden-class implications

Per Investigator §5.5 ("Edge case: a computed's deps-list extension
AFTER it has marks"):

- **Computed first construction:** Linear shape (no `lastWave` slot).
  V8 caches this hidden class.
- **Computed first `linkAdd`:** still Linear — depsHead was null, no
  upgrade.
- **Computed second `linkAdd`:** MERGE bit set; on next `markOne`, the
  type-guarded dedup at site A enters the lastWave write path. **First
  `lastWave = wave` write transitions the hidden class from Linear to
  Merge.** This is identical to scribe's pre-H5 behavior (where every
  computed transitions on first mark). Net: hidden-class machinery is
  **strictly more stable** under M4 — only Merge nodes ever transition.
- **Effect construction (fresh):** literal includes `flags: EFFECT |
  MERGE` and `lastWave: 0`. Single hidden class from birth.
- **Effect pool reuse:** `node.lastWave = 0` keeps the slot SMI-typed
  (no NaN, no Double generalisation). Pooled and fresh effects share
  one hidden class. **Fixes the polymorphic-dispatch site at
  `signal.ts:185` flagged in Investigator §2.1.3.**

### §3.5 What H5 does NOT change

Per Investigator §4.3, §Q4 verdict, and §Q5 verdict:

- **Topology mutation by mark.** Unchanged — `subsHead/subsTail/depsHead/
  depsTail` are still read, never written by `markOne`/chase/checkDirty/
  drainEffectQueue.
- **Cascade-suppression settle (`signal.ts:285–287`).** Untouched. The
  effect is always Merge; its `recomputeIfNeeded?.()` walk works
  identically.
- **`recompute()` finally-block (`computed.ts:51`).** Untouched. Clears
  `RUNNING | STALE | MARKED | PENDING` (NOT `MERGE`).
- **`shallowClear` (`signal.ts:230–236`).** Untouched. Does not touch
  `lastWave` or `MERGE`.
- **`clearVisited` (`signal.ts:325–330`).** Untouched. Does not touch
  `MERGE`.
- **The H4 chase loop's outer/inner split.** Preserved. H5 only inserts
  type guards into the dedup gates of both phases.
- **Public API surface.** `index.ts` not modified. `Subscriber` is an
  internal type; the typed shapes are opaque to consumers (§13.7).

---

## §4 Named invariants (must hold post-implementation)

These are the invariants the Builder must preserve and the Verifier
must check. The four H4 invariants are **inherited unchanged**; H5
adds two new invariants for the typed-subscriber mechanism.

### §4.1 DI-1 — Diamond Invariant 1 (inherited from spec-6.2-phase2.md §4.1)

> **DI-1.** For any Subscriber N reached during a wave W, the work
> performed by `markOne` (or the inner fast-chase) on N is a no-op if
> `N.lastWave === W`. The first arrival sets `N.lastWave = W` and
> proceeds; all subsequent arrivals at N within W are dropped.

**Refinement under H5:** DI-1 is required only for Merge subscribers
(those that can receive ≥ 2 marks per wave). For Linear subscribers,
DI-1 is **vacuously satisfied** — by construction they have exactly
one inbound dep, so exactly one inbound mark arrives per wave.

**Builder MUST:** preserve the existing DI-1 dedup test for Merge
subscribers (sites A and chase-inner). For Linear subscribers, NO
dedup is required and NO `lastWave` field exists to test against.

### §4.2 CS-1 — Cascade-Suppression Invariant 1 (inherited from spec-6.2-phase2.md §4.2)

> **CS-1.** The mark phase MUST set PENDING on every visited
> Subscriber, including interior computeds AND the terminal effect.
> The dep-graph topology — `subsHead`, `subsTail`, `depsHead`,
> `depsTail` — is not mutated by mark.

**Refinement under H5:** unchanged. The MERGE bit is independent of
PENDING. PENDING-stamping logic in the chase is not modified.

**Builder MUST:** ensure the chase's flag-stamp step (`cur.flags |=
MARKED | PENDING`, post-H4) executes on every interior hop regardless
of MERGE status. The terminal-effect exit must still stamp PENDING
+ lastWave on the effect (effects are always Merge — lastWave field
is present).

### §4.3 SF-1 — STALE-Supersedes-PENDING on fan-out exit (inherited from spec-6.2-phase2.md §4.3)

> **SF-1.** When the inline chase exits at a fan-out boundary, the
> node carries `MARKED | PENDING` from the chase's stamp step. The
> fan-out exit then sets `cur.flags |= STALE`. Both bits coexist;
> recomputeIfNeeded treats `(STALE | PENDING)` identically.

**Refinement under H5:** unchanged. MERGE is orthogonal to STALE/
PENDING/MARKED. Note: when fan-out exit fires on a node, that node
is already Merge by construction (it has a fan-out child *and* it
was reached in the first place — typically as a Merge target itself,
or as an interior computed whose hot path is type-stable).

### §4.4 RC-1 — Reentrancy of `recomputeIfNeeded` (inherited from spec-6.2-phase2.md §4.4)

> **RC-1.** `recompute()`'s finally-block clears `RUNNING | STALE |
> MARKED | PENDING` on every recompute completion. H5 does NOT add
> `MERGE` to that mask.

**Builder MUST NOT:** modify `computed.ts:51`. In particular, MERGE
is **NOT** to be cleared in the finally-block. MERGE is a one-way
classifier bit per §3.1 and §4.5.

### §4.5 MERGE-1 — Merge-Bit Coverage (NEW under H5)

> **MERGE-1.** For every Subscriber S reachable from a signal host
> via a path of length ≥ 2 deps converging at S (i.e. S has ≥ 2
> inbound dep edges), `S.flags & MERGE !== 0` MUST hold from the
> moment the second dep edge is attached.

**Source:** Investigator §Q5 §5.2 ("the right structural classifier
is: a node is MERGE if its `depsHead` chain has length ≥ 2").

**Why it holds:** §3.3's `linkAdd` upgrade. The bit is set inside
`linkAdd` BEFORE the new edge is appended, when `sub.depsHead`
is non-null and a new edge would make the count 2.

**Why it is necessary:** if a node with ≥ 2 deps has the MERGE bit
clear, the dedup gate at site A (and chase-inner) will skip both
the lastWave check and the write. The second mark from a second
dep would re-enter the chase at that node, re-stamp PENDING, and
potentially re-push the node's children to markStack — a diamond
correctness violation detectable by the cellx body-count guard
(§9.4).

**Builder MUST:** ensure the linkAdd upgrade fires on the second
dep edge — not the third, not later. Verifier checks via the cellx
body-count guard.

### §4.6 MERGE-2 — Merge-Bit Construction Eagerness (NEW under H5)

> **MERGE-2.** Signal hosts and effect Subscribers are constructed
> with `flags & MERGE !== 0`. Computeds are NOT constructed with
> MERGE; they are upgraded by linkAdd per MERGE-1.

**Source:** Investigator §Q3 §3.4 + §Q5 §5.2.

**Why it holds:** §5.1.4 (signal host literal) and §5.2 (effect
literal + pool reuse) set the bit at construction. Computed factory
(§5.3) does NOT set it.

**Why it is necessary:** signal hosts and effects are always reached
along ≥ 2 paths in real programs (a signal is shared among many
subs; an effect is the sole consumer of its dep but the dep itself
may have ≥ 2 paths). Eager construction-time MERGE on signals/effects
guarantees their `lastWave` field exists from the first hidden-class
emission, so polymorphism never creeps in. For computeds, lazy
upgrade preserves the savings on the linear-chain case — 99/100
computeds in `deep-propagation-100` are linear and never upgrade.

**Builder MUST NOT:** set MERGE on computeds at construction. If
that is done, the Linear/Merge split collapses, no savings, the
spec is violated. Verifier checks by inspecting the computed factory
in source review.

---

## §5 Changes to packages/signals/src

### §5.1 `signal.ts`

Six sites change. All other content of `signal.ts` is bit-identical
to H4 (head `378d494`).

| Lines (post-H4) | Content | Change under H5 |
|---|---|---|
| 22–34 | `Subscriber` interface | **CHANGED.** Split into `LinearSubscriber` (no `lastWave`) and `MergeSubscriber extends LinearSubscriber` (adds `lastWave: number`). Existing `Subscriber` becomes a discriminated union: `Subscriber = LinearSubscriber \| MergeSubscriber`. The `lastWave?: number` optional field is removed from the base shape. **This is the §13.4 override — see §8 below.** |
| 36–51 | Flag constants | **CHANGED.** Add one constant: `const MERGE = 0x040` (using the existing hole between `EFFECT = 0x020` and `MARKED = 0x080`). All other constants unchanged. |
| 111–137 | `linkAdd` | **CHANGED — single line addition.** Before appending the new edge to `sub.depsHead/depsTail`, if `sub.depsHead !== null` (i.e. sub already has ≥ 1 dep edge and this would be the 2nd or later), set `sub.flags |= MERGE`. Idempotent; safe to set on already-Merge sub. |
| 168 | `markStack` declaration | **NO CHANGE.** |
| 170–217 | `markOne` outer phase + inner chase (post-H4) | **CHANGED at sites A, B, and chase-inner per §3.2.** Type-guard the dedup-and-write on `(sub.flags & MERGE)`. Linear nodes skip both. Investigator §4.2 site walkthrough confirms each of these sites is a single-line guard insertion. |
| 221–223 | `propagateMark` | **NO CHANGE.** |
| 230–236 | `shallowClear` | **NO CHANGE.** Does not touch `lastWave` or MERGE. |
| 244–264 | `checkDirty` (incl. site D) | **CHANGED at site D.** The `dep.recomputeIfNeeded === undefined` branch reads `dep.lastWave === wave` — dep is always a signal host (always Merge) — but add a defensive `(dep.flags & MERGE)` guard for type-narrowing. The branch behavior is preserved. |
| 272–298 | `drainEffectQueue` incl. cascade-suppression settle at `:285–287` | **NO CHANGE.** §13.2 / §11 protected step. |
| 316–321 | `settleAndDrain` | **NO CHANGE.** |
| 325–330 | `clearVisited` | **NO CHANGE.** Does not touch MERGE. |
| 338–372 | `drainBatch` incl. lastWave patch (site C, ~`:355–359` post-H4) | **CHANGED at site C.** Add a defensive `(l.dep.flags & MERGE)` guard before the `lastWave` read/write. Behavior preserved (signal hosts are always Merge). **NOTE: This is a deliberate, narrow modification — see §13.3 below for the predecessor-spec override.** |
| 413–466 | `signal()` factory + `write()` | **CHANGED at host literal.** Set `flags: MERGE` (was `flags: 0` post-H4). Initialise `lastWave: 0` in the literal so the host is constructed as a fully-typed `MergeSubscriber`. The existing `wave++` and `host.lastWave = wave` in `write()` (around `:457`) is preserved unchanged — overwriting an SMI 0 with an SMI wave is a value-write, not a hidden-class transition. |

The Builder's diff in `signal.ts` should touch ONLY: the interface
declaration, the flag-constant block (one new line), `linkAdd` (one
new line), `markOne` (sites A/B/chase-inner), `checkDirty` (site D
guard), `drainBatch` (site C guard), and the signal-host factory
literal. Any other modified line is an unauthorised drive-by per
Director-note §"Researcher 5: Verifier — Bidirectional check".

### §5.2 `effect.ts`

Two sites change. Investigator §4.2 site E + the construction literal.

| Lines | Content | Change under H5 |
|---|---|---|
| 21–22 | `MAX_POOL = 8`, pool array | **NO CHANGE.** |
| 28–38 | `runEffect` | **NO CHANGE.** |
| 43–52 | Pool reuse path | **CHANGED at site E.** Replace `node.lastWave = Number.NaN` (`:51`) with `node.lastWave = 0`. The reset value MUST be a stable SMI sentinel that cannot collide with a live wave; `0` is the spec value because wave is initialised to `1` and only increments. The flags reset on the same path stays `flags = EFFECT | MERGE` (was `flags = EFFECT` pre-H5). |
| 54–67 | Effect construction literal | **CHANGED.** Set `flags: EFFECT | MERGE` (was `flags: EFFECT` post-H4). Add `lastWave: 0` to the literal. The notify closure is unchanged. |

**Forbidden:** Builder MUST NOT use `Number.NaN`, `-1`, or any other
sentinel at site E. The spec value is `0`. Rationale: NaN reintroduces
the Double-typed slot problem (Investigator §2.1.3). Negative SMIs
(e.g. `-1`) work mathematically but fragment the SMI-only invariant
on platforms where the runtime treats certain negative SMIs specially
(e.g. as boxed for arithmetic). `0` is the strictly safest choice
and matches the construction default.

### §5.3 `computed.ts`

**NO CHANGE in body.** The factory literal (`:55–87`) is left as-is —
flags initialised to `STALE` (post-H4), no `lastWave` slot in the
literal. Computed Subscribers are born **Linear**; the `linkAdd`
upgrade flips them to Merge if/when a second dep attaches.

**Type system (TypeScript):** the literal's typed annotation may need
to be `LinearSubscriber` (a narrowing from the previous
`Subscriber`). Investigator §3.4 noted "do NOT pre-set MERGE" at
construction. This is a **typing change only**; runtime semantics
unchanged.

If the Builder believes a `computed.ts` runtime edit is needed, that
is a substance question — Builder MUST surface to Architect before
pushing.

### §5.4 `index.ts`

**NO CHANGE.** Public API surface is fixed. The typed shapes
`LinearSubscriber` and `MergeSubscriber` are `/** @internal */` to
`signal.ts`; not re-exported.

---

## §6 Algorithm pseudocode (mechanism level)

The pseudocode below shows H5's adaptations to the H4 mark phase. It
is at branch-level granularity, NOT implementation. Lines marked
`[H5]` are new under H5; everything else is bit-identical to
spec-6.2-phase2.md §6.

```
markOne(root):                                                     [H4 unchanged frame]
  baseLen := markStack.length
  markStack.push(root)
  try:
    while markStack.length > baseLen:
      sub := markStack.pop()
      if sub.flags & DISPOSED: continue
      if sub.flags & MERGE:                                        [H5 — site A guard]
        if sub.lastWave === wave: continue                         [DI-1 outer]
        sub.lastWave := wave                                       [H5 — site B conditional]
      // else Linear: no dedup, no write, fall through
      if sub.flags & RUNNING: throw SignalCircularError
      sub.flags |= MARKED
      if sub.flags & EFFECT: effectQueue.push(sub); continue
      head := sub.subsHead
      if head === null: sub.flags |= STALE; continue               [leaf]
      if head.nextSub !== null:                                    [fan-out]
        visited.push(sub); sub.flags |= STALE
        for l := sub.subsTail; l !== null; l := l.prevSub: markStack.push(l.sub)
        continue
      fastChase(head)                                              [H4 inner phase]
  catch e:
    markStack.length := baseLen; throw e

fastChase(initialHead):                                            [H4 inner phase + H5]
  cur := initialHead.sub
  loop:
    if cur.flags & MERGE:                                          [H5 — chase-inner guard]
      if cur.lastWave === wave: return                             [DI-1 inner]
      cur.lastWave := wave                                         [H5 — conditional]
    // else Linear: no dedup, no write
    if cur.flags & DISPOSED: return
    if cur.flags & RUNNING: throw SignalCircularError
    cur.flags |= (MARKED | PENDING)                                [CS-1 stamp]
    if cur.flags & EFFECT: effectQueue.push(cur); return
    head := cur.subsHead
    if head === null: cur.flags |= STALE; return                   [leaf]
    if head.nextSub !== null:                                      [fan-out; SF-1]
      visited.push(cur); cur.flags |= STALE
      for l := cur.subsTail; l !== null; l := l.prevSub: markStack.push(l.sub)
      return
    if head.sub.flags & EFFECT:                                    [terminal effect]
      // effect is always Merge — lastWave field is present
      head.sub.lastWave := wave; head.sub.flags |= PENDING
      effectQueue.push(head.sub); return
    cur := head.sub                                                [linear continuation]

linkAdd(dep, sub):                                                 [H5 — single line addition]
  if sub.depsHead !== null: sub.flags |= MERGE                     [MERGE-1 lazy upgrade]
  // existing edge-append logic unchanged
  ...
```

**Total H5 additions: 4 conditional branches (sites A/B inside one
guard, chase-inner sites inside one guard, the linkAdd one-liner,
and the terminal-effect exit which now relies on the eager-Merge
construction of the effect for `lastWave` field presence).**

**Note 1.** The chase's `head.sub.flags & EFFECT` branch in fastChase
sets `head.sub.lastWave := wave` unconditionally — this is correct
under H5 because effects are constructed Merge per MERGE-2, so the
field is always present.

**Note 2.** The chase's `cur.flags & EFFECT` branch (the case where
the chase enters with cur already an effect) does NOT need a
lastWave write because the dedup at the top of the chase iteration
has already done it (sites in the H5 guard above). This is
unchanged from H4.

**Note 3.** The construction-time MERGE on signal hosts and effects
means the chase's lastWave write in the terminal-effect path
(`head.sub.lastWave := wave`) hits a slot that was initialised to 0
at construction, not undefined. No hidden-class transition occurs
on that write — it's a value-write into the SMI-typed slot.

---

## §7 PENDING / cascade-suppression preservation

**Unchanged from spec-6.2-phase2.md §7 and §8.** H5 modifies neither
PENDING-set sites nor the cascade-suppression settle at `signal.ts:
285–287`. Specifically:

| Element | Status under H5 |
|---|---|
| PENDING set per-hop on every interior computed (chase line 6) | UNCHANGED. Type-guard does not affect the flag-stamp. |
| PENDING set on terminal effect (chase terminal-effect exit) | UNCHANGED. Effect is always Merge — lastWave field present. |
| PENDING + STALE coexistence on fan-out exit (SF-1) | UNCHANGED. |
| PENDING cleared by `recompute()` finally (`computed.ts:51`) | UNCHANGED. |
| PENDING cleared by `clearVisited` (`signal.ts:325–330`) | UNCHANGED. MERGE not in mask. |
| PENDING cleared by `drainEffectQueue` (`signal.ts:278`) | UNCHANGED. |
| PENDING retention on direct deps via `checkDirty` (Phase-1 deviation #1) | UNCHANGED. |
| Cascade-suppression settle at `signal.ts:285–287` | **PROTECTED. NO MODIFICATION** per §13.2 below. |

**Investigator §Q4 site-by-site verdict (compatibility check):**

- Site 1 (dedup gate): PRESERVED for Merge; vacuously satisfied for Linear.
- Site 2 (write): conditional on MERGE. Linear nodes don't write. ✓
- Site 3 (chase tail): unchanged. ✓
- Site 4 (cascade-suppression settle): walks `effect.depsHead`, calls
  `recomputeIfNeeded?.()`. The dep is Merge (the chain tail c99 will
  have been a chase target — but chase targets along the linear chain
  are Linear; only the effect itself is Merge). **The settle does
  NOT depend on the dep being Merge** — `recomputeIfNeeded?.()` works
  on Linear deps too (the optional method is on the base shape). ✓
- Site 5 (drainBatch lastWave patch): defensive guard added per §5.1
  site C. ✓
- Site 6 (checkDirty): defensive guard added per §5.1 site D. ✓
- Site 7 (effect.ts:51 reset): NaN → 0 per §5.2 site E. ✓

---

## §8 Subscriber interface change (overrides spec-6.2-phase2.md §13.4)

### §8.1 The override

**Predecessor §13.4** of `spec-6.2-phase2.md` reads:

> *"§13.4 No modification to Subscriber interface (`signal.ts:22–34`).
> Phase-2 forbids interface-shape changes."*

This spec **OVERRIDES** that prohibition. H5's mechanism IS the
interface change. The Investigator (§R1) explicitly named this the
top risk and required the Architect to surface it; the user has
pre-authorised the Path-C pivot.

### §8.2 New typed shapes

The pre-H5 `Subscriber` interface (a single shape with `lastWave?:
number` optional) is replaced by a **discriminated union** of two
typed shapes:

```
LinearSubscriber {
  notify(): void
  flags: number
  subsHead, subsTail, depsHead, depsTail: Link | null
  recomputeIfNeeded?(): void
  // NO lastWave
}

MergeSubscriber extends LinearSubscriber {
  lastWave: number   // required, SMI, initialised to 0 at construction
}

Subscriber = LinearSubscriber | MergeSubscriber  // discriminated by (flags & MERGE)
```

### §8.3 Why this change is necessary

Per Investigator §Q1.2 and §3.4, the `lastWave` field-slot is the
sole memory contributor H5 can address without touching per-instance
method closures. Removing the slot from Linear subscribers requires
making it absent from the type, which requires splitting the
interface. There is no "field-optional" workaround that V8 treats
as truly optional — pre-H5's `lastWave?: number` always reserves
the slot in the hidden class once any Subscriber writes it
(Investigator §2.1).

### §8.4 What stays the same

- **No public API change.** `Subscriber` is `/** @internal */`. The
  union is not exported.
- **No test file modification** (§13.1 still holds).
- **`recomputeIfNeeded?(): void`** stays on `LinearSubscriber` (the
  base) — both Linear and Merge can be computeds with this method,
  and signal hosts have it as `undefined` for the dirty-detection
  trick (`checkDirty` line 261 + drainBatch lastWave patch). H5 does
  not move this field.

### §8.5 Surface-to-User obligation (PRE-BUILDER)

Per Investigator §R1 + Director-note §"Surface-to-user triggers" #6:
the Architect must surface this spec change to the user **before
Builder ships**. The user pre-authorised Path C; this surface is
informational continuity, not a permission gate. The Architect's
status report (post-spec) names §8 explicitly so the user sees the
override.

---

## §9 Tests

### §9.1 Existing tests pass unchanged

All H4 existing tests in `packages/signals/tests/` — including the
H4-era `signal.test.ts`, `computed.test.ts`, `effect.test.ts`,
`batch.test.ts`, `state.test.ts`, `properties.test.ts`, and the
expanded `deep-chain.test.ts` (which got the §9.2.1 + §9.2.2 H4
property tests) — pass without modification. The Builder MUST NOT
edit any test file. Per §13.1.

If any existing test fails after H5 lands, the Builder MUST diagnose
the regression (likely an H5 invariant violation — DI-1, MERGE-1,
MERGE-2) before pushing. **Tests are NOT to be modified to
accommodate H5 under any circumstance.**

### §9.2 Property-based glitch-freedom (re-confirm)

Tests §9.2.1 and §9.2.2 from `spec-6.2-phase2.md` (depth-parameterised
linear chain glitch-freedom at depths 1/5/10/100/500; equality cascade
at c50 depth-100) are inherited unchanged. They MUST pass under H5.

The depth-100 + depth-500 cases exercise the linear-chain Linear
subscribers; the depth-100 c50 equality test exercises the cascade-
suppression settle (Merge effect → Linear chain dep → recomputeIfNeeded
on the Linear dep). Both are non-trivial for H5.

### §9.3 NEW: `linkAdd` MERGE-promotion test

**File:** `packages/signals/tests/deep-chain.test.ts` — append (do
not create a new file unless §9.2 additions plus this would push
the file beyond ~250 lines).

**Mandate:** verifies MERGE-1 directly. Three properties.

**Pseudocode shape (Builder implements verbatim):**

```
import { MERGE } from '../src/signal'  // exported as /** @internal */ for test access
                                       //   — if MERGE is not exported, the test imports
                                       //   from a test-internal helper that re-exports
                                       //   the constant. Architect's intent: do NOT
                                       //   widen the public API for the test.

it('linkAdd: linear sub stays Linear with 1 dep, upgrades to Merge on 2nd dep, dedups in same wave', () => {
  // (a) Build a single-dep computed; verify Linear.
  const [src, setSrc] = signal(0)
  const c1 = computed(() => src() + 1)
  // Force linkAdd to fire by triggering a read inside an effect:
  let observed = -1
  const dispose = effect(() => { observed = c1() })
  expect(observed).toBe(1)
  // After read: c1.depsHead is set (1 edge from src). c1 should still be Linear.
  // Access via type-cast since Subscriber is /** @internal */:
  const c1node = (c1 as any).__node ?? /* internal accessor matching scribe convention */
  expect((c1node.flags & MERGE) === 0).toBe(true)   // (a) Linear

  // (b) Add a second dep. Build a second computed that reads BOTH c1 and a new signal.
  // To trigger linkAdd(s2, c2) with c2.depsHead already non-null, c2 must
  // first read c1 (1st linkAdd) and THEN read s2 (2nd linkAdd) within the
  // same recompute. Construct accordingly:
  const [s2, setS2] = signal(10)
  const c2 = computed(() => c1() + s2())   // reads c1 first, then s2
  let merged = -1
  const dispose2 = effect(() => { merged = c2() })
  expect(merged).toBe(11)
  const c2node = (c2 as any).__node ?? /* same accessor */
  expect((c2node.flags & MERGE) !== 0).toBe(true)   // (b) Merge after 2nd dep

  // (c) Mark through both deps in the same wave. Drive a write to src that
  // propagates through c1 → c2 (dep edge 1) AND a write to s2 that lands in
  // the same wave (only possible inside batch()). Inside the batch the marks
  // for both srcs converge at c2; c2's MERGE dedup must catch the second mark.
  let runCount = 0
  const dispose3 = effect(() => { runCount++; void c2() })
  runCount = 0   // reset post-initialisation
  batch(() => { setSrc(5); setS2(20) })
  // Property: c2 should re-emit ONCE for the combined wave, not twice.
  expect(runCount).toBe(1)
  expect(merged).toBe(26)   // 5+1 + 20

  dispose(); dispose2(); dispose3()
})
```

**Builder MUST:** implement the test exactly as described. The internal
accessor pattern (`(c1 as any).__node`) is permitted ONLY for this
test; the Builder may add a `/** @internal */` `_getNode(): Subscriber`
helper to `computed.ts` if the existing API does not expose the
underlying Subscriber for inspection. Such a helper is NOT a public
API change — confirm with Architect if uncertain.

If exporting `MERGE` from `signal.ts` is undesirable, the Builder
may add a `/** @internal */` `_MERGE_FLAG` re-export under a
test-only path; the test imports from there.

**Why this catches H5 regressions:**

- **(a) failure:** if the Linear shape leaks the MERGE bit at construction
  (MERGE-2 violation), this assertion fires. Causes the savings to vanish.
- **(b) failure:** if linkAdd's `if (sub.depsHead !== null) flags |=
  MERGE` line is missing or fires on the wrong condition, this assertion
  fires. The diamond invariant would be violated under multi-dep
  computeds — runtime would silently double-mark Merge nodes.
- **(c) failure:** if the dedup gate at site A or chase-inner is missing
  the MERGE branch, the second mark from s2 would re-stamp PENDING and
  re-emit the effect. `runCount === 2` exposes this.

### §9.4 cellx body-count invariant guard (HARD GATE — inherited)

**Run `bun .team/phase-2-5/scratch/cellx-counter.ts`. The output MUST
print TOTAL = 17.** Inherited from `spec-6.2-phase2.md` §12 / §9.3.
Any other value indicates DI-1, MERGE-1, or MERGE-2 has been violated.
Halt and debug before pushing.

If post-H5 the counter prints `TOTAL = 18`, the most likely violation
is MERGE-1: the cellx merge node's MERGE bit was not set on the second
dep edge attach, allowing the second mark to skip dedup and re-stamp
PENDING on the effect.

### §9.5 Smoke check — runner.ts and memory.ts

Per Director-note §"Researcher 4: Builder — Self-test gates":

1. `cd bench/signals && bun src/runner.ts` — completes without error.
2. `bun --expose-gc bench/signals/src/memory.ts` — completes without
   error and `RESULTS.memory.json` regenerated.

The Builder does NOT interpret bench numbers (Verifier's job). The
memory bench MUST be re-run as part of H5 — the entire premise of the
spec is the memory delta on `deep-propagation-100`.

---

## §10 Bundle / Perf budget

### §10.1 Bundle byte estimate (concrete)

**Authoritative current state** (post-H4, head `378d494`, re-measured
by Architect via `bun scripts/size.ts`):

| Package | gz size | Cap | Headroom |
|---|---:|---:|---:|
| `@scribe/signals` | **1809 B** (post-H4, per Investigator §3.4) | 1850 B | **+41 B** |
| `@scribe/arbor` | ~2171 B (post-H4) | 2200 B | **+29 B** |

Note: the H4 verification report (2026-04-30) gave a different signals
number; this spec uses the Investigator's post-H4 measurement of 1809 B
as the authoritative pre-H5 baseline. The Verifier MUST re-measure
both packages with `bun scripts/size.ts` post-H5.

#### 10.1.1 H5 byte addition estimate — sketch and method

Investigator §3.4 estimated the H5 raw delta at **+25–35 B raw** /
**+15–25 B gz**. The Architect's tightened breakdown:

**Removed by H5:**

- Pre-H5 Subscriber's `lastWave?: number` slot declaration: 0 B raw
  (TypeScript types compile away).

**Added by H5:**

| Item | Raw delta | Compressibility |
|---|---:|---|
| `MERGE = 0x040` constant declaration | ~5 B | high (pure repetition) |
| Site A guard (markOne outer dedup): `if (sub.flags & MERGE) { ... }` wrapping 2 lines | ~12 B | high (`flags`, `MERGE`, `lastWave`, `wave` all repeated) |
| Site B inside the same guard (no separate cost) | 0 | — |
| Chase-inner guard (markOne inner chase dedup): same pattern | ~12 B | high |
| Site C (drainBatch) defensive guard | ~10 B | high |
| Site D (checkDirty) defensive guard | ~10 B | high |
| linkAdd MERGE upgrade: `if (sub.depsHead !== null) sub.flags |= MERGE` | ~10 B | high |
| Signal-host literal: `flags: MERGE`, `lastWave: 0` | +6 B (was `flags: 0`) | medium |
| Effect literal change: `flags: EFFECT \| MERGE`, `lastWave: 0` | +6 B | medium |
| Site E change (NaN → 0): | −6 B (`Number.NaN` is longer than `0`) | medium |
| **Total raw** | **+65 B raw** (±5 B) | — |

Compressibility ratio for high-token-repetition code (per spec-6.2-
phase2.md §10.1.2 derivation): ~12–15 % of raw → gz.

**+65 B raw × 12–15 % ≈ +8–10 B gz.**

This is **lower** than Investigator §3.4's +15–25 B estimate. The
Architect's tightening reflects three observations:

1. The MERGE bit and the lastWave field-name are highly repeated
   across sites — gzip handles them efficiently.
2. The `Number.NaN` → `0` change at site E is a small **compression
   win** (NaN is a 10-byte literal; 0 is 1 byte).
3. Many of the "added" guards are tiny conditional wrappers, not
   new branch logic; gzip's dictionary captures the pattern.

#### 10.1.2 Concrete net estimate

**Net H5 estimate: +10 B gz (±5 B). Conservative ceiling: +20 B gz.**

| Scenario | Estimated gz | Headroom remaining (cap 1850) |
|---|---:|---:|
| H5 nominal (+10 B) | 1819 B | +31 B |
| H5 high (+20 B, near Investigator's upper bound) | 1829 B | +21 B |
| H5 worst-case (+30 B) | 1839 B | +11 B |

**All scenarios fit within the 1850 B cap. NO ESCALATION REQUIRED
for signals.**

#### 10.1.3 Arbor cascade

**`@scribe/arbor` is at +29 B headroom post-H4.** The H5 changes are
strictly internal to `markOne`/`linkAdd`/`drainBatch`/`checkDirty` —
arbor's tree-shaker already exposes `markOne` (via `mount`'s effect
path), so the +10 B gz from signals could propagate up to ~+10 B in
arbor.

| Scenario | Arbor gz | Headroom (cap 2200) |
|---|---:|---:|
| H5 nominal (+10 B propagation) | ~2181 B | +19 B |
| H5 high (+20 B propagation) | ~2191 B | +9 B |
| H5 worst-case (+30 B propagation) | ~2201 B | **−1 B** (BREAK) |

**Builder MUST run `bun scripts/size.ts` after H5 lands and confirm
BOTH `@scribe/signals` AND `@scribe/arbor` pass.** If arbor exceeds
2200 B, this is a §15 conditional escalation (arbor cap raise required
— separate from signals; user approval per Director-note hard line on
"Pre-approving any bundle cap raise"). See §15.2 below.

### §10.2 Perf gates (UNCHANGED — same as spec-6.2-phase2.md §10.2)

| Workload | Floor (≤) | Required rank | Pass type |
|---|---:|---|---|
| `deep-propagation-100` | 3.00 µs | n/a | **Hard pass** |
| `deep-propagation-100` | 3.00–3.10 µs | n/a | **Soft pass** (Director's tolerance band) |
| `deep-propagation-100` | > 3.10 µs but < 3.41 µs (post-H4 baseline) | n/a | **Miss** (counts vs 3-miss budget) |
| `deep-propagation-100` | ≥ 3.41 µs | n/a | **Hard fail** (regression vs H4) |
| `deep-propagation-100` | ≤ 2.55 µs | n/a | **Stretch (parity-with-alien)** |
| `cellx` | **540 ns** | **#1** | Hard gate; rank break = FAIL regardless of dp-100 result |
| `batched-writes-100` | **2.75 µs** | **#1** | Hard gate; rank break = FAIL regardless of dp-100 result |
| `dynamic-deps` | **740 ns** | **#1 or #2** | Hard gate; rank break = FAIL regardless of dp-100 result |
| `wide-fanout-100` | **4.83 µs** | no rank | Hard gate (absolute only) |
| `creation-1to1000` | **76.2 µs** | no rank | Hard gate (absolute only) |

**Investigator §6.2 forecast** (post-H5):

| Workload | Post-H4 | H5 prediction | Verdict band |
|---|---:|---:|---|
| `deep-propagation-100` | 3.41 µs | 3.16–3.26 µs | **soft pass** (most likely) — H5 ALONE will not hit hard pass. |
| `cellx` | 495 ns | 495–510 ns (no regression; +1 branch in gate) | hard pass; rank held |
| `batched-writes-100` | 2.46 µs | 2.46 µs (unchanged path) | hard pass; rank held |
| `dynamic-deps` | 706 ns | 706 ns (unchanged path) | hard pass; rank held |
| `wide-fanout-100` | 4.41 µs | 4.41 µs (unchanged) | hard pass |
| `creation-1to1000` | 70.24 µs | 70–72 µs (unchanged + tiny +flag store cost) | hard pass |

The **honest forecast** repeated from the orchestration brief: H5
alone will likely come in at 3.16–3.26 µs — a **MISS vs hard-pass
3.00 µs**. Director's Round 6 decides ship-soft / raise-target /
stack-with-another-optimization.

### §10.3 Memory gates (NEW under H5)

Round-5 stance (Director-note §"Memory gates") was "measure first,
then bar". H5 IS the first round to bar. The bar is set per
Investigator §6.1:

| Workload | scribe.buildHeapDelta | Hard pass | Soft pass | Fail |
|---|---:|---|---|---|
| `deep-propagation-100` | (current 10.24 KB) | **≤ 2.00 KB** | ≤ 5.00 KB | > 5.00 KB |
| `cellx` | (current 0 B) | ≤ 0 B (no regression) | ≤ +500 B | ≥ +1.00 KB |
| `wide-fanout-100` | (current 38.19 KB) | ≤ 38.19 KB (no regression) | ≤ +5 KB | ≥ +10 KB |
| `batched-writes-100` | (current 1.17 KB) | ≤ 1.17 KB (no regression) | ≤ +500 B | ≥ +1.00 KB |
| `dynamic-deps` | (current 0 B) | 0 B (unchanged) | ≤ 0 B | ≥ +500 B |
| `creation-1to1000` | (current 0 B) | 0 B (unchanged) | ≤ 0 B | ≥ +500 B |

**Rationale for the deep-prop-100 ≤ 2 KB target (Investigator §6.1):**
M4 saves ~1.6 KB by removing `lastWave` from linear-chain Subscribers;
the residual ~8 KB of overhead is per-instance method closures (NOT
addressed by H5; v2 redesign).

**Confirm-the-cause check (Verifier — Investigator §6.4):** compute
`(scribe.buildHeapDelta − alien.buildHeapDelta) / 102` per Subscriber
on `deep-propagation-100` post-H5. Pre-H5 ~108 B/Sub. **Target
post-H5: ≤ 50 B/Sub.** If post-H5 the per-Sub delta is still ~80 B,
Investigator §1.1's "per-instance closure" diagnosis is confirmed and
v2 redesign is the only path to alien parity. The Verifier reports
this number explicitly in `RESULTS.md`.

---

## §11 Risks

### §11.1 Subscriber interface change risk (HIGH visibility, LOW correctness)

**Risk:** the `Subscriber` interface split (§8) is the most invasive
change in this spec. Downstream code in `signal.ts`, `computed.ts`,
`effect.ts`, and any consumer that has accessed Subscribers via TS
type-narrowing may need adjustment. Investigator §R1 named this the
top risk.

**Mitigation:**
- §8 surfaces explicitly to user (via Architect's status report).
- §13.7 below: typed shapes are opaque to consumers (no public API
  change); failure of this guarantee is a Builder-time escalation.
- The Builder runs `bun typecheck` post-edit and surfaces any external
  consumer typing failure to Architect.

**Residual risk:** if the typed split causes V8 to deoptimise an
unexpected call site (e.g. in `propagateMark` or `clearVisited`), the
Verifier will detect it via the `cellx` rank gate or the `creation-
1to1000` floor. Both are gated in §10.2.

### §11.2 Arbor bundle propagation risk (LOW–MEDIUM)

**Risk:** §10.1.3 computes a worst-case arbor delta of +30 B gz, which
would break the 2200 B cap by 1 B.

**Mitigation:** §15.2 below — Builder STOPS, surfaces to Architect.
Architect's expected outcome: arbor lands at 2181–2191 B (within cap)
because rolldown's tree-shaker drops the unused MERGE branch on the
arbor side (arbor's effects are pre-classified Merge — the Linear
branch in markOne is dead-code-eliminable for arbor's call patterns).

**Residual risk:** arbor exceeds cap → escalate per §15.2.

### §11.3 `effect.ts:51` NaN→SMI sentinel risk (LOW)

**Risk:** the change `node.lastWave = Number.NaN` → `node.lastWave =
0` could collide with a live wave if `wave === 0` ever held. Per
`signal.ts` global `wave`-counter initialisation, `wave` starts at
`1` and only increments. Live waves are always ≥ 1, never 0.

**Mitigation:** Builder MUST verify the wave initialisation invariant
during edit. If the wave starts at 0 (pre-H5 readers should re-confirm
via grep), the spec value `0` is unsafe; substitute `-1` and inform
Architect. **As of post-H4 head `378d494`, wave starts at 1; this
risk is mitigated.**

**Residual risk:** if a future change resets `wave = 0`, the sentinel
collides. Add a comment at site E referencing this spec section.

### §11.4 M4 transition correctness on shape change (MEDIUM)

**Risk:** the moment a computed transitions from Linear to Merge
(via linkAdd's MERGE-1 upgrade), V8 may emit a hidden-class transition
that the dedup gate's call-site sees as polymorphic. The first chase
through that node post-upgrade might trip a deopt.

**Mitigation per Investigator §5.5:** the transition is identical in
character to scribe's pre-H5 behavior (where every Subscriber added
`lastWave` on first markOne write). H5 actually has **fewer** such
transitions because Linear nodes never transition. Net hidden-class
machinery is more stable, not less.

**Residual risk:** none observed in the Investigator's analysis. The
property test §9.3 (c) exercises a transition path; the cellx body-
count guard (§9.4) backstops correctness; the bench harness backstops
performance.

### §11.5 V8 tier-up timing risk (LOW — inherited from spec-6.2-phase2.md §11.5)

mitata's warmup samples should provide steady-state numbers. Verifier
relies on p50, not p99.

### §11.6 try/catch boundary risk (LOW — inherited from spec-6.2-phase2.md §11.6)

The H4 try/catch frame at `signal.ts:173, 213` must remain. H5 does
not modify the frame. If the Builder accidentally moves it, the
existing circular-error tests detect.

### §11.7 Recompute walk overhead unrecoverable (KNOWN — inherited)

Per Investigator §Q3 closing: H5 is forecast 3.16–3.26 µs. The
residual ~200 ns to hard-pass is the `recompute()` chain walk —
NOT addressable by H5. Phase 3 territory or a later round.

---

## §12 cellx body-count invariant guard (HARD GATE — inherited)

> **Run `bun .team/phase-2-5/scratch/cellx-counter.ts`. The output
> MUST print TOTAL = 17. Any other value is FAIL — halt, debug, do
> not push.**

Inherited verbatim from `spec-6.2-phase2.md` §12. The cellx body-
count invariant is the empirical guard for diamond correctness.

Most likely H5-introduced violations (in order of probability):

1. **MERGE-1 misfire.** linkAdd's MERGE upgrade fires on the wrong
   condition (e.g. `sub.depsHead === null` instead of `!== null`),
   leaving the cellx merge node Linear. Second mark skips dedup,
   re-stamps PENDING, re-pushes effect → TOTAL = 18.
2. **Site A or chase-inner guard inverted.** The MERGE-gate condition
   is `(sub.flags & MERGE) === 0` instead of `(sub.flags & MERGE) !== 0`,
   inverting which subs get deduped.
3. **MERGE-2 leak.** Computed factory accidentally sets MERGE at
   construction. Counter passes (over-deduping is silent on cellx),
   but memory savings vanish — Verifier flags via Investigator §6.4
   per-Sub check.

---

## §13 Forbidden modifications (UPDATED from spec-6.2-phase2.md §13)

These are HARD lines. Builder violation = revert and re-spec.

### §13.1 No existing test file may be modified — STILL HOLDS

Inherited from `spec-6.2-phase2.md` §13.1. All 7+ test files (the H4-
era state) remain bit-identical. The new linkAdd MERGE-promotion
test in §9.3 is APPENDED to `deep-chain.test.ts`, not edited into
existing tests.

### §13.2 No modification to `signal.ts:285–287` (cascade-suppression settle) — STILL HOLDS

Inherited from `spec-6.2-phase2.md` §13.2. The protected step is
unmodified by H5; type-guards do not enter the settle.

### §13.3 No modification to `drainBatch` lastWave patch (`signal.ts:355–359`) — UPDATED

**Predecessor §13.3** of `spec-6.2-phase2.md` reads:

> *"§13.3 No modification to `drainBatch` lastWave patch
> (`signal.ts:355–359`). The lastWave patch ... is a load-bearing
> detection mechanism..."*

This spec **NARROWLY UPDATES** §13.3. H5 modifies the patch at site C
(per §3.2 + §5.1) by adding a defensive `(l.dep.flags & MERGE)`
guard. The semantic behavior of the patch is preserved — signal hosts
are always Merge under H5, so the guard never short-circuits in
practice. The change is purely a TypeScript narrowing aid + a defensive
runtime check.

**Builder MUST:** the patch's behavior MUST remain bit-identical from
the Verifier's perspective. The added guard is a no-op on every signal-
host dep (because MERGE is always set on signal hosts at construction).
If the Verifier reports the patch firing for any non-Merge dep, H5
has a MERGE-2 violation — surface immediately.

### §13.4 No modification to Subscriber interface — **OVERRIDDEN by H5**

**Predecessor §13.4** of `spec-6.2-phase2.md` is **OVERRIDDEN BY THIS
SPEC**. The Subscriber interface change IS the H5 mechanism. See §8
above for the override rationale, the new typed shapes, the Surface-
to-User obligation, and the public-API-stability guarantee.

The override applies only to the Subscriber interface internal split
(§8.2). All other §13.4 hard-line obligations of the predecessor are
inherited unchanged.

### §13.5 No bundle cap raise without explicit user approval — STILL HOLDS

Inherited from `spec-6.2-phase2.md` §13.5. Per §10.1.3, signals fits
within the 1850 B cap. Per §10.1.3, arbor MAY require escalation —
that is a §15.2 conditional escalation, not a license to edit
`.size-limit.json`.

### §13.6 No restructuring of try/catch frame in markOne — STILL HOLDS

Inherited from `spec-6.2-phase2.md` §13.6. The H4 try/catch at
`signal.ts:173, 213` remains. H5's type guards run inside the frame.

### §13.7 NEW: Typed Subscriber shapes are opaque to consumers

**No public API change.** `LinearSubscriber` and `MergeSubscriber`
MUST be `/** @internal */` to `signal.ts`. They MUST NOT be re-exported
from `index.ts`. The `MERGE` flag constant MAY be exported as
`/** @internal */` for the §9.3 property test (with a re-export through
a test-only path); it MUST NOT appear in the public API.

If the Builder believes any consumer of `@scribe/signals` (including
`@scribe/arbor`, `@scribe/runtime`, `@scribe/agent`) needs to observe
the typed shapes, that is a substance question — escalate to Architect
before exposing the types.

### §13.8 NO modification to `computed.ts` runtime behavior

Per §5.3. Type annotation may need narrowing to `LinearSubscriber`;
runtime semantics are preserved. If the Builder believes a runtime
edit is needed, escalate.

---

## §14 Deliverables checklist (Builder)

The Builder ships a single PR on `feat/v1-signals-6.2-phase2-h5`
(off H4 head `378d494`) with the following deliverables.

### §14.1 Source changes

- [ ] **`packages/signals/src/signal.ts`** — six edits (Subscriber
      interface split per §8; `MERGE = 0x040` constant; linkAdd
      MERGE-1 one-liner; markOne sites A/B/chase-inner type-guards;
      checkDirty site D guard; drainBatch site C guard; signal-host
      factory literal `flags: MERGE`/`lastWave: 0`). NO other lines
      modified.
- [ ] **`packages/signals/src/effect.ts`** — two edits (effect
      construction literal `flags: EFFECT | MERGE`/`lastWave: 0`;
      pool reset site E `node.lastWave = 0`). NO other lines modified.
- [ ] **`packages/signals/src/computed.ts`** — type annotation may
      narrow to `LinearSubscriber`; runtime body unchanged.
- [ ] **`packages/signals/src/index.ts`** — NO change.

### §14.2 Test additions

- [ ] **`packages/signals/tests/deep-chain.test.ts`** — appended with
      one new test:
      - linkAdd MERGE-promotion test per §9.3 (verbatim properties).
- [ ] No modification to any existing test (§13.1).

### §14.3 Self-test gates before push

- [ ] `bun test` in `packages/signals/` — all H4 existing tests +
      §9.3 new test pass (expected: H4-baseline count + 1 new test).
- [ ] `bun typecheck` from repo root — no type errors. The Subscriber
      interface split (§8) MUST type-check cleanly across all packages.
- [ ] `bun run build` from repo root — completes without error.
- [ ] `bun scripts/size.ts` from repo root — both `@scribe/signals`
      ≤ 1850 B AND `@scribe/arbor` ≤ 2200 B. If arbor exceeds cap →
      §15.2 escalation; do NOT push.
- [ ] `cd bench/signals && bun src/runner.ts` — completes without
      error. Builder does NOT interpret bench numbers.
- [ ] `bun --expose-gc bench/signals/src/memory.ts` — completes
      without error; `RESULTS.memory.json` regenerated.
- [ ] `bun .team/phase-2-5/scratch/cellx-counter.ts` — prints
      **TOTAL = 17** (HARD GATE — §12).

### §14.4 Commit hygiene

- [ ] One commit per logical unit. Recommended sequence:
  1. `feat(signals): typed Subscriber split + MERGE flag (spec §3, §5, §8)`
  2. `feat(signals): linkAdd MERGE-1 upgrade + dedup type-guards (spec §3.2, §3.3, §6)`
  3. `feat(effect): EFFECT|MERGE construction + SMI sentinel reset (spec §5.2)`
  4. `test(signals): linkAdd MERGE-promotion property test (spec §9.3)`
- [ ] Commit body cites `spec-6.2-phase2-h5.md §X.Y` for each change.
- [ ] No commit modifies tests + source in the same commit (preserves
      audit trail).

### §14.5 Pre-push verification

- [ ] All §14.3 gates green.
- [ ] `git diff 378d494...HEAD --stat` shows changes ONLY in:
      - `packages/signals/src/signal.ts`
      - `packages/signals/src/effect.ts`
      - `packages/signals/src/computed.ts` (type annotation only)
      - `packages/signals/tests/deep-chain.test.ts` (one test appended)
- [ ] No accidental edits to `packages/signals/src/index.ts`,
      `.size-limit.json`, or any other file.

### §14.6 Verifier handoff

- [ ] Push to `feat/v1-signals-6.2-phase2-h5`. Open PR.
- [ ] PR description cites this spec file at
      `.team/v1/spec-6.2-phase2-h5.md` and summarizes Builder's diff
      vs spec ACs (e.g. "AC §3.2 site A implemented at signal.ts:185
      with `if (sub.flags & MERGE) { ... }` guard").
- [ ] PR description includes self-test results (gate output for
      §14.3) AND post-H5 size-limit numbers for both signals and arbor.
- [ ] PR description names the §8 override and the §13.4 deviation
      explicitly so the Verifier audits it.

---

## §15 Escalations

### §15.1 Bundle escalation for signals — NOT REQUIRED

Per §10.1.2, H5 is estimated at +10 B gz against 41 B headroom on
signals (post-H4 baseline 1809 B). **No `🔴 ESCALATE TO USER`
condition triggered for signals.** The investigator's upper-bound
estimate of +25 B also fits.

### §15.2 Arbor cascade — CONDITIONAL ESCALATION

🟡 **CONDITIONAL ESCALATION:** if `bun scripts/size.ts` reports
`@scribe/arbor` > 2200 B after H5 lands, the Builder STOPS and surfaces
to Architect with the following options:

> **Option A.** Investigate arbor's tree-shaking. The H5 type-guards
> in `markOne` may be inlined into arbor's bundle; verify via
> rolldown's `--inspect` or equivalent.
>
> **Option B.** Raise arbor cap from 2200 B to 2230 B. This is a
> +30 B raise; user approval required per Director-note hard line.
>
> **Option C.** Refactor the H5 type-guards to share more code with
> the H4 outer-loop body (e.g. extract a helper `dedupOnMerge(sub):
> boolean`). Builder-time optimisation, not a spec change.

**Architect's expectation:** arbor lands at 2181–2191 B (within cap)
because rolldown's tree-shaker drops the Linear branch on the arbor
side — arbor's effects construct as Merge, so the Linear-fall-through
path is unreachable from arbor's call patterns and DCE'd.

### §15.3 If H5 misses (Verifier reports > 3.10 µs OR memory > 5.00 KB)

Per Director-note §"Iteration budget":

- **1st miss (time soft band 3.00–3.10 µs):** Director's call. Likely
  ship-as-soft-pass with `[bench-bump]` justification.
- **1st miss (time hard fail > 3.10 µs):** Architect re-specs with
  refinements (likely combining H5 with a recompute-walk follow-up).
- **1st miss (memory soft band 2.00–5.00 KB):** Director's call.
  Likely ship; informational confirmation via Investigator §6.4
  per-Sub check.
- **1st miss (memory hard fail > 5.00 KB):** Investigator §1.1's
  per-instance closure diagnosis is confirmed; surface to user that
  alien parity requires v2 redesign (Surface-to-User #5). Round 6
  scopes the v2.

### §15.4 If H5 hard fails (rank break OR ≥ 3.41 µs OR existing test fails)

Per Director-note §"Iteration budget — 'Miss' definition" #2: Builder
reverts. Architect re-specs. Does NOT count toward 3-miss budget.

The Verifier MUST flag rank-break separately from absolute-floor-break.

### §15.5 If existing test must be modified (forbidden)

🔴 **HARD ESCALATE TO USER.** Per §13.1.

### §15.6 If `signal.ts:285–287` cascade-suppression settle must be modified (forbidden)

🔴 **HARD ESCALATE TO USER.** Per §13.2.

### §15.7 If MERGE bit must be exposed in public API (forbidden)

🔴 **HARD ESCALATE TO USER.** Per §13.7.

### §15.8 If the §8 Subscriber interface split breaks downstream consumer typing

🟡 **CONDITIONAL ESCALATION.** If `bun typecheck` post-H5 reports
type errors in `@scribe/arbor`, `@scribe/runtime`, `@scribe/agent`,
or any other workspace package, the Builder STOPS and surfaces to
Architect. Likely cause: an external consumer narrowed against the
old `Subscriber` shape and the new union confuses TS inference.
Resolution: tighten the public API surface so the typed split stays
internal (preferred); or update the consumer's type usage in a
follow-up PR (less preferred).

---

## §16 Summary table — files touched

| File | Change | Lines affected | §-reference |
|---|---|---|---|
| `packages/signals/src/signal.ts` | Interface split (§8); `MERGE = 0x040` constant; linkAdd MERGE-1 upgrade; markOne site A/B/chase-inner guards; checkDirty site D guard; drainBatch site C guard; signal-host literal flags+lastWave | ~25–35 lines net change | §5.1, §3, §6, §8 |
| `packages/signals/src/effect.ts` | Effect literal `flags: EFFECT | MERGE` + `lastWave: 0`; pool reset site E NaN→0 | ~3 lines net change | §5.2 |
| `packages/signals/src/computed.ts` | Type annotation may narrow to `LinearSubscriber`; runtime body unchanged | ~1 line (annotation only) | §5.3 |
| `packages/signals/tests/deep-chain.test.ts` | Append linkAdd MERGE-promotion property test per §9.3 | ~+50 lines appended | §9.3 |

**No other files modified.** Per §5.4 and §13.

---

## §17 References

- Director-note: `.team/v1/director-notes/track-c-round-005.md`
- Predecessor spec: `.team/v1/spec-6.2-phase2.md` (overridden at §13.4)
- Predecessor verification: `.team/v1/verification-report-6.2-phase2.md`
- Investigation: `.team/v1/investigation-6.2-phase2-h5.md` (Q1–Q6
  verdicts; cited inline)
- Reference impl context: `bench/signals/node_modules/alien-signals/
  esm/system.mjs` (alien's typed shape model — informational)
- Source state at spec time:
  - `packages/signals/src/signal.ts` (post-H4 head `378d494`;
    Subscriber interface 22–34, flag constants 36–51, linkAdd
    111–137, markOne 170–217, checkDirty ~244–264, cascade-
    suppression settle 285–287, drainBatch ~338–372, signal factory
    ~413–466)
  - `packages/signals/src/computed.ts` (factory ~55–87, recompute
    finally `:51`)
  - `packages/signals/src/effect.ts` (pool ~21–22, runEffect ~28–38,
    pool reuse path 43–52, factory 54–67)
- Post-H4 bundle baseline: `@scribe/signals` 1809 B (41 B headroom);
  `@scribe/arbor` ~2171 B (29 B headroom). Re-measure post-H5 via
  `bun scripts/size.ts`.
- H4 verification baseline: `deep-propagation-100` 3.41 µs WSL2 p50;
  all shallow ranks held; cellx body-count = 17.

---

*End of spec. Status: READY FOR BUILDER. Surface-to-User #6 (§8
override of §13.4) MUST be acknowledged in Architect's status
report before Builder ships. No `🔴 ESCALATE TO USER` triggered
for signals bundle. Conditional 🟡 escalations defined for arbor
bundle, downstream typing, and miss bands.*
