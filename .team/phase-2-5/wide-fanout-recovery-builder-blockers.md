# Builder blockers — wide-fanout-100 recovery

**Author:** Builder
**Date:** 2026-04-28
**Branch:** `perf/signals-cellx-fix`
**Spec:** `.team/phase-2-5/wide-fanout-recovery-spec.md`
**Status:** **Blocker — Avenue B as specified is structurally incorrect. No code committed for the recovery; spec changes only on the branch.**

## §A Avenue B (leaf-computed inline settle) breaks NOTIFIED dedup

### Observation

The spec's Avenue B leaf detection — `inner.size === 1 && (only.flags & EFFECT) !== 0` — identifies computeds whose only *downstream* subscriber is an effect. The spec assumes these are true leaves and that running their `recomputeIfNeeded` inline during Phase 1 marking is safe.

This assumption is wrong for any computed that has *upstream* dependencies on other computeds. The leaf detection checks the forward (subscriber) direction but says nothing about the backward (dependency) direction.

### Failure modes observed

I implemented Avenue B per spec §4 (with biome lint adjustments — non-null assertions replaced with `for...break` extraction and explicit `inner === undefined` guard, costing ~4 B vs the spec prediction). Tests showed three failures:

1. `computed > diamond graph: each node runs exactly once per signal write` — `evals.l2a` expected 2, received 3.
2. `computed > cellx 4×4 diamond: exactly 17 body executions per signal write` — `counters.l1[i]` expected 1, received 0 (NEVER recomputes).
3. `computed > NOTIFIED dedup: a write reaching the same computed via multiple paths only marks it once` — `bEvals` expected 2, received 1.

### Root cause

The NOTIFIED-dedup test graph is `src → a, src → b, a → c, b → c, c → effect`. Under Avenue B:

- `c.subs.size === 1`, only sub is the effect → leaf path fires on `c`.
- During `setSrc(10)` Phase 1: `markOne(a)` pushes `a` to visited, sets STALE, recurses to `markOne(c)`.
- `markOne(c)` is the leaf path: enqueues effect, then runs `c.recomputeIfNeeded()` **inline during Phase 1**.
- `c`'s recompute reads `a()` (a is STALE, recomputes correctly) and `b()` — **but b has not been marked yet**, so `b()` returns its cached value from before the write.
- `c.cached` becomes `11 + stale_b = 13` instead of `11 + 12 = 23`.
- Phase 1 continues: `markOne(b)` marks b STALE, then recurses to `markOne(c)` → c is NOTIFIED, return early (dedup works).
- Phase 2 settle: visited = `[a, c, b]`. `a.recomputeIfNeeded` early-returns (STALE cleared by inline recompute). `c.recomputeIfNeeded` early-returns. `b.recomputeIfNeeded` early-returns because `b.subs = {c}` and c is a computed, so `hasEffectSub` is false on b (lazy-stale path).
- Phase 3 effect drain: effect runs, reads c() — c is not STALE, returns cached 13. Never reads b. `bEvals` stays at 1.

The cellx 4×4 case is more severe because all four L4 computeds satisfy the leaf detection (each has subs.size === 1 with the effect), so all four take the leaf path, all four read L3 nodes that haven't been marked yet, and the lazy-stale path on L1/L2/L3 means nothing ever reads them again. L1 evals stays at 0.

### Why the spec missed this

The spec §3 framed Avenue B around the wide-fanout-100 graph: 1 signal → 100 computeds → 100 effects, where each computed reads only the source signal. In that graph, the leaf detection coincides with "computed has no computed-deps upstream" — running the computed's body inline during Phase 1 is safe because its only upstream is a primitive signal whose new value is already committed before propagateMark runs.

The spec implicitly assumed the forward `subs.size === 1 && EFFECT` test was equivalent to the backward "no computed deps upstream" property. It isn't. The NOTIFIED-dedup graph and the cellx 4×4 graph both have leaf-detected computeds (`c`, the four `L4`s) whose recomputes depend on still-unmarked siblings.

This is a Phase 2 Finding 3-style structural correctness gap that the spec couldn't have anticipated without enumerating these graph shapes — exactly the kind of surface the spec §8 risk register tries to map but missed in this case.

## §B Why the spec's risk register didn't catch it

§8 row "Leaf fast path misfires on a computed with 1 computed sub (EFFECT=0)" identified the wrong failure mode. It assumed a misfire would mean the leaf path *running* on a node with computed downstream. The actual failure is the opposite: the leaf path fires on a node that *correctly* has effect downstream but has computed *upstream* deps that aren't ready yet.

