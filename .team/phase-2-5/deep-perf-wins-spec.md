# Spec — `@aihu/signals` Deep Perf Wins (size-relaxed)

**Author:** Architect
**Date:** 2026-04-28
**Branch:** `perf/signals-cellx-fix` (HEAD = Phase B `2790610` + Phase C/D bench bookkeeping)
**Status:** Final — Builder may consume.
**Supersedes:** none. **Composes with:** parent spec
`.team/phase-2-5/cellx-structural-rewrite-spec.md` (the §9 deferred-wins
menu) and the wide-fanout-recovery-v2 build (Avenue C wave counter +
restricted leaf path; commits `235312a` and `2790610`).

This spec is binding. It is **size-relaxed**: the bundle hard cap is
raised to **1500 B gz** (from 1024 B) per Team Lead authorization. The
public `@aihu/signals` API surface is unchanged; every win is internal.
Phase 3's `phase-3/arbor-implementation` worktree is concurrent — this
spec touches **no** files under `packages/arbor/` and **no** files under
`bench/signals/` (other than auto-regenerated `RESULTS.md` /
`CHANGELOG.md` rows).

References:
- Parent spec: `.team/phase-2-5/cellx-structural-rewrite-spec.md` §9
  (deferred wins menu), §3 (perf model), §10 (acceptance template).
- Builder deviation memo (machine baseline): `.team/phase-2-5/wide-fanout-recovery-v2-builder-blockers.md` §2–§4.
- Bench: `bench/signals/RESULTS.md` (2026-04-28), `bench/signals/CHANGELOG.md`.
- Phase 2 surface contract: `.team/phase-2/spec-signals.md`.
- Current implementation HEAD: `packages/signals/src/{signal,computed,effect,batch}.ts`.
- alien-signals reference: `bench/signals/node_modules/alien-signals/esm/system.mjs`.

---

## §1 Goal and gates

### §1.1 Primary goal

Maximise **wide-fanout-100 ops/s on the Builder's machine.** Current p50
12.59 µs (76 K ops/s); alien-signals on the same machine measures
~8.26 µs (119 K ops/s). The aspirational target is parity with alien
on this machine. The hard target is a meaningful step toward parity:
≥ 95 K ops/s p50 (≤ 10.5 µs), with stretch to ≥ 110 K ops/s
(≤ 9.1 µs).

### §1.2 Hard gates (no-regression contracts)

| Workload | Builder-machine current p50 | Hard gate | Source |
|---|---:|---:|---|
| cellx | 1.64 µs | **≤ 1.74 µs** (current + 6 % noise band) | builder-blockers §2 |
| batched-writes-100 | 9.21 µs | **≤ 9.6 µs** (current + 4 % noise band) | builder-blockers §2 |
| wide-fanout-100 | 12.59 µs | **≤ 10.5 µs** (target improvement) | this spec §1.1 |
| Bundle gz | 1015 B | **≤ 1500 B** (Team-Lead-raised cap) | user directive |
| Test suite | 42 / 42 pass | **42 / 42 pass** + new tests | parent §5 |
| cellx body-count | 17 evals/op | **17 evals/op** (structural minimum) | parent §3.1 |

The cellx and batched-writes gates are *no-regression-with-noise-band*,
not improvement gates — they are the contracts the user explicitly
called out. The wide-fanout gate is the *target* this spec exists to
clear.

### §1.3 Aspirational targets (per phase end-state)

- Wide-fanout-100 p50 ≤ 9.1 µs on Builder's machine (≥ 110 K ops/s),
  approaching alien-signals' 8.26 µs / 119 K ops/s.
- Cellx p50 ≤ 1.55 µs (modest improvement, not regression).
- Batched-writes-100 p50 ≤ 9.0 µs (modest improvement).
- Bundle gz ≤ 1400 B (100 B headroom under cap).

### §1.4 Public API surface

**Unchanged.** `signal`, `computed`, `effect`, `batch`, `$state`,
`SignalError`, `SignalCircularError`, plus the type re-exports listed
in `packages/signals/src/index.ts:1–11` ship verbatim. Every change in
this spec is `/** @internal */`. The Phase 2 verification matrix
(`.team/phase-2/verification-report.md` Gate 3) remains valid.

### §1.5 Relationship to concurrent Phase 3 arbor work

Arbor lives on `phase-3/arbor-implementation` (separate worktree) and
consumes `@aihu/signals` only through the public surface. Because
this spec preserves that surface bit-for-bit, **the two branches do
not need to coordinate.** This spec MUST NOT touch:
- `packages/arbor/` (any file)
- `packages/signals/src/index.ts` (the surface manifest)
- `packages/signals/src/state.ts`, `errors.ts` (untouched leaves)

---

## §2 Phase plan (sequenced)

Five phases, each independently revertable. Phases 0–2 are the
load-bearing wins; Phases 3–4 are exploration with explicit
"defer-with-rationale" exits.

### Phase 0 — Single-sub fast path (parent §9.1, partial)

**Status check.** The parent spec §9.7 lists "§9.1 single-sub fast
path" as *shipped* in the cellx rewrite, but the current code at
`signal.ts:220` and `computed.ts:33` still allocates
`new Set<Subscriber>()` unconditionally, and `Subscriber.subs` is
typed `Set<Subscriber>` (`signal.ts:7`). **The single-sub fast path
was deferred at implementation time and is not present at HEAD.** This
spec ships it as Phase 0.

**Mechanism.** Replace `subs?: Set<Subscriber>` with a tagged union:

```
type SubsField =
  | undefined          // 0 subs (no field set)
  | Subscriber         // 1 sub (direct ref)
  | Subscriber[]       // 2+ subs (array, length grows; degenerates to Set above N)
```

Phase 0 ships only the **null / single-ref / Set** triplet (no inline
array yet). The Set fallback engages at the *first* second sub.
Phase 1 below extends to the 2-element-array tier.

Internal helpers gain a uniform shape:
- `subAdd(host, sub)`: null → single; single → Set([single, sub]);
  Set → Set.add.
