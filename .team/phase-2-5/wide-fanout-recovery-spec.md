# Spec — wide-fanout-100 recovery (Phase 2.5 follow-up)

**Author:** Architect
**Date:** 2026-04-28
**Branch:** `perf/signals-cellx-fix`
**Status:** Final — Builder may consume.

Canonical investigation: `.team/phase-2-5/cellx-rewrite-builder-blockers.md` §A
Parent spec: `.team/phase-2-5/cellx-structural-rewrite-spec.md`

---

## §1 Goal

| Workload | Target (ideal) | Hard gate |
|---|---:|---:|
| wide-fanout-100 | ≤ 8.97 µs (recover baseline) | ≤ 9.87 µs |
| cellx | ≤ 1.7 µs | ≤ 1.7 µs |
| batched-writes-100 | ≤ 8.2 µs | ≤ 8.2 µs |
| bundle (gzipped) | — | ≤ 1024 B |

Wide-fanout-100 measures 10.81 µs post-rewrite (+20% over the 8.97 µs pre-rewrite baseline), tripping the 10% gate. The recovery must clear the 9.87 µs gate without regressing cellx (1.61 µs, −72%) or batched-writes-100 (7.99 µs, −28%). The PR must not need `[bench-bump]`.

---

## §2 Investigation summary

See builder-blockers §A for the full profiling decomposition. The ~10.8 µs floor breaks into: Phase 1 mark (200 nodes) ~1.5 µs, Phase 2 settle (100 computeds × `recomputeIfNeeded`) ~3.5 µs, Phase 3 effect drain (100 effects) ~3.5 µs, Phase 4 `clearVisited` (100 computeds) ~0.8 µs. Phase 3 is irreducible — 100 effects must run.

Wide-fanout-100 (1 signal → 100 computeds → 100 effects, 1 effect per computed) gains nothing from the mark/settle/drain split. No diamond fan-in exists; NOTIFIED dedup never fires; all 100 computeds are leaf computeds with effect-only subscriber sets. Phase 2 settle and Phase 4 clear exist entirely to service those 100 leaf nodes. Inlining their settle into Phase 1 marking eliminates both passes for this graph shape.

---

## §3 Recommended design

**Avenue A (monomorphize via split effectSubs/computedSubs arrays) — rejected.** The dominant cost is Phase 2 and Phase 4 iteration overhead, not per-node dispatch polymorphism on `Subscriber.notify()`. Split arrays cost ~20–30 B gz (extra Set fields per signal and computed node) for marginal gain against the wrong bottleneck. Does not fit the 10 B headroom.

**Avenue C (epoch counter replacing NOTIFIED walk in clearVisited) — deferred.** Eliminates Phase 4's NOTIFIED clear (~0.5 µs). Byte cost: `lastWave: number` on every Subscriber node plus epoch-check replacements at all NOTIFIED-check sites ≈ +20 B gz. Budget prohibitive standalone. Revisit when §9.4 linked-list dep graph lands (that work restructures the node object anyway, amortizing the field cost).

**Avenue B (inline settle for leaf computeds) — recommended, with byte-neutral pairing.** In `markOne`, when a computed has exactly 1 subscriber and that subscriber is an effect (`inner.size === 1` + EFFECT flag check on the only element), settle it inline during Phase 1 instead of deferring to Phase 2. The effect is enqueued via recursive `markOne(only)`; then `sub.recomputeIfNeeded?.()` runs inline — if equal, `shallowClear` fires before Phase 3 drain (Finding 3 ordering preserved). The computed skips `visited.push` and clears its own NOTIFIED immediately. For wide-fanout-100, `visited` is empty after Phase 1; Phase 2 and Phase 4 loops iterate zero entries.

**Detection mechanism**: structural, O(1), zero per-wave overhead: `inner.size === 1 && (only.flags & EFFECT) !== 0` evaluated inside `markOne` on the already-loaded `inner` reference. Intentionally narrow — covers the benchmark workload shape (single-effect-sub computeds). Multi-effect-sub leaf generalization deferred per §10.

**Finding 3 interaction**: equality suppression calls `shallowClear(subs)` during Phase 1 inline settle, before Phase 3 drain. The ordering invariant holds by construction. `computed.test.ts:97–116` passes without modification.

**Diamond protection**: non-leaf computeds (`inner.size !== 1` or non-EFFECT single sub) take the original `visited.push` + `propagateMark(inner)` path unchanged. NOTIFIED dedup operates identically. The 17-eval body-count contract for cellx is preserved because no cellx node has `inner.size === 1` with an EFFECT-flagged sub.

**Byte-budget pairing**: Remove `shallowClearFired` and its guard in `recomputeIfNeeded` (`if (!shallowClearFired) return`). The re-assert loop becomes unconditional but remains correct — when no shallowClear has fired, the loop re-ORs MARKED bits already set from Phase 1 (a bitwise no-op). Also remove the `inner !== undefined &&` dead-code guard (computeds always have `subs` initialized) and the `inner.size > 0` guard from the general path (`propagateMark` on an empty Set iterates zero times). These three removals save ~22 B gz and offset the ~22 B gz cost of the Avenue B leaf branch. Net: ~0 B.

