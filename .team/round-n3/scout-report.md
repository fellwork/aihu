# Scout Report — Fusion (Round N+3)

**Date:** 2026-05-01
**Scout:** auto (Mode 2 worktree session)
**Branch:** `feat/signals-n3-fusion` at HEAD `207c521`
**Branch point (semantic):** `origin/main` `51a1572` ("merge: feat/lattice-signals-promote — lattice signals barrel + signals limit raise to 2050 B"). The 5 commits at HEAD above `51a1572` are doc-only (historian-close + Round N+2 architect-spec + retro); `git diff 51a1572..HEAD -- packages/signals/src/signal.ts` is empty. The §3 invariant analysis applies bit-identically at both commits.
**Locked dispatch model (user-confirmed):** **B1 — Inline-effect.** When the mark walk reaches an EFFECT node, immediately checkDirty + settle deps + call `notify()` right there in the walk. Maximally fused; depth-first effect firing order. The Architect will design to this; this report grounds the design in observed behavior.

---

## 1. Baseline numbers

Captured at HEAD `51a1572`, baseline file committed at `bench/baselines/round-n3-pre-51a1572.md`.

| Metric | Value | Notes |
|---|---:|---|
| `@aihu/signals` size (gz, via `bun run size`) | **1925 B** | `.size-limit.json` says 1850 B; HEAD is 72 B over the declared limit (see Open Q #1). |
| `cellx` p50 | 532.64 ns | aihu leads field. |
| `wide-fanout-100` p50 | 6.60 µs | alien 4.63 µs (43 % gap). |
| `batched-writes-100` p50 | 3.01 µs | aihu leads field. |
| **`deep-propagation-100` p50** | **4.02 µs** | **load-bearing — Fusion must hit ≤ 3.62 µs (≥ 10 % gain).** alien 3.06 µs. |
| `dynamic-deps` p50 | 1.14 µs | s-js leads at 677 ns. |
| `creation-1to1000` p50 | 106.65 µs | s-js leads at 51.80 µs. |

Run-to-run variance vs. the committed `bench/signals/RESULTS.md` (also from HEAD `51a1572`) is wider than the 10 % gate on `deep-propagation-100` (committed: 3.35 µs; Scout: 4.02 µs). **The Builder MUST bench in the same environment they baselined in** — do not cross-compare numbers from different runs of the box.

Full baseline + raw bench output: `bench/baselines/round-n3-pre-51a1572.md`.

---

## 2. alien-signals technique 3 — observations

**Source read:** `node_modules/.bun/alien-signals@3.1.2/node_modules/alien-signals/esm/system.mjs` and `index.mjs`. Same install version (`3.1.2`) referenced in `bench/signals/package.json`. The structural picture also matches `.team/v1/investigation-deep-chain.md` §1 prose.

### 2.1 alien-signals does NOT fire effects inline at mark-time

The Round N+2 director note's reference to "single-pass mark + effect queue" does not mean inline-effect dispatch. Alien-signals is two-phase:

1. **Phase 1 — `propagate(link)`** (`system.mjs:92–142`) walks the dep→sub graph. When it reaches a Watching sub (effect, `flags & 2`), it calls the user-supplied `notify(sub)` callback (line 115).
2. **`notify(effect)`** in `index.mjs:17–34` does NOT run the effect body — it only **pushes** the effect into a `queued[]` array and updates `queuedLength`. Lines 18–28 push; lines 29–33 reverse-swap the just-inserted slice (so nested-effect parents come before children).
3. **Phase 2 — `flush()`** (`index.mjs:208–225`) runs queued effects sequentially via `run(effect)` (line 213).

So alien queues effects mid-walk and runs them in a separate flush phase. **B1 inline-effect is more aggressive than alien.** No reference implementation of B1 exists in this codebase.

### 2.2 Dependency settling when a computed must be re-evaluated mid-walk

Alien defers dep settling to the effect run, not to the mark walk. Inside `run(effect)` (`index.mjs:186–207`):

- Line 188 checks `flags & 16` (Dirty — a fresh signal write) — if set, run.
- Line 189–190 check `flags & 32` (Pending — possibly dirty via upstream computed) AND `checkDirty(e.deps, e)` — **`checkDirty` is the pull-on-demand** (`system.mjs:143–209`).
- `checkDirty` walks the dep tree backward through Pending computeds. When it finds a `(1 | 16)` (Mutable + Dirty) signal, it calls the user-supplied `update(dep)` callback to forward-recompute the chain.
- `updateComputed` (`index.mjs:167–181`) increments `cycle`, sets RecursedCheck, calls `c.getter(oldValue)`, and returns `oldValue !== c.value`.

Translation to aihu terms: alien's `checkDirty` is the same shape as aihu's existing `checkDirty` (`signal.ts:292–318`) — both walk back through PENDING deps, both stop on a Dirty signal source, both pull-recompute downward. Aihu's `recomputeIfNeeded` (in `computed.ts`) is alien's `update`. **The two systems converged on the same dep-settle protocol.**

### 2.3 Error isolation — alien does NOT isolate per-effect throws

`flush()` (`index.mjs:208–225`):

```js
function flush() {
    try {
        while (notifyIndex < queuedLength) {
            const effect = queued[notifyIndex];
            queued[notifyIndex++] = undefined;
            run(effect);
        }
    }
    finally {
        while (notifyIndex < queuedLength) {
            const effect = queued[notifyIndex];
            queued[notifyIndex++] = undefined;
            effect.flags |= 2 | 8;
        }
        notifyIndex = 0;
        queuedLength = 0;
    }
}
```

There is **no try/catch around `run(effect)`**. The first throw aborts the loop. The `finally` block re-flags the un-run effects with `2 | 8` (Watching | Recursed) — they are NOT re-run; they are silently restored to the state where the next propagation will re-queue them.

**This is a design choice, not a fix-up.** Alien-signals lets first-throw-wins: if effect A throws, effect B does not run, effect C does not run, the whole flush wave aborts. This is **strictly weaker than aihu's EI-1** (per-effect try/catch + AggregateError surface). See `.team/v1/investigation-deep-chain.md` for confirmation that alien chose this tradeoff for hot-path bytes.

### 2.4 Effect dispatch order — depth-first with parent-before-child swap

In `notify` (`index.mjs:17–34`), when an effect is reached, alien walks `effect.subs?.sub` upward — this is the chain of **scope-parent effects** (i.e. an effect declared inside another effect's body). The do-while loop (lines 20–27) walks up until it finds a non-Watching parent or runs out. Then lines 29–33 reverse-swap the just-pushed slice so the **outermost parent runs before its child**.

Aihu does not use scope-parents at all (no `effectScope` API in `effect.ts`); this branch is dead code in our adaptation. Order in alien's flat (no-scope) case is **mark-walk discovery order** (depth-first DFS through the dep→sub graph).

Aihu today fires effects in `effectQueue` push order, which is:
- `propagateMark(host.subsHead)` walks the signal's outbound subs forward (head → tail);
- For each sub, `markOne` does an iterative DFS;
- DFS uses an explicit `markStack` (`signal.ts:200`); push order at fan-out is `tail → head` (line 231–233 / 253–255), so pop order is `head → tail`. **Net effect: depth-first pre-order, head-to-tail in each sub list.**

**B1 inline-effect would change this in one specific way:** when an EFFECT node is popped, today's code pushes it to `effectQueue` and continues the mark walk for its siblings. B1 would invoke `notify()` immediately. If the effect body writes a signal (re-entrancy), today's code defers via the wave counter; B1 must decide what re-entrancy looks like (see Q4).

In a **simple linear or wide chain with no re-entrancy**, B1 produces the same observable order as today — both are mark-walk DFS pre-order. In **a graph with effect-body writes back into the wave**, observable order may differ (see RC-1 below).

### 2.5 Cycle / re-entrancy protection

Alien uses `flags & 4` (RecursedCheck): set during `updateComputed` and `run(effect)` re-entry. Re-entry into the same node while RecursedCheck is set means alien either skips (line 102: `flags = 0`) or marks `Recursed` (line 105). It does NOT throw on a cycle — alien-signals tolerates re-entrant effect writes by re-queueing and running again.

Aihu enforces cycles with `RUNNING` flag + `SignalCircularError`. `markOne` line 222 / 244: `if (sub.flags & RUNNING) throw new SignalCircularError()`. `drainBatch` line 401–404: throws after `MAX_BATCH_ITERATIONS = 100`. **Aihu's protection is stricter than alien's** — aihu throws on direct self-write within an effect body (test at `effect.test.ts:76–85`); alien would silently re-run.

---

## 3. Aihu's mark/drain invariants (lines 200–435 of `packages/signals/src/signal.ts`)

### DI-1: Dependency Invariant

**What:** Before any effect's `notify()` is called, every PENDING/STALE computed in the effect's transitive dep chain has been settled (either confirmed clean and PENDING cleared, or recomputed and STALE cleared).

**Where enforced:** Two-step enforcement.

1. **Settle pass at `signal.ts:374–375`** (`settleAndDrain`):
   ```ts
   for (const sub of visited) sub.recomputeIfNeeded?.()
   ```
   `visited[]` (populated by `markOne` at lines 229 and 252 — fan-out path only) lists every computed reached eagerly during mark. Iterating in push order (DFS pre-order from the source signal) means upstream computeds settle before downstream. Each `recomputeIfNeeded` either runs the body (clearing STALE) or short-circuits.

2. **Per-effect direct-dep settle at `signal.ts:339–341`** (`drainEffectQueue`, in the PENDING branch):
   ```ts
   for (let l = sub.depsHead; l !== null; l = l.nextDep) {
     if (l.dep.flags & (STALE | PENDING)) l.dep.recomputeIfNeeded?.()
   }
   ```
   This catches the **lazy-linear** path. Linear-chain computeds (Option D, `markOne` line 237 / 246) are marked PENDING but NOT pushed to `visited[]`; their settle is deferred to here. Walking the effect's `depsHead` chain settles whichever direct computed deps are still PENDING/STALE before `notify` runs.

**What B1 must preserve:** When `markOne` reaches an EFFECT node, `notify()` cannot run until DI-1 holds. B1 must call `checkDirty(effect)` and the per-effect direct-dep settle loop **before** dispatching `notify()` (mirroring `drainEffectQueue` lines 331–342). The settle of `visited[]` in `settleAndDrain` (line 375) is the load-bearing settle for fan-out; this loop runs before drainEffectQueue today, which means by the time today's `notify()` fires, every fan-out computed in the wave has already settled. **B1 inline-effect breaks this ordering** — when it fires effect E1 mid-walk, fan-out computeds discovered AFTER E1 in the DFS have not yet been visited or settled.

This is the core hazard B1 introduces. Mitigations the Architect must spec:
- Defer eager settle until checkDirty fires per-effect (alien's pull model). For linear chains this is fine; for fan-out where E1 reads a fan-out node settled later in the wave, checkDirty must walk back through the fan-out (which is still STALE/PENDING) and recompute it on demand.
- Or: fire effects only when their entire transitive dep set has been settled (defeating the purpose of inline-effect — degenerates to today's two-pass).

### CS-1: Cascade Suppression

**What:** When `recomputeIfNeeded` finds a computed's recomputed value equals the prior value (per its `equals` comparator), the cascade stops there: direct subscribers' MARKED bit is cleared so they are skipped at drain.

**Where enforced:** `shallowClear` at `signal.ts:278–284`:
```ts
export function shallowClear(head: Link | null): void {
  for (let l = head; l !== null; l = l.nextSub) {
    const sub = l.sub
    if (sub.flags & EFFECT) sub.flags &= ~MARKED
    else sub.flags &= ~(STALE | MARKED)
  }
}
```
Called from `computed.ts` (not in scope) when recompute produces a value-equal result. The downstream subs lose MARKED → `drainEffectQueue` line 329 checks `if (!(sub.flags & MARKED)) continue` and skips them.

The PENDING path also enforces it: `drainEffectQueue` lines 338–342 settle direct deps, then re-check `if (!(sub.flags & MARKED)) continue` — if `shallowClear` cleared MARKED while the direct dep settled, the effect is suppressed.

**Flag transitions:** STALE | MARKED set during mark; STALE cleared by recompute (`recomputeIfNeeded` running); MARKED cleared by `shallowClear` (cascade-suppress) OR by drainEffectQueue line 344 (effect fires).

**What B1 must preserve:** This is **load-bearing for correctness**, not just performance. Test pin: any effect that reads a computed whose value didn't change must NOT fire. The classic case is the cellx diamond. B1 must integrate per-effect dep-settle (DI-1's per-effect loop, line 339) AND re-check MARKED after settle (line 342) BEFORE invoking `notify()`. Without this, effects fire unnecessarily on equality-stable updates → cellx regression.

### SF-1: Single-Fire

**What:** Each effect fires at most once per propagation wave (single signal write or single batch flush iteration).

**Where enforced:** Two mechanisms.

1. **Wave-counter dedup at `signal.ts:221, 223, 243, 245`** (in `markOne`):
   ```ts
   if (sub.flags & MERGE && sub.lastWave === wave) continue   // dedup mark
   if (sub.flags & MERGE) sub.lastWave = wave                 // record mark
   ```
   The `MERGE` flag is set on every Subscriber that has ≥ 2 inbound deps (linkAdd line 151) AND on every signal host (line 489 — `MERGE | HOST`). Effects without ≥ 2 deps lack MERGE — the dedup check is a no-op for them; they would be marked twice if reached twice, BUT the next mechanism catches it.

2. **MARKED flag check at drain**: `drainEffectQueue` line 329 checks `if (!(sub.flags & MARKED)) continue`. After an effect runs (line 344 clears MARKED), a duplicate entry in `effectQueue` (from a re-mark) would skip. Plus `effectQueue` is appended to without dedup — a duplicate push is possible but the MARKED gate suppresses the second run.

   Actually, looking closer: `markOne` line 225 `if (sub.flags & EFFECT) { effectQueue.push(sub); continue }` — pushes unconditionally. If an effect has 1 dep, lacks MERGE, and is reached twice in the same wave (e.g., signal A → effect, signal B → effect; user writes A then B in a sequence outside batch), each write triggers a separate wave (`wave++`), so this dedup question is per-wave and the answer is: within ONE wave, an effect with 1 dep is reached at most once because there's only one path from one signal write. With ≥ 2 deps, MERGE is set and `lastWave === wave` dedup skips.

**What B1 must preserve:** B1 fires effects inline. If during mark, a single effect were re-entered (e.g., a fan-out walk reaches the effect via two distinct paths in one wave), B1 must not double-fire. Today's mark-then-drain decouples mark dedup from fire: dedup at mark, fire-once at drain via MARKED. B1 collapses these — the mark-time dedup AND the fire-once-per-wave guarantee both must be encoded at one site. Suggested invariant for B1: **clear MARKED immediately upon firing** (already done today at line 344), AND check `!(sub.flags & MARKED)` AT the inline-fire site (skip if previously fired in same wave).

### RC-1: Re-Entrancy Containment

**What:** When an effect body writes a signal during its own `notify()`, the new write must not corrupt the in-flight propagation wave; the new write either spawns a fresh wave (non-batched) or re-enqueues for the next batch iteration (batched).

**Where enforced:** Two paths.

1. **Non-batched (signal.write line 506–532):** When an effect runs from `drainEffectQueue` and its body calls `setN(v)`, control reaches `signal.ts:506`. `batchDepth === 0` (we're inside the user-facing `signal.write` recursion, not a `batch()`), so line 524 `wave++` runs and a fresh wave starts via `propagateMark(head); settleAndDrain()`. The OUTER wave is at line 528 — its `try/finally` block is paused on the `notify()` call stack frame. The INNER wave runs to completion. When the inner returns, the outer resumes, calling `clearVisited()` line 531. **Outer `effectQueue` and `visited` are reused arrays** (module-level, not per-wave), so the inner wave consumes/clears them. This is safe because: (a) inner runs `clearVisited` itself, fully draining; (b) outer's iteration variables (`for (const sub of effectQueue)` at line 327) are stale — but line 355 `effectQueue.length = 0` after the inner ran already drained the array, so the outer for-of loop continues against an empty array and exits.

   Verifying: the for-of loop in `drainEffectQueue` at line 327 captures `effectQueue` by reference; when inner-wave's `effectQueue.length = 0` mutates it mid-iteration, JS's for-of iterator on a mutated array uses live indexing — the iterator stops when `index >= length`. So if inner shrinks length to 0, outer's iterator's next bump stops the loop. But `effectQueue.push` at line 225 from inner would re-grow it — and then outer's iterator would see those entries. **This is murky territory** — the inner wave's effects do flow through the outer drain.

   Test that pins this: `batch.test.ts:83–109` ("effect that writes inside flush extends the same batch") — but that's the batched case.

2. **Batched (`drainBatch` at line 396–434):** Inner write goes to `enqueueIfNeeded` (line 438) which appends to `batchQueue`. The `while (batchQueue.length > 0)` loop at line 400 picks up the new entries on the next iteration. `MAX_BATCH_ITERATIONS = 100` caps cycles (line 401–404 → SignalCircularError).

**What B1 must preserve:** B1 fires effects inline DURING `markOne`. If the effect body writes a signal, the write either:
- spawns a fresh wave (unbatched): the inner `propagateMark/settleAndDrain` runs while `markOne` is still on the call stack — recursion into mark-then-drain. The `markStack` array is module-level (line 200); the inner mark wave would PUSH onto it, popping outer's pending entries! **THIS IS A RECURSION HAZARD** — the markStack must either be per-wave or the inner wave must save/restore the outer stack. Today's mark walk completes before any effect runs, so this doesn't arise.
- enqueues to batchQueue (batched): safer, but B1's inline-fire is during mark which is INSIDE drainBatch's `for (const sub of drainList)` at line 408. The new batchQueue entries get picked up on the next iteration of the outer while loop — same as today.

The Architect MUST spec: **markStack save-and-restore protocol for B1's inline-fire when effect body triggers a non-batched re-entrant write.** The existing try/catch at `signal.ts:261–264` already does `markStack.length = baseLen` on throw; B1 needs the same length-discipline for normal-completion path of inner waves.

### EI-1: Error Isolation

**What:** If effect A throws and effect B doesn't, B still runs. Multiple thrown effects in one wave surface as `AggregateError`; single throw rethrows directly preserving stack.

**Where enforced:** `drainEffectQueue` lines 345–353:
```ts
try {
  sub.notify?.()
} catch (e) {
  errors.push(e)
}
```
And `throwEffectErrors` lines 363–367:
```ts
if (errors.length === 0) return
if (errors.length === 1) throw errors[0]
throw new AggregateError(errors, 'multiple effects threw during drain')
```

Tests pinning: `effect.test.ts:143–168` (sibling effects survive boom), `:170–195` (two booms → AggregateError). Note line 192 sorts the errors before assertion: `agg.errors.map(...).sort()` — **the test does not pin order across the AggregateError**.

**What B1 must preserve:** Inline-fire must wrap each `notify()` call in try/catch and accumulate to a per-wave `errors[]`. The accumulator must be threaded through `markOne`'s call stack — either as a parameter, a module-level array, or a closure variable. Today's `errors` array is allocated at the top of `drainEffectQueue` (line 376) — for B1 it must move to where the wave starts (top of `propagateMark` or the signal-write site at line 526–528). Then `throwEffectErrors(errors)` runs after mark completes. The `signal.write` `try/finally` at 528–531 already catches; B1 wires errors[] into that.

### Summary table (cite-only)

| Inv | Definition | Enforced at file:line |
|---|---|---|
| DI-1 | All effect deps settled before `notify` | `signal.ts:374–375` (visited fan-out settle), `signal.ts:339–341` (per-effect direct-dep settle, PENDING path) |
| CS-1 | Equality-stable recompute suppresses MARKED on subs | `signal.ts:278–284` (`shallowClear`); checked at `signal.ts:329` and `signal.ts:342` |
| SF-1 | Each effect fires ≤ 1× per wave | `signal.ts:221–223, 243–245` (MERGE wave dedup at mark), `signal.ts:329, 344` (MARKED gate at fire) |
| RC-1 | Effect-body writes spawn fresh wave (non-batched) or re-enqueue (batched) | `signal.ts:524–531` (wave++ + propagate/settle in signal.write), `signal.ts:438–442` (enqueueIfNeeded), `signal.ts:400–428` (drainBatch loop) |
| EI-1 | Per-effect try/catch; single→rethrow, multi→AggregateError | `signal.ts:345–353` (try/catch in drain), `signal.ts:363–367` (throwEffectErrors) |

---

## 4. B1 inline-effect preservation/relaxation

| Invariant | LOAD-BEARING / RELAXABLE | Rationale | Test that pins it |
|---|---|---|---|
| **DI-1** | **LOAD-BEARING** | Effects observing un-settled deps would see stale or torn values — breaks every cellx-shape test. B1 must integrate per-effect checkDirty + dep-settle BEFORE inline `notify()`. | `effect.test.ts:124–141` (fan-out fire), `properties.test.ts` (cellx structural correctness), all `computed.test.ts` |
| **CS-1** | **LOAD-BEARING** | Equality-stable cellx is the canonical regression — every reactive lib has been bitten by it. Removing CS-1 produces extra effect runs on stable values and fails `cellx` benchmark + correctness. | `computed.test.ts` cellx and equality tests; `bench/signals/src/workloads/cellx.ts` (TOTAL = 17 invariant in `.team/phase-2-5/scratch/cellx-counter.ts` per Learning #26) |
| **SF-1** | **LOAD-BEARING** | A double-firing effect violates Solid/Preact/cellx contract. Users assume idempotence per wave. | `effect.test.ts:124–141` (each effect runs exactly once on each setN) |
| **RC-1** | **LOAD-BEARING (with B1-specific extension)** | Effect-body writes are a documented feature (`batch.test.ts:83–109`). B1's inline-fire creates a NEW hazard: re-entrancy during mark walk. The Architect must spec markStack save/restore (see §3 RC-1). | `batch.test.ts:83–109`; `effect.test.ts:76–85` (direct self-write throws), `effect.test.ts:143–168` (siblings survive throw which involves re-entry into drain) |
| **EI-1** | **LOAD-BEARING — semantics** + **RELAXABLE — order** | The semantic shape (per-effect catch + AggregateError surface) is pinned. Order of errors in AggregateError is NOT pinned — `effect.test.ts:192` calls `.sort()` before assertion. So B1 may reorder the errors array; alien-signals' "first throw aborts" is incompatible and CANNOT be adopted. | `effect.test.ts:143–168, 170–195` |

### B1-specific ordering analysis

The user's brief states B1 produces "depth-first effect firing order." This matches today's `effectQueue` push order (which is DFS pre-order from the source signal across each sub list head→tail). **B1 does not change observable ordering for graphs without re-entrancy.** Confirmed by inspection of:
- No test asserts effect-firing order across siblings except via independent counter increments (which are order-independent).
- `effect.test.ts:124–141` checks both effects ran (`a` and `b` both incremented) — does not pin which fired first.
- `effect.test.ts:170–195` sorts the AggregateError messages — order within a wave is not pinned.

**Verdict: B1's depth-first inline ordering is observably equivalent to today for the existing test suite, modulo re-entrancy edge cases.** No test will fail purely from order changes.

### Tests B1 risks regressing

Following are the tests where B1's structural change touches the load-bearing invariant:

1. `effect.test.ts:143–168` ("thrown effect does not strand siblings") — exercises EI-1. B1 must wrap each inline-fire in try/catch. **High-attention test.**
2. `effect.test.ts:170–195` (AggregateError) — same as above; ensure errors[] is correctly threaded.
3. `effect.test.ts:197–238` (20 000-deep dep chain, no stack overflow) — load-bearing for B1's recursion-depth analysis. If B1 fires effects DURING mark and a recompute triggers a re-entrant signal write, the call stack could grow non-O(1). The current iterative markStack guarantees O(1) JS-stack frames (line 261–264 try/catch trims). B1's inline-fire RE-ENTERS markOne via the recompute's signal write, growing JS-stack by one frame per re-entry. With a 20 000-deep chain this is still safe (chain produces 1 wave; effect-body writes are not present in this test). **No regression expected** but Architect should confirm the analysis.
4. `batch.test.ts:83–109` ("effect that writes inside flush extends the same batch") — RC-1 batched re-entry. B1 must enqueue to batchQueue in the batched path; must NOT spawn a fresh wave inside drainBatch's iteration.
5. `effect.test.ts:76–85` (direct self-write → SignalCircularError) — exercises RUNNING flag check at `signal.ts:222, 244`. B1 preserves these checks. No regression expected.
6. `batch.test.ts:111–132` (cycle inside batch → SignalCircularError) — exercises MAX_BATCH_ITERATIONS at `signal.ts:401`. B1 doesn't touch drainBatch's iteration count. No regression expected.

### CS-1 + DI-1 interaction is the architect's hardest case

When B1 inline-fires effect E during the mark walk, and E's deps include both a fan-out computed C1 (which has been visited+marked but NOT yet recomputed) and a linear computed C2 (PENDING-only), the per-effect direct-dep settle loop (`signal.ts:339–341`) must walk E's depsHead and call `recomputeIfNeeded` on both. C1 may equality-stably recompute and trigger `shallowClear` on E's MARKED bit — at which point B1 must abort the inline-fire (just like today's drainEffectQueue line 342 `if (!(sub.flags & MARKED)) continue`). The Architect must spec this gate at the inline-fire site.

---

## 5. Open questions for Architect

1. **Size budget reconciliation.** `.size-limit.json` says 1850 B; HEAD overshoots at 1925 B (72 B over). The merge commit subject at HEAD says "signals limit raise to 2050 B" but the file wasn't updated. **What is the committed budget for Round N+3?** B1 fusion will likely add bytes. Architect needs an authoritative size cap before specifying. Suggested: align `.size-limit.json` to 2050 B in a separate commit before B1 lands; record current 1925 B as the pre-fusion floor and budget B1 to ≤ 2050 B.

2. **B1 dep-settle scope: per-effect-only, or transitive eager-settle?** When inline-firing effect E mid-mark, which dep-settle path does B1 take?
   - **Option α (alien-style, lazy):** call `checkDirty(E)` + per-effect direct-dep settle (today's drainEffectQueue lines 331–342). Cheaper, but `checkDirty` may force recomputes of fan-out computeds that the mark walk would otherwise have settled in `visited[]` order. Question: does this regress fan-out workloads (`wide-fanout-100`)?
   - **Option β (today's eager fan-out, fused effects):** complete the mark walk (populating `visited[]` and `effectQueue`), then run `settleAndDrain` (visited recompute + drain), but inline the drain into a continuation of the mark. Less aggressive fusion — closer to today's two-pass with the boundary blurred.
   - **Option γ (full B1):** during mark, settle each fan-out node WHEN ENCOUNTERED at fan-out, before continuing DFS. Most aggressive; preserves visited-pre-order settlement.

   Architect must pick before the spec is written. The user's "maximally fused; depth-first" implies α or γ.

3. **markStack safety under inline-fire re-entrancy.** When an effect's `notify()` body writes a signal (non-batched re-entrant write), today's path runs `propagateMark` → `markOne` → which uses the module-level `markStack`. Under B1, the inline-fire happens INSIDE the outer markOne while `markStack` has live entries. The inner mark wave will push onto the same stack and pop them. **Does B1 require a per-wave markStack (closure-allocated, costs bytes + alloc) or a length-discipline save/restore (cheap but bug-prone)?** Today's `try/catch` at line 261–264 already uses `baseLen` save-and-trim — extending this to a normal-completion save/restore is the cheap path.

4. **Error accumulator threading.** Today's `errors[]` is allocated at the top of `drainEffectQueue` (line 376) and `drainBatch` (line 398). B1's inline-fire happens inside `markOne` which today is shape-pure (returns void, no errors). Options:
   - **Option α:** module-level errors array, similar to `markStack`. Mark each fire-site's catch to push. Reset at the wave-start sites.
   - **Option β:** thread errors[] as a parameter through `markOne` → `propagateMark` → `signal.write`. More signature changes but type-safe.

5. **Re-entrancy under inline-fire: spawn-fresh-wave vs. defer.** When an effect body writes a signal inline-fired during a non-batched mark, today the write recurses into `signal.write` at line 506 which detects `batchDepth === 0` and spawns a fresh wave. Under B1, doing the same recursion is dangerous (markStack hazard, Q3) and produces deeper-than-needed call stacks. Should B1, even in non-batched mode, **enqueue the new write to a small inner queue and drain it after the outer mark completes**? This is a behavior change visible to users ONLY in observable timing/order; need to verify no test pins synchronous re-entry.

6. **Compressor-team coordination.** Compressor is in flight on `compressor/signals-h4-recovery` editing lines 1–200 and 437+. B1 fusion edits lines 200–435. Coordination question: **when B1 lands, will the merge with Compressor's branch be clean?** Compressor's targets (CL-7, K1c+ host classifier, etc.) might touch the `markOne` outer-loop entry conditions or the post-435 `drainBatch` body. The Architect should anchor B1's spec to the lines-200–435 invariant boundary explicitly and request a Compressor heads-up if their branch crosses the boundary.

7. **Bench gate environment lockdown.** Run-to-run variance in this Scout's measurements is wider than the 10 % gate (deep-prop 3.35 → 4.02 µs from same HEAD). The Builder's bench environment must be controlled — same machine, same warmup, same external load — across baseline and post-fusion measurement. Document this as a Builder pre-flight: **"Run baseline immediately before applying changes; do not cross-reference cached numbers from RESULTS.md committed by a different machine."**

8. **`Subscriber.notify` shape under B1.** Today `notify` lives on Effect.prototype (K1c+, signal.ts comment lines 346–349) and is called via `sub.notify?.()` (line 350). B1's inline-fire site needs the same optional-chain semantics. Confirm: signal-host literals at line 488–495 lack `notify` and are never EFFECT-flagged → never reach the inline-fire site. ✓ No change needed.

---

## 6. Files in scope for Architect spec

Confirmed:

- **`packages/signals/src/signal.ts` lines 200–435** — the entire mark/settle/drain pipeline. This is the WRITE region for Round N+3. All B1 surgery happens here.
- **`bench/signals/`** — read for receipts; do NOT modify workloads (would invalidate baseline). May regenerate RESULTS.md after fusion lands.
- **`tests/`** in `packages/signals/tests/` — MAY add new tests (e.g., a B1-specific re-entrancy regression). Never weaken or remove existing tests.

Out-of-scope (DO NOT TOUCH):

- `packages/signals/src/signal.ts` lines 1–199 and 436+ — Compressor team's region.
- `packages/signals/src/computed.ts`, `effect.ts`, `errors.ts`, `batch.ts`, `state.ts`, `untrack.ts`, `lattice.ts`, `index.ts` — outside Round N+3 scope. (Caveat: if `Computed.prototype.recomputeIfNeeded` needs a new code path for B1's per-effect settle, that may require a 1-line touch to `computed.ts`. Architect to flag in spec.)
- `.size-limit.json` — only update if Open Q #1 is resolved (separate commit, not B1's).

---

**Scout deliverables this round:**

1. `bench/baselines/round-n3-pre-51a1572.md` — committed.
2. `.team/round-n3/scout-report.md` — this file.

No source files edited (Scout is read-only).