- `subDelete(host, sub)`: inverse.
- `subSize(host)`: 0 / 1 / Set.size.
- `subForEach(host, fn)`: dispatches over the shape.
- `subOnlyIfSingle(host)`: returns the lone Subscriber when shape is
  single, else `undefined`. Used by `markOne`'s restricted leaf path.

`Subscriber.subs` becomes `subs?: Subscriber | Set<Subscriber>` (the
internal type widens; not exported). The host (signal closure /
computed node) holds the field directly; we no longer pre-allocate a
Set on construction.

**Predicted speedup.**

Reference machine (parent spec §3.5 baseline, V8 fast-iterate Set vs
direct ref):
- wide-fanout-100: each of 100 computeds has 1 effect sub. Phase 1
  mark walks `subs` once per computed → 100 Set-iterator allocations
  saved. Per-iter cost ~25 ns × 100 = 2.5 µs. Plus 100 Set construction
  costs avoided at construction time (not in the bench hot loop, so 0
  µs benefit there).  Predicted: 8.97 → 7.0 µs (~−22 %).
- cellx: 16 computeds + 1 effect = 17 nodes. ~half have a single sub
  (L4 → effect; L1 → 2 subs). The fast path catches ~9 nodes ×
  ~25 ns = 0.22 µs. Predicted: 1.61 → 1.45 µs (~−10 %).
- batched-writes-100: signal has 1 effect sub. Whole hot loop avoids
  Set entirely. ~30 ns × 100 batched-writes = 3 µs (the per-write
  enqueue path). But the current `[...subs]` snapshot allocation is
  the dominant cost at 100 entries × ~10 ns + GC pressure.
  Predicted: 7.99 → 6.8 µs (~−15 %).

Builder machine (apply Builder's deviation memo offsets — wide-fanout
+40 % offset, cellx +2 %, batched +15 %):
- wide-fanout-100: 12.59 → ~9.8 µs (range 9.4–10.5).
- cellx: 1.64 → ~1.48 µs (range 1.42–1.55).
- batched-writes-100: 9.21 → ~7.8 µs (range 7.5–8.2).

**Size cost.** ~80 B gz arithmetic (parent §9.1 budget). The 5
helpers compile to small switch-on-typeof + Array.isArray checks. Net:
1015 → ~1095 B gz.

**Risks.**
- V8 megamorphism on `subs`'s tagged shape. Mitigation: use
  `instanceof Set` as the late branch; keep "is array" check tight via
  `Array.isArray` (V8 specialises this). Alternative: drop the inline
  array and stay null/single/Set (Phase 0 final form; Phase 1 extends).
- The just-landed restricted leaf path in `markOne`
  (`signal.ts:93–104`) reads `inner.size === 1` and iterates `inner`.
  After Phase 0, `inner` is `Subscriber | Set<Subscriber>`. The leaf
  branch becomes `if (subs is Subscriber single)` — *cheaper than the
  pre-Phase-0 size+iterate dance*. **Composability: positive.**
- Cycle-throw recovery (`signal.ts:149–155 clearVisited`) walks
  `effectQueue`, not `subs` — unaffected.
- Test impact: `properties.test.ts` writes 50× to a signal with 1
  effect sub; the single-sub path is exercised throughout.
  `computed.test.ts:262 cellx 4×4` exercises the Set fallback (L1
  computeds have 2 subs). Both must pass.

**Composability with prior phases.**
- Avenue C wave counter (HEAD): `markOne` iterates `inner` once;
  Phase 0 collapses the iteration to a direct ref read for size 1.
  No interaction with `lastWave` or `wave++` semantics.
- Restricted leaf fast path (HEAD): the `inner.size === 1` check
  becomes `(subs as Subscriber).flags !== undefined` (or analogous
  shape branch). The HAS_COMPUTED_DEPS guard is unaffected.

---

### Phase 1 — Inline 2-element array tier (parent §9.1, full)

**Mechanism.** Extend Phase 0's tagged union:

```
type SubsField =
  | undefined          // 0
  | Subscriber         // 1
  | [Subscriber, Subscriber]   // 2 — fixed-length tuple, NOT a growing array
  | Set<Subscriber>    // 3+
```

The 2-element tier is a bare 2-slot tuple; it does NOT grow. On adding
a third sub, promote to Set. On removing one of two, demote to single.
This keeps each shape monomorphic at its hidden class, and the array
tier never has holes.

`subForEach` for the 2-tuple does `fn(a[0]); fn(a[1])` (no loop, no
iterator). `subSize` returns 2 directly.

**Predicted speedup.**

Reference machine:
- cellx: L1 has 2 subs (2× L2), L2 has 2 subs, L3 has 2 subs, L4 has
  1 sub (effect; covered by Phase 0). The 12 nodes with 2 subs each
  iterate the tuple in ~6 ns vs ~25 ns for Set. Saves 12 × 19 ns ≈
  0.23 µs. Predicted: 1.45 → 1.22 µs (~−16 %).
- wide-fanout-100: every node has exactly 1 sub. **No Phase 1 win.**
- batched-writes-100: 1 effect sub. **No Phase 1 win.**

Builder machine:
- cellx: 1.48 → ~1.25 µs.
- wide-fanout-100: 9.8 → 9.8 µs (flat).
- batched-writes-100: 7.8 → 7.8 µs (flat).

**Size cost.** ~25 B gz over Phase 0 (Array.isArray + length-2
specialisation in helpers). Net: ~1095 → ~1120 B gz.

**Risks.**
- Hidden-class churn: a node that bounces 1 → 2 → 1 → 2 reshapes its
  `subs` field. V8 stabilises after a few transitions; for the cellx
  graph (constructed once, reads many) this is a non-issue.
- The 2-tuple is `[a, b]` — a real Array. V8 may pick PACKED_ELEMENTS
  kind. Avoid pushing/popping (which can create HOLEY); always
  promote/demote by allocating a fresh tuple of the new size.
