# Investigation: Deep-Chain Propagation Gap
**Date:** 2026-04-30
**By:** Investigator (automated)
**Workload:** `deep-propagation-100`
**Gap:** aihu 4.00 µs vs alien-signals 2.42 µs (1.65× slower)
**Target:** ≤ 3.00 µs p50 (≥ 25 % improvement)

**Sources read:**
- `packages/signals/src/signal.ts` (markOne, propagateMark, wave, settleAndDrain)
- `packages/signals/src/computed.ts` (recomputeIfNeeded, hasEffectSub)
- `packages/signals/src/effect.ts` (pool, notify, runEffect)
- `bench/signals/src/workloads/deep-propagation-100.ts`
- `node_modules/.bun/alien-signals@3.1.2/node_modules/alien-signals/esm/system.mjs` + `index.mjs`
- `.team/phase-2-5/deep-perf-wins-spec.md` + `deep-perf-wins-verification-report.md`
- `.team/learnings.md` (Learning #26: deep-chain design-point note)
- `bench/signals/RESULTS.md` (2026-04-30 baseline)

---

## 1. Structural comparison — step by step

### The benchmark setup (`deep-propagation-100.ts:39–56`)

```
src → c0 → c1 → c2 → … → c99 → effect
```

100 computeds in a linear chain. Each computed reads only one predecessor (zero fan-out within the chain). One terminal effect reads `c99`. On every `run()`, `setSrc(counter++)` is called — the value always changes.

---

### Aihu: step-by-step on `setSrc(n++)`

**Phase 1 — Mark** (`signal.ts:417–441`, specifically `wave++` at :435 and `propagateMark` at :437)

1. `wave++` (one integer increment, module-global).
2. `propagateMark(host.subsHead)` — walks the signal's subscriber list. The signal has one subscriber: `c0`. One call: `markOne(c0)`.
3. `markOne` begins an iterative DFS via `markStackSubs`/`markStackKinds` (two module-level arrays).
4. For each node `c[i]` (i = 0..98), `markOne`:
   - Checks `DISPOSED` (1 flag read)
   - Checks `lastWave === wave` (1 comparison — dedup)
   - Checks `RUNNING` (1 flag read)
   - Sets `sub.lastWave = wave` (1 write)
   - Sets `sub.flags |= MARKED` (1 read-modify-write)
   - The EFFECT bit is not set → goes to the else branch
   - Pushes `sub` onto `visited[]` (1 array push)
   - Sets `sub.flags |= STALE` (1 read-modify-write)
   - Reads `sub.subsHead` (1 pointer read)
   - The **restricted-leaf fast path** check (`signal.ts:222`):
     `head.nextSub === null && !(sub.flags & HAS_COMPUTED_DEPS) && head.sub.flags & EFFECT`
     — for c0 through c98: `head.nextSub === null` is TRUE (linear chain), `HAS_COMPUTED_DEPS` is SET (each computed reads another computed, marking it via `computed.ts:98`), so the fast path **does NOT fire** for any interior node.
   - Falls through to the general fan-out loop (`signal.ts:234`): pushes `head.sub` (= c[i+1]) onto the work stack.
5. For `c99` (the last computed, whose only subscriber is the effect):
   - Same flag checks and sets as above.
   - `head.nextSub === null` is TRUE, `HAS_COMPUTED_DEPS` is SET (c99 reads c98, which is a computed), so the fast path does NOT fire here either.
   - Falls to the general push: pushes the effect onto the work stack.
6. When the effect node is popped:
   - `EFFECT` flag is set → `effectQueue.push(effect)` (1 array push), then `continue`.
7. **Total mark-phase visits: 101 nodes** (c0 through c99 plus the effect). Each visit is ~8 operations (flag checks, writes, one array push to `visited` or `effectQueue`, and one Link pointer chase).

**Why HAS_COMPUTED_DEPS fires on every interior node:** On first construction, when c1's `read()` function runs (inside the effect's initial run), c1 calls `cap()` which calls c0's `read()`. Inside `computed.ts:98`:
```ts
else if (observer.recomputeIfNeeded !== undefined) observer.flags |= HAS_COMPUTED_DEPS
```
`observer` is c1 (a computed observer reading a computed source c0), so `c1.flags |= HAS_COMPUTED_DEPS`. This propagates for every link in the chain — c1 through c99 all get HAS_COMPUTED_DEPS set permanently. This permanently disables the restricted-leaf fast path for all 99 interior computeds.

**Phase 2 — Settle** (`signal.ts:305–310`, `settleAndDrain`)

```ts
for (const sub of visited) sub.recomputeIfNeeded?.()
```