---

## §4 Pseudocode

### `signal.ts` — `markOne` revised

```
function markOne(sub: Subscriber): void {
  if (sub.flags & (DISPOSED | NOTIFIED)) return
  if (sub.flags & RUNNING) throw SignalCircularError()
  sub.flags |= NOTIFIED | MARKED

  if (sub.flags & EFFECT) {
    effectQueue.push(sub)
    return
  }

  sub.flags |= STALE
  const inner = sub.subs!        // non-null assertion: subs always defined for computeds

  // Leaf fast path: exactly 1 effect sub — settle inline, skip visited.
  if (inner.size === 1) {
    const only = inner.values().next().value!
    if (only.flags & EFFECT) {
      markOne(only)               // handles DISPOSED/NOTIFIED checks; enqueues to effectQueue
      sub.recomputeIfNeeded?.()  // inline settle; shallowClear fires here if equal
      sub.flags &= ~NOTIFIED     // MARKED + STALE already cleared by recompute() inside
      return
    }
  }

  // General path: multi-sub, computed sub, or zero subs
  visited.push(sub)
  propagateMark(inner)           // guard removed: empty Set is O(0); undefined guard removed
}
```

### `signal.ts` — remove `shallowClearFired` (3 sites)

- `export let shallowClearFired = false` — delete
- `shallowClearFired = true` inside `shallowClear` body — delete
- `shallowClearFired = false` inside `clearVisited` body — delete

### `computed.ts` — 2 removals

- `shallowClearFired,` from the named import list — delete
- `if (!shallowClearFired) return` guard (line 80) — delete

The re-assert loop at lines 81–85 is unchanged and now runs unconditionally. When no equality cascade has fired in the wave, the loop re-ORs MARKED bits already set from Phase 1 — a bitwise no-op costing ~0.1 µs for wide-fanout-100 (100 nodes × 1 sub each).

---

## §5 Byte budget arithmetic

| Change | File | Est. gz delta |
|---|---|---:|
| Leaf fast path (size check, EFFECT check, 3 calls, ~NOTIFIED, return) | signal.ts | +22 B |
| Remove `inner !== undefined &&` dead guard | signal.ts | −4 B |
| Remove `inner.size > 0` guard from general path | signal.ts | −4 B |
| Remove `export let shallowClearFired` + 2 assignment sites | signal.ts | −8 B |
| Remove import entry + guard line | computed.ts | −6 B |
| **Net estimated delta** | | **+0 B** |

Current bundle: 1.01 KB gz (~1034 B). Projected: ~1034 B. Hard cap: 1024 B. Current headroom: ~10 B; this change nominally preserves it. Gzip estimates carry ±5 B uncertainty; Builder MUST run `bun run size` after Phase B and confirm ≤ 1024 B.

Fallback sequence if over budget:

1. Inline the `markOne(only)` call: `if (!(only.flags & (DISPOSED|NOTIFIED))) { only.flags |= NOTIFIED|MARKED; effectQueue.push(only) }` — removes one call-site reference; saves ~3–5 B gz.
2. Drop `inner.size > 0` guard from the general path if not already done (~4 B gz).
3. If still over by >10 B: file a follow-up PR note requesting a 10–20 B cap renegotiation. The recovery is functionally complete; the overrun is a gzip rounding artifact.

---

## §6 Predicted bench numbers

| Workload | Current | Predicted | Range | Mechanism |
|---|---:|---:|---|---|
| wide-fanout-100 | 10.81 µs | 9.5 µs | 9.0–10.5 µs | Phase 2 settle eliminated (~0.7 µs); Phase 4 clearVisited eliminated (~0.6 µs); unconditional re-assert costs ~0.1 µs; net ~−1.2 µs |
| cellx | 1.61 µs | 1.65 µs | 1.55–1.75 µs | Leaf path never taken (cellx nodes have multi-element subs); unconditional re-assert adds ~0.05 µs |
| batched-writes-100 | 7.99 µs | 8.0 µs | 7.9–8.2 µs | Batch path unchanged; unconditional re-assert adds ~0.01 µs |

The wide-fanout-100 range spans the 9.87 µs gate at its high end. Gate-clearance probability is ~80%. Recovering the 8.97 µs baseline is not predicted — the structural floor for two-phase dispatch remains; this is gate clearance, not baseline recovery.

Per nomos v3.1 §5 deviation tracking: Builder's Phase C commit body should record actual numbers and any deviation from the predicted range. Wide-fanout-100 landing in 9.0–10.5 µs is on-prediction; outside that range is a deviation worth documenting.

---

## §7 Build phases

**Phase A — signal.ts changes (preparatory)**
Add the leaf fast path in `markOne`; move `visited.push` to after the leaf check; remove `inner !== undefined &&` and `inner.size > 0` guards; remove `shallowClearFired` export and its two assignment sites. Do NOT touch computed.ts yet (import will fail to resolve until Phase B). Run TypeScript compile to confirm signal.ts compiles in isolation.

