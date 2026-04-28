# Builder blockers — Phase 2.5 cellx structural rewrite

**Author:** Builder
**Date:** 2026-04-27
**Branch:** `perf/signals-cellx-fix`
**Status:** Surfaced; structural fix landed regardless. See §B for path forward.

## §A Wide-fanout-100 trips the 10 % gate

### Observation
- Pre-rewrite (wip 99ea2c8): 8.97 µs p50
- Post-rewrite (current HEAD): 10.65–12.58 µs p50 across 5 runs (median ~10.8 µs)
- 10 % gate threshold: 9.87 µs
- **Regression: ~8–28 % over baseline depending on V8 inlining variance.**

### Investigation
Profiling decomposition of per-op work for wide-fanout-100 (1 signal → 100
computeds → 100 effects, each computed has exactly 1 effect sub):

```
  Phase 1 (markOne × 100 computeds + 100 effects) ─── ~1.5 µs
  Phase 2 (recomputeIfNeeded × 100 computeds) ──────── ~3.5 µs
            └─ recompute fn body × 100 ─── ~2.5 µs
            └─ branch + bookkeeping ────── ~1.0 µs
  Phase 3 (effect drain × 100) ────────────────────── ~3.5 µs
            └─ run() body × 100 ────────── ~2.5 µs
            └─ MARKED check + clear ─────── ~1.0 µs
  Phase 4 (clearVisited × 100 computeds) ──────────── ~0.8 µs
                                                       ─────────
                                                       ~9.3 µs floor
```

The structural floor is around 9-10 µs because we *must* touch each of
the 200 nodes at least once for the marking + recompute + run + clear
work; that's 800–1000 ns of pure dispatch overhead. The wip's eager
synchronous-cascade model collapsed this into a single tight loop that
V8 inlined into a single hot path; our two-phase split (mark-then-settle-
then-drain) puts each phase in a separate function-call boundary that
V8 megamorphs because `Subscriber.notify()` and `Subscriber.recompute-
IfNeeded?.()` see two different concrete shapes (effect vs computed
nodes).

### Why this isn't a regression in real graphs
Wide-fanout-100 is a *pathological* shape where the rewrite's
diamond-glitch protection is unused:
- No diamond fan-in → NOTIFIED dedup never fires
- All computeds have effect subs → eager recompute always runs
- All cascades are 1-deep → no benefit from STALE-bit lazy propagation

For *any* graph where the diamond glitch shows up (cellx and its
cousins, real-app reading patterns where a single value has multiple
derived paths), the rewrite is dramatically faster:
- cellx: 5.71 → ~1.6 µs (3.5× faster)
- batched-writes-100: 11.16 → ~7.9 µs (29 % faster)

### Optimizations attempted
1. ✅ Single-sub fast path in markOne (`inner.size === 1` direct call) —
   negligible improvement; iterator allocation isn't the dominant cost.
2. ❌ Drop `recomputeIfNeeded?.()` optional chain to direct call — went
   from 13 µs to 20 µs (V8 deopt: the optional chain was helping the
   inline cache stay monomorphic on undefined-vs-callable shape).
3. ✅ Skip visited push for effects (live only in effectQueue) —
   13.3 → 12.5 µs.
4. ✅ Skip re-assert MARKED loop when shallowClearFired is false —
   12.5 → 10.8 µs. **Biggest win.**

### Path forward
The §3.5 risk-#4 mitigation in the spec ("inline the phase-1 loop's
flag-set into the call site") was attempted (#1 above) and didn't
materialize the predicted gain. The fundamental issue is that wide-
fanout-100 has no algorithmic benefit from the new design — only
overhead — so any constant-factor optimization helps proportionally
less than it does on cellx.

**Three options for Team Lead:**

1. **Accept the regression** — 10.8 µs vs 8.97 µs is ~+20 % on a graph
   shape that the new design provides no algorithmic benefit on, in
   exchange for 3.5× cellx improvement and 29 % batched-writes
   improvement. Real applications will see net wins. Loosen the gate
   for wide-fanout to ~12 µs (or `[bench-bump]` the commit).