- Test impact: the cellx 4×4 test directly exercises this tier; all
  diamond tests do. `properties.test.ts` only constructs single-sub
  graphs, so it doesn't stress Phase 1.

**Composability.** Phase 1 *only* adds a tier between Phase 0's single
and Set. The restricted leaf path's "single sub" branch is unaffected;
it sees the 2-tuple shape and falls through to `propagateMark(inner)`,
exactly as it does today for Set.

---

### Phase 2 — Linked-list dep graph (parent §9.4)

**Mechanism.** Replace the forward-only `subs` field with a doubly-
linked-list graph of `Link` nodes. Each Link records one (dep, sub)
edge:

```
interface Link {
  dep: Subscriber          // the upstream node (signal-host or computed)
  sub: Subscriber          // the downstream observer
  prevSub: Link | null     // prev edge in dep.subs list
  nextSub: Link | null     // next edge in dep.subs list
  prevDep: Link | null     // prev edge in sub.deps list
  nextDep: Link | null     // next edge in sub.deps list
}
```

Each host (signal closure, computed node) gets two heads:
- `subsHead: Link | null` (forward edges — observers of this node)
- `subsTail: Link | null`
- `depsHead: Link | null` (back edges — what this observer reads)
- `depsTail: Link | null`

Per-edge cost: 1 Link object = ~6 fields. Per-node cost: 4 head/tail
slots replacing the `subs` field (net +24 B per node closure).

**Why this is the load-bearing win for wide-fanout.** alien-signals'
8.26 µs on this machine vs aihu's 12.59 µs is largely the difference
between `Set.add` / iterator-walk and Link push / pointer-walk. A
single forward edge walk in alien is `for (let l = head; l; l = l.nextSub)`
— no iterator allocation, no hash lookup. On wide-fanout-100, that's
100 walks reduced to a 100-step pointer chase. Estimated win:
1.5–2.5 µs on this workload alone.

**Pseudocode for the markOne hot loop (post-Phase-2):**

```
markOne(sub):
  if sub.flags & DISPOSED: return
  if sub.lastWave === wave: return
  if sub.flags & RUNNING: throw SignalCircularError
  sub.lastWave = wave
  sub.flags |= MARKED
  if sub.flags & EFFECT:
    effectQueue.push(sub)
    return
  visited.push(sub)
  sub.flags |= STALE
  // Restricted leaf path (preserved): single forward edge → inline settle
  const head = sub.subsHead
  if head !== null && head.nextSub === null && !(sub.flags & HAS_COMPUTED_DEPS):
    if head.sub.flags & EFFECT:
      markOne(head.sub)
      sub.recomputeIfNeeded?.()
      return
  // General fan-out walk (replaces propagateMark over a Set)
  for (let l = head; l !== null; l = l.nextSub) markOne(l.sub)
```

The `for (let l = head; l; l = l.nextSub)` loop is V8-monomorphic and
allocates nothing.

**Sub-add path (signal.read / computed.read):**

```
addEdge(dep, sub):
  // Skip if edge already exists (sub-side fast path: walk sub's deps?
  // O(deps) is bad for wide-fanout where sub has 1 dep). Instead use a
  // wave-marker: each dep stores the wave it was added on the current
  // recompute, and skip-add if matched. See §2.5 below for cost.
  if sub.lastDepWave === recomputeWave && depAlreadyLinked(...): return
  link = { dep, sub, prevSub: dep.subsTail, nextSub: null,
           prevDep: sub.depsTail, nextDep: null }
  if dep.subsTail: dep.subsTail.nextSub = link else dep.subsHead = link
  dep.subsTail = link
  if sub.depsTail: sub.depsTail.nextDep = link else sub.depsHead = link
  sub.depsTail = link
```

**Dedup of repeat-reads within one recompute.** The current code uses
`subs.has(observer)` (`computed.ts:91`) to dedup. With a linked list,
the equivalent is "walk sub's deps list looking for `dep`." That's
O(D) per read where D = deps count. For a computed reading the same
signal twice, D=1 → cheap. For a computed reading 4 signals, D=4 →
still fine. **For pathological D, this is worse than the Set
solution.** Mitigation: keep a per-recompute "last linked dep" pointer
on the observer; if the new read matches, skip immediately. This
catches the common case (read the same signal twice in a row) at O(1).

**Unsubscribe-on-dispose.** When an effect or computed disposes, walk
its `depsHead → depsTail`, splice each Link out of its `dep.subsList`.
O(deps), once. Since the current code never removes subs (effects
flag DISPOSED but stay in the Set forever, leaking until the host GC
collects), this is **strictly an improvement** — Phase 2 introduces
real unsubscribe.

**Predicted speedup.**

Reference machine:
- wide-fanout-100: 100 forward-walk steps replace 100 Set iterations.
  Per step ~3 ns (pointer chase) vs ~20 ns (Set iterator step + ref
  unbox). Saves 100 × 17 ns = 1.7 µs. **Predicted on top of Phase 0+1:
  ~7.0 → ~5.3 µs (~−24 %).**
- cellx: 17 nodes × ~5 ns avg saving (some 1-edge, some 2-edge walks)
  ≈ 0.085 µs. **Predicted: 1.22 → 1.13 µs (~−7 %).**
- batched-writes-100: 1 forward edge. ~negligible saving on the mark
  step; main saving is at the per-write enqueue path's
  `subs.size === 0` short-circuit (now `subsHead === null`, slightly
  faster). **Predicted: ~6.8 → 6.7 µs (flat).**

Builder machine (apply offsets):
- wide-fanout-100: 9.8 → ~7.5 µs (range 7.0–8.2). **At parity-or-
  better with alien-signals (8.26 µs).**
- cellx: 1.25 → ~1.15 µs (range 1.10–1.22).
- batched-writes-100: 7.8 → 7.7 µs (flat).

**Size cost.** ~180 B gz arithmetic:
- 4 head/tail slots per node (2 hosts × 2 lists) — ~30 B in the
  closure shape.