`visited` contains c0 through c99 (100 entries, in DFS pre-order = c0 first). For each:
- `recomputeIfNeeded` in `computed.ts:64–85`:
  - Checks `DISPOSED`
  - Checks `!hasEffectSub` — **for c0 through c98**: `hasEffectSub` is `false` (their direct subscriber is another computed, not an effect). So `recomputeIfNeeded` returns early for **99 out of 100 nodes**.
  - For `c99`: `hasEffectSub` is `true` (its direct subscriber is the terminal effect). It checks `STALE`, reads `sub.subsHead`, runs `recompute()`, re-marks the effect as MARKED via the Link walk.
- **Total settle phase: 100 function calls into `recomputeIfNeeded`, 99 short-circuit at the `!hasEffectSub` guard, 1 actual recompute (c99 only).**

**Phase 3 — Effect drain** (`signal.ts:275–287`, `drainEffectQueue`)

- `effectQueue` has one entry: the terminal effect.
- Checks `DISPOSED`, `MARKED`, clears MARKED, calls `effect.notify()` → `runEffect(node)`.
- `runEffect` sets the observer context, calls `effect.fn()` which reads `tail()` (= `c99()`).
- Reading `c99()` from within the effect: `c99` has STALE cleared already (recomputeIfNeeded ran and cleared it at `computed.ts:51`: `node.flags &= ~(RUNNING | STALE | MARKED)`). But wait — only c99 was recomputed. When the effect calls `tail()` = `c99.read()`, `c99` is not STALE (it was just recomputed in Phase 2). Returns cached value.
- But this means **c0 through c98 were never recomputed**. The effect reads c99 which is fresh. Done.

**Summary for aihu on a 100-deep chain:**
| Phase | Node visits | Work per visit |
|---|---|---|
| Mark | 101 | ~8 ops: flag checks, lastWave write, array push, Link pointer read |
| Settle | 100 `recomputeIfNeeded` calls | 99 short-circuit (2 flag checks), 1 full recompute |
| Effect drain | 1 | `runEffect` + read c99 (cached) |
| **Total** | ~202 node touches | |

---

### Alien-signals: step-by-step on `setSrc(n++)`

Alien-signals uses a three-flag propagation model: `Dirty` (16), `Pending` (32), and `Watching` (2). The key function is `propagate` in `system.mjs:92–142`.

**Phase 1 — Propagate** (`index.mjs:258–288`, `signalOper` write path)

1. `this.flags = 1 | 16` (marks signal as Dirty).
2. Calls `propagate(subs)` where `subs` is the head of the signal's subscriber list — one link pointing to `c0`.
3. Inside `propagate` (a tight `do { ... } while(true)` loop):
   - For `c0`: `flags = c0.flags`. `c0` has `flags & 1` (Mutable/computed). Since `!(flags & (RecursedCheck | Recursed | Dirty | Pending))`, sets `c0.flags = flags | 32` (= Pending). Then checks `flags & 1` (Mutable) — yes. Reads `sub.subs` (c0's subscriber = c1's link). Descends: `link = subSubs` (the link to c1), saves `next = nextSub` (null).
   - Same for c1 through c98: each gets `flags |= 32` (Pending). The loop descends into `sub.subs` for each.
   - For `c99`: `flags |= 32` (Pending). Reads `c99.subs` = link to the effect. Descends into effect's link.
   - For the **effect**: `flags = effect.flags = 2 | 4` (Watching | RecursedCheck). The condition `!(flags & (RecursedCheck | Recursed | Dirty | Pending))` is FALSE (RecursedCheck=4 is set). Falls through to: `flags & 2` (Watching) is TRUE → `notify(effect)`.
4. `notify(effect)` (`index.mjs:17–34`): pushes the effect into `queued[]` array. The `effect.subs?.sub` chain checks for nested effects — none here. `queuedLength++`.

**Key insight**: In alien-signals' `propagate`, the flag set for computeds is `Pending` (32), NOT `Dirty` (16). `Pending` means "an upstream may be dirty; I need to check when read." It does NOT trigger a recompute. The loop visits all 100 computeds but only to set one flag bit (`|= 32`) and chase one pointer.

**Phase 2 — Flush/run** (`index.mjs:208–225`, `flush`)

- `run(effect)` is called. Checks `flags & 16` (Dirty) — no. Checks `flags & 32 && checkDirty(e.deps, e)`.
- `checkDirty` (`system.mjs:143–209`) is the **pull-on-read** verification: walks the effect's dep chain upward through c99 → c98 → … → c0 → signal, checking whether the signal is actually Dirty. On finding the signal is Dirty (`flags & (1 | 16) === (1 | 16)`), calls `update(dep)` which calls `updateComputed(dep)` for each computed starting at c0.
- `updateComputed(c)`: resets c's `depsTail`, sets flags, runs `c.getter()`, compares old vs new value. Returns true if changed.
- This triggers a **forward recompute walk from c0 to c99** inside `checkDirty`'s stack loop, recomputing each computed in order.
- After the recompute chain, `run(effect)` calls `e.fn()` (the effect body).