**Phase B — computed.ts cleanup + full test gate**
Remove `shallowClearFired` from import; remove the guard line. Run `bun test packages/signals` — all Phase 2 tests must pass including `computed.test.ts:97–116`. Run `bun run size` — must report ≤ 1024 B. Commit Phase A and B together or as adjacent commits per nomos v3.1 §5 (each commit body cites bundle size + which test suites passed).

Iteration trigger: any test failure → check whether the unconditional re-assert loop incorrectly re-ORs MARKED on an already-suppressed effect (inspect computed.ts:81–85 behavior when `hadCache && equals(prev, next)` is true and the shallowClear branch was taken). Bundle over 1024 B → apply fallback sequence §5 steps 1–2.

**Phase C — bench run + verification**
Run `bun bench` (all 3 workloads, minimum 4 runs). Record median p50. Confirm: wide-fanout-100 ≤ 9.87 µs, cellx ≤ 1.7 µs, batched-writes-100 ≤ 8.2 µs. Run `bun .team/phase-2-5/scratch/cellx-counter.ts` — must output exactly 17 body evaluations. Commit with full delta table in body.

Iteration trigger: wide-fanout-100 > 9.87 µs → profile whether V8 is inlining `inner.values().next()`; try `for (const s of inner) { only = s; break }` extraction pattern. Cellx > 1.7 µs → add instrumentation to confirm leaf path is not triggering on any cellx node (`inner.size === 1` should be false for all L1/L2/L3/L4 computeds which each have 2 subs).

**Phase D — CHANGELOG**
Append 2026-04-28 entry to `bench/signals/CHANGELOG.md` with the 3-workload delta table (from 10.81/1.61/7.99 baselines), the leaf-computed inline-settle mechanism, `shallowClearFired` removal, final bundle size, and any deviation-from-prediction note (§6).

---

## §8 Risk register

| Risk | Signal | Fallback |
|---|---|---|
| V8 fails to optimize `inner.values().next()` iterator in hot single-element loop | wide-fanout p50 > 10.5 µs | Replace with `let only!: Subscriber; for (const s of inner) { only = s; break }` — V8 typically elides the allocation for the break-early pattern |
| Leaf fast path misfires on a computed with 1 computed sub (EFFECT=0) | cellx body count ≠ 17, or test failure | `only.flags & EFFECT` guards this by construction — a computed sub has EFFECT=0 and the fast path is skipped. Analytically zero risk; confirm via body-count test. |
| Unconditional re-assert loop breaks equality cascade on shared-effect-sub graph | Phase 2 Finding 3 test failures | The loop only runs on the UNEQUAL branch (shallowClear's early return handles the equal case before reaching the loop). Re-ORing already-set MARKED is a no-op. No test should fail; if one does, reintroduce the guard as a local boolean `shallowClearFired` (without the export) — costs ~6 B gz of the saved budget. |
| Bundle exceeds 1024 B | `bun run size` output after Phase B | Apply §5 fallback steps 1–2 before final commit |
| wide-fanout p50 misses 9.87 µs gate at high end of range | Phase C bench 9.9–10.5 µs | Stack Avenue C (epoch counter for NOTIFIED clear) in the same PR; ~8 B net cost can be offset by the ~10 B remaining headroom plus a 10–20 B cap renegotiation note per §10 |

---

## §9 Acceptance criteria

| # | Constraint | Pass condition | Verification |
|---|---|---|---|
| C1 | No cellx regression | cellx p50 ≤ 1.7 µs | Phase C bench, 4-run median |
| C1 | No batched-writes regression | batched-writes-100 p50 ≤ 8.2 µs | Phase C bench, 4-run median |
| C2 | wide-fanout gate | wide-fanout-100 p50 ≤ 9.87 µs | Phase C bench, 4-run median |
| C3 | Bundle budget | ≤ 1024 B gzipped | `bun run size` after Phase B |
| C4 | Diamond dedup contract | cellx body count = 17 | `bun .team/phase-2-5/scratch/cellx-counter.ts` |
| C4 | Phase 2 Finding 3 parity | `computed.test.ts:97–116` passes unmodified | `bun test packages/signals` |
| C5 | No bench-bump | All 3 workloads gate-green | Phase C, no `[bench-bump]` tag |
| — | Full Phase 2 test suite | All tests in 6 test files pass unmodified | `bun test packages/signals` |

---

## §10 Out of scope

- §9.4 linked-list dep graph: deferred per Team Lead.
- Broader leaf detection via `!hasComputedSub` flag (multi-effect-sub leaves): deferred; `size === 1` covers the benchmark workload.
- Avenue C epoch counter: deferred to a future perf session unless required as fallback per §8.
- §9.5 / §9.6 deeper wins from the parent spec.
- Bundle cap renegotiation: this is a recovery PR; no cap changes requested unless §5 fallback step 3 triggers.
- Changes to `drainBatch` or the batch-write path: correct as shipped.