The spec did not enumerate "the leaf-detected computed has computed deps upstream" as a risk because the wide-fanout-100 graph (the spec's reference workload) cannot exhibit it.

## §C Options for Team Lead

Three paths forward, in increasing order of cost:

### Option 1 — Accept the wide-fanout regression after all
Revert to the merged-cellx state without recovery. Tag the cellx PR with `[bench-bump]` to acknowledge the wide-fanout +20%. Cost: zero engineering. The Builder blocker §A from the cellx work argued real-app graphs (cellx-shaped) win 3.5× while pathological-shape graphs (wide-fanout-100, no diamond fan-in) lose 20%. Net real-app gain remains positive.

**Counter-argument the user already made**: "We don't want regression on that front." Option 1 reverses Decision 1.

### Option 2 — Stack Avenue C (epoch counter) as the recovery
Spec §3 deferred Avenue C because of byte cost (~+20 B gz standalone). After completing the `shallowClearFired` removal here (~−14 B gz) the budget is tight but possibly workable. Avenue C's mechanism (epoch field + epoch-check replacing NOTIFIED Set walks in `clearVisited`) doesn't depend on graph topology — it's a per-node bookkeeping change that affects all workloads uniformly.

Predicted gain on wide-fanout-100: ~−0.5 µs (the Phase 4 clearVisited cost the spec attributed to the leaf path). Predicted gain on cellx: ~0 µs (already minimal Phase 4 cost there). Predicted gain on batched-writes: ~0 µs.

That gets wide-fanout-100 to ~10.3 µs — still over the 9.87 µs gate by ~5%. Would need pairing with another optimization or a gate-renegotiation note.

**Cost**: One new spec, one Builder pass, ~4 hours. Risk of similar correctness surface unmet.

### Option 3 — Restrict leaf detection to "no computed upstream deps"
Modify the leaf detection to also check `computed.hasComputedDeps === false` (a flag the computed sets when it's read for the first time during construction or first read). Wide-fanout-100's computeds satisfy this; the NOTIFIED-dedup `c` and cellx L4 don't. Byte cost: +~10–15 B gz for the flag and check. Combined with `shallowClearFired` removal (−14 B gz), nominally net-zero.

**Risks**:
- The flag must be set/cleared correctly across re-subscription. Currently `hasEffectSub` is one-way (set on first effect read, never cleared). `hasComputedDeps` would need similar discipline.
- Determining "no computed deps" requires observing the dep set during `recompute`. The current `read()` in computed.ts doesn't distinguish source-signal reads from computed reads. Adding a flag bit on the read side requires plumbing — distinguishing the two read paths is a structural change.
- Predicted gain on wide-fanout-100: same as spec §6 (~−1.2 µs to ~9.5 µs), since wide-fanout's graph has the property and the leaf path still fires. Gate-clearance probability ~80%.

**Cost**: Spec revision + Builder pass + plumbing in computed.ts. ~6–8 hours.

### Option 4 — Compose Options 2 + 3
Stack Avenue C with restricted leaf detection. Gets wide-fanout-100 to ~9.0 µs (under gate, near baseline). Full byte budget arithmetic needs re-work; likely needs cap renegotiation.

**Cost**: Largest. ~8–12 hours of spec + Builder + verification.

## §D Builder recommendation

**Option 2 (stack Avenue C)**, with explicit acknowledgment that wide-fanout-100 may land at 10.3 µs and still trip the gate by a small margin. This option:

- Avoids the structural correctness surface that took down Avenue B.
- Is byte-budget feasible after `shallowClearFired` removal.
- Uses a topology-independent mechanism (epoch counters affect all workloads uniformly, not just leaf-shaped ones).
- If it doesn't fully clear the gate, the residual ~0.5 µs over baseline can be discussed as a `[bench-bump]` adjudication on a much smaller margin than the current +20%.

If Team Lead requires gate clearance with confidence, **Option 4** is the path — but it's a spec rewrite + 8-12 hours, not a recovery.

## §E State of the working tree

- No source code has been committed for the recovery. Both `signal.ts` and `computed.ts` are at HEAD (the merged cellx structural rewrite state), tests passing 42/42.
- `.team/phase-2-5/wide-fanout-recovery-spec.md` IS committed (commit `56e0975`) and remains as a record of the Avenue B attempt and its blocker. The spec should be updated or replaced based on Team Lead's option choice.
- The cellx structural rewrite work is unaffected and remains correct.

Per nomos v3.1 §5: this blocker memo IS the deviation-from-prediction artifact for the recovery session. The prediction (wide-fanout 9.5 µs, cellx 1.65 µs, batched-writes 8.0 µs) is moot because the design is structurally incorrect. Future perf Architects: do not ship a leaf-fast-path optimization without verifying the leaf-detected computed has no upstream computed deps.
