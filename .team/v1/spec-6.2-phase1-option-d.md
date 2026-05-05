# Spec — Plan 6.2 Phase 1: Option D — Hybrid Fanout/Lazy Mark Propagation

**Author:** Architect
**Date:** 2026-04-30
**Status:** READY FOR BUILDER
**Predecessor:** Plan 6.2 Phase 0 (Option C) — `HAS_EFFECT_SUB = 0x40`, conditional `visited.push` in `markOne`
**Target workload:** `deep-propagation-100`
**Current baseline (post Option C):** 3.27 µs p50
**Target:** ≤ 3.00 µs p50 (≥ 25 % improvement from original 4.00 µs; ~8 % more from current 3.27 µs)

**Investigation source:** `.team/v1/investigation-deep-chain.md` §3 Option D, §6
**Format follows:** `.team/phase-2-5/deep-perf-wins-spec.md`

---

## §1 Goal and gates

### §1.1 Primary goal

Reduce `deep-propagation-100` p50 from **3.27 µs** (post Option C) to **≤ 3.00 µs** by replacing the
per-node `STALE`-flag-and-`visited[]`-push with a lightweight `PENDING` bit for nodes on a linear
path (single subscriber). Fan-out nodes keep the existing eager mark path unchanged.

### §1.2 Hard gates — no-regression contracts (post-Option-C baselines)

All five gates from `state-track-c.md` must hold. The floors are −10 % from the Option C
post-merge baselines.

| Workload | Post-Option-C baseline | Floor (≤) | Risk under Option D |
|---|---:|---:|---|
| `cellx` | ~506 ns | **≤ 557 ns** | MEDIUM — diamond merge point; see §6 |
| `wide-fanout-100` | ~4.68 µs | **≤ 5.15 µs** | NONE — signal fan-out is 100, eager path applies |
| `batched-writes-100` | ~2.60 µs | **≤ 2.86 µs** | LOW — lazy path; trivial 1-dep checkDirty |
| `dynamic-deps` | ~742 ns | **≤ 816 ns** | LOW — all signal→computed edges are linear |
| `creation-1to1000` | ~69.3 µs | **≤ 76.2 µs** | NONE — graph construction, no propagation |

Additionally: `deep-propagation-100` p50 must reach **≤ 3.00 µs** (the primary target).

### §1.3 Public API surface

**Unchanged.** All changes are `/** @internal */`. `packages/signals/src/index.ts` is unmodified.

---

## §2 Current state — post Option C

### §2.1 Flag constants in `signal.ts` (as of Option C merge)

```ts
/** @internal */ export const RUNNING          = 0x01
/** @internal */ export const DISPOSED         = 0x02
/** @internal */ export const QUEUED           = 0x04
/** @internal */ export const STALE            = 0x08
/** @internal */ export const EFFECT           = 0x10
/** @internal */ export const MARKED           = 0x20
/** @internal */ export const HAS_EFFECT_SUB   = 0x40   // ← added by Option C
/** @internal */ export const HAS_COMPUTED_DEPS = 0x80
```

`0x40` is `HAS_EFFECT_SUB`, the only Option C addition. It is set on a computed node when an
effect subscribes (in `computed.ts` read path) and consulted in `markOne` to decide whether to
push to `visited[]`.

### §2.2 `markOne` hot path (post Option C, simplified)

```ts
// ... dedup, DISPOSED, RUNNING, lastWave checks ...
sub.lastWave = wave
sub.flags |= MARKED
if (sub.flags & EFFECT) { effectQueue.push(sub); continue }
if (sub.flags & HAS_EFFECT_SUB) visited.push(sub)   // Option C: conditional push
sub.flags |= STALE
const head = sub.subsHead
// ... restricted-leaf fast path and general fan-out push ...
```

Per the investigation (§1 of `investigation-deep-chain.md`), after Option C the deep-chain mark
phase does ~7–8 ops per node: dedup checks, `lastWave` write, `MARKED` R-M-W, `STALE` R-M-W,
`visited.push` (for `HAS_EFFECT_SUB` nodes), and stack push. For the 100-deep linear chain only
the terminal computed (`c99`) has `HAS_EFFECT_SUB` set, so 99 of 100 `visited.push` calls are
already eliminated. The remaining gap to ≤ 3.00 µs is the per-node `STALE` R-M-W and the
`markStackSubs.push` / `markStackKinds.push` for the general fan-out path.

---

## §3 Bit allocation — `PENDING = 0x100`

### §3.1 Chosen value

```ts
/** @internal */
export const PENDING = 0x100
```

**Rationale:**
- All bits 0x01–0x80 are occupied (see §2.1). `0x100` is the next free bit, fitting in a 32-bit
  integer (JS numbers are 32-bit for bitwise operations).
- Does not collide with any existing flag.
- Semantics: "an upstream may be dirty; this node has not yet been confirmed dirty; recompute
  only if `checkDirty` returns true at effect-run time."

### §3.2 Full flag table after Option D

```ts
/** @internal */ export const RUNNING          = 0x001
/** @internal */ export const DISPOSED         = 0x002
/** @internal */ export const QUEUED           = 0x004
/** @internal */ export const STALE            = 0x008
/** @internal */ export const EFFECT           = 0x010
/** @internal */ export const MARKED           = 0x020
/** @internal */ export const HAS_EFFECT_SUB   = 0x040   // Option C
/** @internal */ export const HAS_COMPUTED_DEPS = 0x080
/** @internal */ export const PENDING          = 0x100   // Option D ← NEW
```

All nine constants fit in the lower 9 bits of a 32-bit integer. No mask arithmetic changes are
needed; existing `flags & X` checks remain valid.

---

## §4 `markOne` change — hybrid linear/fan-out branch

### §4.1 Variable naming clarification

Inside `markOne`, the variable `head` is assigned as:

```ts
const head = sub.subsHead
```

`sub.subsHead` is the head of the **forward (subscriber-direction)** linked list — i.e., the
list of nodes that are *downstream* of `sub`. Each `Link` in this list has `link.sub` pointing
to one downstream subscriber of `sub`.