**Summary for alien-signals on a 100-deep chain:**
| Phase | Nodes touched | Work per node |
|---|---|---|
| Propagate | 101 (c0–c99 + effect) | 1 flag set (`|= 32`) + 1 pointer read + 1 stack push/pop for deep path |
| checkDirty + recompute | ~101 (checking upward + recomputing downward) | Full getter call per computed |
| Effect run | 1 | `e.fn()` |

**The structural difference is NOT in node visit count — it is in the work per node in the mark/propagate phase:**

- Aihu `markOne` per node: ~8 operations (two flag reads, one wave comparison, one `lastWave` write, one `flags |= MARKED` R-M-W, one `flags |= STALE` R-M-W, one `visited.push()`, one `markStackSubs.push()`, one Link pointer dereference).
- Alien `propagate` per node: ~3–4 operations (read flags, one OR assignment `|= 32`, read `sub.subs`, assign `link = subSubs`). No per-node array push in the common path — the stack is a linked list of inline stack frames (`{ value, prev }`) that only allocates when there are multiple subscribers (fan-out), not in the linear-chain case.

Additionally:
- Aihu has the **`visited[]` array** (one `push` per interior computed) that must be iterated in the settle phase.
- Alien has **no `visited[]` array**. Instead, recomputation is pulled lazily from within `checkDirty` when the effect actually runs.

**The settle-phase difference:**
- Aihu settle: iterates `visited` (100 entries), calls `recomputeIfNeeded` on each. 99 calls short-circuit at `!hasEffectSub`. 1 call recomputes c99.
- Alien settle (inside `run` → `checkDirty`): walks backwards from the effect through all 100 Pending computeds, recomputing each in forward order. All 100 computeds are recomputed — but this is one combined pass without the per-node `hasEffectSub` guard overhead.

The net effect: aihu does more bookkeeping in the mark phase (per-node `visited.push`, `STALE` flag, wave counter write) and more overhead in the settle phase (100 `recomputeIfNeeded` calls, 99 early-exits with two flag checks each) than alien's cleaner `|= 32` mark + single pull in `checkDirty`.

---

## 2. Root cause hypothesis

The gap has two components, both structural.

**Primary cause — A: Per-node overhead in the mark phase.**

Aihu's `markOne` performs ~8 operations per node. Alien-signals' `propagate` performs ~3–4 operations per node. On a 100-node linear chain, this difference is ~400–500 "wasted" operations. At ~4 ns per operation on V8, that is ~1.6–2.0 µs of mark-phase overhead beyond alien's. This accounts for most of the 1.58 µs gap (4.00 – 2.42 µs).

The specific contributors, in order of cost:

1. **`visited.push(sub)`** (signal.ts:211): one array element write per interior computed. Allocates hot path array growth. Alien has no equivalent.
2. **`sub.flags |= STALE`** (signal.ts:212): a read-modify-write that alien does not perform in the propagate phase (alien uses Pending = 32, a single OR, and no separate STALE concept).
3. **`markStackSubs.push()` / `markStackKinds.push()`** (signal.ts:235–237): two array pushes per node in the general fan-out path. Alien uses an inline `{ value, prev }` stack only at fan-out points; for the linear chain case it `continue`s the loop without any stack push.
4. **`lastWave = wave` write** (signal.ts:205): one write per node. Necessary for dedup but alien doesn't need a per-node counter for this workload (propagate is called once).

**Secondary cause — C: Settle phase overhead.**

100 calls to `recomputeIfNeeded`, 99 of which bail at `!hasEffectSub` after two flag checks. Each call is a non-trivially-sized function body (closure over `hasEffectSub`, `cached`, etc.) — V8 may not inline all 100 calls. Alien pulls recomputation through `checkDirty` in a single pass without per-node function call overhead.

**Not a significant cause — B (version counters):** Alien-signals does use a `version` field in its `link` function (`system.mjs:25–26`) for dep-edge reuse during recomputation, not for propagation dedup. This does not explain the deep-chain gap. The `cycle` counter in alien (`index.mjs:168`) is incremented per recompute, not per propagation wave. It is not the mechanism that makes deep-chain faster.

**Summary:** The root cause is A (mark-phase per-node overhead) + C (settle-phase 100-function-call overhead), with A being primary (~70 % of gap) and C secondary (~30 %).

---

## 3. Option analysis

### Option A: Lazy mark with pull-on-read

**Mechanism:** Instead of setting STALE on each intermediate computed and pushing it to `visited[]` during the mark phase, mark only the direct subscribers as STALE (or a lighter "Pending" bit) and let downstream nodes lazily pull during the effect's `notify()` run by re-running `recomputeIfNeeded` on demand.

**(a) Expected impact on deep-propagation-100:**

Eliminating the `visited[]` push and the STALE flag write from the mark phase removes ~2 array operations per interior computed. The settle phase would be restructured so `recomputeIfNeeded` is only called on nodes that are actually read. For the 100-deep linear chain, the effect reads c99, which reads c98, etc. — a chain of lazy pulls. This mirrors alien's `checkDirty` model.

