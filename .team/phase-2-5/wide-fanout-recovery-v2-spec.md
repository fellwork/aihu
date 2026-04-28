# Spec — wide-fanout-100 recovery v2 (Option 4: stacked)

**Author:** Architect
**Date:** 2026-04-28
**Branch:** `perf/signals-cellx-fix`
**Status:** Final — Builder may consume.
**Supersedes:** `wide-fanout-recovery-spec.md` (Avenue B; rejected per blocker memo)

Canonical post-mortem: `.team/phase-2-5/wide-fanout-recovery-builder-blockers.md`
Parent spec: `.team/phase-2-5/cellx-structural-rewrite-spec.md`
Profile floor: `.team/phase-2-5/cellx-rewrite-builder-blockers.md` §A

---

## §1 Goal

| Workload | Target (ideal) | Hard gate |
|---|---:|---:|
| wide-fanout-100 | ≤ 8.97 µs (recover baseline) | ≤ 9.87 µs |
| cellx | ≤ 1.7 µs | ≤ 1.7 µs |
| batched-writes-100 | ≤ 8.2 µs | ≤ 8.2 µs |
| bundle (gzipped) | — | ≤ 1024 B |

User chose Option 4 (stacked) over Option 2 (Avenue C alone) specifically to clear the gate without `[bench-bump]`. Option 2 was projected at ~10.5 µs (still tripping). Option 4's stacked gain is needed to land near baseline.

---

## §2 Investigation summary

See `cellx-rewrite-builder-blockers.md` §A for the structural-floor profile decomposition (Phase 1 ~1.5 µs / Phase 2 ~3.5 µs / Phase 3 ~3.5 µs / Phase 4 ~0.8 µs = ~9.3 µs floor, of which the Phase 2 body-execution cost is ~2.5 µs and the rest is dispatch overhead).

The wide-fanout-100 graph (1 signal → 100 computeds → 100 effects, 1 effect per computed, each computed reads only the source signal) gains nothing from the mark/settle/drain split — no diamond fan-in, all-1-deep cascades, no shared-effect-sub equality cascades. Phase 2 settle and Phase 4 visited-walk exist purely to service these 100 nodes whose work could happen during Phase 1 marking. Two independent wins are available: (a) collapse Phase 2 dispatch for confirmed-leaf computeds via inline settle, and (b) eliminate the per-wave NOTIFIED bit-clear iteration via wave-counter dedup.

---

## §3 Why Avenue B failed and what Option 4 changes

**Correctness invariant for inline-recompute during Phase 1 marking:**
A computed C is safe to inline-recompute during Phase 1 iff all of C's transitive upstream computed dependencies are either (a) already marked AND already inline-recomputed in this wave, or (b) absent (C reads only source signals).

Avenue B's leaf detection (`inner.size === 1 && (only.flags & EFFECT)`) checks the *forward* (subscriber) direction and gives no information about (a) or (b). The wide-fanout-100 reference workload accidentally satisfied (b), masking the gap. The NOTIFIED-dedup test graph's `c` (reads two computed deps) and the cellx 4×4 L4 nodes (each reads two L3 deps) satisfy the forward test but violate (b) — their inline recompute reads still-unmarked siblings and corrupts the cache.

**Option 4's restricted leaf detection** adds a `HAS_COMPUTED_DEPS` flag on each computed, set true the first time the computed reads another computed during its body. The new leaf test `inner.size === 1 && (only.flags & EFFECT) && !(node.flags & HAS_COMPUTED_DEPS)` is **sufficient (not necessary)** for property (b): a computed with `HAS_COMPUTED_DEPS = false` has never read another computed in any prior recompute, so it cannot have computed upstream deps. The flag is one-way (once true, stays true) — like the existing `hasEffectSub` — so a computed that *was* a non-leaf at any point conservatively forfeits the fast path forever.

**Excluded by the new test (correctness):**
- NOTIFIED-dedup `c` — reads a, b (computeds) → `HAS_COMPUTED_DEPS=true` → leaf path skipped, normal Phase 2 settle runs, c sees freshly-marked a and b. ✓
- Cellx L4 nodes — each reads two L3 nodes → `HAS_COMPUTED_DEPS=true` → leaf path skipped. ✓
- Diamond test L2a — reads l1a, l1b → `HAS_COMPUTED_DEPS=true` → leaf path skipped. ✓