Therefore `head.nextSub === null` means "the current node being marked (`sub`) has exactly **one**
downstream subscriber." This is the correct check for the "linear path" condition — not the
number of dependencies, but the number of subscribers.

A linear path means the current computed node has a single outbound edge (one forward link). In
the 100-deep chain, every interior node `c[i]` has exactly one subscriber (`c[i+1]` or the
terminal effect), so `head.nextSub === null` is true for all 100 interior nodes.

### §4.2 Exact `markOne` change

**Current (post Option C):**

```ts
if (sub.flags & HAS_EFFECT_SUB) visited.push(sub)
sub.flags |= STALE
const head = sub.subsHead
if (head === null) continue
if (head.nextSub === null && !(sub.flags & HAS_COMPUTED_DEPS) && head.sub.flags & EFFECT) {
  // restricted-leaf fast path (unchanged)
  markStackSubs.push(sub)
  markStackKinds.push(MARK_KIND_RECOMPUTE)
  markStackSubs.push(head.sub)
  markStackKinds.push(MARK_KIND_MARK)
  continue
}
for (let l: Link | null = sub.subsTail; l !== null; l = l.prevSub) {
  markStackSubs.push(l.sub)
  markStackKinds.push(MARK_KIND_MARK)
}
```

**After Option D:**

```ts
const head = sub.subsHead
if (head === null) continue

if (head.nextSub === null) {
  // Linear path: single subscriber — lazy PENDING, no visited push, no STALE.
  sub.flags |= PENDING
  // Do NOT push to visited[]. Do NOT set STALE.
  markStackSubs.push(head.sub)
  markStackKinds.push(MARK_KIND_MARK)
  continue
}

// Fan-out path (head.nextSub !== null): keep existing eager mark.
if (sub.flags & HAS_EFFECT_SUB) visited.push(sub)
sub.flags |= STALE
for (let l: Link | null = sub.subsTail; l !== null; l = l.prevSub) {
  markStackSubs.push(l.sub)
  markStackKinds.push(MARK_KIND_MARK)
}
```

**Important details:**

1. The `head === null` short-circuit moves before the linear/fan-out branch. This is a safe
   reordering — `head === null` means no subscribers at all; the node is a leaf sink with no
   downstream, so neither PENDING nor STALE is relevant.

2. `sub.flags |= MARKED` and `sub.lastWave = wave` are still set **before** this branch (earlier
   in the loop body, unchanged). Both the linear and fan-out paths benefit from these.

3. The restricted-leaf fast path (`!(sub.flags & HAS_COMPUTED_DEPS) && head.sub.flags & EFFECT`)
   is **subsumed** by the linear path check. In the deep chain, all interior computeds have
   `HAS_COMPUTED_DEPS` set, so the restricted-leaf fast path never fires for them — Option D's
   linear path takes over for those nodes. For nodes where the restricted-leaf fast path
   previously fired (`!(HAS_COMPUTED_DEPS)` and one effect sub), those nodes now follow the
   linear path and get `PENDING` instead of triggering an inline recompute during marking.
   **This means the restricted-leaf fast path is effectively replaced by the linear path when
   `head.nextSub === null`.** The Builder must remove the now-dead restricted-leaf fast path
   block or verify that it is unreachable. See §4.3.

4. For the linear path, `MARKED` is still set (from the earlier unconditional line). The effect
   at the end of the chain will be pushed to `effectQueue` when its EFFECT bit is seen — this
   is unchanged.

### §4.3 Restricted-leaf fast path interaction

The restricted-leaf fast path at `signal.ts:222` currently fires when:
```
head.nextSub === null && !(sub.flags & HAS_COMPUTED_DEPS) && head.sub.flags & EFFECT
```

Under Option D, `head.nextSub === null` is now handled by the linear path before reaching the
restricted-leaf check. The restricted-leaf block is therefore dead code after Option D's linear
path check.

**Builder action:** Remove the restricted-leaf fast path block entirely. It was an optimization
for the pre-Option-D world; Option D's lazy PENDING path provides a strictly better substitute
for the single-subscriber case. The `MARK_KIND_RECOMPUTE` stack kind and its handling in the
`if (kind === MARK_KIND_RECOMPUTE)` branch may also be removed if no other caller produces it.
Removing dead code recovers ~30–40 B gz.

---

## §5 `checkDirty` function

### §5.1 Purpose and placement

`checkDirty` is a new internal function, placed in `signal.ts` (near `settleAndDrain`).

It walks backward through a node's dependency chain to determine whether any source signal is
actually dirty (i.e., its value changed in the current wave). Returns `true` if a dirty ancestor
is found (the effect should run); `false` if all dependencies are clean (the effect should be
skipped).

### §5.2 Signature

```ts
/** @internal — pull-based dirtiness check for PENDING nodes.
 * Walks the dep chain of `node` backward through PENDING computeds until
 * a definitively dirty source (STALE signal, or modified signal) or a
 * clean source is found.
 * Returns true if the effect should run; false if the chain is clean. */
function checkDirty(node: Subscriber): boolean
```

### §5.3 Algorithm (precise)

```ts
function checkDirty(node: Subscriber): boolean {
  for (let l = node.depsHead; l !== null; l = l.nextDep) {
    const dep = l.dep
    const depFlags = dep.flags

    // A dep with STALE set is definitively dirty (fan-out path, already recomputed
    // or awaiting recompute in visited[]). The current node's value will change.
    if (depFlags & STALE) return true

    // A dep with PENDING set is on the lazy path. Recurse to check if *it* is dirty.
    // If the recursion finds a dirty ancestor, return true immediately.
    if (depFlags & PENDING) {
      if (checkDirty(dep)) return true
    }

    // A dep that is a raw signal source (no recomputeIfNeeded, no PENDING, no STALE)
    // and whose lastWave matches the current wave was written in this wave → dirty.
    // Signal hosts have flags === 0 normally; they get their subsHead walked but carry
    // no STALE/PENDING themselves. We detect "written this wave" via lastWave.
    // NOTE: signal write increments `wave` then calls propagateMark — so any signal
    // that triggered the current propagation has lastWave === wave after the write path
    // sets it. However signal.ts's signal host does NOT set lastWave on itself.
    // Instead, we infer dirtiness of a signal dep by checking that its subscribing
    // computed has PENDING (meaning it was reached during propagateMark from that
    // signal). So reaching here with PENDING on dep already handled above; a dep with
    // neither STALE nor PENDING and no recomputeIfNeeded is a signal source that was
    // NOT written this wave (its propagateMark was not called) → clean.
  }
  return false
}
```