Estimated gain: eliminating `visited[]` push and the settle iteration loop reduces per-op cost by roughly 100 × ~6 ns (array push + STALE write + settle call) = ~600 ns, pushing aihu's p50 from 4.00 µs toward ~3.40 µs. The remaining gap to 2.42 µs would require further reducing mark overhead (items 3 and 4 from §2).

**(b) Risk to other workloads:**

- **cellx** (5-deep diamond, 1 effect): The cellx diamond has multiple paths converging on the same computed nodes (L4 has 2 subscribers, L3 has 2 subscribers, etc.). The current `hasEffectSub` check is set when an effect directly subscribes. In the lazy-pull model, the "does this node need recomputing?" check must correctly handle diamonds. Aihu's existing wave-counter dedup (`lastWave === wave`) already handles the diamond dedup in the mark phase. The settle phase for cellx currently benefits from the eager recompute of L4 (which has `hasEffectSub = true`). A lazy model must replicate this without a regression.
  - **Risk: MEDIUM.** The cellx restricted-leaf fast path (`signal.ts:222`) currently fires when `head.nextSub === null && !(HAS_COMPUTED_DEPS) && head.sub.flags & EFFECT`. In the diamond, some interior nodes have HAS_COMPUTED_DEPS set (they read other computeds). The lazy model's correctness for diamonds requires careful handling of the multi-parent case.
- **wide-fanout-100** (1 signal → 100 computeds → 100 effects): Each computed has `hasEffectSub = true` (its direct subscriber is an effect). In the current model, all 100 computeds are pushed to `visited` and all are recomputed in settle. A lazy model defers recomputation to effect run time — each of 100 effects would independently trigger its own recompute walk. This would be 100 separate single-step pull operations, which is no worse than today and may be faster by eliminating the `visited[]` array pass.
  - **Risk: LOW.** Each c[i] has only one dep (the signal) and one subscriber (effect[i]). The pull is one step.
- **dynamic-deps**: The current aihu advantage (1.65×) on dynamic-deps relies on fast re-wiring of the dep graph during effect re-runs. Lazy pull does not change the re-wiring mechanism. **Risk: LOW.**
- **batched-writes-100**: Uses `batchDepth > 0` path which calls `enqueueIfNeeded` and then `drainBatch`. The lazy-pull change primarily affects the non-batched settle path. **Risk: LOW.**
- **creation-1to1000**: Graph construction, not propagation. **Risk: NONE.**

**Compatibility with restricted-leaf fast path:** The restricted-leaf fast path fires for a computed with exactly one effect subscriber and no computed deps (`HAS_COMPUTED_DEPS` unset). In the deep chain, every interior computed has `HAS_COMPUTED_DEPS` set, so the fast path never fires for c0–c99. A lazy-pull model would effectively replace the settle pass for the deep-chain case. The fast path could be retained for shallow trees (cellx-shaped) where HAS_COMPUTED_DEPS is unset on the leaf computed. These two mechanisms do not conflict — they cover different graph shapes.

**(c) Implementation complexity: HIGH.**

This is a significant restructuring of the mark → settle pipeline. The `recomputeIfNeeded` function's `!hasEffectSub` guard would need to become a pull-on-read mechanism. The settle loop (`for (const sub of visited) sub.recomputeIfNeeded?.()`) would need to be replaced or changed fundamentally. The `visited[]` array would shrink or disappear. The `STALE` flag semantics would need revisiting (currently STALE on a computed means "will recompute in settle"; a lazy model overloads STALE to mean "recompute on next read").

**(d) Size impact: +40 to +80 B gz.**

The settle loop simplification and the removal of `visited[]` management would save bytes, but the new lazy-pull dispatch logic in `recomputeIfNeeded` (or a new `checkDirty`-style function) would add bytes. Roughly net-neutral to +80 B gz.

---

### Option B: Version counter per computed node

**Mechanism:** Add a `version: number` field to each computed. The signal increments a global version on every write (replacing or extending the `wave` counter). During `recomputeIfNeeded`, if the computed's recorded version of its deps matches the current version, skip recompute.

**(a) Expected impact on deep-propagation-100:**

In this benchmark, `setSrc(counter++)` — the value always changes. The source signal's version always increments. c0's version would be updated after recompute to match the signal's new version. c1's version check against c0 would find c0's version changed → recompute c1. This propagates all the way to c99. Every node is recomputed on every write.

**A version counter provides ZERO benefit for deep-propagation-100** because the value changes on every write. The version check would be "c0's version ≠ recorded version → must recompute" for every single node, 100 times per operation.

**(b) Risk to other workloads:**

The version counter is beneficial only when an intermediate computed's output does NOT change despite an upstream change (e.g., `computed(() => Math.abs(src()))` where src toggles between 1 and -1 — the computed always returns 1). None of the current no-regression gate workloads have this pattern. The counter would be dead weight for all five gates.