**Permitted by the new test (perf):**
- Wide-fanout-100 computeds — each reads only `src()` (a signal) → `HAS_COMPUTED_DEPS=false` → leaf path fires. ✓
- Any "shallow projection" computed that's a 1-deep derivation of a signal with a single effect downstream.

The new test is conservative — it excludes some computeds that *could* safely take the fast path (e.g., a computed reading only computeds that are themselves leaves and already inline-settled in mark order). Sufficiency over completeness is the right tradeoff: zero correctness surface beats marginal wins on rare graph shapes.

---

## §4 Recommended design

Two stacked optimizations. Implement in the order specified to allow independent revert if a stacked failure occurs.

### Optimization 1 — Avenue C: epoch counter replacing NOTIFIED bit

Replace the `NOTIFIED = 0x40` bit and its 6 set/clear sites with a module-level `wave: number` counter and a per-Subscriber `lastWave: number` field.

**Mechanism:**
- Module-level `let wave = 0` in signal.ts.
- Subscriber interface gains optional `lastWave?: number`.
- At start of each non-batch write and each `drainBatch` iteration: `wave++`.
- Wherever NOTIFIED was set: `sub.lastWave = wave`.
- Wherever NOTIFIED was checked for dedup: `sub.lastWave === wave`.
- Every NOTIFIED clear-loop site (`clearVisited` lines 123, 126; `drainBatch` lines 153, 163; `settleAndDrain` line 112): **deleted**. The next `wave++` invalidates all prior matches with no iteration cost.

**Subtlety:** uninitialized `lastWave` is `undefined`. Since `undefined === 0` is false, the first wave (`wave === 0`) never matches an uninitialized node — safe. After first write, `wave === 1`, also no false match. For an ungifted reader of this code: explicit init at construction would cost +6 B gz; the implicit-undefined path is free and correct.

**Wave wrap-around:** at 2^53 writes the wave counter loses precision. Not a practical concern (decades of continuous writes on a hot signal at MHz rates).

### Optimization 2 — Restricted leaf-computed inline settle

Add `HAS_COMPUTED_DEPS = 0x80` flag bit. In `computed.ts`'s read closure, when called with a non-null `currentObserver` whose `subs !== undefined` (i.e., the observer is a computed, not an effect), set `observer.flags |= HAS_COMPUTED_DEPS` on first establishment of the dep.