**Note on signal-source detection:** Signal hosts in aihu have `recomputeIfNeeded === undefined`
and are represented as `Subscriber`-shaped objects with `flags = 0` at rest. A signal that was
written this wave will have caused `propagateMark` to be called on its subscriber chain,
resulting in those subscribers receiving `PENDING` (linear path) or `STALE` (fan-out path) marks.
Therefore a dep that has neither `STALE` nor `PENDING` was not on any dirty propagation path
from a written signal — it is clean.

### §5.4 Recursion depth and stack considerations

For `deep-propagation-100`, the chain is 100 nodes deep. Recursive `checkDirty` at depth 100
is safe in V8 (default stack size handles ~5,000–10,000 frames). However, if the Builder prefers
an iterative implementation for safety, an explicit stack may be used:

```ts
function checkDirty(root: Subscriber): boolean {
  const stack: Subscriber[] = [root]
  while (stack.length > 0) {
    const node = stack.pop() as Subscriber
    for (let l = node.depsHead; l !== null; l = l.nextDep) {
      const dep = l.dep
      if (dep.flags & STALE) return true
      if (dep.flags & PENDING) stack.push(dep)
    }
  }
  return false
}
```

The iterative form is preferred: it avoids JS call-stack pressure for pathologically deep chains
and stays monomorphic (single `stack.pop()` shape). The Builder should implement the iterative
form.

**Size note:** The iterative form is ~5 B gz larger than the recursive form but eliminates any
stack-overflow risk.

---

## §6 Effect path change — handling `PENDING` at run time

### §6.1 Where effects are run

In `signal.ts`, `drainEffectQueue` iterates `effectQueue` and calls `sub.notify()` for each
non-DISPOSED, MARKED effect. In `effect.ts`, `notify()` calls `runEffect(node)`.

Under Option D, an effect can arrive in `effectQueue` with `PENDING` set (because a PENDING
computed upstream triggered a linear-path mark all the way to the effect, setting MARKED on the
effect). The effect's MARKED flag is still set in `drainEffectQueue`'s check.

### §6.2 Modified `drainEffectQueue` (or `notify` in `effect.ts`)

Two implementation options are available; the Builder should choose based on minimal diff:

**Option A — check in `drainEffectQueue`:**

```ts
function drainEffectQueue(errors: unknown[]): void {
  for (const sub of effectQueue) {
    if (sub.flags & DISPOSED) continue
    if (!(sub.flags & MARKED)) continue
    sub.flags &= ~MARKED
    // Option D: if effect's deps are all PENDING (lazy path), verify dirtiness.
    if (sub.flags & PENDING) {
      sub.flags &= ~PENDING
      if (!checkDirty(sub)) continue   // chain is clean — skip effect body
    }
    try {
      sub.notify()
    } catch (e) {
      errors.push(e)
    }
  }
  effectQueue.length = 0
}
```

**Option B — check in `effect.ts` `notify()`:**

The effect's `notify()` in `effect.ts` currently calls `runEffect(node)` unconditionally (after
checking DISPOSED and RUNNING). Change to:

```ts
notify() {
  if (node.flags & DISPOSED) return
  if (node.flags & RUNNING) throw new SignalCircularError()
  if (node.flags & PENDING) {
    node.flags &= ~PENDING
    if (!checkDirty(node)) return   // clean — no-op
  }
  runEffect(node)
}
```

**Architect recommendation:** Option A (in `drainEffectQueue`) keeps the PENDING check in
`signal.ts` alongside `checkDirty` and avoids a `signal.ts` import cycle with `effect.ts`. If
`checkDirty` is placed in `signal.ts`, Option A is the cleaner co-location.

### §6.3 Clearing `PENDING` on the upstream chain

When `checkDirty(sub)` returns `false` (chain is clean), the PENDING flag must be cleared from
all upstream PENDING nodes to prevent stale flags from accumulating. Extend the iterative
`checkDirty` to clear PENDING as it walks:

```ts
function checkDirty(root: Subscriber): boolean {
  const stack: Subscriber[] = [root]
  while (stack.length > 0) {
    const node = stack.pop() as Subscriber
    for (let l = node.depsHead; l !== null; l = l.nextDep) {
      const dep = l.dep
      if (dep.flags & STALE) return true   // dirty found; PENDING on visited nodes
                                            // will be cleared in clearVisited below
      if (dep.flags & PENDING) {
        dep.flags &= ~PENDING              // clear eagerly on false path
        stack.push(dep)
      }
    }
  }
  return false
}
```

When `checkDirty` returns `true` (dirty found), the propagation proceeds normally. Remaining
PENDING flags on nodes that were not reached by `checkDirty` will be cleared in `clearVisited`
(see §8.2).

---

## §7 Correctness invariants

### §7.1 Primary invariant

> **A node with PENDING set is considered potentially dirty at effect-run time if and only if
> `checkDirty` returns true for it. A node with STALE set is definitively dirty (eager path) and
> will be recomputed in `settleAndDrain` before effects run.**

- STALE on a computed means: "I am in `visited[]`; `recomputeIfNeeded` will be called on me
  during settle; I will produce a fresh value before effects drain."
- PENDING on a computed means: "I was reached during propagateMark via a linear-path chain; I
  have not been added to `visited[]`; I will only be recomputed if an effect that reads me
  calls `checkDirty` and finds a dirty ancestor."

### §7.2 `lastWave` dedup — both paths

Both the PENDING and STALE paths set `sub.lastWave = wave` at the start of `markOne`'s loop body
(before the linear/fan-out branch). This is unchanged by Option D. The dedup guard
`if (sub.lastWave === wave) continue` prevents a node from being marked twice in the same wave
regardless of which path reaches it first.