**(c) Implementation complexity: LOW-MEDIUM.**

Adding a `version` field to `Subscriber` is straightforward. Integrating it into `recomputeIfNeeded` is mechanical.

**(d) Size impact: +20 to +40 B gz.**

One new field on Subscriber plus a handful of comparison sites.

**Verdict: Option B does not address the deep-chain problem at all. It is the wrong solution for this workload. Noted in `.team/learnings.md` Learning #26 and `.team/phase-2-5/deep-perf-wins-spec.md` §8 item 3 as previously investigated and deferred.**

---

### Option C: Iterative pull in settleAndDrain

**Mechanism:** Keep the current eager-mark phase (all 100 nodes visited, pushed to `visited[]`) but optimize `settleAndDrain` to skip the 99 short-circuit `recomputeIfNeeded` calls by only calling `recomputeIfNeeded` on nodes with `hasEffectSub = true`.

This is actually close to what aihu already does: the `!hasEffectSub` guard in `computed.ts:66` already skips recompute for nodes with no effect subscribers. The settle loop iterates `visited` (100 entries) but 99 short-circuit in 2–3 instructions.

A refinement: instead of pushing ALL computeds to `visited[]` during mark and iterating all of them in settle, only push computeds where `hasEffectSub === true` during mark. This would reduce `visited[]` to 1 entry (just c99) and the settle loop to 1 actual call.

**(a) Expected impact on deep-propagation-100:**

This is an optimization of the settle phase only. The mark phase still visits 100 nodes and does all its current work (STALE flag, `visited.push`, stack operations). The settle loop reduces from 100 iterations to 1.

Eliminating 99 unnecessary `visited.push()` + 99 unnecessary `recomputeIfNeeded` short-circuits saves approximately:
- 99 × `visited.push()`: ~99 × 3 ns = ~300 ns
- 99 × two-flag-check `recomputeIfNeeded`: ~99 × 2 ns = ~198 ns
- Total: ~500 ns improvement

This would bring aihu from 4.00 µs toward ~3.50 µs — meaningful but not enough to reach ≤ 3.00 µs alone.

**(b) Risk to other workloads: LOW.**

The change is simply "don't push to `visited[]` if `hasEffectSub === false`." Nodes without effect subs are already no-ops in the settle loop. The STALE flag must still be set (for pull-on-read correctness) even if not pushed to `visited[]`. The wave counter dedup is unaffected. The restricted-leaf fast path is unaffected.

- **cellx**: L4 has `hasEffectSub = true`; it is the only node that needs to be in `visited[]`. L1/L2/L3 have `hasEffectSub = false` (their subs are other computeds). Currently L1–L3 are pushed to `visited[]` and short-circuit in `recomputeIfNeeded`. Under this option, L1–L3 would not be pushed — the settle loop visits only L4 and recomputes it. The critical question is whether L4 can read L3 as STALE and get a fresh value. Answer: yes — because L4's `recomputeIfNeeded` will call `recompute()` which calls `fn()` which calls `L3()`. L3's `read()` function finds `node.flags & STALE` is set, calls `recompute()`, which calls L2, which calls L1 in turn. The STALE flag on each node triggers a lazy pull from within the recompute chain. This is already how aihu handles computeds that are STALE at read time (`computed.ts:101–105`): `if (!hasCached || node.flags & STALE) { cached = recompute(); hasCached = true }`.
- **dynamic-deps**: The computed reads 5 of 50 signals. `hasEffectSub = true` (it has an effect subscriber). It would always be in `visited[]`. No change.
- **wide-fanout-100**: 100 computeds each with `hasEffectSub = true`. All 100 stay in `visited[]`. No change.
- **batched-writes-100**: 1 computed with `hasEffectSub = true`. No change.
- **creation-1to1000**: Not affected.

**(c) Implementation complexity: LOW.**

One change in `markOne` (`signal.ts:211`):
```ts
// Before:
visited.push(sub)
// After:
if (hasEffectSub) visited.push(sub)
```

But `hasEffectSub` is a closure variable in `computed.ts`, not accessible from `signal.ts`'s `markOne`. The implementation needs a flag bit to communicate this. A natural approach: repurpose or add a flag bit `HAS_EFFECT_SUB = 0x40` (or similar) that is set when an effect subscribes (`computed.ts:94`). The `markOne` function would check this flag before pushing to `visited[]`:

```ts
// In markOne (signal.ts):
if (sub.flags & HAS_EFFECT_SUB) visited.push(sub)
```

The `hasEffectSub` variable in `computed.ts:41` would also set this flag on the node. This is a 2-file change, ~10 lines of code.

**(d) Size impact: +15 to +30 B gz.**

One new flag constant plus two flag-set sites and one flag-check site.

---

### Option D: Hybrid — restrict eager mark to fanout-only paths

