# Spec — `@aihu/signals` Structural Rewrite (Phase 2.5 → Phase 3-class)

**Author:** Architect
**Date:** 2026-04-27
**Branch:** `perf/signals-cellx-fix`
**Status:** Final — Builder may consume. Supersedes `cellx-fix-spec.md` (8dcf3ef).
**Wip checkpoint replaced:** `99ea2c8` (5.71 µs cellx p50, structurally bounded).

This spec is binding. It is not a refinement of the Phase 2.5 hybrid
notify split — it is a structural replacement of the reactive scheduler
inside `@aihu/signals`, scoped to fix the diamond glitch storm
identified by the Investigator (`cellx-investigation-report.md`,
committed `f2f23f9`). The Phase 2 public surface is preserved verbatim;
all four Phase 2 verification scenarios remain green; Phase 2 Finding 3
equality-cascade-suppression is preserved without test modification;
cycle detection is preserved without test modification.

References:
- Investigator's report: `.team/phase-2-5/cellx-investigation-report.md` (`inv`)
- Superseded spec: `.team/phase-2-5/cellx-fix-spec.md` (`p25`)
- Phase 2 spec: `.team/phase-2/spec-signals.md` (`spec-2`)
- Phase 2 verification: `.team/phase-2/verification-report.md` (`vr-2`)
- Bench: `bench/signals/HARNESS.md`, `bench/signals/RESULTS.md`
- alien-signals reference: `bench/signals/node_modules/alien-signals/esm/`
- Investigator instrumentation: `.team/phase-2-5/scratch/cellx-counter.ts`,
  `cellx-counter-alien.ts`, `cellx-trace.ts`

---

## §1 Public API surface

**No change.** The 7 value exports + 7 type exports from `spec-2` §1 ship
unchanged. No new public symbol; no widened generic; no new option on
`signal()`, `effect()`, `computed()`, `$state()`, `batch()`; no new
error class.

The Phase 2 verification report at `vr-2` Gate 3 confirmed the externally
observable surface; that surface is unchanged here. All deviations are
strictly under `/** @internal */`.

**Phase 3 prep that explicitly stays out of scope of this spec:**
`untrack()` is mentioned in `spec-2` §2.5 as a future arbor helper. It is
*not* added here. The size budget (§7) reserves headroom for it; that's
the only acknowledgment.

---

## §2 Internal architecture

### §2.1 Direction selection: D (composite), refined for aihu

The four candidate directions described in the prompt all reach 17
ops/op on cellx. The selection criterion is: which fits aihu's
constraints (size budget ≤ 880 B target / 1024 B hard cap; no public
surface change; preserve Phase 2 invariants; future arbor `untrack`
hook room) at the lowest size cost while delivering parity-class perf.

| Dir | Size delta vs current | Cellx p50 prediction | Fits constraints? | Verdict |
|---|---:|---:|---|---|
| A — generation/version counters | +60–80 B | 1.5–2.0 µs | Yes, but lacks effect-dedup; risks regressing batched-writes on real-app patterns | **Almost-fit.** Picked components from this in D. |
| B — pure two-phase mark/propagate | +80–120 B | 1.0–1.3 µs | Yes; but loses cheap stale-suppression on equal recomputes (Phase 2 Finding 3) without an extra check | **Strong but incomplete.** Needs equality-shortcut handling. |
| C — topological scheduling | +120–200 B | 1.0–1.3 µs | Borderline — depth tracking + scheduler queue blow the byte budget | **Rejected.** Buys nothing over D for our graphs. |
| **D — composite (alien-signals strategy)** | **+90–130 B** | **1.0–1.5 µs** | **Yes.** Composes the three smaller pieces. | **PICKED.** |