This is essential for the diamond case: if two fan-out branches both attempt to mark the same
downstream node, the second attempt is deduped by `lastWave`. The first attempt determines
whether the node gets PENDING (linear) or STALE (fan-out). In the cellx diamond, all interior
nodes have fan-out (`head.nextSub !== null`) and take the STALE path; the leaf's effect edge is
linear and takes the PENDING path for the final hop.

### §7.3 Diamond case — cellx correctness walk-through

The cellx workload has this shape:

```
       src
      /   \
    L1a   L1b
      \   /  \
       L2a   L2b
         \   /
          L3
           |
         effect
```

(Simplified; the actual cellx 4×4 has multiple levels but the key property is fan-out at every
level except the final effect edge.)

**Mark phase under Option D:**

1. `src` has two subscribers (L1a, L1b) → `head.nextSub !== null` → fan-out path.
   - L1a gets STALE + `visited[]` push (if `HAS_EFFECT_SUB`); else STALE only.
   - L1b gets STALE + same.
2. L1a has two subscribers (L2a, possibly L2b) → fan-out path → STALE.
3. L1b has two subscribers → fan-out path → STALE.
4. L2a has two subscribers (or one, depending on diamond shape) → fan-out or linear.
5. L3 has one subscriber (the effect) → `head.nextSub === null` → **linear path** → PENDING.
6. The effect is pushed to `effectQueue` (EFFECT flag check).

**Effect run phase:**

1. `drainEffectQueue` reaches the effect. Effect has `PENDING` set.
2. `checkDirty(effect)` is called.
3. `checkDirty` walks the effect's dep chain: dep is L3.
4. L3 has `PENDING` set → recurse (push L3 onto stack).
5. L3's deps: L2a and L2b (or whatever fan-out fed into L3). Both have `STALE`.
6. `STALE` found → `checkDirty` returns `true`.
7. Effect runs: calls its body, which reads L3. L3 has PENDING (not STALE). On read, L3's
   `read()` in `computed.ts` checks `!hasCached || node.flags & STALE`. PENDING is not STALE,
   so the existing pull check does not fire on PENDING alone.

**Critical issue:** The existing `computed.ts` read path at line 101:
```ts
if (!hasCached || node.flags & STALE) { cached = recompute(); hasCached = true }
```
only recomputes if `STALE` is set. A node with only `PENDING` will NOT be recomputed on read
under the existing logic.

**Resolution — extend the read guard to include PENDING:**

```ts
if (!hasCached || node.flags & (STALE | PENDING)) {
  cached = recompute()
  hasCached = true
}
```

The `recompute()` call clears `RUNNING | STALE | MARKED` (line 50 of `computed.ts`). The Builder
must also add `PENDING` to this clear:

```ts
// In recompute():
node.flags &= ~(RUNNING | STALE | MARKED | PENDING)
```

This ensures PENDING is cleared when a node is actually recomputed on read, and that the
downstream chain pull works correctly.

**With this fix, the cellx correctness walk-through completes:**

7. (continued) On read, L3 has PENDING → `node.flags & (STALE | PENDING)` is true → L3
   recomputes. L3's `recompute()` calls `fn()` which reads L2a and L2b.
8. L2a has STALE → `STALE` check fires → L2a recomputes. And so on up the chain.
9. All PENDING nodes are recomputed lazily via the pull chain. All STALE nodes recompute
   when read (existing behavior).
10. The effect body receives the correct fresh value from L3. Correctness preserved.

### §7.4 Interaction between PENDING and `settleAndDrain`

`settleAndDrain` iterates `visited[]` and calls `recomputeIfNeeded()` on each. Under Option D:

- Fan-out nodes with `HAS_EFFECT_SUB` are still pushed to `visited[]` (STALE path unchanged
  from Option C).
- Linear-path nodes are **not** in `visited[]` (PENDING path).

`visited[]` therefore contains fewer or equal entries compared to Option C. The settle loop is
unchanged; it simply has fewer iterations for deep-chain workloads. No modification to
`settleAndDrain` is needed.

### §7.5 `PENDING` flag cleanup — when cleared

| Situation | When PENDING is cleared |
|---|---|
| `checkDirty` returns false (chain clean) | During the `checkDirty` walk itself (`dep.flags &= ~PENDING` for each PENDING node visited) |
| Effect runs (chain dirty, `checkDirty` returned true) | At effect read time: `recompute()` clears `~(RUNNING \| STALE \| MARKED \| PENDING)` |
| `clearVisited()` at end of wave | Must also clear PENDING from all nodes — see §8.2 |
| During settle (`settleAndDrain`) | NOT cleared — PENDING nodes are not in `visited[]` |
| If effect is DISPOSED before running | PENDING is a no-op on DISPOSED nodes; cleared in `clearVisited()` |

### §7.6 `wide-fanout-100` — no regression proof

In `wide-fanout-100`, the signal has 100 subscribers (`head.nextSub !== null` from the signal's
perspective). The write path checks `head.nextSub === null` in the signal write function (batched
fast path) — this is the signal's own subscriber list, not the computed's. In `markOne`, each
computed `c[i]` is reached with `sub.subsHead` pointing to a single link to `effect[i]`
(`head.nextSub === null`). Under Option D, each `c[i]` would take the **linear path** and get
PENDING. Each `effect[i]` is pushed to `effectQueue`.

At drain time, 100 `checkDirty` calls are made (one per effect). Each call: dep is `c[i]`, which
has PENDING. Recurse: `c[i]`'s dep is the signal, which has neither STALE nor PENDING at the dep
level. But `c[i]` has PENDING set because `propagateMark` was called on `signal.subsHead`...

**Wait — this is the signal → computed edge, not the computed → effect edge.** Let me re-examine.