- Link object literal + edge add/remove helpers — ~120 B.
- Forward-walk replacement (drops Set.iterator, drops `[...subs]`
  spread in any remaining sites) — saves ~30 B.

Net: ~1120 → ~1300 B gz. **Bundle headroom: ~200 B under 1500 cap.**

**Risks.**
- **Dedup-on-read regression.** The Set's O(1) dedup is replaced with
  O(D) list-walk. For computeds reading 5+ unique signals, this is a
  perf regression on the read path. Mitigation: per-recompute
  "last linked" pointer (~5 ns saving on common case, falls back to
  list walk). Tests: `properties.test.ts:74` reads 1 signal in a
  computed; `computed.test.ts:415` reads c1 + c2 in an effect (D=2
  for the effect). All still O(D) ≤ 2 → fine.
- **Cycle-throw stack hygiene.** The current `clearVisited` walks
  `visited` and `effectQueue`. After Phase 2, the *partially-built*
  Link list during a thrown propagate may need cleanup. **Per parent
  §2.9, the throw fires during the first re-entrant `read()` of a
  RUNNING observer; that `read()` happens before the new edge is
  spliced.** So the throw cannot leave a dangling Link.
  **Verification: a property-based test must enumerate this.** See
  §4.3.
- **Bundle gz growth.** ~180 B is the largest single phase. If
  gz_actual exceeds gz_predicted by > 50 B, the Builder
  proportionally drops Phase 2's "per-recompute last-linked dep"
  optimisation (~25 B), accepting the slightly slower dedup.
- **V8 hidden-class stability.** Each Subscriber gains 4 new fields
  (`subsHead`, `subsTail`, `depsHead`, `depsTail`); each Link is a
  fresh object literal. Test: confirm no megamorphic deopts in the
  mark loop via `--print-opt-code` if perf is below prediction.

**Composability.**
- **Avenue C wave counter:** unchanged. `lastWave` is per-Subscriber;
  the wave counter is module-global. Both compose orthogonally.
- **Restricted leaf path:** the leaf check becomes "single forward
  edge AND that edge points at an effect." The pseudocode above
  preserves the exact spec §3 sufficiency invariant. The
  `HAS_COMPUTED_DEPS` flag is set in `computed.read` exactly as today
  (line `computed.ts:97`), at the same trigger site (computed-observer
  reading a computed source).
- **Phases 0–1 (sub-shape variants):** Phase 2 *replaces* the tagged
  union with the linked list. Phases 0–1 are removed when Phase 2
  ships. **Sequencing decision: Phase 2 makes Phase 0 + 1 obsolete in
  the final tree, but landing them first delivers 60–70 % of the
  perf win at 30 % of the byte cost, and lets us measure each
  phase's contribution independently.** See §6.4 for the alternative
  ("ship Phase 2 directly without Phase 0/1"). The Architect's call:
  ship 0 → 1 → 2 in sequence so deviation measurement per nomos §5
  is per-phase-clean. The Builder MAY collapse 0+1+2 into one
  refactor commit *if and only if* §3's deviation tracking is
  recorded as a single combined prediction.

---

### Phase 3 — Pre-allocated effect run pool (parent §9.5) — **DEFER WITH RATIONALE**