**Mechanism:** Only walk eagerly into downstream computeds when the current node has multiple subscribers (fan-out, `head.nextSub !== null`). For linear chains (`head.nextSub === null`), defer by NOT pushing to `visited[]` and NOT setting STALE — instead, set only a lightweight "Pending" bit. At effect run time, pull lazily through the Pending chain.

**(a) Expected impact on deep-propagation-100:**

For the 100-deep linear chain, every node has `head.nextSub === null`. This means:
- Mark phase: visit 101 nodes, set Pending bit only (no STALE, no `visited.push`). ~3–4 ops per node instead of ~8.
- Settle: skip entirely (no `visited[]` to iterate).
- Effect drain: effect fires, calls `c99()`. c99 is Pending → check if dirty (need a checkDirty-style walk up to source). Recompute c99 (which recomputes c98..c0 lazily).

Estimated gain from removing `visited[]` push, STALE flag, and settle iteration: ~800 ns–1.2 µs improvement. This could bring aihu to ~2.8–3.2 µs, near or at the 3.00 µs target.

**(b) Risk to other workloads:**

- **cellx** (5-deep diamond with fan-out): The diamond has interior nodes with `head.nextSub !== null` (e.g., the signal has 2 subscribers L1[a] and L1[b]). These nodes would follow the eager path unchanged. Interior diamond nodes with a single subscriber (e.g., L4 with 1 effect sub) would follow the lazy path. This correctly covers cellx: the eager path handles the diamond fan-out; the lazy path handles the final-hop to the effect.
  - **Risk: MEDIUM.** The transition between eager (fan-out) and lazy (single-sub) paths must be correct at diamond merge points. When two paths converge on L4 (both L3a and L3b have L4 as their sub), the second mark of L4 is already deduped by the wave counter. But L4's Pending vs STALE semantics must be consistent.
- **wide-fanout-100** (1 signal → 100 computeds → 100 effects): The signal has 100 subscribers (all `head.nextSub !== null`). The signal's fan-out triggers the eager path, walking all 100 computeds. Each computed has one effect sub (`head.nextSub === null` for each c[i]→effect[i] edge) — so c[i]→effect[i] follows the lazy path. But the signal→c[i] edges are walked eagerly (fan-out from signal). Each c[i] gets STALE set and is pushed to `visited[]`. The settle loop still runs 100 recomputes. **No change for wide-fanout-100** — the signal's fan-out means the eager path applies everywhere.
  - **Risk: NONE** for wide-fanout regression.
- **dynamic-deps**: The computed reads 5 of 50 signals. Each signal has exactly 1 subscriber (the computed). So signal→computed edges are linear (no fan-out from signals). The computed→effect edge is also linear. Under Option D, the propagation from all 5 signals through the computed to the effect would use the lazy path. The effect would pull lazily.
  - **Risk: LOW.** aihu currently wins dynamic-deps 1.65× over alien. The lazy pull on the computed is equivalent to how alien handles it. Aihu's advantage on dynamic-deps is primarily from fast re-wiring on dep rotation, not from the propagation model. The lazy-pull addition should be neutral or slightly beneficial.
- **batched-writes-100**: 100 signals, each with 1 subscriber (the effect). All signal→effect edges are linear. Under Option D, the propagation is lazy (Pending only). The effect fires 100 times (once per signal, batched). The checkDirty call per effect is trivial (1 dep, 1 step). No regression expected.
- **creation-1to1000**: Not affected.

**(c) Implementation complexity: HIGH.**

Requires:
1. A new `PENDING = 0x100` (or similar) flag distinct from STALE.
2. A `checkDirty`-style pull function that walks Pending chains backward to find the source of dirtiness.
3. Modified `markOne`: for single-sub paths (`head.nextSub === null && head.sub.flags & EFFECT`), only set Pending on the chain — do not push to `visited[]`, do not set STALE.
4. Modified effect `notify()`: before running, call `checkDirty`-like logic to verify the chain is actually dirty and recompute in topological order.
5. Careful handling of the cellx diamond where the eager and lazy paths must interoperate correctly.

This is the most complex option. It touches both `signal.ts` and `computed.ts` significantly. The correctness invariant for the diamond case requires careful specification.

**(d) Size impact: +60 to +120 B gz.**

New flag constant, new `checkDirty`-like function, and modified `markOne` branching. Likely 100–150 B raw, ~70–110 B gz.

---

## 4. Recommendation

**Recommended: Option C first, then evaluate Option A or D.**

### Why Option C first

Option C (skip `visited[]` push for nodes with `hasEffectSub = false`) is:
- **Low risk**: the correctness argument is tight — nodes not in `visited[]` are already no-ops in the settle loop; the only behavior change is removing 99 no-op calls. STALE is still set on interior nodes, so pull-on-read from within `recomputeIfNeeded` still works.
- **Low complexity**: ~10 lines across 2 files, one new flag constant.
- **Measurable**: estimated 400–500 ns improvement (12–13 % of the 4.00 µs total, reaching ~3.50 µs). Not sufficient alone to hit the ≤ 3.00 µs target, but a clean first step that provides an independent measurement point.
- **No regression gates threatened**: all five gate workloads are either unaffected (wide-fanout has all nodes with `hasEffectSub = true`) or improved (deep-chain).