When `propagateMark(host.subsHead)` is called (the signal's subscriber list), `markOne` is called
with each `c[i]`. For each `c[i]`:
- `c[i].subsHead` points to a link to `effect[i]` (one subscriber) → `head.nextSub === null` →
  linear path → `c[i].flags |= PENDING`.

Then `head.sub` is `effect[i]` → pushed to work stack → EFFECT flag → pushed to `effectQueue`.

At drain: `checkDirty(effect[i])` → walks `effect[i].depsHead` → dep is `c[i]` → `c[i]` has
PENDING → recurse (push `c[i]`) → walk `c[i].depsHead` → dep is the signal host.

The signal host has `flags = 0` at rest but was written this wave. The signal host does NOT have
STALE or PENDING set on itself. `checkDirty` will find neither STALE nor PENDING on the signal
dep → `checkDirty` returns `false` → effect is skipped.

**This is a correctness bug.** For `wide-fanout-100`, the signal is always written with a
changing value (`counter++`), but `checkDirty` would return false and skip all 100 effects.

**Resolution — signal dirtiness detection:**

The signal host needs to communicate that it was written in the current wave. Two options:

**(A) Set a STALE-equivalent on the signal host at write time:**

In `signal.ts` `write()`, after `value = resolved` and before `propagateMark`:
```ts
host.flags |= STALE   // mark the signal source as dirty this wave
```
Then in `clearVisited()`, also clear STALE from signal hosts. But signal hosts aren't tracked
anywhere — clearing requires storing them.

**(B) Use `lastWave` on the signal host:**

In `signal.ts` `write()`:
```ts
host.lastWave = wave   // record write wave on the signal host
```

In `checkDirty`, after the `depsHead` walk reaches a dep that has neither STALE nor PENDING,
check:
```ts
// dep is a source signal (no recomputeIfNeeded) — dirty if written this wave
if (dep.recomputeIfNeeded === undefined && dep.lastWave === wave) return true
```

This is the correct detection mechanism. Signal hosts have `recomputeIfNeeded` as `undefined`
(per the `Subscriber` interface definition — optional). A signal host that was written in the
current wave has `lastWave === wave`.

**Updated `checkDirty` with signal source detection:**

```ts
function checkDirty(root: Subscriber): boolean {
  const stack: Subscriber[] = [root]
  while (stack.length > 0) {
    const node = stack.pop() as Subscriber
    for (let l = node.depsHead; l !== null; l = l.nextDep) {
      const dep = l.dep
      if (dep.flags & STALE) return true
      if (dep.flags & PENDING) {
        dep.flags &= ~PENDING
        stack.push(dep)
        continue
      }
      // Signal source: dirty if written in the current wave.
      if (dep.recomputeIfNeeded === undefined && dep.lastWave === wave) return true
    }
  }
  return false
}
```

**And in `signal.ts` `write()`:**

```ts
const write: Write<T> = (next) => {
  const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : (next as T)
  if (equals !== false && equals(value, resolved)) return
  value = resolved
  host.lastWave = wave    // ← ADD THIS LINE (before propagateMark, after wave++)
  // ... existing code ...
}
```

Wait — `wave++` happens inside the `if (batchDepth === 0)` non-batched path. The `host.lastWave`
must be set after `wave++`. The correct placement:

```ts
wave++
host.lastWave = wave   // record write wave on signal host
try {
  propagateMark(head)
  settleAndDrain()
} finally {
  clearVisited()
}
```

For the batched path (`batchDepth > 0`), the signal is enqueued via `enqueueIfNeeded`. When
`drainBatch` processes the queue, it calls `markOne(sub)` on the enqueued subscribers (not the
signal itself). In this case, `checkDirty` must also work. In `drainBatch`, `wave++` happens per
iteration; the signal host's `lastWave` must be set at enqueue time or at drain time.

**Simpler resolution for batched path:** At `drainBatch`, before calling `markOne(sub)`, the `sub`
is a signal subscriber (a computed or effect that was enqueued). The signal that triggered the
enqueue already changed its value. For the batched path, `checkDirty` reaches a dep that is the
signal host (via the computed's depsHead). The signal host's `lastWave` was set during the
non-batched write. But wait — in the batched path, `wave++` happens in `drainBatch`, NOT in
`write()`. So `host.lastWave` set at write time would equal the old wave, not the drain wave.

**Correct fix for both paths:**

Set `host.lastWave = wave` in the write function immediately when the value changes, before any
wave increment:

Actually, the cleanest approach is to set `host.lastWave` inside `propagateMark` (called for the
non-batched path) and ensure that the batched path also sets it. But `propagateMark` takes a
`Link | null` head, not the host.

**Final resolution:** Modify `write()` to set `host.lastWave` as part of the write:

```ts
const write: Write<T> = (next) => {
  const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : (next as T)
  if (equals !== false && equals(value, resolved)) return
  value = resolved
  const head = host.subsHead
  if (head === null) return
  if (batchDepth > 0) {
    host.lastWave = -1   // sentinel: "written but wave not yet assigned"
    // ... enqueue path unchanged ...
    return
  }
  wave++
  host.lastWave = wave   // wave is now current; set before propagateMark
  try {
    propagateMark(head)
    settleAndDrain()
  } finally {
    clearVisited()
  }
}
```

And in `drainBatch`, after `wave++`:

```ts
wave++
const drainList = batchQueue.splice(0)
// For each enqueued sub, find the signal host that wrote it this batch.
// We don't have a direct signal→host mapping. Instead, use the dep edge:
// walk the enqueued sub's depsHead and set lastWave on any dep that is
// a signal source (recomputeIfNeeded === undefined) with lastWave === -1.
for (const sub of drainList) {
  sub.flags &= ~QUEUED
  // Patch signal lastWave for checkDirty
  for (let l = sub.depsHead; l !== null; l = l.nextDep) {
    if (l.dep.recomputeIfNeeded === undefined && l.dep.lastWave === -1) {
      l.dep.lastWave = wave
    }
  }
  markOne(sub)
}
```

This is getting complex. **Simpler alternative:** Instead of `lastWave` on signal hosts, use a
`Set<Subscriber>` of dirty signal hosts, cleared in `clearVisited`. This trades a Set allocation
for code complexity. **Architect's recommendation:**

Use the `lastWave` approach with a two-step correction:

1. In `write()`, set `host.lastWave = wave` in the non-batched path after `wave++`.
2. In `drainBatch`, set `host.lastWave = wave` on each signal source dep of enqueued subs, but
   only if `host.lastWave !== wave` (avoid redundant writes).

For the batched path, the enqueued subscriber IS the computed/effect whose signal-dep changed.
Walking its `depsHead` once before `markOne` is O(deps) and acceptable.

**This is the binding implementation for the Builder.** If the batched-writes-100 bench regresses
under this approach, the Architect must be consulted before reverting.

---

## §8 `clearVisited` and wave cleanup

### §8.1 Current `clearVisited`

```ts
function clearVisited(): void {
  for (const sub of visited) sub.flags &= ~MARKED
  visited.length = 0
  for (const sub of effectQueue) sub.flags &= ~MARKED
  effectQueue.length = 0
}
```

### §8.2 Required addition — PENDING cleanup

PENDING nodes are not in `visited[]`. If an effect is DISPOSED before drain, or if an error
interrupts the drain, PENDING flags may remain set on upstream computeds. These must be cleared.

**Option:** Track PENDING nodes in a `pendingNodes: Subscriber[]` array (similar to `visited`),
appended in `markOne`'s linear path alongside the `PENDING` flag set.

```ts
// In markOne's linear path:
sub.flags |= PENDING
pendingNodes.push(sub)    // track for cleanup

// In clearVisited():
for (const sub of pendingNodes) sub.flags &= ~(MARKED | PENDING)
pendingNodes.length = 0
```

**Size cost:** One new module-level array (`pendingNodes: Subscriber[] = []`) plus two push/clear
sites. Approximately +15–20 B gz.

**Alternative (no new array):** Accept that PENDING flags left on nodes after an aborted wave
will be cleared on the next wave via `lastWave` dedup (the node will be re-visited and re-marked,
overwriting the stale PENDING). This is safe because:
- The node will be re-reached from the source signal on the next write.
- `lastWave === wave` dedup prevents double-marking within a wave.
- Between waves, the stale PENDING bit is harmless: `checkDirty` is only called during effect
  drain (within a wave), not between waves.

**Architect's recommendation:** Use the no-new-array approach for the initial implementation to
minimize size impact. If testing reveals correctness issues with stale PENDING bits (e.g., an
effect incorrectly skipped on the next wave), add `pendingNodes` tracking. Document this decision
in the Builder notes (§11).

---

## §9 Settle phase interaction summary

| Node type | After Option D |
|---|---|
| Fan-out computed with `HAS_EFFECT_SUB` | STALE + in `visited[]` (unchanged from Option C) |
| Fan-out computed without `HAS_EFFECT_SUB` | STALE only, not in `visited[]` (Option C behavior) |
| Linear-path computed (single subscriber) | PENDING only, not in `visited[]` (new) |
| Effect node | In `effectQueue` (unchanged) |

`visited[]` remains as-is. For deep-chain workloads it will be **empty** (all 100 interior
computeds take the linear path; only `c99` would have `HAS_EFFECT_SUB` set, but under Option D,
`c99` also takes the linear path since its sole subscriber is the effect). Therefore `settleAndDrain`
makes zero `recomputeIfNeeded` calls for the deep-propagation-100 workload.

---

## §10 Size budget

### §10.1 Post-Option-C baseline

| Metric | Value |
|---|---|
| `@aihu/signals` gz (post Option C) | **1.54 kB** |
| Budget cap | **1.70 kB** |
| Headroom | ~160 B |

### §10.2 Option D additions

| Addition | Estimated raw B | Estimated gz |
|---|---:|---:|
| `PENDING = 0x100` constant | ~8 B | ~6 B |
| `pendingNodes` array (if used) | ~20 B | ~15 B |
| `checkDirty` function body (iterative form) | ~200 B | ~90–110 B |
| `markOne` linear-path branch (replaces restricted-leaf block) | ~60 B added, ~50 B removed (restricted-leaf) | net ~10–20 B |
| `write()` `host.lastWave = wave` assignment | ~15 B | ~8 B |
| `drainBatch` dep-walk for signal lastWave | ~80 B | ~35–45 B |
| `computed.ts` read guard `(STALE \| PENDING)` | ~8 B | ~5 B |
| `computed.ts` recompute clear `\| PENDING` | ~5 B | ~3 B |
| Effect path `PENDING` check in `drainEffectQueue` | ~50 B | ~25–30 B |
| **Total additions** | ~446 B | **~197–227 B** |
| Restricted-leaf removal (dead code) | −~100 B | −~40–50 B |
| **Net total** | ~346 B | **~150–185 B** |

### §10.3 Budget assessment

**Expected gz: ~1.54 kB + 0.15–0.185 kB = ~1.69–1.73 kB**

This slightly exceeds the 160 B headroom. The total sits at 150–185 B net gz addition against
160 B headroom — the upper end of the estimate overshoots by ~25 B.

**Architect's decision: raise the `@aihu/signals` budget to 1.85 kB gz.**

Justification:
- The combined 4-package browser bundle is currently ~3.46 kB gz, against a 4.00 kB total cap.
  The remaining headroom across all packages is ~540 B gz.
- Raising `@aihu/signals` from 1.70 kB to 1.85 kB uses 150 B of that headroom.
- The remaining 390 B headroom across the bundle is sufficient for remaining v1 work.
- Alternative: drop the `pendingNodes` cleanup array (saves ~15 B gz) and the `drainBatch`
  dep-walk (saves ~35–45 B gz) in exchange for the "no-new-array" PENDING cleanup strategy
  (§8.2 alternative) and restricting Option D to non-batched paths initially. This keeps the
  net addition at ~100–125 B gz, within the 160 B headroom. The Builder should attempt this
  smaller scope first and escalate if batched correctness is required.

### §10.4 Size budget table

| Scenario | `@aihu/signals` gz | Cap | Headroom |
|---|---:|---:|---:|
| Post Option C (current) | 1.54 kB | 1.70 kB | ~160 B |
| Option D (full, with batched fix) | ~1.69–1.73 kB | **1.85 kB** (raised) | ~120–160 B |
| Option D (reduced: non-batched only) | ~1.64–1.66 kB | 1.70 kB | ~40–60 B |

---

## §11 No-regression risk assessment (post Option C)

Per `investigation-deep-chain.md` §6, adjusted for the post-Option-C state:

| Gate | Floor | Option D risk | Mitigation |
|---|---|---|---|
| `cellx` ≤ 557 ns | Currently ~506 ns | **MEDIUM** — diamond merge points. Interior L1–L3 nodes have fan-out (`head.nextSub !== null`); they take the STALE path unchanged. L3→effect edge is linear → PENDING. `checkDirty` correctly finds STALE on L2/L1 deps (§7.3). After the `(STALE \| PENDING)` read guard fix (§7.3), L3 recomputes lazily at read. **Correctness is preserved; no regression expected if §7.3 is implemented correctly.** | Implement §7.3 `(STALE \| PENDING)` read guard in `computed.ts`. Run `bun .team/phase-2-5/scratch/cellx-counter.ts` — must print TOTAL = 17. |
| `wide-fanout-100` ≤ 5.15 µs | Currently ~4.68 µs | **LOW-MEDIUM** — linear path applies to each `c[i]→effect[i]` edge, adding `checkDirty` overhead (100 × ~3 ops). The signal `lastWave` fix (§7.4) is required for correctness. Performance: 100 `checkDirty` calls of depth 2 each = 200 dep-chain hops. At ~3 ns/hop, ~600 ns. But the mark phase improves (no `visited[]` push for `c[i]`). Net change: approximately neutral to slightly worse. | Implement signal `lastWave` detection in `checkDirty`. Bench must stay ≤ 5.15 µs. |
| `batched-writes-100` ≤ 2.86 µs | Currently ~2.60 µs | **LOW** — each signal has 1 subscriber (the effect). Linear path applies. `checkDirty` finds signal source dirty via `lastWave`. Overhead: 1 `checkDirty` call per write = 100 calls at depth 1 each = trivial. | Implement `drainBatch` `lastWave` patch (§7.4). |
| `dynamic-deps` ≤ 816 ns | Currently ~742 ns | **LOW** — computed has 1 effect sub. Linear path for `computed→effect` edge. `checkDirty` walks the computed's deps (5 signals). Each signal is checked for `lastWave`. If all are clean → effect skipped (correct). If any dirty → effect runs (correct). Aihu's dynamic-dep advantage (fast re-wiring) is unaffected. | No special mitigation beyond §7.4 signal detection. |
| `creation-1to1000` ≤ 76.2 µs | Currently ~69.3 µs | **NONE** — graph construction. No propagation path touched. | None. |

---

## §12 Test specification

### §12.1 New test file: `packages/signals/tests/deep-chain.test.ts`

Minimum 4 new tests:

#### Test 1 — Linear chain propagation correctness

```ts
it('deep-chain: signal change propagates to terminal effect through 100-node chain', () => {
  const [src, setSrc] = signal(0)
  let prev = src
  for (let i = 0; i < 100; i++) {
    const c = prev
    prev = computed(() => c() + 1)
  }
  const tail = prev
  let runCount = 0
  let lastSeen = -1
  const dispose = effect(() => { runCount++; lastSeen = tail() })
  // Initial run
  expect(runCount).toBe(1)
  expect(lastSeen).toBe(100)
  // Update
  setSrc(1)
  expect(runCount).toBe(2)
  expect(lastSeen).toBe(101)
  setSrc(2)
  expect(runCount).toBe(3)
  expect(lastSeen).toBe(102)
  dispose()
})
```

#### Test 2 — Diamond shape correctness (cellx pattern)

```ts
it('deep-chain: diamond graph — all paths compute correctly after signal change', () => {
  // Reproduce the core cellx diamond: src → [L1a, L1b] → [L2a, L2b] → L3 → effect
  const [src, setSrc] = signal(0)
  const L1a = computed(() => src() * 2)
  const L1b = computed(() => src() + 1)
  const L2a = computed(() => L1a() + L1b())
  const L2b = computed(() => L1a() - L1b())
  const L3 = computed(() => L2a() + L2b())
  let runCount = 0
  let lastSeen = 0
  const dispose = effect(() => { runCount++; lastSeen = L3() })
  // Initial: src=0, L1a=0, L1b=1, L2a=1, L2b=-1, L3=0
  expect(runCount).toBe(1)
  expect(lastSeen).toBe(0)
  // Update: src=3, L1a=6, L1b=4, L2a=10, L2b=2, L3=12
  setSrc(3)
  expect(runCount).toBe(2)
  expect(lastSeen).toBe(12)
  // Update: src=5, L1a=10, L1b=6, L2a=16, L2b=4, L3=20
  setSrc(5)
  expect(runCount).toBe(3)
  expect(lastSeen).toBe(20)
  dispose()
})
```

#### Test 3 — PENDING cleared on no-op (value unchanged in linear chain)

```ts
it('deep-chain: effect does NOT run when upstream value unchanged (equal write)', () => {
  const [src, setSrc] = signal(5)
  const c = computed(() => src() > 0 ? 1 : 0)   // stable output for all positive src values
  let runCount = 0
  const dispose = effect(() => { runCount++; c() })
  expect(runCount).toBe(1)
  // Write a different value but the computed's output doesn't change (1 in both cases)
  // NOTE: this tests the existing equals short-circuit in computed, not PENDING specifically.
  // For a direct PENDING test, write the source signal with the same value — no propagation.
  setSrc(5)   // same value — equals check short-circuits before propagation
  expect(runCount).toBe(1)  // effect did NOT run
  setSrc(10)  // different value, computed output still 1
  expect(runCount).toBe(1)  // effect did NOT run (shallowClear suppressed cascade)
  setSrc(-1)  // computed output changes to 0
  expect(runCount).toBe(2)  // effect ran
  dispose()
})
```

#### Test 4 — Hybrid path: wide-fanout-100 still correct

```ts
it('deep-chain: wide-fanout-100 pattern — all 100 effects fire exactly once per write', () => {
  const [src, setSrc] = signal(0)
  const computeds = Array.from({ length: 100 }, () => computed(() => src() + 1))
  const runCounts = new Array(100).fill(0)
  const disposes = computeds.map((c, i) =>
    effect(() => { runCounts[i]++; c() })
  )
  // Initial
  expect(runCounts.every(n => n === 1)).toBe(true)
  setSrc(1)
  expect(runCounts.every(n => n === 2)).toBe(true)
  setSrc(2)
  expect(runCounts.every(n => n === 3)).toBe(true)
  disposes.forEach(d => d())
})
```

### §12.2 Cellx body-count invariant

After Option D lands, run:

```
bun .team/phase-2-5/scratch/cellx-counter.ts
```

Must print **TOTAL = 17**. If any other value is printed, the diamond correctness invariant (§7.3)
has been violated. Halt and debug before merging.

### §12.3 All existing tests must pass

The Builder must run the full test suite (`bun test` in `packages/signals/`) before and after.
No existing test may be modified. All current tests must pass at every intermediate step.

---

## §13 Builder constraints and warnings

1. **Do not modify `bench/signals/` workload files.** The bench harness is fixed. Perf validation
   is measured by running the bench, not by modifying workloads.

2. **Do not modify existing test files** except to add the 4 new tests in the new
   `deep-chain.test.ts` file (§12.1). Do not edit `signal.test.ts`, `computed.test.ts`,
   `effect.test.ts`, `batch.test.ts`, `state.test.ts`, or `properties.test.ts`.

3. **Smoke check:** After implementing, run `bun run bench:signals` from the repo root (or
   `cd bench/signals && bun src/runner.ts`). Confirm it completes without error. Full bench
   result validation (p50 comparison against floors) is the Verifier's job, not the Builder's.

4. **`checkDirty` cellx debug protocol:** If `cellx` regresses (below 557 ns floor or TOTAL ≠ 17):
   - Verify that `computed.ts`'s read guard was updated to `(STALE | PENDING)` (§7.3).
   - Verify that `recompute()` clears `~(RUNNING | STALE | MARKED | PENDING)` (§7.3).
   - Verify that `checkDirty`'s signal-source detection uses `dep.recomputeIfNeeded === undefined`
     (§7.4).
   - Run `bun .team/phase-2-5/scratch/cellx-counter.ts` and inspect which nodes fire unexpectedly.
   - Do NOT revert to Option C without consulting the Architect's correctness invariant (§7).

5. **Restricted-leaf fast path removal:** The `MARK_KIND_RECOMPUTE` path in `markOne` is dead
   after Option D's linear path check subsumes it (§4.3). Removing it saves ~40–50 B gz and
   simplifies the code. The Builder SHOULD remove it. If any existing test fails after removal,
   the test is asserting on behavior that the restricted-leaf path provided and the linear/PENDING
   path now provides differently — investigate before modifying tests.

6. **Size validation:** After implementation, run `bunx size-limit` (or `bun run build` and check
   the gz output). If the `@aihu/signals` gz exceeds 1.85 kB, the Builder must reduce scope
   (remove the `drainBatch` dep-walk patch and accept that Option D only applies to non-batched
   paths) before escalating to the Architect.

7. **Implementation sequence (recommended):**
   1. Add `PENDING = 0x100` constant to `signal.ts`.
   2. Modify `markOne` (linear path branch, remove restricted-leaf block).
   3. Add `checkDirty` function.
   4. Modify `drainEffectQueue` (or `effect.ts` `notify()`) to call `checkDirty`.
   5. Modify `computed.ts` read guard and `recompute()` clear.
   6. Add `host.lastWave = wave` in `write()`.
   7. Run all tests. Fix failures.
   8. Add `drainBatch` `lastWave` patch.
   9. Run bench smoke check.
   10. Add the 4 new tests in `deep-chain.test.ts`.

---

## §14 Performance prediction

| Metric | Post Option C | After Option D | Improvement |
|---|---:|---:|---:|
| `deep-propagation-100` p50 | 3.27 µs | **~2.70–3.00 µs** | ~8–17 % |
| Mark phase ops/node (deep chain) | ~7 ops | **~3–4 ops** (PENDING set + nextSub push) | ~50 % |
| `visited[]` entries (deep chain) | 1 (c99 only, post Option C) | **0** | 100 % |
| `settleAndDrain` calls (deep chain) | 1 (`c99.recomputeIfNeeded`) | **0** | 100 % |
| `checkDirty` overhead (deep chain) | 0 | ~100 dep-walks + 1 dirty source find | new cost ~200 ns |

**Expected net gain on deep-propagation-100:** removing the settle call (~100 ns) and reducing
mark ops from ~7 to ~4 per node on 100 nodes (~300 ns) minus `checkDirty` overhead (~200 ns) =
net ~200 ns improvement, bringing p50 from 3.27 µs to ~3.05–3.00 µs. This is the low-end
estimate. If `checkDirty` is faster (V8 inlines the short dep-chain walk), the improvement could
reach ~400–600 ns, bringing p50 to ~2.70–2.85 µs.

**Tolerance band (deviation tracking):** p50 must reach ≤ 3.00 µs. If observed p50 is 3.00–3.10 µs
(just outside the gate), the Builder should report the miss to the Architect before declaring the
phase complete.

---

## §15 Summary of file changes

| File | Change | Lines affected |
|---|---|---|
| `packages/signals/src/signal.ts` | Add `PENDING = 0x100`; modify `markOne` (linear path, remove restricted-leaf); add `checkDirty`; modify `write()` (`host.lastWave`); modify `drainEffectQueue` (PENDING check); modify `clearVisited` if `pendingNodes` used; modify `drainBatch` (signal `lastWave` patch) | ~60–80 lines |
| `packages/signals/src/computed.ts` | Modify read guard `(STALE \| PENDING)`; modify `recompute()` clear `\| PENDING` | ~4 lines |
| `packages/signals/tests/deep-chain.test.ts` | New file — 4 tests | ~80 lines |

No other files should be touched. `packages/signals/src/effect.ts` is unchanged if the PENDING
check is placed in `drainEffectQueue` (Option A from §6.2). `packages/signals/src/index.ts` is
unchanged.

---

*End of spec. Status: READY FOR BUILDER.*