**Investigation outcome (Architect's analysis).** None of the three
benchmarks construct/dispose effects in their hot loop:
- `cellx`: constructs 16 computeds + 1 effect *once*, then writes the
  source 5000 times. Effect is never disposed.
- `wide-fanout-100`: constructs 100 computeds + 100 effects once, then
  writes the source. Effects never disposed.
- `batched-writes-100`: constructs 1 effect once.

Therefore §9.5's effect pool **cannot show a measurable win on any of
the three workloads**, and the predicted impact is < 0.5 % (well below
the 5 % threshold).

The user's directive includes "investigate and ship where they pay
off." For §9.5: **investigated, does not pay off on the three benches.**

**Possible future driver:** arbor's mount/unmount churn. Per parent
§9.5, this is the kind of workload that exercises pooling. **Decision:
defer to a follow-up perf session driven by a new arbor-shaped bench**
(adding such a bench is out of scope per the "no bench harness
changes" hard stop). Surfaced to Team Lead in §6.

**No code changes in Phase 3.**

---

### Phase 4 — Topological sort + run-effects-in-graph-order (parent §9.6) — **DEFER WITH RATIONALE**

**Investigation outcome.** None of the three benchmarks have *shared
upstream computeds with multiple effect descendants* in a shape that
would benefit from topological ordering:
- `cellx`: 1 effect — ordering of 1 element is trivially correct.
- `wide-fanout-100`: 100 effects, but each effect has its own private
  c[i]; no shared upstream between effects.
- `batched-writes-100`: 1 effect.

The shape that *would* benefit is "1 signal → c1 → {effA, effB}
where effA's body also reads c1 again" — and *even there*, aihu's
two-phase mark/settle/drain (parent §2.4) already ensures c1 is
fresh before either effect runs (settle phase runs all visited
computeds before any drain effect runs). **Topological ordering of
effects within the drain queue would only matter if effect A *writes a
signal* that effect B reads** — and the Phase 2 batch contract
already handles that via `MAX_BATCH_ITERATIONS` re-flush.

Therefore §9.6's predicted impact on the three benchmarks is **0 %.**

**No code changes in Phase 4.** Surfaced to Team Lead in §6 with the
question: should we add a "shared-upstream-effects" bench shape that
*would* exercise this, before deciding to defer permanently? If yes,
it's a separate spec (bench harness change, out of scope here).

---

## §3 Performance prediction (binding for nomos §5 deviation tracking)

### §3.1 Per-phase, per-workload predictions

| Phase | Workload | Ref-machine p50 (predicted) | Builder-machine p50 (predicted) | Variance ±2σ | Deviation tolerance |
|---|---|---:|---:|---:|---:|
| Baseline (HEAD) | cellx | 1.61 µs | 1.64 µs | ±0.06 | — |
| Baseline (HEAD) | wide-fanout-100 | 8.97 µs | 12.59 µs | ±1.5 µs | — |
| Baseline (HEAD) | batched-writes-100 | 7.99 µs | 9.21 µs | ±0.8 µs | — |
| **Phase 0** end | cellx | 1.45 µs | 1.48 µs | ±0.08 | **±15 %** ⇒ 1.26–1.70 µs |
| **Phase 0** end | wide-fanout-100 | 7.0 µs | 9.8 µs | ±0.7 µs | **±10 %** ⇒ 8.8–10.8 µs |
| **Phase 0** end | batched-writes-100 | 6.8 µs | 7.8 µs | ±0.4 µs | **±10 %** ⇒ 7.0–8.6 µs |
| **Phase 1** end | cellx | 1.22 µs | 1.25 µs | ±0.07 | **±15 %** ⇒ 1.06–1.44 µs |
| **Phase 1** end | wide-fanout-100 | 7.0 µs (flat) | 9.8 µs (flat) | ±0.7 µs | **±10 %** ⇒ 8.8–10.8 µs |
| **Phase 1** end | batched-writes-100 | 6.8 µs (flat) | 7.8 µs (flat) | ±0.4 µs | **±10 %** ⇒ 7.0–8.6 µs |
| **Phase 2** end | cellx | 1.13 µs | 1.15 µs | ±0.07 | **±15 %** ⇒ 0.98–1.32 µs |
| **Phase 2** end | wide-fanout-100 | 5.3 µs | 7.5 µs | ±0.6 µs | **±15 %** ⇒ 6.4–8.6 µs |
| **Phase 2** end | batched-writes-100 | 6.7 µs | 7.7 µs | ±0.4 µs | **±10 %** ⇒ 6.9–8.5 µs |

### §3.2 Per-machine derivation

The Builder-machine column is derived from the reference column using
the per-workload offsets observed in the `wide-fanout-recovery-v2`
build:

| Workload | Builder offset | Derivation |
|---|---:|---|
| cellx | +2 % | builder-blockers §2 |
| wide-fanout-100 | +40 % | builder-blockers §2; explicit "+2.1 µs ≈ +19 %" + V8 noise → ~+40 % at the absolute level (12.59 µs vs ref 8.97 µs) |
| batched-writes-100 | +15 % | builder-blockers §2 |

These offsets are applied multiplicatively to each phase's predicted
reference number. The variance is preserved in absolute µs.

### §3.3 Deviation tolerance — nomos §5 Rule 3 binding

Per nomos §5 Rule 3, the Builder tracks deviation per phase. **The
deviation tolerance column above is the threshold that triggers a
Builder check-in with Team Lead.** Specifically:

- If observed p50 ≤ predicted + tolerance: **PASS, no check-in needed.**
- If observed p50 > predicted + tolerance: **HALT, write a
  builder-blocker note, escalate to Team Lead.**
- If observed p50 < predicted − tolerance: **PASS, but note the
  surprise in the bench changelog (over-delivery is fine; we want to
  understand why).**

The tolerance bands are wider for cellx (±15 %) than for the larger
workloads (±10 %) because cellx's absolute p50 is small, so V8 noise
dominates a larger fraction.

The wide-fanout Phase 2 tolerance is widened to ±15 % to account for
the linked-list rewrite's higher V8-warmup variance (the new mark
loop is a hot path and may take 2–3 bench iterations to stabilise its
inline cache).

### §3.4 Bundle size predictions

| Phase end-state | Predicted gz | Cap | Headroom |
|---|---:|---:|---:|
| Baseline (HEAD) | 1015 B | 1500 B | 485 B |
| Phase 0 end | ~1095 B | 1500 B | 405 B |
| Phase 1 end | ~1120 B | 1500 B | 380 B |
| Phase 2 end | ~1300 B | 1500 B | 200 B |

If any phase's measured gz exceeds prediction by > 50 B, Builder
applies the per-phase fallback noted in that phase's "Risks" subsection.

### §3.5 Sanity-check predictions vs alien-signals

After Phase 2:
- **wide-fanout-100:** aihu ~7.5 µs (Builder machine) vs alien
  ~8.26 µs. Aihu at parity-or-better. Goal cleared.
- **cellx:** aihu ~1.15 µs (Builder machine) vs alien ~1.63 µs.
  Aihu **ahead** (alien runs the same Set-equivalent linked-list but
  has slightly heavier per-eval path).
- **batched-writes-100:** aihu ~7.7 µs vs alien ~9.81 µs. Aihu
  **ahead.**

If the actual numbers come in within ±2σ of these predictions, the
spec succeeds.

---

## §4 Test plan

### §4.1 The 42 existing tests — all must pass at every phase

| File | Tests | Stress focus per phase |
|---|---:|---|
| `signal.test.ts` | 8 | All phases — exercises 1-sub (Phase 0), no-sub (Phase 0 null shape), dispose. |
| `effect.test.ts` | 7 | Phases 0–2 — fan-out test stresses 2-tuple (Phase 1) and Set (pre-Phase-2) / Link list (post-Phase-2). |
| `computed.test.ts` | 14 (+ Phase 2 Finding 3 quartet, cellx 4×4, NOTIFIED-dedup, mixed-subs) | All phases — diamond test exercises 2-tuple. cellx 4×4 stresses Phase 2's edge-add dedup. |
| `batch.test.ts` | 8 | Phases 0–2 — batch drain interacts with subs shape; effect-writes-during-flush re-triggers edges. |
| `state.test.ts` | 4 | Phases 0–2 — `$state` delegates to `signal`, indirectly exercises the shape. |
| `properties.test.ts` | 4 fast-check + 1 sanity | Phases 0–2 — 50× write to single-sub signal stresses Phase 0 hot path with random inputs. |

**Builder MUST NOT modify any existing test.** Halt if any fails.

### §4.2 New tests per phase

#### Phase 0 — single-sub fast path

Append to `tests/signal.test.ts`:

```ts
it('subs shape: 0 → 1 → 2 → 3+ transitions all reach the right subscribers', () => {
  // Uses 4 effects on the same signal; assert each fires on each write.
  // Implicitly exercises null → single → tuple → Set transitions.
})

it('subs shape: dispose-mid-write does not lose remaining subscribers', () => {
  // Effect A disposes itself; effect B (also subbed) must still run.
  // Exercises the snapshot-iteration during shape mutation.
})
```

#### Phase 1 — 2-tuple tier

Append to `tests/computed.test.ts`:

```ts
it('subs shape: promoting from 2-tuple to Set on third sub preserves order', () => {
  // 3 effects subscribed in known order; assert insertion order preserved
  // through the tuple → Set promotion.
})

it('subs shape: demoting from Set to 2-tuple on dispose preserves remaining edges', () => {
  // 3 effects → dispose 1 → assert remaining 2 still fire.
})
```

#### Phase 2 — linked-list dep graph

Append to `tests/properties.test.ts` (these are property tests because
the linked-list invariants are global):

```ts
it('property: every dep edge has a matching sub edge (back-edge invariant)', () => {
  // fast-check: random graph of N ≤ 8 signals + M ≤ 8 computeds + K ≤ 4 effects.
  // After construction, walk every node's depsHead..depsTail; for each Link,
  // assert it appears in dep.subsHead..subsTail (and vice versa).
})

it('property: dispose-effect splices all its dep edges in O(deps) time', () => {
  // Construct then dispose; assert every former-dep's subsList no longer
  // contains the disposed effect.
})

it('property: cycle-throw leaves no partially-spliced Link', () => {
  // Random cycle constructions; for each, after the throw, walk all nodes'
  // dep+sub lists and assert symmetry (no orphan Link).
})

it('property: NOTIFIED-dedup invariant holds with linked-list edges', () => {
  // For random multi-parent diamonds, assert each computed body runs ≤ 1× per write.
})
```

Append to `tests/computed.test.ts`:

```ts
it('linked-list: same-signal-read-twice does not create duplicate edges', () => {
  // computed(() => n() + n()) — assert n.subsHead..subsTail has length 1.
})

it('linked-list: read order preserves dep insertion order across recomputes', () => {
  // Important for the per-recompute "last linked dep" optimisation to work.
})
```

### §4.3 Bench validation per phase

After each phase, run `cd bench/signals && bun src/runner.ts` and
verify:

| Phase | Workload | Expected direction | Risk to confirm |
|---|---|---|---|
| Phase 0 | cellx | improve ≥ 5 % | no regression |
| Phase 0 | wide-fanout-100 | improve ≥ 15 % | **load-bearing** |
| Phase 0 | batched-writes-100 | improve ≥ 10 % | no regression |
| Phase 1 | cellx | improve ≥ 10 % from Phase 0 | no regression |
| Phase 1 | wide-fanout-100 | flat (within ±5 %) | no regression |
| Phase 1 | batched-writes-100 | flat (within ±5 %) | no regression |
| Phase 2 | cellx | improve ≥ 5 % from Phase 1 | no regression |
| Phase 2 | wide-fanout-100 | improve ≥ 20 % from Phase 1 | **primary goal** |
| Phase 2 | batched-writes-100 | flat (within ±3 %) | no regression |

Per nomos §5 Rule 3, missing any "expected direction" by > tolerance
(§3.3) triggers a Builder check-in. The Builder MAY ship a phase
whose tolerance is tight if §3.3's bench-changelog over-delivery
clause applies.

### §4.4 Cellx body-count contract — invariant across phases

`bun .team/phase-2-5/scratch/cellx-counter.ts` must continue to print
**TOTAL = 17** at every phase. This is the structural diamond-glitch
absence test from parent spec §3.1. **Halt if any phase prints
anything other than 17.**

### §4.5 Bundle size validation per phase

`bunx size-limit --json` after each phase. Phase-end gz must satisfy
the §3.4 prediction within ±50 B. If gz exceeds the 1500 B cap at any
phase, Builder applies that phase's "Risks" fallback (Phase 0 has
none — it's the smallest; Phase 1 drops the 2-tuple tier and stays at
Phase 0's shape; Phase 2 drops the per-recompute last-linked
optimisation).