In `markOne`, for non-effect non-disposed subs: after pushing to visited and setting STALE, check `inner.size === 1 && only.flags & EFFECT && !(sub.flags & HAS_COMPUTED_DEPS)`. If all three: enqueue the effect via recursive `markOne(only)`, run `sub.recomputeIfNeeded?.()` inline, return. The leaf computed remains in `visited` (Phase 2's iteration over it will be a fast early-return because STALE was cleared by recompute).

**Why keep the leaf in `visited`:** correctness over micro-optimization. Phase 4 still needs to clear MARKED on cycle-throw recovery; an inline-recomputed leaf cleared its own MARKED already, so the clear is idempotent. The Phase 2 walk's early-return on `!STALE` is ~5 ns per node — cheap. Skipping the visited push (as Avenue B v1 attempted) created an exit-from-NOTIFIED bookkeeping problem that took down the original implementation.

**Phase 2 Finding 3 preservation:** When the leaf's recompute body runs equal-to-cached, `shallowClear(subs)` fires inline before the effect drains in Phase 3 — the same ordering the current `recomputeIfNeeded` provides. The effect's MARKED bit clears before drain examines it. Test `computed.test.ts:97-116` passes unmodified.

---

## §5 Pseudocode

### `signal.ts` — module additions

```
/** @internal */ let wave = 0
// NOTIFIED constant deleted
/** @internal */ export const HAS_COMPUTED_DEPS = 0x80
```

### `signal.ts` — `markOne` revised

```
function markOne(sub: Subscriber): void {
  if (sub.flags & DISPOSED) return
  if (sub.lastWave === wave) return            // wave-dedup (was NOTIFIED bit)
  if (sub.flags & RUNNING) throw new SignalCircularError()
  sub.lastWave = wave
  sub.flags |= MARKED
  if (sub.flags & EFFECT) {
    effectQueue.push(sub)
    return
  }
  visited.push(sub)
  sub.flags |= STALE
  const inner = sub.subs
  if (inner === undefined) return
  // Restricted leaf fast path: confirmed source-only deps + 1 effect sub.
  if (inner.size === 1 && !(sub.flags & HAS_COMPUTED_DEPS)) {
    let only: Subscriber | undefined
    for (const s of inner) { only = s; break }
    if (only !== undefined && only.flags & EFFECT) {
      markOne(only)
      sub.recomputeIfNeeded?.()
      return
    }
  }
  propagateMark(inner)
}
```

### `signal.ts` — `shallowClear`, `clearVisited`, `settleAndDrain`, `drainBatch`

- `shallowClear`: delete `shallowClearFired = true` (already in v1 spec; carried forward).
- `settleAndDrain` line 112: delete `sub.flags &= ~NOTIFIED`.
- `clearVisited` lines 123, 126: change `&= ~(NOTIFIED | MARKED)` to `&= ~MARKED`. Delete `shallowClearFired = false`.
- `drainBatch` lines 153, 163: delete `sub.flags &= ~NOTIFIED`. At iteration start (line 140 area), insert `wave++`.
- Top of `signal.write` non-batch path before `propagateMark(subs)`: insert `wave++`.

### `computed.ts` — `read` revised

```
const read: Read<T> = () => {
  if (node.flags & RUNNING) throw new SignalCircularError()
  const observer = peekCurrentObserver()
  if (observer !== null && !subs.has(observer)) {
    subs.add(observer)
    if ((observer.flags & EFFECT) !== 0) hasEffectSub = true
    // Computed-observer reading a computed source: mark observer non-leaf.
    else if (observer.subs !== undefined) observer.flags |= HAS_COMPUTED_DEPS
  }
  if (!hasCached || node.flags & STALE) {
    cached = recompute()
    hasCached = true
  }
  return cached
}
```

### `computed.ts` — `recomputeIfNeeded` cleanup

Delete `shallowClearFired,` from import; delete `if (!shallowClearFired) return` guard line. Re-assert loop becomes unconditional (idempotent no-op when no equality cascade fired).

---

## §6 Byte budget arithmetic

| Change | File | Est. gz delta |
|---|---|---:|
| Restricted leaf path (size+EFFECT+HAS_COMPUTED_DEPS check, 3 calls, return) | signal.ts | +26 B |
| `HAS_COMPUTED_DEPS = 0x80` constant export | signal.ts | +5 B |
| `observer.flags \|= HAS_COMPUTED_DEPS` in computed.ts read | computed.ts | +3 B |
| Avenue C: `let wave = 0` + 2× `wave++` sites | signal.ts | +7 B |
| Avenue C: replace NOTIFIED check with `lastWave === wave` (delta over old check) | signal.ts | +2 B |
| Avenue C: `sub.lastWave = wave` in markOne | signal.ts | +3 B |
| Remove `inner !== undefined &&` dead guard | signal.ts | −4 B |
| Remove `inner.size > 0` guard | signal.ts | −4 B |
| Remove `shallowClearFired` (export, 2 assignments, import, guard) | both | −14 B |
| Remove `NOTIFIED = 0x40` constant | signal.ts | −5 B |
| Remove 6 NOTIFIED clear sites (settleAndDrain, clearVisited ×2, drainBatch ×2, plus consolidation savings under gzip) | signal.ts | −18 B |
| **Net estimated delta** | | **+1 B** |

Current bundle: ~1034 B gz (per `bun run size`, currently ~10 B over the 1024 B cap). Projected after Option 4: ~1035 B. **Over the 1024 B cap by ~11 B.** Gzip estimates carry ±5-8 B uncertainty — best case ~1027 B, worst case ~1043 B.

**This spec acknowledges the bundle constraint cannot be fully satisfied without additional byte-saving work or a cap renegotiation.** Three honest paths:

1. **Inline-fallback sequence** (saves ~5-8 B):
   - Replace `for (const s of inner) { only = s; break }` with `const only = inner.values().next().value` (after biome-ignore for the iterator-result type) — saves ~4 B if biome allows the suppression at the file level.
   - Combine the early returns in markOne: `if (sub.flags & DISPOSED || sub.lastWave === wave) return` — saves ~2 B vs two-line form (already proposed above; verify minified output).
   - Drop the explicit `inner === undefined` guard if the leaf path's `inner.size` access is safe under TypeScript's narrowed type after `subs?: Set` is type-narrowed by the prior check chain — save ~3 B.

2. **Cap renegotiation request** (+10-15 B). The 1024 B cap was set during the cellx structural rewrite where the Builder squeezed under by ~10 B. The recovery legitimately spends those bytes on correctness-preserving stacked optimization. Surface to Team Lead at PR review.

3. **Defer Avenue C, ship restricted leaf alone** (saves ~−14 B from Avenue C avoided). Loses the Avenue C ~0.3 µs win; predicted wide-fanout becomes ~9.3 µs (still under gate by ~0.5 µs margin but tighter). **This is the recommended primary path if the inline-fallback (1) doesn't bring the bundle under cap.**

Builder MUST run `bun run size` after Phase B and report the actual number. If under 1024 B, ship as designed. If over by ≤5 B, apply fallback (1). If over by >5 B, downgrade to the restricted-leaf-only variant per (3) and document the choice in the build manifest.

---

## §7 Predicted bench numbers

Realistic gain analysis. The Phase 2 body-execution cost (~2.5 µs for 100 computeds × ~25 ns each) is **irreducible** — those bodies must run somewhere. Inline settle moves them from Phase 2 into Phase 1 with no function-call boundary; the saving is the boundary overhead, not the body cost.

**Avenue C alone** (~0.3 µs): elimination of in-`drainBatch` interim NOTIFIED clear loop + `clearVisited`'s NOTIFIED clear (the MARKED clear iteration still runs).

**Restricted leaf alone** (~1.0-1.5 µs): elimination of Phase 2's call-site dispatch into `recomputeIfNeeded` for 100 leaf nodes + elimination of the megamorphism Builder identified between effect-vs-computed shapes in `settleAndDrain`'s visited walk (visited still has computeds but they early-return cheaply now).

**Stacked Option 4** (~1.3-1.8 µs): the two optimizations are non-overlapping (different code paths affected). Net wide-fanout-100 gain: ~1.3-1.8 µs.

| Workload | Current | Predicted | Range | Gate-clearance probability |
|---|---:|---:|---|---:|
| wide-fanout-100 | 10.81 µs | 9.2 µs | 9.0-9.7 µs | ~85% |
| cellx | 1.61 µs | 1.65 µs | 1.55-1.75 µs | (target ≤ 1.7 µs, ~80%) |
| batched-writes-100 | 7.99 µs | 8.0 µs | 7.9-8.2 µs | ~95% |

Wide-fanout-100 baseline 8.97 µs is **not** predicted to be recovered (the structural floor from two-phase dispatch remains for non-leaf paths in deeper graphs, but those paths aren't on wide-fanout's critical path). Range top end (9.7 µs) clears the 9.87 µs gate by ~0.17 µs — narrow margin. If actual lands above 9.7 µs, that's a deviation worth diagnosing per nomos v3.1 §5.

**Cellx prediction reasoning:** the leaf path's HAS_COMPUTED_DEPS check correctly excludes all 16 cellx computeds (each reads ≥2 computed deps), so the leaf branch never fires for cellx workloads. The only delta vs current is Avenue C's wave-counter overhead (~0.04 µs slower per write due to the extra `wave++` and property-vs-bit comparison) plus the unconditional re-assert loop from `shallowClearFired` removal (~0.05 µs). Net cellx +0.05 µs. Inside ≤1.7 µs target.

**Batched-writes prediction reasoning:** same reasoning as cellx — the workload's computeds have computed deps, leaf path never fires; Avenue C's wave-counter overhead amortizes across the 100 batched writes (per-iteration `wave++` is cheap).

---

## §8 Build phases

Per nomos v3.1 §5 — each commit body carries metrics, deviation notes, and links to the artifact. **Phase A is intentionally Avenue C alone** to preserve revertability.

**Phase A — Avenue C only (epoch counter)**
- Add `let wave = 0`; add `wave++` at signal-write entry and drainBatch iteration start.
- Add `lastWave?: number` to Subscriber interface (zero gz cost).
- Replace NOTIFIED set/check sites with `sub.lastWave = wave` and `sub.lastWave === wave`.
- Delete `NOTIFIED = 0x40` constant export and all 6 NOTIFIED clear sites.
- Run full `bun test` — 42/42 must pass. Run `bun run size` — record actual byte count.
- Commit: `refactor(signals): replace NOTIFIED bit with wave counter` — body cites bundle delta and test count.

Iteration trigger: any test failure → suspect: a node missed a `lastWave` set site or a check site was missed in the bit-to-counter substitution. Grep `NOTIFIED` to confirm zero remaining references before re-running tests.

**Phase B — Restricted leaf path + shallowClearFired removal**
- Add `HAS_COMPUTED_DEPS = 0x80` constant.
- Modify computed.ts `read` to set the flag on computed-observer-reads-computed.
- Remove `shallowClearFired` (5 sites across both files). Re-assert loop becomes unconditional.
- Add restricted leaf branch to `markOne` per §5 pseudocode.
- Remove `inner !== undefined &&` and `inner.size > 0` dead guards.
- Run full `bun test` — 42/42 must pass. Critically: `computed.test.ts:97-116` (Finding 3 single-effect parity), the NOTIFIED-dedup test, and the cellx 4×4 test must all pass.
- Run `bun run size` — record actual; if over 1024 B, apply §6 fallback (1) before committing. If still over by >5 B, halt and surface to Team Lead.
- Commit: `perf(signals): restricted leaf-computed inline settle` — body cites bundle delta, test count, and references this spec's §3 correctness invariant.

Iteration trigger: any test failure → check whether the leaf path is firing on a computed that has computed deps not yet captured by `HAS_COMPUTED_DEPS` (e.g., a re-subscription-after-recompute path). Add diagnostic logging if needed.

**Phase C — Bench run + verification**
- Run `bun bench` (4-run minimum, all 3 workloads). Record p50.
- Confirm: wide-fanout ≤ 9.87 µs, cellx ≤ 1.7 µs, batched-writes ≤ 8.2 µs.
- Run `bun .team/phase-2-5/scratch/cellx-counter.ts` — must report 17.
- Commit: `perf(signals): bench results — wide-fanout-100 recovery v2 stacked` — body has full delta table and any deviation note.

Iteration trigger: wide-fanout > 9.87 µs but ≤ 10.0 µs → §8 risk register fallback (try `for...break` vs `iterator.next().value` permutations). > 10.0 µs → deviation memo per nomos v3.1 §5; surface to Team Lead.

**Phase D — CHANGELOG**
Append 2026-04-28 entry to `bench/signals/CHANGELOG.md`. Cite Avenue B failure, why Option 4 worked, and final numbers.

---

## §9 Risk register

| Risk | Signal | Fallback |
|---|---|---|
| Avenue B-style upstream-deps surface re-emerges via a graph topology not enumerated in §3 | Phase B test failure on a non-§3-listed test | The new test is *sufficient*, not necessary. False-negatives on `HAS_COMPUTED_DEPS` (computed has deps but flag wasn't set) would be the failure mode. Audit all read paths in computed.ts — only the explicit `read` closure should be source-of-truth for the flag. Any other code path that sets up a sub→source link without going through that read is a leak (none exist currently, but verify). |
| Avenue C wave-counter overhead > 0.05 µs on cellx (regresses target) | Phase C cellx > 1.7 µs | Inline `wave++` site differs by call site — try moving wave++ from drainBatch iteration start to drainBatch entry only (one increment per batch instead of per iteration) if cellx tests pass under that variant. |
| Bundle exceeds 1024 B even after fallback (1) | Phase B `bun run size` > 1029 B | Downgrade to restricted-leaf-only (skip Avenue C); predicted wide-fanout becomes 9.3 µs, still under gate. Document the deviation in build manifest. |
| `HAS_COMPUTED_DEPS` flag never gets set on a wide-fanout computed (false-positive non-leaf) | Phase C wide-fanout > 10.0 µs | Add diagnostic: log `obs.flags & HAS_COMPUTED_DEPS` after each computed's first recompute. The wide-fanout computeds read only `src()` (a signal) — their computed.ts read paths shouldn't fire the flag-set branch. If they do, the bug is in the source-side detection of "observer is a computed." |
| Unconditional re-assert loop breaks an unanticipated equality-cascade ordering (legacy concern from v1) | `computed.test.ts:97-116` fails or any equals-test fails | The loop only runs on UNEQUAL recomputes (shallowClear's early-return catches equal). Re-ORing already-set MARKED is a no-op. If a test fails, restore the guard as a *local* boolean (not exported) — costs ~6 B gz. |
| `markOne` recursion depth grows linearly with chain length and could hit JS engine call-stack limits | RangeError on a deep chain | The leaf path adds at most 1 recursion level per leaf computed (call to `markOne(only)` for the effect). Effects don't recurse further. Net depth same as v1 markOne. Existing chains hit `MAX_BATCH_ITERATIONS` (100) protection at the batch level. |

---

## §10 Acceptance criteria

| # | Constraint | Pass condition | Verification |
|---|---|---|---|
| C1 | No cellx regression | cellx p50 ≤ 1.7 µs | Phase C bench |
| C1 | No batched-writes regression | batched-writes-100 p50 ≤ 8.2 µs | Phase C bench |
| C2 | wide-fanout gate | wide-fanout-100 p50 ≤ 9.87 µs | Phase C bench |
| C3 | Bundle budget | ≤ 1024 B gz (or documented over by ≤5 B with cap-renegotiation request) | Phase B `bun run size` |
| C4 | Diamond dedup contract | cellx body count = 17 | scratch/cellx-counter.ts |
| C4 | Phase 2 Finding 3 parity | `computed.test.ts:97-116` passes unmodified | bun test |
| C4 | NOTIFIED-dedup test | passes unmodified (validates restricted-leaf correctness) | bun test |
| C4 | cellx 4×4 diamond test | passes unmodified (validates restricted-leaf correctness) | bun test |
| C5 | No bench-bump | All 3 workloads gate-green | Phase C |
| — | Full Phase 2 test suite | 42/42 pass unmodified | bun test |

---

## §11 Out of scope

- §9.4 linked-list dep graph from parent spec (deferred per Team Lead).
- Multi-effect-sub leaf detection (broader leaf class).
- Topology-aware optimizations (e.g., inline-settle for "leaf chain whose deps are also already settled in mark order").
- §9.5/§9.6 deeper wins from parent spec.
- `drainBatch` structural changes beyond Avenue C and shallowClearFired removal.
- Cap renegotiation as a default — only fallback path (2) of §6 if fallbacks (1) and (3) both fail.

---

## §12 Findings for Team Lead (per nomos v3.0 Decision 2B)

The Architect raises three findings the user should know before Builder spawn:

1. **Bundle budget is tight.** Honest arithmetic shows ~+1 B over current (already +10 B over cap). The fallback sequence in §6 has good coverage but the recovery may legitimately need a +10-15 B cap renegotiation. This is normal for two stacked optimizations; the Avenue B v1 spec was unrealistically optimistic about net-zero-cost.

2. **Gate clearance margin is narrow at the top of the predicted range.** ~9.7 µs vs 9.87 µs gate = 0.17 µs margin. V8 inlining variance can be ±0.3 µs on this workload (per the original Builder's 5-run experience). If the bench lands in the worst quartile of the variance band, it could miss by 0.1-0.2 µs. Mitigation: 4-run minimum, take median; if first run misses, run again before declaring deviation.

3. **The `HAS_COMPUTED_DEPS` source-side detection has one architectural assumption** worth flagging: computeds and effects have different shapes (`subs !== undefined` vs `flags & EFFECT`). Future code that adds a third Subscriber kind without effect or subs would need to be considered for this flag. Currently the only Subscribers are computeds and effects; this is a load-bearing invariant for the new test's correctness.

If any of these findings change the Option 4 calculus, surface back to user before Builder spawn.