**After Option C is measured:** If aihu reaches ~3.50 µs, combine with a targeted Option A partial (lazy pull only for the STALE-but-no-effect-sub computeds at read time, replacing the current `if (!hasCached || node.flags & STALE)` pull path). This partial Option A addresses the mark-phase overhead without restructuring the full mark → settle pipeline.

### Why not Option A alone

Option A (full lazy-pull restructuring) is the right long-term direction and is how alien-signals achieves its performance. However:
- It requires a careful correctness argument for the diamond case (cellx). The restricted-leaf fast path interaction must be re-specified.
- It is not a "small incremental change" — it is a structural rewrite of the settle pipeline that should be driven by a spec (similar to how the Phase 2 linked-list rewrite was specced in `.team/phase-2-5/deep-perf-wins-spec.md`).
- The risk to the cellx no-regression gate (floor ≤ 557 ns; current 506 ns) is non-trivial and requires bench validation at each step.

### Why not Option B

Option B provides zero benefit on deep-propagation-100 (all values change) and zero benefit on any no-regression gate workload. Ruled out.

### Why not Option D alone

Option D is the highest-impact option (potentially reaching 2.8–3.2 µs) but also the highest complexity. It requires a new `checkDirty`-style function and a new flag. The Architect should spec this as a follow-on once Option C's measurement confirms the settle-phase overhead model is correct.

### Proof-of-concept micro-test

A standalone test can be written in `packages/signals/tests/` or `bench/signals/src/workloads/` that benchmarks the current 100-deep chain behavior without modifying `signal.ts`. For example, a test that runs 10,000 iterations of `setSrc(counter++)` and measures wall clock, then compares to a hand-rolled version where the `visited[]` iteration is manually counted. This can be done with `performance.now()` and `console.log` in a standalone `.ts` file under `.team/v1/poc-deep-chain.ts`. It does not require modifying any source file and can validate the hypothesis that 99 no-op `recomputeIfNeeded` calls are indeed contributing ~500 ns.

---

## 5. Size constraint

**Current budget:** `@aihu/signals` is 1.53 kB gz (Scout report, 2026-04-30). Cap is 1.70 kB gz. Headroom: 172 B.

| Option | Estimated size cost | Remaining headroom |
|---|---|---|
| Option C alone | +15 to +30 B gz | 142–157 B remaining |
| Option A (full lazy-pull) | +40 to +80 B gz | 92–132 B remaining |
| Option D (hybrid) | +60 to +120 B gz | 52–112 B remaining |
| Options C + partial A | +35 to +80 B gz | 92–137 B remaining |

**Option C is well within budget.** The new `HAS_EFFECT_SUB` flag constant (~6 B), the flag-set in `computed.ts` (~8 B), and the conditional `visited.push` in `markOne` (~10 B) total ~24 B raw. After gzip, likely 15–20 B gz.

Option A's laziness dispatch adds a new branch in `recomputeIfNeeded` or a new helper function. Estimated 40–60 B raw, 25–40 B gz.

Option D's `checkDirty`-style function plus new `PENDING` flag is the largest addition: 80–150 B raw, 50–90 B gz. Still within the 172 B headroom but leaving only ~52–122 B for future features.

**Recommendation:** Ship Option C (15–30 B gz). Reserve remaining 142+ B headroom for a potential Option D follow-up.

---

## 6. No-regression risk assessment

| Gate | Current floor | Option C risk | Option A risk | Option D risk |
|---|---|---|---|---|
| cellx p50 ≤ 557 ns (floor from 506 ns) | Currently 506 ns | **VERY LOW** — cellx nodes L4 has `hasEffectSub = true` and stays in `visited[]`. L1–L3 have `hasEffectSub = false` and would be removed from `visited[]`. BUT they are already no-ops in the current settle loop. The only behavior change: L4's recompute now lazily pulls from L3 instead of L3 being pre-computed. L3 will be STALE, so L4's `recompute()` triggers `L3.read()` → STALE → pull L2 → pull L1. This is the existing pull path in `computed.ts:101–105`. No new logic. | **MEDIUM** — requires correctness proof for diamond case; risk of regression if lazy-pull handles multi-parent diamonds incorrectly. | **MEDIUM** — same concern as Option A for diamond paths. |
| wide-fanout-100 p50 ≤ 5.15 µs (floor from 4.68 µs) | Currently 4.68 µs | **NONE** — all 100 computeds have `hasEffectSub = true`. All stay in `visited[]`. Zero change to wide-fanout path. | **LOW** — each compute has one effect sub; lazy pull is one step. | **NONE** — signal's fan-out is 100 (not linear); eager path applies. |
| batched-writes-100 p50 ≤ 2.86 µs (floor from 2.60 µs) | Currently 2.60 µs | **NONE** — batched path uses `batchDepth > 0` → `enqueueIfNeeded` → `drainBatch`. Option C only changes the non-batched settle path. | **LOW** — batched path is separate (`drainBatch`); if lazy-pull doesn't change `drainBatch`, no regression. | **LOW** — same as Option A. |
| dynamic-deps p50 ≤ 816 ns (floor from 742 ns) | Currently 742 ns | **NONE** — computed has `hasEffectSub = true` (effect subscriber). Not affected by Option C. | **LOW** — computed's recompute is a pull from 5 signals; lazy pull reduces to same structure. | **LOW** — all signal→computed edges are linear (no fan-out from signals). |
| creation-1to1000 p50 ≤ 76.2 µs (floor from 69.3 µs) | Currently 69.3 µs | **NONE** — this bench measures graph construction, not propagation. No runtime path affected. | **NONE** | **NONE** |