---

## §5 File-level change list

### Phase 0

| File | Action | Function-level scope |
|---|---|---|
| `packages/signals/src/signal.ts` | modify | (a) Widen `Subscriber.subs` type to `Subscriber \| Set<Subscriber>` (line 7). (b) Add 5 module-level helpers `subAdd`, `subDelete`, `subSize`, `subForEach`, `subOnlyIfSingle`. (c) Replace `subs.add(currentObserver)` in `read` (line 225) with `subAdd(host, currentObserver)`. (d) Replace `for (const sub of [...subs])` and `for (const sub of subs)` loops in `write` (line 235) and `propagateMark` (line 113), `shallowClear` (line 122), `markOne`'s leaf branch (lines 95–98), `clearVisited` (lines 150, 153) with `subForEach` / direct dispatch. (e) Update `signal()` factory (line 220) to leave `subs` undefined. (f) Restricted leaf path: replace `inner.size === 1` + iterator (lines 93–98) with `subOnlyIfSingle(inner)` returning the `only` ref or `undefined`. |
| `packages/signals/src/computed.ts` | modify | (a) Replace `const subs = new Set<Subscriber>()` (line 33) with `let subs: Subscriber \| Set<Subscriber> \| undefined` on the closure; pass via the `node.subs` reference. (b) Replace `subs.has(observer) / subs.add(observer)` (line 91–93) with `subAdd(node, observer)` + a "is observer already in subs" check (this is a dedup; current Set has it via `.has`, new shape has it via `subAdd` doing nothing on duplicate). (c) Replace `for (const sub of subs)` (line 80) with `subForEach(node, sub => …)`. (d) Replace `subs.size === 0` (line 65) with `subSize(node) === 0`. |
| `packages/signals/src/effect.ts` | none | Effects don't have `subs` (effects are leaves in the dep graph). No change. |
| `packages/signals/src/batch.ts` | none | Calls `drainBatch` from `signal.ts`; no internal change. |
| `packages/signals/tests/signal.test.ts` | append | 2 new tests per §4.2. |

