# Spec 6.2 Phase 3 — H4-Tactical (T1 + T2 + T6)

**Track:** C  
**Branch:** `feat/v1-signals-6.2-phase3-h4-tactical` (off `feat/v1-signals-6.2-phase3-closures @ a0a93d6`)  
**Goal:** Eliminate the `isChase` polymorphic dispatch in `markOne` by splitting into monomorphic outer + inner loops.  
**Predicted gain:** 200–400 ns on `deep-propagation-100` (3.39 µs → ~3.0–3.2 µs)

---

## Background

After Phase 3 K1c+ (commit `a0a93d6`), the mark pipeline sits at:
- `deep-propagation-100` p50: **3.39 µs** (soft-miss vs ≤ 3.20 µs relaxed target)
- Signals bundle: **1775 B gz** (75 B headroom under 1850 B cap)
- Memory (100-deep graph): **1.62 KB** (prototype methods; closure overhead eliminated)

The remaining hot-path cost in `markOne` is a boolean dispatch on `isChase`:

```javascript
sub.flags |= isChase ? MARKED | PENDING : MARKED   // V8 sees polymorphic read
```

V8 cannot specialize the loop body when `isChase` flips mid-loop. Splitting into two separate loops gives V8 monomorphic inner loops for the hot case (99/100 iterations in a 100-deep chain are inner-chase iterations).

---

## Changes — `packages/signals/src/signal.ts` only

### T2 — Module constant (1 line)

Add immediately after the `PENDING` constant declaration:

```typescript
/** @internal — combined mark flags for inner chase path. */
export const MARKED_PENDING = MARKED | PENDING
```

### T1 — Split `markOne` into outer drain + inner chase

Replace the current `markOne` (single `while(true)` with `isChase` flag) with two distinct loops:

```typescript
function markOne(root: Subscriber): void {
  const baseLen = markStack.length
  markStack.push(root)
  try {
    while (markStack.length > baseLen) {
      // ── Outer loop: stack-popped nodes, MARKED only (no PENDING) ──
      let sub = markStack.pop() as Subscriber
      if (sub.flags & DISPOSED) continue
      if (sub.flags & MERGE && sub.lastWave === wave) continue
      if (sub.flags & RUNNING) throw new SignalCircularError()
      if (sub.flags & MERGE) sub.lastWave = wave
      sub.flags |= MARKED
      if (sub.flags & EFFECT) { effectQueue.push(sub); continue }
      let head = sub.subsHead
      if (head === null) { sub.flags |= STALE; continue }
      if (head.nextSub !== null) {
        // Fan-out: push children to stack
        visited.push(sub)
        sub.flags |= STALE
        for (let l: Link | null = sub.subsTail; l !== null; l = l.prevSub) {
          markStack.push(l.sub)
        }
        continue
      }
      // Linear entry: promote outer node to PENDING and start inner chase
      sub.flags |= PENDING
      // ── Inner chase loop: MARKED | PENDING on every hop (T1, T2, T6) ──
      while (true) {
        sub = head.sub              // T6: one .sub read per iteration
        if (sub.flags & DISPOSED) break
        if (sub.flags & MERGE && sub.lastWave === wave) break
        if (sub.flags & RUNNING) throw new SignalCircularError()
        if (sub.flags & MERGE) sub.lastWave = wave
        sub.flags |= MARKED_PENDING // T2: constant, eliminates ternary
        if (sub.flags & EFFECT) { effectQueue.push(sub); break }
        head = sub.subsHead
        if (head === null) { sub.flags |= STALE; break }
        if (head.nextSub !== null) {
          // Fan-out exit: push children and exit inner chase
          visited.push(sub)
          sub.flags |= STALE
          for (let l: Link | null = sub.subsTail; l !== null; l = l.prevSub) {
            markStack.push(l.sub)
          }
          break
        }
        // Continue inner chase: head already updated above (T6)
      }
    }
  } catch (e) {
    markStack.length = baseLen
    throw e
  }
}
```

**Note on PENDING semantics across the split:**
- Outer node (first in linear run): MARKED + PENDING (via explicit `sub.flags |= PENDING` before inner loop entry)
- Inner-chase nodes: MARKED | PENDING (via `MARKED_PENDING`)
- Fan-out nodes popped from stack: MARKED only (no PENDING — eager STALE path)
- Effects reached via linear chase: MARKED | PENDING (needed for `drainEffectQueue` PENDING check)

This is bit-for-bit identical to the current `isChase` logic.

---

## Acceptance criteria

### Correctness
- All 329 workspace tests pass (`bun run test`)
- The `deep-chain.test.ts` suite passes in full (property tests, glitch-freedom, cascade-suppression, HOST detection, prototype dispatch)

### Performance (WSL2/Linux, Bun 1.3.8, mitata 1.0.34, 3-run mean)
- `deep-propagation-100` p50 **≤ 3.20 µs** (relaxed gate per state-track-c.md Round 5)
- `deep-propagation-100` ideally ≤ 3.10 µs (directional target toward alien 2.46 µs)

### No-regression matrix (all must hold, Verifier §10 3-run mean)
| Workload | Baseline | Floor (−10%) |
|---|---:|---:|
| cellx | 508 ns | ≤ 559 ns |
| wide-fanout-100 | 4.39 µs | ≤ 4.83 µs |
| batched-writes-100 | 2.50 µs | ≤ 2.75 µs |
| dynamic-deps | 715 ns | ≤ 787 ns |
| creation-1to1000 | ~70 µs | ≤ 76.2 µs |

### Bundle (post-mangle)
- `@scribe/signals` dist ≤ **1850 B gz** (hard cap per §10.3; current 1775 B + estimated +60 B = 1835 B → 15 B residual)
- `@scribe/arbor` dist ≤ **2200 B gz** (arbor bundles signals; signals growth propagates)

---

## Bundle risk

The split loop duplicates some bytecode (the DISPOSED + MERGE-dedup + RUNNING-check sequence appears in both loops). Estimated +50–70 B gz over 1775 B baseline = 1825–1845 B, within cap. If build reports > 1850 B, the Architect must consider:
1. Hoisting shared preamble (DISPOSED / RUNNING checks) into a helper (risk: function-call overhead on hot path)
2. Dropping T6 (minimal gains anyway — T1+T2 are the primary mechanism)
3. Surface to Director if neither resolves it

---

## Files changed
- `packages/signals/src/signal.ts` — T2 constant + T1 markOne split (only file changed)
- `packages/signals/dist/` — rebuilt + mangled
- `.team/v1/spec-6.2-phase3-h4-tactical.md` — this file