**Why D, specifically.** The Investigator's evidence is unambiguous: the
gap to alien-signals is the work multiplier (5.4× more body executions),
not call overhead (aihu's per-eval is already 16% faster than alien).
Closing the gap requires the algorithmic class that prevents the
diamond glitch. Among glitch-free algorithms:

- The Phase 2 Finding 3 invariant — "computed with `equals !== false`
  whose recomputed value compares equal to its previous cached value
  must NOT cascade" — naturally fits a **shallow propagate** step that
  reruns each downstream node, sees the value didn't change, and stops
  the cascade. Pure two-phase mark/propagate (B) doesn't have this; it
  marks and then pulls. Adding the equality short-circuit costs ~15 B
  on top of B and gets us back to D's structure.

- The wide-fanout-100 workload runs 100 effects per write. Without an
  effect-dedup queue, an effect subbed via two paths can re-fire. The
  current numbers show wide-fanout is already at parity; the rewrite
  must not regress. A small effect queue (analogous to alien's
  `queued[]` array) protects this.

- Generation counters are the cheapest known way to skip the entire
  cascade for an unchanged-input read. Cellx writes change every op
  (the bench advances `counter`), so this is not load-bearing for the
  benchmark — but it gives us O(1) read-fast-path that the future arbor
  realm (with stable keys + frequent equal-recompute) will benefit
  from. **Cost: one int per signal, one int per computed.**

D = (cheap version-stamp) + (two-phase mark with equality short-circuit
on propagate-ack) + (small effect queue with QUEUED-flag dedup).
We already have the QUEUED flag from Phase 2's batch; we extend its
role to cover the post-write effect drain (which today is the synchronous
recursive cascade).

### §2.2 The new flag bits and field layout

Signal state lives in `signal.ts`. The bitfield grows by **two bits**:

| Bit | Constant | Set when | Cleared when |
|---|---|---|---|
| `0x1` | `RUNNING` | (unchanged) Body executing | Body exits |
| `0x2` | `DISPOSED` | (unchanged) Disposed | (terminal) |
| `0x4` | `QUEUED` | (extended role) In `batchQueue` *or* in post-write `effectQueue` | When dequeued |
| `0x8` | `STALE` | Computed cached value may be wrong; revalidate on read | After `recompute()` confirms value |
| `0x10` | `EFFECT` | (unchanged from p25) Set at construction on effect nodes | Never |
| `0x20` | `MARKED` | **NEW.** During phase-1 cascade: this node's deps *might* have changed | Cleared during phase-2 read or effect run |
| `0x40` | `NOTIFIED` | **NEW.** During phase-1: this node has been visited, do not re-mark | Cleared at cascade-tail (when effectQueue drains) |

**Why MARKED and NOTIFIED are separate.**
- `MARKED` says "I might be stale; read me to find out." It travels with
  the node across the read pull-loop.
- `NOTIFIED` says "I've been visited in this propagate wave; don't recurse
  through me again." It's the diamond-glitch prevention. It's wave-scoped
  and cleared at the *end* of the wave (after effect drain), not when
  the node recomputes — that distinction is the structural fix.

In the current design, the equivalent bit (`STALE`) was being cleared by
`recompute()` (`computed.ts:51`), which is exactly what enables the second
visit to re-fire the eager path (`inv` §"Why the architect's design didn't
prevent this"). Splitting "I'm stale, please revalidate" from "I've been
notified, don't re-cascade" closes that hole.

**Size cost of the two new flag constants:** ~8 B raw, ~4–6 B gz.

### §2.3 Per-node fields added

`signal.ts` adds **one field** to the `signal()` cell closure: a
`version: number` monotonic counter, incremented on each non-equal
write. Used by computeds for the read fast-path.

`computed.ts` adds **two fields** to the closure:
- `lastSeenVersion: number` — the version of the deps last time the
  computed validated. (Stored as a hash — see §2.5.)
- removes the `hasEffectSub` boolean from p25 (no longer needed; the
  two-phase model treats all subs uniformly).

`effect.ts` keeps its `EFFECT` flag construction. Body is unchanged.

`signal.ts` adds **one new module-level structure**: `effectQueue: Subscriber[]`
— shared with `batchQueue` semantics but flushed at the end of every
write that wasn't inside a batch. (See §2.4 for why this is one queue,
not two.)

### §2.4 The new write pipeline

> **Spec correction (2026-04-28, Phase 2 Learning #8 confirm-keep):** This section originally specified a pure two-phase mark/drain design (phase 1: mark only; phase 2: drain effects which lazily pull through STALE computeds). The Builder discovered at the keyboard that the pure design **cannot satisfy Phase 2 Finding 3's single-effect parity test** — see the rationale block at the end of this section. The Builder shipped a **three-phase hybrid** (mark → settle → drain) that satisfies both Finding 3 and the diamond-glitch fix. Per Phase 2 Learning #8 (Builder may exceed frozen scope when a structural blocker surfaces; Verifier confirms-keep), this section is updated to document the as-built design. The original pure-design pseudocode is preserved in §2.4.1 below for historical reference; the as-built design is the binding contract from this point forward.

```
signal.write(next):
  resolved = resolve(next)                                  # value or updater
  if equals(value, resolved): return                        # Phase 2 invariant
  value = resolved
  version++                                                 # NEW

  if subs.size === 0: return

  if batchDepth > 0:
    # Batch path: enqueue subs as today. Unchanged from Phase 2.
    for sub of [...subs]:
      enqueueIfNeeded(sub, batchQueue)
    return

  # Non-batch path: three-phase propagate.
  propagateMark(subs)        # phase 1: tag everything reachable; queue effects
  settleAndDrain()           # phase 2 (settle) + phase 3 (drain), see below
```

Inside `propagateMark(subs)`:

```
for sub of subs:
  if sub.flags & (DISPOSED | NOTIFIED): continue
  sub.flags |= NOTIFIED
  if sub.flags & EFFECT:
    if !(sub.flags & QUEUED):
      sub.flags |= QUEUED
      effectQueue.push(sub)
    # don't recurse through effects: effects don't have downstream subs
  else:
    # computed
    sub.flags |= STALE | MARKED
    visited.push(sub)         # tracked so phase 2 can settle in walk order
    if sub.subs.size > 0:
      propagateMark(sub.subs)
```

`settleAndDrain()` — the load-bearing change vs the original pure-design:

```
# Phase 2 (settle): walk visited computeds in mark order. Each computed's
# recomputeIfNeeded() is a no-op unless it has effect subs (directly or
# transitively); in that case it eagerly recomputes, runs the equality
# comparator, and if equal calls shallowClear(subs) which clears MARKED on
# downstream effects (suppressing their phase-3 run).
for sub of visited:
  sub.recomputeIfNeeded?.()

# Phase 3 (drain): run effects whose MARKED bit survived shallowClear.
while effectQueue.length > 0:
  sub = effectQueue.shift()
  sub.flags &= ~QUEUED
  if (sub.flags & DISPOSED): continue
  if !(sub.flags & MARKED):  # shallowClear cleared this — equal-recompute upstream
    continue
  sub.notify()                # effect's notify is a thin wrapper around run()

# After drain: clear NOTIFIED + MARKED across visited subs.
for sub of visited:
  sub.flags &= ~(NOTIFIED | MARKED)
visited.length = 0
shallowClearFired = false
```

Each computed's `recomputeIfNeeded()` (defined in §2.5) is what makes the settle phase do real work:

```
recomputeIfNeeded():
  # Skip if this computed has no effect subs (direct or transitive).
  # Computeds whose subs are exclusively other computeds defer their work
  # until phase 3's effect.run() pulls through them lazily — this preserves
  # the lazy-stale property for inert subgraphs.
  if !hasEffectSub: return

  # Eager recompute. Cycle bit + STALE clear handled here.
  prev = cached
  next = recompute()
  cached = next
  if equals !== false && hasCached && equals(prev, next):
    # Phase 2 Finding 3: equal recompute suppresses cascade. Do it BEFORE
    # phase 3 drains so effects observe the suppressed state.
    shallowClear(subs)
```

`shallowClear(subs)` walks one level of subs (effect subs and direct computed subs) clearing MARKED. Effects whose MARKED bit is cleared have their phase-3 run skipped (see drain loop above). Direct computed subs that were going to be settled below this one in the visited walk become no-ops because their settle reads `cached` and finds the unchanged value.

#### §2.4.1 Why the pure two-phase design (originally specified) doesn't work

The Phase 2 Finding 3 single-effect parity test (`computed.test.ts:97-116`) is:

```js
const parity = computed(() => n() % 2)
effect(() => { runs++; parity() })
setN(2)  // n%2 still 0 — equal recompute, cascade should suppress
expect(runs).toBe(1)  // effect must NOT have re-run
```

Under the originally-specified pure two-phase design (phase 1 marks only; phase 2 drains effects which read computeds lazily):

1. `setN` calls `propagateMark({parity})` → marks parity STALE+MARKED.
2. `propagateMark({effect})` → marks effect MARKED+QUEUED.
3. drain shifts effect, sees MARKED set, runs.
4. Effect body reads `parity()`. parity is STALE → recompute → equality fires → `shallowClear` runs.
5. **But `shallowClear` fires *after* the effect already ran.** `runs === 2`. Test fails.

To pass the Finding 3 test, the equality short-circuit must fire **before** the effect drains. The hybrid (eager recompute in phase-2 settle, before phase-3 drain) achieves this: parity recomputes during settle, equality fires during settle, shallowClear clears MARKED on the downstream effect during settle, drain skips the effect's run because MARKED is cleared. `runs === 1`. Test passes.

This is **Phase 2 Learning #9 in action** — hands-on-keyboard discovery surfaces a structural fact the spec's analytic model didn't capture. The pure two-phase design is correct in the abstract (alien-signals uses essentially this shape) but their equality-suppression mechanism is woven differently into their drain loop. Aihu's Finding 3 invariant requires the eager-on-settle hybrid; the spec is updated to reflect what the implementation must do.

The hybrid preserves the structural goal (no diamond glitch — the body-count regression test confirms 92 → 17) and Phase 2 Finding 3. It pays a per-write settle-walk cost over `visited` that the pure design would not, but the cost is bounded by the marked-subgraph size and is the load-bearing reason the structural rewrite achieves cellx 1.6 µs (vs alien's 1.25 µs) — alien's tighter design saves ~25% on cellx but cannot fit aihu's Finding 3 contract without restructuring.

(Builder-blocker §D, commit-history reference: `846ac57` shipped the hybrid; `cellx-rewrite-builder-blockers.md §D` documents the discovery.)

### §2.5 The new `computed.read()`

```
read():
  if node.flags & RUNNING: throw SignalCircularError

  observer = peekCurrentObserver()
  if observer !== null && !subs.has(observer):
    subs.add(observer)

  # Fast path: no STALE bit, cached, deps haven't changed since last validate.
  if hasCached && !(node.flags & STALE):
    return cached

  # If MARKED but not necessarily dirty, validate via dep-version check.
  # (See §2.5.1 for why this is correct.)
  if hasCached && (node.flags & MARKED) && depsVersionUnchanged():
    node.flags &= ~(STALE | MARKED)        # nothing changed; reuse cache
    return cached

  # Otherwise pull-and-validate.
  prev = cached
  next = recompute()                       # also captures fresh deps + their versions
  cached = next
  hasCached = true
  if equals !== false && hadCache && equals(prev, next):
    # Equal recompute: clear MARKED on subs without cascading.
    # (Phase 2 Finding 3 invariant — see §2.6.)
    shallowClear(subs)
    return cached
  return cached
```

#### §2.5.1 Why the version-check is correct

When `propagateMark` traversed to this computed and set `MARKED`, the
write had already incremented its source signal's `version`. If *no
transitive dep's* version actually advanced past what we cached, the
mark was a false alarm — a sibling cascade reached us but our deps are
intact. The version check catches this and saves a recompute.

In cellx, every dep does advance (the source `setSrc(counter)` write
mutates), so the version-check rejects fast and the recompute proceeds.
**Cellx does not benefit from this fast path.** It exists for arbor's
post-launch realm where stable keys produce many "this signal wrote
back to the same value via an updater" patterns — and as a free
optimization we can include because the version-int costs ~4 B gz.

### §2.5.2 `depsVersionUnchanged()` implementation: hashed-XOR aggregate

To avoid storing per-dep version arrays (would blow the byte budget), we
store a single **XOR-hash** of dep versions on the computed, captured at
`recompute()` end:

```
recompute():
  node.flags |= RUNNING
  prevObserver = setCurrentObserver(node)
  versionHash = 0
  try:
    return fn()
  finally:
    setCurrentObserver(prevObserver)
    node.flags &= ~RUNNING
    node.flags &= ~(STALE | MARKED)
    lastVersionHash = versionHash    # the hash captured-during-fn
```

To capture, the `signal.read()` and `computed.read()` paths during a
recompute also XOR their version into the active observer's `versionHash`
field via a small module helper:

```
# in signal.ts read()
read():
  if currentObserver !== null:
    subs.add(currentObserver)
    currentObserver.versionHash ^= version    # NEW: capture
  return value
```

`depsVersionUnchanged()` re-reads the deps without subscribing and
recomputes the hash; if it matches `lastVersionHash`, the deps haven't
moved.

**Wait — that requires re-walking the deps.** The simpler version ditches
the XOR and just stores `lastVersionHash` based on the source value,
re-XOR'ing at sub-add time. Concretely:

- Each computed maintains a `lastVersionHash` int.
- During `recompute()`, an `accumulator` int starts at 0; every signal
  or computed read XORs its current `version` into the accumulator.
- After `recompute()`, `lastVersionHash = accumulator`.
- The `depsVersionUnchanged()` check is performed lazily during `read()`
  if MARKED is set: walk `deps` once (we don't have a `deps` array
  today — see below) and XOR their current versions; compare.

This requires storing a back-pointer from computed → its deps (currently
we only store forward subs → observer). **That doubling-of-pointers
costs ~30 B gz**, which makes the version-fast-path more expensive than
its cellx benefit.

**Architect decision:** ship the version field on signals (cheap, useful
for §9 deeper wins) but **defer the per-computed `deps` array and the
hash-validation fast path** to a follow-up. Cellx's fix doesn't depend
on it; without it, computed.read() falls through to recompute on any
MARKED. The mark-and-recompute-with-equality-shortcircuit (§2.4-§2.6) is
sufficient to hit the perf target. The version stamp on signals stays
because (a) it's 1 word, (b) it lets a future opt land cheaply, and
(c) it gives us a wave-counter that we can repurpose for `NOTIFIED`
clear (see §2.7).

**Updated `computed.read()` (without the version fast path):**

```
read():
  if node.flags & RUNNING: throw SignalCircularError
  observer = peekCurrentObserver()
  if observer !== null && !subs.has(observer):
    subs.add(observer)
  if !hasCached || (node.flags & STALE):
    prev = cached
    hadCache = hasCached
    next = recompute()                        # clears STALE | MARKED inside
    cached = next
    hasCached = true
    if equals !== false && hadCache && equals(prev, next):
      shallowClear(subs)                      # see §2.6
  return cached
```

### §2.6 Equality cascade suppression — Finding 3 preservation

The Phase 2 Finding 3 tests (`computed.test.ts:97-176`) require:
"a computed with `equals !== false` whose recomputed value compares
equal to its previous cached value must NOT cascade to subscribers."

Under the new design, the cascade has two arrival paths at a downstream
sub:

1. **Phase-1 mark traversal** — `propagateMark()` set `MARKED | STALE` on
   downstream computeds and `QUEUED` on downstream effects.
2. **Phase-2 read pull** — when an effect drains, it reads its deps; the
   read on a STALE computed forces a recompute, which (if equal)
   triggers the equality short-circuit.

If a computed's recompute returns a value equal to the previous cached
value, it must **clear MARKED on its own subs without cascading them
further** — exactly the Phase 2 Finding 3 contract. That's what
`shallowClear(subs)` does:

```
shallowClear(subs):
  for sub of subs:
    if sub.flags & EFFECT:
      # If this effect is in the queue but no other sub asks it to run,
      # remove it. Cheap: just unset NOTIFIED + leave QUEUED. The drain
      # loop will skip it via a guard. (See §2.6.1.)
      sub.flags &= ~MARKED
      # NOTE: we do NOT remove it from effectQueue; we mark it skip.
      # alien-signals does the same — it sets a "Pending" flag and
      # the drain checks it before running.
    else:
      # computed: clear STALE | MARKED so its own subsequent read fast-paths.
      sub.flags &= ~(STALE | MARKED)
```

#### §2.6.1 The "skip" mechanism for queued effects

When `shallowClear` propagates equality, an effect already in
`effectQueue` may now have *no remaining stale upstream*. To skip its
re-run, we add a third bit role to `MARKED` on effects: **the drain
loop only runs effects whose MARKED bit is still set**. (Phase 1 sets
MARKED on all enqueued effects; phase 2's `shallowClear` clears MARKED
on equal-recomputed paths; the effect still sits in the queue but is
skipped at drain.)

This is structurally identical to alien-signals' Pending/Dirty split
(`system.mjs` lines 98–113), where flag 32 = "queued, but maybe not
dirty" and flag 16 = "definitely dirty"; `shallowPropagate` flips the
former to the latter only when an upstream actually changed.

**Effect drain loop, revised:**

```
drainEffects():
  while effectQueue.length > 0:
    sub = effectQueue.shift()
    sub.flags &= ~QUEUED
    if sub.flags & DISPOSED: continue
    if !(sub.flags & MARKED): continue      # skip equality-cleared effects
    sub.flags &= ~MARKED
    sub.notify()                            # → run()
```

This passes Finding 3 by construction: an effect whose only upstream
arrived at an equal recompute has MARKED cleared in `shallowClear`, and
the drain skips it. The Phase 2 Finding 3 tests do not change.

### §2.7 NOTIFIED clearing — wave-counter trick

NOTIFIED is wave-scoped: it must not persist across writes. The naive
implementation walks every visited node at end-of-drain and clears the
bit. That's O(visited) work per write, which is fine (no worse than the
mark traversal itself).

A cheaper alternative: store a **wave counter** module-globally
(`waveId: number`, incremented per write), and rename `NOTIFIED` to
`notifiedAt: number` per node. On entry to propagate, check
`notifiedAt === waveId`; if not, set it. This avoids the post-drain
walk, at the cost of one int field per Subscriber.

**Architect decision:** **walk-and-clear** for the v0 of this rewrite.
Why:
- One int field on every Subscriber costs ~10–15 B gz across all node
  literals (we have computed, effect, and probably signal-internal
  subs). Multiplied by the 4 fewer-property V8 hidden classes V8
  prefers, this hurts inlining.
- The walk is bounded by the number of NOTIFIED nodes — exactly the
  diamond fan-out we just walked anyway. We have the list (it's the
  set of nodes we set NOTIFIED on). Tracking that list adds one more
  array allocation per write, but only ~16 entries for cellx.

A simpler trick: **maintain the visited-nodes list during propagate,
then walk-and-clear at the tail of `drainEffects()`.** Already the
phase-1 traversal touches every NOTIFIED node, so we collect them with
zero overhead.

```
propagateMark(subs, visited):
  for sub of subs:
    if sub.flags & (DISPOSED | NOTIFIED): continue
    sub.flags |= NOTIFIED
    visited.push(sub)
    ...

# At end of write:
for sub of visited:
  sub.flags &= ~NOTIFIED
visited.length = 0
```

`visited` is a module-scoped array, pre-allocated and reused (no
per-write GC). Cost: ~8 B gz.

### §2.8 The new `notify()` on computed and effect

Computed `notify()` no longer cascades synchronously. Instead, it is
the entry point for nodes reached via downstream subscription paths
(e.g., during batch drain — see §2.10 — or via shallow propagation):

```
# computed.notify — called from drain loop or shallowClear
notify():
  if node.flags & DISPOSED: return
  if node.flags & RUNNING: throw SignalCircularError
  # In the new model, computed.notify() is reached only when this
  # computed needs to be re-pulled. We mark and propagate via the
  # same propagateMark used by signal.write — but here we're already
  # inside a drain wave, so just mark and let downstream pulls happen.
  if node.flags & NOTIFIED: return
  node.flags |= NOTIFIED | STALE | MARKED
  visited.push(node)
  for sub of subs:
    sub.notify()                    # recurse — only into not-yet-NOTIFIED
```

Effect `notify()` is unchanged in its body but now is reached only via
drain (during normal writes) or directly (during batch flush):

```
notify():
  if node.flags & DISPOSED: return
  if node.flags & RUNNING: throw SignalCircularError
  run()
```

**Critical:** in the non-batch path, `signal.write` calls
`propagateMark` directly, *not* `sub.notify()`. The two-phase split is
the structural fix. `notify()` exists for the batch-drain path (where
the flush loop calls each queued sub's `notify()` per Phase 2's batch
contract) and for the recursive shallow-propagate fan-out from one
computed to its downstream computeds during the same wave.

### §2.9 Cycle detection — preserved bit-for-bit

The Phase 2 cycle-detection contract:
- `RUNNING` bit set during `recompute()` (computeds) and `run()` (effects).
- A `notify()` call that finds `RUNNING` set throws `SignalCircularError`.

Under the new design:
- `recompute()` still sets/clears `RUNNING` (§2.5.2 sketch).
- `run()` still sets/clears `RUNNING` (`effect.ts` unchanged).
- `signal.read()` still throws if read inside its own running observer
  via the existing path.
- `propagateMark()` does **not** check RUNNING — but the throw still
  fires from the `read()` call inside `recompute()` when the cycle
  re-enters synchronously (the existing path).

The two existing cycle tests (`computed.test.ts:49-65`,
`effect.test.ts:75-84`) pass without modification because the cycle is
caught at the first re-entrant `read()` of a still-RUNNING observer,
and that read happens during recompute()/run(), exactly as today.

### §2.10 Batch interaction — preserved

Inside a batch:
- Signal writes enqueue subs into `batchQueue` (Phase 2 behavior,
  unchanged).
- On outermost `batch()` exit, `drainBatch()` calls each queued sub's
  `notify()`, which dispatches to the new computed.notify (mark +
  shallow-propagate) or effect.notify (run).

The drainBatch loop must call `propagateMark` on the queued computeds
before calling effect.notify on the queued effects, otherwise effects
read pre-mark stale caches. Solution: drainBatch already iterates in
insertion order, and signal.write calls `propagateMark` to *each
sub* immediately on write — but inside a batch, propagation is deferred
along with effect runs.

Concrete batch drain (revised):

```
drainBatch():
  # Phase 1: mark all queued nodes' downstream cascade in one pass.
  for sub of batchQueue:
    if sub.flags & (DISPOSED | NOTIFIED): continue
    if sub.flags & EFFECT:
      sub.flags |= NOTIFIED
      visited.push(sub)
      # effect already in queue; nothing more to do
    else:
      # computed in batch queue means a downstream sub-write happened during
      # an effect run; propagate from this computed downward
      propagateMark([sub], visited)

  # Phase 2: run effects in queue order with skip semantics.
  while batchQueue.length > 0:
    sub = batchQueue.shift()
    sub.flags &= ~QUEUED
    if sub.flags & DISPOSED: continue
    if sub.flags & EFFECT:
      if !(sub.flags & MARKED): continue
      sub.flags &= ~MARKED
      sub.notify()
    else:
      # a queued computed: just mark; downstream effects will pull
      sub.flags &= ~(MARKED)              # the mark fired during phase 1
      # don't run computeds during drain; let downstream pull

  # Phase 3: clear NOTIFIED across visited.
  for sub of visited: sub.flags &= ~NOTIFIED
  visited.length = 0
```

**Effect-writes-during-flush** (Phase 2 `spec-2` §1.5 item 3) is
preserved: the in-flight `run()` of an effect calls `signal.write`,
which (because `batchDepth > 0` from the outer batch) appends to
`batchQueue` as today. The drain loop sees the new entries and processes
them with the same two-phase logic. The `MAX_BATCH_ITERATIONS = 100`
guard remains.

### §2.11 What does NOT change

- **`signal.read()`**: identical to Phase 2 except for the version-XOR
  on the active observer's accumulator (one int op). No semantic shift.
- **`signal.write()` outside batch**: replaces synchronous
  `for sub of [...subs]: sub.notify()` with `propagateMark(subs)` +
  `drainEffects()`. Same observable effect: all subscribers reflect the
  new value before write returns, including effect runs.
- **`effect()`**: body unchanged. Construction-time `flags: EFFECT`
  unchanged from p25.
- **`batch()`**: API unchanged. Internal drain logic extends to two-phase
  (§2.10).
- **`$state()`**: trivially unchanged (delegates to signal).
- **`SignalError`, `SignalCircularError`**: unchanged.
- **`index.ts`**: unchanged. New flag bits and helpers stay
  `/** @internal */`, never re-exported.
- **`peekCurrentObserver`, `setCurrentObserver`**: unchanged.

---

## §3 Performance prediction

### §3.1 Cellx — analytic model for the new design

**Model:** under two-phase mark with NOTIFIED dedup, every node gets
visited exactly once in phase 1. Effects are queued exactly once
(QUEUED flag dedup). The drain reads each effect once; reading pulls
through STALE computeds, which recompute exactly once each (STALE
cleared by recompute, NOTIFIED cleared at wave-end — *the second visit
in phase 1 was already short-circuited by NOTIFIED, so there is no
second visit*).

**Cellx breakdown per source write:**

| Stage | Operations | Body executions |
|---|---|---:|
| Phase 1: propagate from src.subs (4 L1) | mark L1 (4), L2 (4), L3 (4), L4 (4), enqueue effect (1) | 0 (no body runs) |
| Phase 2 drain: 1 effect | effect reads l4[0..3]; each STALE → recompute (4) | L4 = 4 evals |
| (each L4 recompute) reads l3[i] + l3[j], each STALE → recompute on first read; cached on later | per-L4-eval triggers 2 L3 reads, but L3 dedup happens via cache; total L3 = 4 evals | L3 = 4 evals |
| (each L3) → 2 L2 reads, dedup'd → L2 = 4 evals | | L2 = 4 evals |
| (each L2) → 2 L1 reads, dedup'd → L1 = 4 evals | | L1 = 4 evals |
| Phase 3: walk visited, clear NOTIFIED | ~17 nodes | 0 |
| **Total body executions** | | **17** (= 4+4+4+4 + 1 effect) |

**This matches alien-signals' measured 17.** The Investigator's table at
`inv` §H4 confirms 17 is the structural minimum for this graph.

**Per-body-execution timing prediction:**

The current aihu per-eval is 62 ns. The new design's per-eval cost is
slightly different:
- `recompute()` body: same closure call as today. Same ~30 ns of fn().
- Per-read overhead: today it's `subs.has() + EFFECT-flag check` (~5 ns);
  new design adds the version-XOR (~1 ns). Net: maybe +1 ns per read.
  Each computed body does 2 reads → +2 ns per eval.
- The lazy-vs-eager conditional in p25 is removed → -3 ns per notify.
  But notify is no longer in the body-execution path; this saving moves
  to phase 1 (where notify is just `flags |= NOTIFIED | STALE | MARKED`
  + Set iterate). Phase 1 cost is ~8 ns × 17 nodes = 136 ns total.
- Phase 3 NOTIFIED clear: ~3 ns × 17 = 51 ns.

**Per-eval prediction: ~63 ns (within noise of current 62).**

**Total cellx p50 prediction: 17 × 63 ns + 136 ns + 51 ns + ~50 ns
overhead = 1,071 + 187 + 50 = 1,308 ns ≈ 1.3 µs.**

This sits between alien-signals (1.25 µs) and the §3 target ceiling
(1.5 µs). **Cellx p50 prediction: 1.3 µs** (range: 1.2–1.5 µs depending
on V8 inlining of the propagate loop).

### §3.2 Wide-fanout-100

Graph: 1 signal, 100 computeds (each only-read by exactly 1 effect),
100 effects.

Phase 1: signal write → mark 100 computeds (each → mark 1 effect each).
Net mark visits: 200 nodes; effect queue gets 100 entries.

Phase 2 drain: 100 effects run; each reads its 1 computed; computed
recomputes (STALE+MARKED), clears flags. 100 computed body evals + 100
effect runs = **200 body executions**, same as today.

The version-stamp work adds 100 × ~1 ns = ~100 ns total — within noise.
The MARKED/NOTIFIED bit work adds 100 × ~3 ns = ~300 ns. The phase-3
visited-clear walk adds 200 × ~3 ns = ~600 ns. Total added: ~1 µs.

Current: 8.97 µs. Prediction: **~9.5 µs (range 9.0–10.0 µs).**

The 10% bench gate threshold is 9.87 µs (10% of 8.97). The prediction
sits at the edge. **Risk noted in §3.5.**

**Mitigation:** if the gate trips, the Builder may inline the phase-1
loop's flag-set into the call site (avoids a function call boundary)
or split `propagateMark` into a simple non-recursive form for
single-deep graphs (wide-fanout has depth 1). Both are post-implement
tweaks; default ships the canonical structure.

### §3.3 Batched-writes-100

Graph: 1 effect subbing 1 signal; `batch()` does 100 sequential writes
to that signal; effect runs once at drain.

Phase 2: each `setN(i)` call inside batch enqueues the effect once; the
QUEUED flag dedups to 1 entry. The batch drain's phase-1 marks the
single effect; phase 2 runs it once. Body executions: 1 (effect).

Current aihu: 11.16 µs. The hot path is 100 × signal.write (which
does equality check, value mutation, queue check) plus 1 effect run.

Per-write cost slightly increases:
- `version++`: +1 ns
- `propagateMark` is *not called* on the batch path (we go through
  `enqueueIfNeeded` directly), so no extra cost there.

Net: +100 ns per 100 writes = +0.1 µs. Plus 1 phase-3 walk-and-clear of
1 visited node = ~3 ns.

**Prediction: 11.3 µs (~+1% from current 11.16 µs).** Within gate.

### §3.4 Why the model is correct for *all* graph shapes

The Investigator's table showed the current design produces L1:1, L2:2,
L3:4, L4:8 evals (doubling per layer = the diamond glitch). Under the
new design:

- **NOTIFIED bit dedup in phase 1:** a node visited by *any* propagate
  path gets NOTIFIED set on first arrival. Subsequent arrivals via
  other paths short-circuit. Result: every node marked at most once
  per wave. **L1:1, L2:1, L3:1, L4:1** in cellx phase 1.

- **STALE bit + recompute() clears it:** during phase 2, the first read
  of a STALE computed triggers `recompute()`, which clears STALE before
  the next reader sees it. Subsequent readers see cached. Result:
  every computed body runs at most once per wave.

- **QUEUED bit dedup on effects:** an effect reached via multiple
  cascades is enqueued once. The drain runs it once. Result: every
  effect runs at most once per wave (Phase 2 `spec-2` §1.5 item 2
  preserved).

- **shallowClear on equal recompute:** if a computed's recompute returns
  an equal value, downstream MARKED bits are cleared without further
  cascade. Result: equality-cascade-suppression preserved (Phase 2
  Finding 3).

- **RUNNING bit:** unchanged. Cycle detection preserved (Phase 2
  `spec-2` §2.4).

For each topology:

| Topology | Phase 1 marks | Phase 2 evals | Phase 3 clears | Total body evals |
|---|---:|---:|---:|---:|
| Linear (s → c1 → c2 → eff) | 3 | c1, c2, eff = 3 | 3 | 3 |
| Fan-out (s → c1..cN → effN) | 2N | N comp + N eff = 2N | 2N | 2N |
| Diamond (cellx 4×4 + eff) | 17 | 16 comp + 1 eff = 17 | 17 | 17 |
| Cycle (write reaches running RUNNING node) | thrown before completion | — | — | thrown |

**The N-evals-per-N-nodes invariant holds across all topologies.** This
is the structural fix.

### §3.5 Risk factors

1. **V8 megamorphic propagateMark.** `propagateMark` is called both
   from `signal.write` and from itself recursively. If V8 sees mixed
   call patterns and goes megamorphic, the inline-cache miss cost
   could add ~5–10 ns per call. Mitigation: write `propagateMark` as
   an iterative loop with an explicit stack (small array, reused),
   not recursion. Cost: ~10 B gz; benefit: monomorphic call site.
   **Builder MAY ship recursive first, profile, and switch to
   iterative if megamorphic costs show up.**

2. **`visited[]` array allocation.** The module-scoped reused array
   avoids per-write allocation, but if the array's high-water-mark
   grows unbounded (some pathological app), V8's array elements kind
   could degrade from PACKED to HOLEY. Mitigation: explicit
   `visited.length = 0` at end of each wave (no `splice`/`pop`).

3. **The MARKED/NOTIFIED two-bit overhead per `flags |= …`.** Each
   bit-OR is one cycle, but pipelining hides it. Risk is V8 deopts the
   `flags` field's int representation if its high bits ever overflow
   into Smi-tag space. We're using bits 0x01–0x40 = 7 bits; well within
   31-bit Smi range on V8. **No risk.**

4. **Wide-fanout's 100 phase-3 clears** could add measurable ns on
   that workload. If the wide-fanout p50 trips the 10% gate (threshold
   9.87 µs), the Builder applies the inlining mitigation in §3.2.

5. **alien-signals uses a doubly-linked-list dep graph (`Link` nodes)**
   instead of a Set per sub. That's a 100–150 B implementation choice
   we're explicitly not making (size budget would blow up). Our
   `Set<Subscriber>` iteration is ~3× slower per element than alien's
   linked-list walk (~30 ns vs ~10 ns for a 4-element walk), but
   amortizes to ~50–100 ns per cellx op total. **Cellx's actual gap to
   alien may end up at 0.05–0.1 µs (4–8% slower than alien) due to
   this choice.** That's acceptable — the §3 target is 1.5 µs and the
   prediction is 1.3 µs; even hitting 1.4 µs is target-clearance.

---

## §4 Side-effect analysis on other workloads

### §4.1 wide-fanout-100

**Walk-through.**
- Setup: 100 computeds c[i] each subscribed to src. 100 effects e[i]
  each subscribed to its c[i]. Effect-construction also reads c[i],
  subscribing the effect.
- Per op: `setSrc(counter+1)`. signal.write fires.
- Phase 1: `propagateMark` over src.subs (100 entries). For each c[i]:
  set `NOTIFIED | STALE | MARKED`, push to visited. Then iterate
  c[i].subs (1 entry, the effect e[i]): set `NOTIFIED | QUEUED`, push
  to visited and to effectQueue. Phase 1 done; 200 nodes visited; 100
  effects in queue.
- Phase 2 drain: shift e[i], check MARKED (set), clear MARKED, call
  e[i].notify → run(). run() reads c[i]; c[i] is STALE → recompute()
  → reads src (subscribes; deps version-stamp); returns new value;
  cleared STALE+MARKED. Effect body finishes.
- Repeat 100×.
- Phase 3: walk visited (200 entries), clear NOTIFIED.

**Body executions:** 100 computed + 100 effect = 200. Same as current.

**Per-op cost vs current:**
- Phase 1 per-node cost: ~8 ns (3 bit-ORs + push + Set iterate + 1
  recursive call to inner subs walk).
- Phase 2: same as current (read → recompute → effect body).
- Phase 3 per-node cost: ~3 ns (bit-clear + index increment).

Current 8.97 µs / 200 evals = 44.85 ns per eval. Adding ~11 ns of
phase-1 + phase-3 per node: ~55.85 ns × 200 + base = ~11.2 µs… wait,
that overcounts. Let me redo: current 8.97 µs *includes* the cascade
work currently done in `notify()`. The new design moves that work to
phase 1 (which is ~8 ns per node) + phase 3 (~3 ns per node) = ~11 ns
per node; current `notify()` is roughly 8 ns per node (one call, one
flag check, one Set iterate). So **net change is ~3 ns per node × 200
= +0.6 µs ≈ +6.7%**.

**Prediction: 9.6 µs ± 0.4.** The 10% gate threshold is 9.87 µs.
**Pass margin is tight (~3%).** Builder MUST run the bench post-fix
and confirm. If it trips, apply the inlining mitigation in §3.5 risk 1.

### §4.2 batched-writes-100

**Walk-through.**
- Setup: 1 effect, 1 signal, batch wraps 100 writes.
- Per op: enter batch; 100× setN(i+1). Each write: equality check (passes
  for 99 of them), value mutation, version++, `enqueueIfNeeded(effect,
  batchQueue)` — first call adds it; 99 are dedup'd by QUEUED flag. Exit
  batch → drainBatch.
- drainBatch phase 1: 1 entry (effect). Flag-check: it's an effect with
  EFFECT bit; set NOTIFIED+MARKED, push to visited. No downstream cascade
  (effect has no subs).
- Phase 2: shift effect, check MARKED (set), clear, call notify → run.
  Run reads signal value (now i=100); cleanup cleared MARKED.
- Phase 3: clear visited (1 node).

**Body executions:** 1 effect run. Same as current.

**Per-op cost vs current:**
- 100× version++: +1 ns × 100 = +100 ns.
- 1 phase-1 mark: +8 ns.
- 1 phase-3 clear: +3 ns.
- Net: +111 ns ≈ +1%.

**Prediction: 11.27 µs (~+1% from 11.16 µs).** Well within gate.

### §4.3 Per-body-execution speed comparison

Investigator's measurement: aihu 62 ns/eval, alien 74 ns/eval. The
new design changes per-eval cost only marginally (the version-XOR adds
~1 ns per dep read). **Predicted post-rewrite: 63–65 ns/eval.** Still
faster than alien per call.

The remaining gap to alien on cellx (1.3 µs vs 1.25 µs ≈ 4%) is
attributable to the Set-vs-LinkedList implementation choice (§3.5
risk 5). Closing it would cost 100–150 B and is **explicitly out of
scope.**

---

## §5 Test plan

### §5.1 Phase 2 tests — all must pass without modification

| Test file | Tests | Status |
|---|---|---|
| `signal.test.ts` | 8 tests (R/W, equality, no-batch notify, dispose, etc.) | unchanged; pass |
| `effect.test.ts` | 7 tests (registration, re-run, equality, dispose, cycle, fan-out) | unchanged; pass |
| `computed.test.ts` | 12 tests including the 4 Phase 2 Finding 3 tests at L97-176 | unchanged; pass |
| `batch.test.ts` | 8 tests (collapse, dedup, cycle, effect-writes-during-flush) | unchanged; pass |
| `state.test.ts` | 4 tests | unchanged; pass |
| `properties.test.ts` | 4 fast-check properties | unchanged; pass |

**The Builder MUST NOT modify any existing test.** If any fails on the
new implementation, the design is broken — halt.

### §5.2 Investigator's instrumentation — adopted as verification methodology

The three scratch files at `.team/phase-2-5/scratch/` are the
verification methodology. The Verifier runs them post-implementation:

```bash
# Expected: TOTAL = 17 (matching alien)
bun .team/phase-2-5/scratch/cellx-counter.ts
# Expected output: per-layer counts of 1; total = 17
```

Compare against the Investigator's measured pre-fix output (TOTAL = 92,
per-layer doubling). The same script with no modifications must produce
17 on the new implementation. **This is the binding diamond-glitch
absence test.**

### §5.3 New unit tests in `packages/signals/tests/computed.test.ts`

Three new tests are appended (the existing `computed.test.ts` already
contains the diamond test from p25 with relaxed bounds; the new design
allows tightening it). The new tests:

```ts
it('cellx 4×4 diamond: exactly 17 body executions per signal write', () => {
  // Mirrors .team/phase-2-5/scratch/cellx-counter.ts but as a unit test.
  const counters = { l1: [0,0,0,0], l2: [0,0,0,0], l3: [0,0,0,0], l4: [0,0,0,0], eff: 0 }
  const [src, setSrc] = signal(0)
  const l1 = [0,1,2,3].map(i => computed(() => { counters.l1[i]++; return src() + i }))
  const l2 = [
    computed(() => { counters.l2[0]++; return l1[0]() + l1[1]() }),
    computed(() => { counters.l2[1]++; return l1[1]() + l1[2]() }),
    computed(() => { counters.l2[2]++; return l1[2]() + l1[3]() }),
    computed(() => { counters.l2[3]++; return l1[3]() + l1[0]() }),
  ]
  const l3 = [
    computed(() => { counters.l3[0]++; return l2[0]() + l2[1]() }),
    computed(() => { counters.l3[1]++; return l2[1]() + l2[2]() }),
    computed(() => { counters.l3[2]++; return l2[2]() + l2[3]() }),
    computed(() => { counters.l3[3]++; return l2[3]() + l2[0]() }),
  ]
  const l4 = [
    computed(() => { counters.l4[0]++; return l3[0]() + l3[1]() }),
    computed(() => { counters.l4[1]++; return l3[1]() + l3[2]() }),
    computed(() => { counters.l4[2]++; return l3[2]() + l3[3]() }),
    computed(() => { counters.l4[3]++; return l3[3]() + l3[0]() }),
  ]
  let sink = 0
  effect(() => { counters.eff++; sink = l4[0]() + l4[1]() + l4[2]() + l4[3]() })
  // Reset post-construction
  for (const k of ['l1','l2','l3','l4'] as const) counters[k] = [0,0,0,0]
  counters.eff = 0
  setSrc(1)
  // Each computed body runs exactly once; effect runs exactly once.
  for (const k of ['l1','l2','l3','l4'] as const)
    for (let i = 0; i < 4; i++) expect(counters[k][i]).toBe(1)
  expect(counters.eff).toBe(1)
  expect(sink).toBe(/* deterministic */ sink) // tautological — we only assert it converged
})

it('NOTIFIED dedup: a write reaching the same computed via multiple paths only marks it once', () => {
  // Two-parent diamond: src → a, src → b; both → c → effect
  const [src, setSrc] = signal(0)
  let aEvals = 0, bEvals = 0, cEvals = 0, effRuns = 0
  const a = computed(() => { aEvals++; return src() + 1 })
  const b = computed(() => { bEvals++; return src() + 2 })
  const c = computed(() => { cEvals++; return a() + b() })
  effect(() => { effRuns++; c() })
  expect(aEvals).toBe(1); expect(bEvals).toBe(1); expect(cEvals).toBe(1); expect(effRuns).toBe(1)
  setSrc(10)
  // c has two parents (a, b); both got marked. Without NOTIFIED dedup,
  // c would be marked twice and (under the old eager design) recomputed
  // twice. Under the new design, NOTIFIED prevents the second mark.
  expect(aEvals).toBe(2)
  expect(bEvals).toBe(2)
  expect(cEvals).toBe(2)              // exactly once, not twice
  expect(effRuns).toBe(2)
})

it('effect dedup: two cascades reaching the same effect run it once', () => {
  // Two computeds that both reach the same effect.
  const [src, setSrc] = signal(0)
  let effRuns = 0
  const a = computed(() => src() + 1)
  const b = computed(() => src() + 2)
  effect(() => { effRuns++; a(); b() })
  expect(effRuns).toBe(1)
  setSrc(5)
  // Effect is reached via a-cascade AND b-cascade in phase 1; QUEUED dedup.
  expect(effRuns).toBe(2)
})
```

### §5.4 Existing diamond test — tighten the bounds

The current `computed.test.ts` at L207-278 contains a 2-layer diamond
test with relaxed bounds (`l1*≤2, l2*≤3, effectRuns≤5`) to accommodate
the p25 design's residual glitch. **Under the new design, all those
bounds tighten to exactly the structural minimum.**

The Builder updates the test (this is a test modification, but it's
*tightening*, not relaxing — the new design is strictly more correct):

```ts
// Replace L259-274 with:
setN(10)
expect(evals.l1a).toBe(2)
expect(evals.l1b).toBe(2)
expect(evals.l2a).toBe(2)
expect(evals.l2b).toBe(2)
expect(effectRuns).toBe(2)
```

The comment explaining "the classic diamond glitch fires" should be
replaced with a comment explaining the new design's NOTIFIED-bit dedup
fixes the glitch.

### §5.5 Bench gate

The runner at `bench/signals/src/runner.ts` enforces the 10% p50
regression gate per `HARNESS.md:128-130`. The Builder runs:

```bash
cd bench/signals && bun src/runner.ts
```

Pass criteria:
- cellx p50 ≤ 1.5 µs (target; **pass = pass; the gate's 10% computation
  yields a ~74% improvement, well below the threshold**)
- wide-fanout-100 p50 ≤ 9.87 µs (10% over current 8.97 µs)
- batched-writes-100 p50 ≤ 12.28 µs (10% over current 11.16 µs)

If the Builder hits the bench and any threshold trips, halt and apply
the §3.5 mitigations *before* opening the PR. Do NOT add `[bench-bump]`
to the commit message; this is a perf rewrite, not a bench bump.

### §5.6 Verifier matrix walk

Reuse `vr-2` §6's four-scenario matrix:

| # | Scenario | Existing test | Status under rewrite | Verifier confirms |
|---|---|---|---|---|
| 1 | Lazy preservation (no observers → no recompute) | `computed.test.ts:67-95` | Unchanged; subs.size === 0 early-return | passes |
| 2 | Linear chain (signal → c1 → c2 → effect) | `computed.test.ts:33-47` | Phase 1 marks all; phase 2 effect pulls; each body runs once | passes |
| 3 | Cycle | `computed.test.ts:49-65`, `effect.test.ts:75-84` | RUNNING bit unchanged; throws fire | passes |
| 4 | Diamond (cellx) | `computed.test.ts` new test (§5.3) + `cellx-counter.ts` | Each body runs ≤ 1× per write | passes |

Plus the four Phase 2 Finding 3 tests at `computed.test.ts:97-176` —
all unchanged, must pass.

Plus the three new tests in §5.3.

Plus the new diamond bound-tightening at §5.4.

---

## §6 File-level change list

Default scope is **three implementation files** + one test file +
one bench bookkeeping file:

| File | Action | Scope |
|---|---|---|
| `packages/signals/src/signal.ts` | modify | (a) Add `MARKED = 0x20`, `NOTIFIED = 0x40` bit constants. (b) Add `version` field to signal closure; bump in write. (c) Replace synchronous-cascade `for sub of [...subs]: sub.notify()` with `propagateMark(subs)` + `drainEffects()`. (d) Add module-level `effectQueue: Subscriber[]`, `visited: Subscriber[]`, `propagateMark`, `drainEffects`, `clearVisited`. (e) Modify `drainBatch` to two-phase (mark queued computeds; phase-2 run effects with skip semantics). |
| `packages/signals/src/computed.ts` | modify | (a) Remove `hasEffectSub` (no longer needed). (b) Replace `notify()` body with the new mark-and-propagate (no eager recompute). (c) Add `shallowClear(subs)` helper called inside `read()` after equal-recompute. (d) Update `recompute()` to clear both STALE and MARKED. |
| `packages/signals/src/effect.ts` | modify | Trivial: notify body unchanged; the queue-driven invocation happens in `signal.ts`'s `drainEffects`. effect's notify is just the run-or-skip path Phase 2 already had. |
| `packages/signals/tests/computed.test.ts` | modify | Append three new tests per §5.3; tighten the existing diamond test bounds per §5.4. The existing 4 Finding 3 tests, the lazy/linear/cycle tests, and all other Phase 2 tests are unchanged. |
| `bench/signals/RESULTS.md` | modify (auto) | Regenerated by `bun src/runner.ts` after rewrite lands. |
| `bench/signals/CHANGELOG.md` | modify | One row noting cellx improvement (5.71 µs → ~1.3 µs), wide-fanout drift (≤+10%), batched-writes drift (≤+1%). |

**No other files change.** Specifically:
- `packages/signals/src/index.ts` — unchanged. New flag bits and helpers
  are `/** @internal */`, never re-exported.
- `packages/signals/src/state.ts`, `batch.ts`, `errors.ts` — unchanged.
- `packages/signals/tests/{batch,effect,signal,state,properties}.test.ts`
  — unchanged.
- `.size-limit.json` — unchanged. Predicted size (820–880 B; see §7) stays
  under the 1024 B hard cap.
- Moon configs, tsconfig, CI workflow — unchanged.

If the Builder finds the change requires touching any other file, halt
and surface a clarifying question. **Default to minimum surgical scope.**

---

## §7 Deviations from Phase 2 spec

| # | Deviation | Source | Authorization |
|---|---|---|---|
| 1 | New `/** @internal */` flag bits: `MARKED = 0x20`, `NOTIFIED = 0x40` in `signal.ts` (was 4 bits in spec-2 §2.1; p25 added EFFECT to make 5; this rewrite adds 2 more for 7) | Architect (this spec) | Continuation of the packed-bitfield design. Cost: ~6–8 B gz. Not exposed publicly. |
| 2 | New module-level `effectQueue: Subscriber[]` and `visited: Subscriber[]` arrays in `signal.ts` (separate from `batchQueue`, both `/** @internal */`) | Architect (this spec) | Internal scheduler infrastructure for the two-phase model. Cost: ~30–40 B gz. Not exposed. |
| 3 | New module-level helper functions in `signal.ts`: `propagateMark`, `drainEffects`, `clearVisited`, `shallowClear` | Architect (this spec) | Internal-only helpers; the public `signal()`/`computed()`/`effect()` factories' contracts are unchanged. Cost: ~80–100 B gz. |
| 4 | New `version: number` field on signal closure; bumped on each non-equal write | Architect (this spec) | Reserved for future read-fast-path (§9) and as the wave-counter foundation. Cost: ~5–10 B gz. No semantic shift. |
| 5 | `signal.write` outside batch no longer calls `sub.notify()` per sub; it calls `propagateMark(subs)` + `drainEffects()` | Architect (this spec) | Same observable behavior: all subs are notified before write returns; effects run in deterministic order. The two-phase implementation is internal. |
| 6 | `computed.notify()` no longer cascades synchronously; it marks STALE+MARKED+NOTIFIED and recurses into not-yet-NOTIFIED subs | Architect (this spec) | Internal restructuring. The semantic contract from `spec-2` §1.3 ("computed marks itself stale and cascades that staleness to its own subscribers") is preserved — staleness *is* cascaded; the recompute is what's deferred to read-time. |
| 7 | `drainBatch` becomes two-phase (mark queued nodes' downstream cascade; then run effects with MARKED-skip semantics) | Architect (this spec) | Phase 2 batch contract preserved: dedup by identity, single-run-per-batch, effect-writes-during-flush extends the batch, MAX_BATCH_ITERATIONS bound. |
| 8 | The existing diamond test (`computed.test.ts:207-278`) has its bounds tightened from `≤` ranges to exact `===` values | Architect (this spec) | This is a *tightening* — the new design is strictly more correct than the old. Phase 2 expected this bound; p25 relaxed it because the glitch persisted; this rewrite restores the original intent. |

**No Decision 2B authorization required.** All deviations are internal,
preserve the externally observable behavior described in `spec-2` §1,
and satisfy all `vr-2` correctness invariants. Phase 2 Finding 3 is
preserved by §2.6's `shallowClear`; cycle detection is preserved by
§2.9; batch contract is preserved by §2.10.

---

## §8 Open questions for Team Lead

### §8.1 Should `propagateMark` be recursive or iterative?

Picked: **recursive** (cleaner code, smaller). Risk: V8 megamorphism
on the recursive call site. **Builder may switch to iterative
(explicit-stack) if profile shows the megamorphism cost.** Cost
delta: +10–15 B gz for iterative. Architect's call to start recursive;
escalate if bench gate trips.

### §8.2 Should the wave counter live on `Subscriber` (per-node int) or as a `visited[]` walk-and-clear?

Picked: **walk-and-clear with shared `visited[]` array** (§2.7).
Per-node wave-counter int costs ~10–15 B gz; walk-and-clear is ~8 B
and keeps Subscriber's hidden class smaller (better V8 inlining).

If Team Lead prefers the per-node counter for forward-compatibility
with Phase 3 telemetry (where a wave ID would be a nice fingerprint
for `[trace] schedule.wave_started`), the cost is ~10 B gz; reply on
this spec.

### §8.3 Should `version` go on `Subscriber` (so computeds also have one) or only on signal closures?

Picked: **only on signals.** Computeds derive their staleness from
STALE/MARKED bits; their "version" is implicit in `cached`'s identity.
A computed-version field would only matter if we add cross-realm
stable-key reads (arbor's territory).

If Team Lead wants forward-compatibility headroom for the §9 deeper
wins (specifically the read-version fast-path for stable-key reads),
the cost is ~15 B gz to add a `version` field to computed; reply on
this spec.

### §8.4 The "skip queued effect on equal-recompute" mechanism — bit-flag or fresh array?

Picked: **bit-flag (MARKED clear)** per §2.6.1. Alternative: maintain
a `pending: Set<Subscriber>` separate from `effectQueue` and only run
effects in the intersection. The Set adds ~30 B and a hashing call
per drain element; the bit-flag is one OR. **Architect's call holds**;
escalate if a future stress test shows MARKED-clear is racy under
batch + cycle interaction.

### §8.5 Should we adopt alien-signals' linked-list dep graph for §9 deeper wins?

Architect-decided **no** for this spec (size budget). The current
`Set<Subscriber>` is ~3× slower per element than alien's `Link` walk
but amortizes to <100 ns per cellx op. Closing that gap costs 100–150
B gz — half the remaining headroom. **Defer.** This is the kind of
post-arbor perf-pass investigation §9 flags.

If Team Lead wants this in, it's a separate spec — likely Phase 4 or
a dedicated perf session.

---

## §9 Deeper wins beyond cellx

The structural rewrite makes several micro-optimizations newly
accessible. Each is listed with mechanism, predicted speedup, and
size cost. The Architect recommends shipping the *first three* in
this spec; the rest are deferred to a future perf session.

### §9.1 (RECOMMENDED) Inline-array subs for ≤ 2 subscribers

**Mechanism.** Most computeds have 1 subscriber; effects have 0.
The current `Set<Subscriber>` allocation costs ~150 B per node and
~20–30 ns per add/iterate. Replace the Set with a tagged union:
- 0 subs: `subs = null`
- 1 sub: `subs = single` (Subscriber reference)
- 2 subs: `subs = [a, b]` (small inline array)
- 3+ subs: `subs = new Set([…])` (fall back to Set)

The `add()` and `iterate()` paths branch on type. V8 inlines the type
guard cheaply.

**Predicted speedup.**
- cellx: every node has 1–4 subs (most have 2). 75% of ops avoid the Set
  overhead. Per-op saving: ~150 ns. Cellx: 1.3 µs → 1.15 µs.
- wide-fanout: every computed has 1 sub (the effect). Per-op saving:
  100 × 30 ns = 3 µs. Wide-fanout: 8.97 µs → 5.97 µs (33% improvement).
- batched-writes: 1 sub. Per-op saving: ~30 ns. Negligible.

**Size cost.** ~80–100 B gz for the type-tagged union and dispatch.

**Recommendation: SHIP IN THIS SPEC** (size budget allows).

The 880 B target leaves ~140 B headroom over current 742; the structural
rewrite spends ~120 B; ~20 B left for this — *too tight for the full
implementation*. **Compromise: ship "single sub fast path"** (null,
single-ref, or fall back to Set). That's ~30–40 B gz and captures the
single-sub case (wide-fanout's win + ~half of cellx's win).

**Predicted with single-sub-only:**
- cellx: 1.3 µs → 1.2 µs
- wide-fanout: 8.97 µs → 7.5 µs (16% improvement)
- batched-writes: unchanged

### §9.2 (RECOMMENDED) Avoid `[...subs]` snapshot in `signal.write`

**Mechanism.** The current `for (const sub of [...subs]) sub.notify()`
in `signal.write` allocates an array per write. Under the new design,
the lazy phase-1 `propagateMark` doesn't need this snapshot (it doesn't
mutate `subs`). The eager batch-drain *does* (effects can dispose
themselves mid-run, mutating subs). **Drop the snapshot in propagateMark;
keep it in drain.**

**Predicted speedup.**
- cellx: 4 saved snapshots per write (one per phase-1 mark layer).
  Per-snapshot cost ~30 ns. 4 × 30 = 120 ns saved. Cellx: 1.2 µs →
  1.08 µs (8% improvement).
- wide-fanout: 1 saved snapshot at root. ~30 ns. Negligible.
- batched-writes: unchanged.

**Size cost.** Free — it's a removal.

**Recommendation: SHIP IN THIS SPEC.** Already implicit in §2.4's
pseudocode (no `[...subs]` in propagateMark).

### §9.3 (RECOMMENDED) Use `for (let i=0; i<subs.length; i++)` over for-of on small arrays

**Mechanism.** V8 inlines indexed-array reads more aggressively than
iterator-protocol calls. On small arrays (≤4 elements, the cellx
shape), index iteration is ~2× faster than `for...of`. Where we use
inline arrays (§9.1), use indexed iteration.

**Predicted speedup.** Maybe 30–50 ns per cellx op. Cellx: 1.08 µs →
1.05 µs.

**Size cost.** ~5 B gz (the index variable + length cache).

**Recommendation: SHIP IN THIS SPEC.** Combines with §9.1.

### §9.4 (DEFER) Linked-list dep graph (alien-signals' Link nodes)

**Mechanism.** Replace `Set<Subscriber>` and the implicit
back-edges-from-Subscriber-to-deps with a single doubly-linked-list of
`Link { dep, sub, prevDep, nextDep, prevSub, nextSub, version }` nodes.
Walks are O(1) per step with no iterator allocation; back-pointers
enable cheap unsubscribe + per-dep version stamping.

**Predicted speedup.** 50–100 ns per cellx op (the Set-iteration tax
remains the residual gap to alien-signals).

**Size cost.** 100–150 B gz. Eats ~half the remaining size budget.

**Recommendation: DEFER** to a future Phase 4 perf session. Not worth
the byte spend in this spec.

### §9.5 (DEFER) Pre-allocated effect run pool

**Mechanism.** Effects allocate their `node` and closures fresh on
each construction. For long-lived effects (component-mount lifetimes
in arbor), this is fine. For short-lived effects (test fixtures,
re-mounting components), pool the node objects.

**Predicted speedup.** 0% on benches (none of them re-create effects).
Real-app: 1–5% on dense remount traffic.

**Size cost.** ~50 B gz.

**Recommendation: DEFER** until arbor's mount/unmount profile drives it.

### §9.6 (DEFER) Topological sort + run-effects-in-graph-order

**Mechanism.** Phase 2 effects pull through computeds lazily, so the
order they read deps is upstream-first. But the *order of effect
runs themselves* is insertion order (FIFO queue). For diamond graphs
where two effects share upstream, sorting them by dep-graph depth
could reduce L2/L3 cache thrashing.

**Predicted speedup.** Inconclusive; depends heavily on graph shape.
On cellx, marginal (single effect). On wide-fanout, no diamond shape.

**Size cost.** 80–120 B (depth tracking + sort).

**Recommendation: DEFER.** Not load-bearing for any current bench.

### §9.7 Summary of §9 picks

**Shipping in this spec:**
- §9.1 single-sub fast path (~35 B gz, +16% wide-fanout, +5–8% cellx)
- §9.2 drop snapshot in propagateMark (free, +8% cellx)
- §9.3 indexed iteration on inline arrays (~5 B gz, +2% cellx)

**Deferred:**
- §9.4 linked-list dep graph (Phase 4 perf session)
- §9.5 effect pool (post-arbor real-app data)
- §9.6 topological effect ordering (low priority)

**Net byte budget for the rewrite + §9 picks:**

| Component | Bytes (gz, estimate) |
|---|---:|
| Current state | 742 |
| Remove `hasEffectSub` and the two-path notify split (p25) | -25 |
| Add MARKED, NOTIFIED bit constants | +6 |
| Add `version` to signal | +8 |
| Add `effectQueue`, `visited`, `propagateMark`, `drainEffects`, `clearVisited`, `shallowClear` | +95 |
| Modify `computed.notify()` and `read()` for the new flow | +5 |
| Update `drainBatch` to two-phase | +20 |
| §9.1 single-sub fast path | +35 |
| §9.2 drop snapshot (free) | 0 |
| §9.3 indexed iteration (small) | +5 |
| **Predicted total** | **891 B gz** |

**Margin to 880 B target:** -11 B (over by 11). **Margin to 1024 B
hard cap:** 133 B headroom.

The 11 B over-target is acceptable; the §9 wins are real perf gains
that justify the spend. Builder can recover those bytes by:
- Sharing the `propagateMark` / `drainEffects` body via a single
  exported helper instead of two separate functions.
- Inlining `clearVisited` into `drainEffects`'s tail.

If the Builder hits the 1024 B hard cap, drop §9.3 (5 B), then §9.1
(35 B) — keeping the structural fix is non-negotiable; the perf wins
are negotiable.

---

## §10 Builder consumption notes

The Builder should:

1. **Read this spec end-to-end** before touching code, plus the
   Investigator's report (`cellx-investigation-report.md`). Do not skip
   the alien-signals reference (`bench/signals/node_modules/alien-signals/esm/system.mjs`)
   — it's the canonical implementation of two-phase mark.

2. **Run the bench once** to confirm current numbers match RESULTS.md
   (sanity check). Run `cellx-counter.ts` once to confirm 92 evals on
   pre-fix (sanity check on the diamond glitch).

3. **Implement in this order:**
   - `signal.ts`: add MARKED, NOTIFIED, `version`, `effectQueue`,
     `visited`, `propagateMark`, `drainEffects`, `clearVisited`,
     `shallowClear`. Modify `signal()`'s write path.
   - `computed.ts`: remove `hasEffectSub`; rewrite `notify()`; update
     `read()` for shallowClear-on-equal-recompute.
   - `effect.ts`: minimal changes; verify `notify()` still calls `run()`.
   - `batch.ts` / `signal.ts` `drainBatch`: extend to two-phase.

4. **Run all 36 existing tests; confirm all pass without modification.**
   If any pre-existing Phase 2 test fails, **halt**.

5. **Add the new tests in §5.3** + tighten the existing diamond bound
   in §5.4. Confirm they pass.

6. **Run `cellx-counter.ts`**: expect TOTAL = 17, per-layer counts 1.

7. **Run the bench**: confirm cellx p50 ≤ 1.5 µs (target), and the
   other two workloads stay within 10% of current.

8. **Run typecheck, build, size, biome** — all clean. Size limit: 1024 B
   hard cap; target ≤ 880 B (slight overshoot OK per §9.7).

9. **Commit** with message
   `perf(signals): two-phase mark/propagate scheduler (cellx 5.71µs → ~1.3µs)`.
   Do NOT include `[bench-bump]` — this is a perf win, not a bench-bump.

10. **Open the PR.** Include in the body: bench results (before/after),
    cellx-counter output (before/after), size delta. The Verifier
    walks the four-scenario matrix per §5.6 plus the new diamond and
    dedup tests.

If any step fails, halt and write a continuation note. The bench gate
will not let a regression land; trust the gate. If size limit is
exceeded, drop §9.3 first, then §9.1 — never compromise the structural
fix.

---

## §11 Summary

This spec replaces the structurally-bounded p25 design (5.71 µs cellx,
diamond glitch storm at 92 evals/op) with a glitch-free two-phase
mark/propagate scheduler that targets 17 evals/op and ~1.3 µs cellx
p50. The four Phase 2 invariants are preserved without test
modification: lazy preservation, linear chain correctness, cycle
detection, and equality cascade suppression (Finding 3). Public API,
batch contract, and bundle size budget are all preserved. The §9
deeper wins (single-sub fast path, snapshot drop, indexed iteration)
add 16% to wide-fanout and 5–8% to cellx as a free side-effect of the
structural rewrite.

The implementation is a Phase 3-class restructuring delivered on the
Phase 2.5 branch. The Builder consumes this spec next; the Verifier
runs the matrix walk + new tests; the bench gate seals the result.