---

## 7. Next steps for Architect

1. **Specify Option C as a micro-spec.** The Architect should write a short spec (following the pattern of `.team/phase-2-5/deep-perf-wins-spec.md`) covering:
   - Add `HAS_EFFECT_SUB = 0x40` (or confirm no bit clash with existing `MARKED = 0x20`, `HAS_COMPUTED_DEPS = 0x80`) in `signal.ts`.
   - In `computed.ts:94`, set `node.flags |= HAS_EFFECT_SUB` when an effect subscribes (`observer.flags & EFFECT !== 0`).
   - In `markOne` (`signal.ts:211`), change `visited.push(sub)` to `if (sub.flags & HAS_EFFECT_SUB) visited.push(sub)`.
   - Confirm that STALE is still set regardless (line 212 is unchanged).
   - Write a bench-validation gate: deep-propagation-100 must improve ≥ 10 % (≤ 3.60 µs); no gate workload regresses > 5 %.

2. **Specify the cellx correctness invariant for the lazy-pull path.** When Option C is landed, verify that `bun .team/phase-2-5/scratch/cellx-counter.ts` still prints TOTAL = 17. If it does, the lazy-pull from within `recomputeIfNeeded` correctly handles the diamond case. This is the empirical proof the restricted-leaf path is compatible.

3. **After Option C is measured, decide on Option D.** If Option C delivers ~400–500 ns improvement (reaching ~3.50 µs), Option D's additional ~700–1000 ns reduction is required to hit ≤ 3.00 µs. The Architect should spec Option D as a second phase, treating Option C as Phase 0 and Option D as Phase 1.

4. **Do NOT pursue Option B.** The version-counter approach is confirmed as not applicable to this workload. It is appropriate only for scenarios where intermediate computeds produce stable outputs despite upstream changes — not this benchmark.

5. **Proof-of-concept:** A PoC can be written at `.team/v1/poc-deep-chain-option-c.ts` that simulates the Option C behavior by running the benchmark twice: once as-is and once with `visited[]` manually filtered to only `hasEffectSub` nodes. This can be done WITHOUT modifying `signal.ts` by post-filtering `visited` in a monkey-patched test setup. The PoC validates the performance hypothesis before Builder implements the flag.

---

**Key file:line citations:**

- `signal.ts:185–248` — `markOne` iterative DFS implementation
- `signal.ts:205` — `sub.lastWave = wave` (per-node wave write)
- `signal.ts:207–210` — EFFECT branch: `effectQueue.push` + return
- `signal.ts:211–212` — `visited.push(sub)` and `sub.flags |= STALE` (Option C target)
- `signal.ts:222–228` — restricted-leaf fast path (HAS_COMPUTED_DEPS guard)
- `signal.ts:234–237` — general fan-out push to mark stack
- `signal.ts:305–310` — `settleAndDrain`: iterate `visited`, call `recomputeIfNeeded`
- `computed.ts:41` — `let hasEffectSub = false` closure variable
- `computed.ts:64–85` — `recomputeIfNeeded`: early-exit at `!hasEffectSub` (line 66)
- `computed.ts:94` — `if ((observer.flags & EFFECT) !== 0) hasEffectSub = true`
- `computed.ts:98` — `HAS_COMPUTED_DEPS` flag set on computed-reading-computed
- `computed.ts:101–105` — lazy pull at read time (`if (!hasCached || node.flags & STALE)`)
- `alien-signals/esm/system.mjs:92–142` — `propagate`: the 3–4 ops/node linear-chain loop
- `alien-signals/esm/index.mjs:167–180` — `updateComputed`: the pull-on-run recompute
- `alien-signals/esm/index.mjs:186–207` — `run(effect)`: calls `checkDirty` before `e.fn()`
- `bench/signals/src/workloads/deep-propagation-100.ts:39–56` — benchmark chain structure