### Phase 1

| File | Action | Scope |
|---|---|---|
| `packages/signals/src/signal.ts` | modify | Extend `subAdd` / `subDelete` / `subForEach` / `subSize` / `subOnlyIfSingle` to handle the 2-tuple `[Subscriber, Subscriber]` shape between single and Set. The 2-tuple is detected via `Array.isArray(subs)`. `subOnlyIfSingle` returns `undefined` for the tuple shape (not single). The restricted leaf path is unaffected. |
| `packages/signals/tests/computed.test.ts` | append | 2 new tests per §4.2. |

### Phase 2

| File | Action | Scope |
|---|---|---|
| `packages/signals/src/signal.ts` | modify | (a) Replace `Subscriber.subs?: Subscriber \| Set<Subscriber>` with `subsHead?: Link \| null`, `subsTail?: Link \| null`, `depsHead?: Link \| null`, `depsTail?: Link \| null`. (b) Add internal `Link` interface (not exported). (c) Replace `subAdd` / `subDelete` / `subForEach` etc. with `linkAdd(dep, sub)`, `linkUnlink(link)`, and a forward-walk template `for (let l = head; l !== null; l = l.nextSub)`. (d) Update `markOne`'s leaf path to "single forward edge → effect" check (`head !== null && head.nextSub === null`). (e) Update `propagateMark`'s outer caller (signal `write`, line 240) to take a `Link` head instead of a `Set`. (f) Rewrite `shallowClear` to walk the forward Link list. (g) `clearVisited` is unchanged in semantics; `effectQueue.length = 0` clear is unchanged. |
| `packages/signals/src/computed.ts` | modify | (a) `node` gains `subsHead/subsTail/depsHead/depsTail` slots; remove the closure `subs` variable. (b) `read` replaces `subAdd / subSize` with `linkAdd(node, observer)` + a per-recompute "last linked dep" check. (c) `recomputeIfNeeded`'s "for (const sub of subs)" becomes a forward walk over `node.subsHead`. (d) Add a `disposeNode(node)` helper that splices all `node.depsHead..depsTail` Links — but **defer call site to a future spec** unless the existing tests require it (they currently do not assume disposal cleans up; the leak is in HEAD too). |
| `packages/signals/src/effect.ts` | modify | The effect's `node` gains `depsHead/depsTail` slots (the effect *has* deps — every signal/computed it reads). The dispose closure (line 30–32) optionally walks `depsHead..depsTail` and unlinks; gated on the disposal cleanup decision in §6.3. |
| `packages/signals/tests/properties.test.ts` | append | 4 new property tests per §4.2. |
| `packages/signals/tests/computed.test.ts` | append | 2 new tests per §4.2. |
| `bench/signals/RESULTS.md` | regenerate | Auto. |
| `bench/signals/CHANGELOG.md` | append | One row noting the cumulative wins after all 3 phases land. |

### Phase 3 — no file changes (defer-with-rationale)

### Phase 4 — no file changes (defer-with-rationale)

---

## §6 Open questions for Team Lead

### §6.1 Linked-list per-link overhead on the trivial 1-sub case

**Question.** The Phase 2 linked-list adds ~20 ns of pointer-chase
overhead in the *very* hot case of 1-sub-1-dep (which Phases 0+1
already cover with a direct ref). Should we keep the Phase 0/1
"single sub fast path" *as a wrapper over* the linked list (i.e., when
`subsHead === subsTail`, branch to a direct-ref path), or replace
fully?

**Architect's lean.** Replace fully. The linked-list 1-edge case is
already a pointer-chase of length 1; it costs `head !== null` (one
deref) — no measurable gain from a separate fast path, and the byte
cost of preserving it is ~30 B. **Recommendation: drop Phase 0/1's
fast path tier when Phase 2 lands.**

But if benchmarks show Phase 2 *regresses* the 1-edge case below
Phase 0/1, the tiered design is the correct fallback — keep both.
Builder runs the Phase 2 bench, and if wide-fanout-100 is *slower*
than Phase 0 by > 5 %, escalates here.

### §6.2 Should we ship the effect pool (§9.5) anyway, knowing arbor will exercise it?

**Question.** Phase 3 (parent §9.5) was deferred because the three
benches don't exercise mount/unmount churn. **But arbor *will*
exercise it** (component remounts on tree edits). Should we ship the
effect pool now even without bench coverage, on the bet that arbor
will need it?

**Architect's lean.** Defer. Shipping a pool without bench coverage
is speculative-engineering and adds bytes (~50 B). Better to wait for
arbor's bench shape to drive the requirement. If Team Lead disagrees
(prefers prefetch), the cost is +50 B gz; the spec accommodates within
the 1500 B cap.

### §6.3 Dispose-cleanup (linked-list unsubscribe) — bundle size tradeoff

**Question.** Phase 2 makes O(1) edge unlink possible (the Set design
never had it cheaply). Should we ship the dispose-walks-depsList
cleanup for effects and computeds, or leave the leak as today?

**Architect's lean.** Ship the cleanup for **effects only** (fixes a
real leak — long-running apps with many effect remounts). Skip the
cleanup for computeds (less common to dispose; cleanup adds ~25 B).
Cost: ~30 B gz for effect dispose. Tests don't currently assert
absence of leak, so no test changes required, but a property test
*could* be added in §4.2.

### §6.4 Ship Phase 0 + 1 + 2 as one Builder commit, or three sequenced commits?

**Question.** Phases 0, 1, 2 are all "internal sub-graph shape"
refactors. They could land as one PR with one bench run, or as three
sequenced PRs each with its own bench run.

**Architect's lean.** **Three sequenced commits on one PR.** Each
phase has independent revert points (one commit each), each phase
gets its own bench-result row in CHANGELOG, but the PR ships as one
review unit. This satisfies nomos §5 Rule 3 deviation tracking
(per-phase predicted vs actual is recorded) without paying CI cost
for three PRs.