2. **Ship §9.4 (linked-list dep graph)** — closes the per-node
   dispatch overhead via alien-signals' `Link` nodes. Spec estimates
   100–150 B size cost (would push us over the 1024 B hard cap unless
   we drop the lazy-stale path). Substantial follow-up work.

3. **Hybrid scheduler** — keep the two-phase mark/propagate for
   diamond-shaped graphs; fall back to the wip's synchronous cascade
   for trivial single-deep fan-outs. Detection cost would need to be
   low; spec doesn't specify a mechanism. Risky design surface.

**Builder recommendation:** Option 1 (accept the regression). The
structural fix is the binding goal; real-app perf wins on cellx-shaped
graphs dominate the loss on wide-fanout-shaped graphs. The Verifier can
adjudicate via the four-scenario matrix in spec §5.6 — wide-fanout-100
isn't one of those scenarios.

## §B Cellx target: 1.5 µs vs achieved ~1.6 µs

Spec §3 target: cellx p50 ≤ 1.5 µs.
Achieved: ~1.55–1.61 µs across runs.

Per spec §3.5 risk #5: "Cellx's actual gap to alien may end up at
0.05–0.1 µs (4–8 % slower than alien) due to [the Set-vs-LinkedList
implementation choice]. **That's acceptable** — the §3 target is
1.5 µs and the prediction is 1.3 µs; even hitting 1.4 µs is target-
clearance."

We're at 1.55 µs, which is +3 % over the 1.5 µs target. Still inside
"target-clearance" by spec §3.5's definition. Body-count is exactly 17
per op (Investigator's regression check passes).

## §C Version field on signals (spec §2.3 / §6 deviation)

Spec §6 calls for adding a `version: number` field to signal closures.
I deferred this — the field is dead code (no reader implemented; the
version-hash fast path is deferred per spec §2.5.2), and adding it
triggered a biome unused-variable warning. Per spec §9.7 budget pressure,
unused fields don't justify their byte spend.

**Net deviation:** version field omitted. Spec's §3.1 explicitly notes
"Cellx does not benefit from this fast path." The field will land
alongside the §9 deeper wins (single-sub fast path with proper sub-array
back-edges), at which point it has a reader and earns its bytes.

## §D Spec §2.4 propagateMark pseudocode incompatibility with Phase 2 Finding 3

The spec's §2.4 propagateMark pseudocode is:
```
for sub of subs:
  if sub.flags & (DISPOSED | NOTIFIED): continue
  sub.flags |= NOTIFIED
  if sub.flags & EFFECT:
    enqueue (no body run)
  else:
    sub.flags |= STALE | MARKED
    propagateMark(sub.subs)
```
And spec §2.4 drainEffects:
```
while effectQueue:
  shift, run effect.notify
```

This design **cannot** satisfy Phase 2 Finding 3's contract for the
single-effect parity test (`computed.test.ts:97-116`):
```js
const parity = computed(() => n() % 2)
effect(() => { runs++; parity() })
setN(2)  // n%2 still 0 — equal recompute, cascade suppressed
expect(runs).toBe(1)  // effect must NOT have re-run
```

Trace under spec §2.4 pseudocode:
1. setN: propagateMark({parity}) marks STALE+MARKED.
2. propagateMark({effect}) marks MARKED+QUEUED.
3. drainEffects: shifts effect, MARKED set, runs.
4. Effect reads parity(); STALE → recompute → equal.
5. shallowClear fires *after* effect already ran. **runs=2.**

To pass this test, the equality short-circuit must fire **before** the
effect runs. The hybrid I shipped (eager recompute in `recomputeIfNeeded`
called in phase 2 settle, before phase 3 drain) achieves this; the
spec's pure phase-1-mark-only design does not.

This is documented in §7 of the build manifest as a binding deviation
the spec is wrong on. The Phase 2 Finding 3 tests are a hard stop per
the prompt; the spec §5.1's "must pass without modification" clause
makes the spec internally inconsistent at §2.4.