If Team Lead prefers three PRs (slower but cleaner attribution),
that's authorised; the spec is structured to support either.

### §6.5 Should we add a "shared-upstream-effects" bench shape to drive §9.6?

**Question.** Phase 4 (parent §9.6 topological sort) was deferred
because no bench currently exercises the shape that would benefit.
Should we add such a bench (e.g., 1 signal → 1 c → 10 effects, where
effects also read further computeds in different orders) before
deciding to permanently defer §9.6?

**Architect's lean.** Defer the bench addition too. The cellx 4×4
diamond already has shared upstreams (L4→L3→L2→L1 visit 16 of the same
upstream cells); cellx p50 is what would benefit, and the structural-
mark/settle/drain pipeline already orders that work optimally.
Inventing a synthetic workload to demonstrate §9.6's value is busy-
work; defer permanently unless arbor surfaces a real-app shape that
exhibits the diamond-effect-cache-thrash pattern.

### §6.6 Phase 2 sequencing — series or parallel with Phase 0/1?

**Question.** Could Phase 2 (linked-list) be implemented in parallel
with Phase 0/1 (since Phase 2 obsoletes them)?

**Architect's lean.** **Strictly serial.** Phase 0/1 give us
intermediate measurement points to validate the perf model before
committing to Phase 2's larger refactor. If Phase 0 *under-delivers*
on wide-fanout (e.g., < 10 % improvement), that's a signal that the
hot path isn't where we think — Builder halts and re-investigates
*before* spending on Phase 2's 180 B. Skipping Phase 0/1 forfeits this
sanity check.

---

## §7 Acceptance criteria

### §7.1 Per-phase pass/fail

| Phase | Pass criteria (all required) | Fail triggers |
|---|---|---|
| **Phase 0** | (1) 42 tests + 2 new pass. (2) bench: wide-fanout-100 ≥ 15 % improvement on Builder machine vs HEAD; cellx ≥ 5 %; batched ≥ 10 %. (3) gz ≤ 1150 B. (4) cellx-counter = 17. | Any criterion misses by > §3.3 tolerance ⇒ HALT, write builder-blocker. |
| **Phase 1** | (1) 42 + 2 + 2 new pass. (2) bench: cellx ≥ 10 % from Phase 0; others flat ±5 %. (3) gz ≤ 1175 B. (4) cellx-counter = 17. | Any criterion misses by > tolerance ⇒ HALT. |
| **Phase 2** | (1) 42 + 2 + 2 + 6 new (4 properties + 2 unit) pass. (2) bench: wide-fanout-100 ≥ 20 % from Phase 1 (≤ 7.84 µs Builder); cellx ≥ 5 % from Phase 1; batched flat ±3 %. (3) gz ≤ 1500 B. (4) cellx-counter = 17. (5) Property test "every dep has back-edge" passes 50/50 fast-check runs. | Any criterion misses by > tolerance ⇒ HALT. |

### §7.2 Whole-spec acceptance

The spec succeeds iff:

1. All 42 existing unit tests + 10 new tests pass (52 total).
2. cellx p50 ≤ 1.32 µs (Builder machine; Phase 2 ±15 % tolerance).
3. wide-fanout-100 p50 ≤ 8.6 µs (Builder machine; Phase 2 ±15 %).
4. batched-writes-100 p50 ≤ 8.5 µs (Builder machine; Phase 2 ±10 %).
5. Bundle gz ≤ 1500 B.
6. cellx body-count = 17.
7. CHANGELOG row appended with per-phase numbers.
8. No `packages/arbor/` files touched.
9. No `bench/signals/src/` or `bench/signals/HARNESS.md` files touched.
10. No public API surface change (`packages/signals/src/index.ts` unmodified).

### §7.3 Stretch acceptance (aspirational)

If Phase 2 over-delivers:
- wide-fanout-100 p50 ≤ 7.5 µs (parity with alien on this machine).
- cellx p50 ≤ 1.20 µs (ahead of alien on this machine).
- Bundle gz ≤ 1400 B.

Over-delivery on any of the above is logged in the CHANGELOG with
"surprise" annotation per §3.3.

---

## §8 Out of scope

Things considered and rejected, with one-line rationale:

1. **Public API additions** — locked surface; arbor consumes it. Out of scope.
2. **`untrack()` helper** — Phase 3 territory; future Phase 4 spec.
3. **Generation/version counters per signal (parent §9 §2.5.2 hashed-XOR)** — parent spec deferred this; cellx doesn't benefit and arbor's stable-key reads aren't yet bench-driven.
4. **Bench harness changes** — explicit hard stop. The `bench/signals/src/` workload set stays as-is.
5. **Effect pool (parent §9.5)** — investigated, no measurable win on the three benches; deferred per §2 Phase 3.
6. **Topological effect ordering (parent §9.6)** — investigated, no shape in the bench set exercises it; deferred per §2 Phase 4.
7. **Iterative `propagateMark` with explicit stack (parent §3.5 risk 1)** — Phase 2's forward-walk is iterative by construction, so this risk evaporates.
8. **Replacing the wave counter with a per-Subscriber wave id** — already shipped (Avenue C, commit `235312a`). No further work.
9. **Removing the `HAS_COMPUTED_DEPS` flag in favour of a different correctness gate** — the flag works; no reason to change.
10. **Splitting `signal.ts` into multiple files** — bytes-neutral, churn-positive; defer.
11. **TypeScript strict-checking improvements on `Subscriber` shape** — the widened type is `/** @internal */`; no public surface implication.
12. **Adding a `dispose()` for computeds** — see §6.3; effects-only cleanup ships, computed cleanup deferred.
13. **Pure-functional shape (replace closures with classes)** — would change V8 hidden class story; out of scope; orthogonal to this spec.
14. **Inlining the equality comparator on the hot path** — premature; no evidence this is the bottleneck.
15. **Per-phase telemetry / instrumentation** — not requested; arbor's `[trace]` work covers this elsewhere.

---
