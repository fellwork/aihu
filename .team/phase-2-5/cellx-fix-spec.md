# Spec — `@scribe/signals` cellx perf fix (Phase 2.5)

**Author:** Architect
**Date:** 2026-04-27
**Branch:** `perf/signals-cellx-fix`
**Status:** Final — Builder may consume.

This spec is binding. It targets the Phase 2.5 builder-blocker
(`.team/phase-2-5-builder-blockers.md`): scribe is 7.2× slower than
alien-signals on cellx (5-deep diamond propagation) because every observed
computed re-runs synchronously during the notify wave. The fix is internal
to `computed.ts` plus a one-bit flag addition in `signal.ts`. Phase 2's
public surface is preserved verbatim; the equality-cascade-suppression
behavior from Phase 2 Finding 3 is preserved verbatim. No deviations from
Phase 2 spec require Decision 2B authorization beyond a single new
`/** @internal */` flag bit.

References:
- Phase 2 spec: `.team/phase-2/spec-signals.md` (`spec-2`)
- Phase 2 verification report: `.team/phase-2/verification-report.md` (`vr-2`)
- Phase 2.5 builder-blockers: `.team/phase-2-5-builder-blockers.md` (`bb`)
- Bench harness: `bench/signals/HARNESS.md`
- Bench results: `bench/signals/RESULTS.md`
- cellx workload: `bench/signals/src/workloads/cellx.ts`

---

## 1. Public API surface

**No change.** Every export listed in `spec-2` §1 (the 7 values + 8 types
the Phase 2 Verifier confirmed at `vr-2` Gate 3) ships unchanged. No new
public symbol; no new option on `signal()`, `effect()`, `computed()`,
`$state()`, `batch()`. No new error class. No widened generic.

The fix is entirely internal. The only externally observable change is
that `cellx-shaped` graphs propagate faster — and that's measured by the
bench harness, not by the type surface.

This avoids any Decision 2B authorization burden.

---

## 2. Internal architecture

### 2.1 Why the verification report's Option 1 didn't work, and how this design navigates it

`vr-2` §6 records the binding constraint at lines 587-594:

> `computed.notify()` propagates only by calling `sub.notify()` on each
> forward subscriber — there is no separate "I am stale, please ask me
> again later" channel. If the cascade is suppressed, the downstream
> effect never schedules and never reads again.

This is correct. The Builder's Phase 2 pivot (eager-recompute-when-subbed)
works because `notify()` is overloaded with two duties:
1. **Tell the subscriber it should run** (effect needs to schedule itself).
2. **Mark intermediate state stale** (downstream computeds should re-derive on
   next read).

You can't drop duty 1 — effects must run, or the world stays out of sync.
You can drop duty 2's *eager body execution* — but only if you preserve
the schedule path for effects.

**The hybrid (Option 3 from the prompt) is the right move, with one twist:**
the split is not "subscribed by effect vs subscribed by computed" — it's
"this computed has at least one effect-sub vs only-computed-subs". A
computed with mixed subs takes the eager path (necessary for the effect);
the lazy path is reserved for computeds whose subscribers are exclusively
other computeds.

In cellx, layers 1-3 fit the lazy criterion (their subs are next-layer
computeds). Layer 4 fits the eager criterion (its subs include the
terminal effect). Result: layers 1-3 propagate STALE marks via cheap
pointer-walks; layer 4 eagerly recomputes (which lazily pulls layers 1-3)
and runs the equality check before cascading to the effect. Each
computed body still runs at most once per signal write — but the work
shifts off the notify hot-path and into the read-pull, allowing the
non-leaf layers to skip the recompute closure, the equality call, and the
`[...subs]` snapshot allocation.

### 2.2 The new bit: `EFFECT`

Add a fifth flag bit to `signal.ts`:

```ts
/** @internal */ export const EFFECT = 0x10
```

Bit assignment after change:

| Bit | Meaning |
|---|---|
| `0x1`  RUNNING   | (unchanged) Subscriber's body is currently executing. |
| `0x2`  DISPOSED  | (unchanged) Subscriber disposed; notify becomes no-op. |
| `0x4`  QUEUED    | (unchanged) Subscriber is in `batchQueue`. |
| `0x8`  STALE     | (unchanged) Computed body needs to re-run on next read. |
| `0x10` EFFECT    | **NEW.** Subscriber is an Effect (not a Computed). Set once at construction; never cleared. |

Set in `effect()`'s node constructor: `flags: EFFECT` (was `flags: 0`).

Cost: ~5-10B gz (one constant + the literal in effect.ts).

### 2.3 `computed.ts` — the cached `hasEffectSub` flag

Add a closure-scoped `hasEffectSub` boolean to `computed()`, monotonic
(once `true`, never goes back to `false`). Updated at sub-add time inside
`read()`:

```ts
let hasEffectSub = false
// ... inside the existing read() body:
const observer = peekCurrentObserver()
if (observer !== null) {
  if (!subs.has(observer)) {
    subs.add(observer)
    if ((observer.flags & EFFECT) !== 0) hasEffectSub = true
  }
}
```

The `subs.has(observer)` guard avoids re-paying the `hasEffectSub` test
on every read (which would also be correct, just wasted cycles); add it
even though the Set already dedupes — it's free in JS Sets and shaves the
closure-scope read on the hot path.

Cost: ~15-25B gz (the boolean, the conditional, the EFFECT constant
import — most of which is shared with the bit definition above).

### 2.4 `computed.notify()` — the two-path split

Replace the current `notify()` body with:

```ts
notify() {
  if (node.flags & DISPOSED) return
  if (node.flags & RUNNING) throw new SignalCircularError()
  // If already stale, downstream was already notified on the prior write —
  // suppress the redundant cascade. (Unchanged from Phase 2.)
  if (node.flags & STALE) return
  node.flags |= STALE
  // No subscribers → nothing to cascade. Stay lazy. (Unchanged.)
  if (subs.size === 0) return

  if (hasEffectSub) {
    // Eager path: at least one effect-sub depends on whether the
    // recomputed value differs. Recompute now, equality-test, decide
    // whether to cascade. This preserves Phase 2 Finding 3
    // (equality-cascade-suppression).
    const prev = cached
    const next = recompute()
    cached = next
    hasCached = true
    if (equals !== false && hasCached && equals(prev, next)) return
    for (const sub of [...subs]) sub.notify()
  } else {
    // Lazy path: subs are only other computeds. Propagate STALE marks
    // without running our body. The downstream computeds will lazily
    // recompute when something reads them. No equality check fires here
    // — it fires later, at the eager-path computed (or at the read site
    // for an unsubscribed pull).
    for (const sub of subs) sub.notify()
  }
}
```

Key differences from the current implementation:
1. The **lazy path** does no `recompute()` call, no `equals(prev, next)`,
   no `[...subs]` snapshot. Just bit-set + Set iteration of inner
   `notify()` calls (which themselves bit-set + iterate, terminating
   when STALE is already set or when an eager leaf is hit).
2. The **eager path** is identical to current behavior (this is the
   important invariant: when an effect-bearing computed sees a notify, it
   behaves exactly like it does today, including the equality short-circuit
   from Phase 2 Finding 3).
3. The **lazy-path Set iteration drops the `[...subs]` snapshot**. We can
   iterate `subs` directly because the lazy path only calls
   `sub.notify()`, which on the lazy path only sets a flag and recurses;
   no body runs, no dispose can fire, no mutation of `subs` occurs during
   iteration. (The eager path keeps the snapshot — that path may run an
   effect whose body could dispose itself.)

### 2.5 First-read invariant (no behavior change)

The `read()` path is unchanged:

```ts
const read: Read<T> = () => {
  if (node.flags & RUNNING) throw new SignalCircularError()
  const observer = peekCurrentObserver()
  if (observer !== null) {
    if (!subs.has(observer)) {
      subs.add(observer)
      if ((observer.flags & EFFECT) !== 0) hasEffectSub = true
    }
  }
  if (!hasCached || node.flags & STALE) {
    cached = recompute()
    hasCached = true
  }
  return cached
}
```

The lazy STALE bit is cleared inside `recompute()` (already true today —
`computed.ts:41`). So when an effect reads a STALE computed, it
recomputes, which lazily reads its own STALE deps, which recompute, etc.
Each computed's body runs at most once per notify wave because once it
clears STALE, the second visit short-circuits at the cache hit.

### 2.6 What does NOT change

- `signal.ts`: no behavior change in `read()`, `write()`, batch internals.
  Only the `EFFECT` constant addition.
- `effect.ts`: only the construction-time flag value (`0` → `EFFECT`).
  `notify()` body unchanged. `run()` unchanged. Disposal unchanged.
- Cycle detection: unchanged. `RUNNING` is still set during `recompute()`
  (eager path) and during `run()` (effects). Re-entry still throws
  `SignalCircularError`.
- Batch interaction: unchanged. Inside a batch, signal writes enqueue
  subscribers via `enqueueIfNeeded`; on drain, each sub's `notify()` is
  called once. The lazy-path notify is what runs during drain for
  computeds with only-computed subs. The eager-path notify runs for
  computeds with effect subs. Equality suppression at the eager path
  still gates whether enqueued effects ultimately observe the change.

### 2.7 Performance hypothesis (why this hits the target)

Current cellx hot path per signal write (5-deep diamond, 16 inner
computeds + 1 effect):
- 16 × `recompute()` closure call (RUNNING flag set/clear, try/finally,
  observer swap, fn() body)
- 16 × `equals(prev, next)` call
- 16 × `[...subs]` Array.from allocation
- 16 × Set iteration to call sub.notify
- 1 × effect.run

Proposed cellx hot path:
- 12 × lazy notify (layers 1-3, 4 each): bit-set + Set iteration of
  notify. No recompute, no equals, no allocation.
- 4 × eager notify at layer 4: same cost as current per-node (recompute
  + equals + snapshot + iteration). Each eager notify drives a
  recompute that pulls through layers 3/2/1 — hitting STALE-then-cache
  hits.
- 1 × effect.run.
- The 12 layer-1-2-3 recomputes happen during the eager-path
  recompute()'s read of upstream — but as call-frames in a tight read
  loop, not as separate notify-cascade bodies.

Net work: same number of computed-body executions (16 plus the effect),
but the 12 non-leaf executions move out of the notify cascade and into
the read-driven recompute, which doesn't pay closure-allocation +
allocation-of-subs-snapshot per node.

Predicted p50: **1.8-2.4 µs**, putting us comfortably under the
hard target (2.6 µs) and within range of the stretch target (1.5 µs).
Final number depends on V8's inlining of the lazy-path branch and the
Set iteration cost. The bench will tell.

**No-regression on wide-fanout-100:** wide-fanout has 100 effects each
subscribed to its own computed (and all 100 computeds subscribed to one
signal). Every computed has exactly one effect sub → every computed
takes the eager path. Behavior is byte-for-byte equivalent to today. The
only new cost is the boolean-flag check, which is one bit-AND and one
boolean read per notify — well below the bench-gate noise floor (10%).

**No-regression on batched-writes-100:** the batch path is untouched. The
drain loop calls `sub.notify()`, which dispatches to the same notify
bodies; the dedup via `QUEUED` flag is unchanged. Predicted neutral.

---

## 3. Tooling

### 3.1 Bench harness — no change needed

The harness at `bench/signals/HARNESS.md` already runs the three-workload
× six-competitor matrix. The 10% p50 regression gate
(`HARNESS.md:128-130`) covers all three workloads. The Builder runs
`bun src/runner.ts` once before the fix to confirm the current numbers
match RESULTS.md, then once after to measure the improvement.

### 3.2 CI gate behavior on this PR

Per `HARNESS.md:134-143` (the `[bench-bump]` override), the gate **does
not need an override** for this PR — cellx improving is a pass for the
gate (the formula is `(current.p50 / previous.p50) - 1`; a perf win
yields a negative number, well below the 0.10 threshold). The
`[bench-bump]` token is for legitimate slowdowns; this PR has none.

The Builder does NOT add `[bench-bump]` to the commit message.

### 3.3 RESULTS.md regeneration

The runner overwrites RESULTS.md on each invocation (it includes the
machine-readable JSON block between `<!-- bench-data:start -->` markers
that the gate parses). The Builder runs the runner as the last step
before opening the PR; the new RESULTS.md commits alongside the code
fix. CHANGELOG.md gets one new entry: a row noting the cellx
improvement and the (unchanged) wide-fanout / batched-writes numbers.

### 3.4 Local verification before PR

The Builder runs in order:
1. `bun run test --coverage` — all 36 tests still pass. Coverage on
   `computed.ts` should not drop materially.
2. `bun run typecheck` — clean.
3. `bun run build` — clean.
4. `bun run size` — under 1024 B (predicted ~720-740 B; +20-40 B from
   current 698 B for the new flag and conditional).
5. `bun src/runner.ts` (in `bench/signals/`) — cellx p50 < 2.6 µs;
   wide-fanout-100 and batched-writes-100 within 10% of current
   numbers.
6. `bunx biome ci .` — clean.

If any step fails, halt and surface to Team Lead. Don't ship a partial
fix.

### 3.5 Test infrastructure

Two new test files; details in §4.

---

## 4. Test plan

The Verifier runs **all four scenarios from `vr-2` §6** on the new
implementation, plus the Phase 2 Finding 3 regression check, plus
new diamond-specific tests.

### 4.1 Scenario coverage matrix

| # | Scenario | Existing test | Status under fix | Verifier confirms |
|---|---|---|---|---|
| 1 | Lazy preservation (no observers → no recompute) | `computed.test.ts:67-95` | Unchanged — `subs.size === 0` early-return fires before either path | passes |
| 2 | Linear chain (signal → c1 → c2 → effect) | `computed.test.ts:33-47` | c2 has effect sub (eager path); c1 has only c2 sub (lazy path); each body runs once | passes |
| 3 | Cycle (must throw `SignalCircularError`) | `computed.test.ts:49-65`, `effect.test.ts:75-84` | RUNNING-bit check unchanged; both throw paths fire | passes |
| 4 | Diamond (cellx) | NEW (see §4.3) | Layers 1-3 lazy-propagate; layer 4 eager-recomputes; final effect runs once per signal write | passes |

### 4.2 Equality-cascade-suppression (Phase 2 Finding 3) — must continue to work

These four existing tests in `computed.test.ts` MUST remain green
without any modification:

- **L97-116** `cascade suppressed on equal recompute (default Object.is)`
- **L118-138** `cascade fires on unequal recompute`
- **L140-155** `equals: false always cascades, even on identical recomputed value`
- **L157-176** `custom comparator gates cascade`

All four reach the eager path because the test fixtures all read the
computed inside an effect — `hasEffectSub === true`. Behavior is
byte-for-byte equivalent to current.

The Builder MUST NOT modify these tests. If any fails on the new
implementation, the design is broken — halt.

### 4.3 New tests — `computed.test.ts` (3 unit tests appended)

Append to `packages/signals/tests/computed.test.ts`:

```ts
it('lazy stale propagation: only-computed subs do not recompute on notify', () => {
  // signal → c1 → c2 (no effect; c2 is only read once at the end)
  const [n, setN] = signal(1)
  let c1Evals = 0
  let c2Evals = 0
  const c1 = computed(() => {
    c1Evals++
    return n() + 1
  })
  const c2 = computed(() => {
    c2Evals++
    return c1() * 10
  })
  // Initial read of c2 to wire deps. c2 reads c1, c1 reads n.
  expect(c2()).toBe(20)
  expect(c1Evals).toBe(1)
  expect(c2Evals).toBe(1)
  // Now write to n. With no effect subscribed, c2 should NOT recompute
  // during notify — c2 has no subs → STALE-mark only. c1 has c2 as sub
  // → STALE-propagate, no recompute.
  setN(5)
  expect(c1Evals).toBe(1) // not yet (lazy)
  expect(c2Evals).toBe(1) // not yet (lazy)
  // Reading c2 forces the chain to recompute exactly once each.
  expect(c2()).toBe(60)
  expect(c1Evals).toBe(2)
  expect(c2Evals).toBe(2)
})

it('diamond graph: each computed body runs exactly once per signal write', () => {
  // 5-deep mini-diamond (1 source, 2 layers of 2 computeds each, 1 effect).
  // Verifies the cellx-shape correctness invariant: every node runs once.
  const [n, setN] = signal(0)
  const evals = { l1a: 0, l1b: 0, l2a: 0, l2b: 0 }
  const l1a = computed(() => { evals.l1a++; return n() + 1 })
  const l1b = computed(() => { evals.l1b++; return n() + 2 })
  const l2a = computed(() => { evals.l2a++; return l1a() + l1b() })
  const l2b = computed(() => { evals.l2b++; return l1a() * l1b() })
  let effectRuns = 0
  let observed = -1
  effect(() => {
    effectRuns++
    observed = l2a() + l2b()
  })
  // After construction, all 4 computeds have evaluated once (effect's read).
  expect(evals.l1a).toBe(1)
  expect(evals.l1b).toBe(1)
  expect(evals.l2a).toBe(1)
  expect(evals.l2b).toBe(1)
  expect(effectRuns).toBe(1)
  // n=0 → l1a=1, l1b=2, l2a=3, l2b=2, observed = 5.
  expect(observed).toBe(5)

  // Write to n. After the dust settles, each computed body must have run
  // exactly twice (once at construction, once after the write).
  setN(10)
  expect(evals.l1a).toBe(2)
  expect(evals.l1b).toBe(2)
  expect(evals.l2a).toBe(2)
  expect(evals.l2b).toBe(2)
  expect(effectRuns).toBe(2)
  // n=10 → l1a=11, l1b=12, l2a=23, l2b=132, observed = 155.
  expect(observed).toBe(155)
})

it('mixed subs: computed with both effect and computed subs takes eager path', () => {
  // c1 is read by both a downstream computed (c2) AND an effect directly.
  // c1 must take the eager path because it has at least one effect sub,
  // which means equality suppression must work on c1.
  const [n, setN] = signal(0)
  let c1Evals = 0
  const c1 = computed(() => {
    c1Evals++
    return n() % 2 // returns 0 for even, 1 for odd
  })
  const c2 = computed(() => c1() * 10)
  let effectRuns = 0
  effect(() => {
    c1() // direct sub of c1
    c2() // indirect sub of c1 via c2
    effectRuns++
  })
  expect(c1Evals).toBe(1)
  expect(effectRuns).toBe(1)
  // Write that produces equal recompute (0 → 2, both even → c1=0 unchanged).
  setN(2)
  // c1 has effect sub → eager path → recompute → equals(0, 0) → suppress.
  // Effect must NOT have re-run.
  expect(c1Evals).toBe(2) // recomputed eagerly (eager path)
  expect(effectRuns).toBe(1) // suppressed by equality
})
```

These three tests cover the three structural cases:
- **lazy stale propagation:** the work-deferral path.
- **diamond:** the cellx structural correctness (each body runs once).
- **mixed subs:** the equality suppression remains intact when a computed
  has both kinds of subscribers.

### 4.4 Property test — already covered

`packages/signals/tests/properties.test.ts` already has the
`computed = f(signal)` round-trip property at L74-86. It runs
50 fast-check iterations and asserts that for any sequence of writes,
`doubled() === w * 2` holds. This continues to validate correctness
against the new implementation — under any sequence of writes, the
final computed value matches the pure-function spec.

If the Verifier wants extra confidence, an optional fourth property
worth adding (NOT mandated by this spec; Verifier's call):

```ts
it('diamond round-trip: leaf-effect observes correct final value', () => {
  fc.assert(
    fc.property(fc.array(fc.integer(0, 100), { minLength: 1, maxLength: 20 }), (writes) => {
      const [n, setN] = signal(0)
      const a = computed(() => n() + 1)
      const b = computed(() => n() + 2)
      const c = computed(() => a() + b())
      let observed = -1
      effect(() => { observed = c() })
      for (const w of writes) setN(w)
      const last = writes[writes.length - 1]!
      return observed === last + 1 + (last + 2)
    }),
    { numRuns: 50 },
  )
})
```

### 4.5 Bench harness — no new workloads

The cellx workload is the regression test for this fix. After the fix,
the bench gate's negative regression (= improvement) will be the proof.
No new bench workload is needed.

---

## 5. File-level change list

Default scope is **two files**: `signal.ts` (one constant) and
`computed.ts` (the notify split + sub-add change). Plus tests.

| File | Action | Scope |
|---|---|---|
| `packages/signals/src/signal.ts` | modify | Add one line: `/** @internal */ export const EFFECT = 0x10`. No other change. |
| `packages/signals/src/effect.ts` | modify | One-line change: `flags: 0` → `flags: EFFECT` in the node literal. Add `EFFECT` to the import from `signal.ts`. |
| `packages/signals/src/computed.ts` | modify | Add `EFFECT` to imports. Add `let hasEffectSub = false`. Modify `read()` sub-add branch to update `hasEffectSub` (and short-circuit on `subs.has`). Replace `notify()` body with the two-path implementation in §2.4. |
| `packages/signals/tests/computed.test.ts` | modify | Append three new tests per §4.3. Existing 8 tests unchanged. |
| `bench/signals/RESULTS.md` | modify (auto) | Regenerated by `bun src/runner.ts` after the fix lands. The Builder commits the new RESULTS.md alongside the source change. |
| `bench/signals/CHANGELOG.md` | modify | Append one row noting the cellx win (date, before/after p50, "no regression" on the other two workloads). |

**No other file changes.** Specifically:
- `packages/signals/src/index.ts` — unchanged. `EFFECT` is `/** @internal */`,
  not re-exported.
- `packages/signals/src/state.ts` — unchanged. `$state` delegates to
  `signal()`; signal behavior is unchanged.
- `packages/signals/src/batch.ts` — unchanged.
- `packages/signals/src/errors.ts` — unchanged.
- `packages/signals/tests/effect.test.ts`, `signal.test.ts`,
  `state.test.ts`, `batch.test.ts`, `properties.test.ts` — unchanged.
- `.size-limit.json` — unchanged. Predicted size (~720-740 B) stays
  comfortably under the 1024 B budget.
- Moon configs, tsconfig, CI workflow — unchanged.

If the Builder finds the change requires touching any other file, halt
and surface as a clarifying question. **Default to minimum surgical
scope.**

---

## 6. Deviations from existing spec

| # | Deviation | Source | Authorization |
|---|---|---|---|
| 1 | New `/** @internal */` flag bit `EFFECT = 0x10` in `signal.ts` | Architect (this spec) | Phase 2 spec §2.1 documents 4 flag bits in a single packed `flags: number`. Adding a 5th bit is a continuation of the same packed-bitfield design. Cost: ~5-10 B gz. Not exposed publicly (per `spec-2` §2.1: "Subscriber" stays `/** @internal */`). |
| 2 | `effect()` constructor uses `flags: EFFECT` instead of `flags: 0` | Architect (this spec) | One-character change in a private file. No semantic shift visible to users. |
| 3 | `computed.notify()` adopts a two-path model (lazy STALE-propagate vs eager-recompute), gated by `hasEffectSub` | Architect (this spec) | The two-path model is internal to `computed.ts`. The semantics observable to user code (lazy first read, cached subsequent reads, equality suppression on cascade, cycle on re-entry) match `spec-2` §1.3 verbatim. The Phase 2 Verifier's four scenarios at `vr-2` §6 all hold under the new model — confirmed in §4.1 of this spec. |

**No Decision 2B authorization required.** Each deviation is internal,
preserves all externally-observable behavior described in `spec-2` §1, and
satisfies all `vr-2` correctness invariants.

The Phase 2 spec §2.1 line "A 4-bit field suffices" becomes "A 5-bit
field suffices" — the spec file should be updated to reflect this when
the Builder ships, but it's documentation maintenance, not a contract
change.

---

## 7. Open questions for Team Lead

### 7.1 Should `hasEffectSub` be monotonic, or refcounted with downgrade-to-lazy?

Picked: **monotonic.** Once a computed has ever had an effect sub, it
remains in eager mode forever (until disposal of the computed itself,
which v0 doesn't expose).

Trade-off:
- **Monotonic (this spec):** ~5 B gz, O(1) bool. Cellx's effect lives
  the whole bench, so monotonic is optimal here. In real apps, an
  effect that mounts/unmounts many times would leave the computed in
  eager mode forever, paying eager-recompute cost on every signal
  write even when nothing observes the result. **Slight pessimism but
  never wrong.**
- **Refcounted with downgrade:** ~30-40 B gz (counter field on each
  computed; decrement on effect dispose; reset to lazy when counter
  hits 0). Tracks reality more accurately.

**Recommendation: ship monotonic for v0. Re-evaluate if a real
arbor scenario demonstrates the over-paying.** Effect creation in arbor
is tied to component mount lifecycle; once a component mounts, its
effects persist for the route lifetime, so the monotonic approximation
is close to optimal. Add a TODO comment in `computed.ts` flagging the
refcounted variant for the post-arbor perf pass.

**Team Lead override path:** if you'd rather pay the 30-40 B for the
refcounted variant now to avoid the future audit cycle, reply on this
spec; the Builder can implement either.

### 7.2 Should the lazy path's `for (const sub of subs)` keep the `[...subs]` snapshot?

Picked: **drop the snapshot on the lazy path; keep it on the eager path.**

Trade-off:
- **Drop on lazy (this spec):** the lazy path only invokes `sub.notify()`
  on each sub, and `notify()` on the lazy path only sets a STALE bit and
  recurses (no body, no dispose, no Set mutation). Iterating `subs`
  directly is safe. Saves the array-allocation cost per notify, which is
  most of the cellx hot-path saving.
- **Keep snapshot:** safer-by-default if a future change introduces a
  side-effect into the lazy path. Costs 1 array allocation + iteration
  per notify per layer.

**Recommendation: drop the snapshot.** The safety argument doesn't
apply because we control the invariant — the lazy path is *defined* to
not mutate `subs`. If a future change wants to add side effects to the
lazy path, that change will need to revisit this decision; a comment
in `computed.ts` should call this out so the future maintainer doesn't
accidentally break it.

If Team Lead prefers the defensive snapshot for forward safety, the
perf win is reduced (~10-20% smaller) but still substantial — the bench
target is still reachable. **Architect's call holds; Team Lead may
override.**

### 7.3 Telemetry instrumentation (perf-metrics Realm 2 question)

The prompt's perf-metrics-final.md reference asked whether the cellx fix
should add the scheduling-vs-execution event split to arbor §2.8
telemetry as part of its instrumentation, or defer.

**Architect-decidable: defer.** Telemetry is cross-cutting and lives in
arbor, not signals. The cellx fix is internal to signals; adding telemetry
hooks to `computed.ts` for an arbor-resident sink would invert the
dependency direction. The fix should ship clean; telemetry instrumentation
is a separate session that wires through arbor's existing telemetry surface.

This is **not actually an open question** — flagging here so the Team
Lead sees that the prompt-implied question was considered and resolved
internally. If Team Lead disagrees, surface back; otherwise ship without
telemetry hooks.

---

## 8. Builder consumption notes

The Builder should:
1. Read this spec end-to-end before touching code.
2. Run the bench once to confirm the current numbers match RESULTS.md
   (sanity check on the local environment).
3. Implement the fix in the order: `signal.ts` (add EFFECT) →
   `effect.ts` (use EFFECT) → `computed.ts` (the two-path notify).
4. Run all 36 existing tests; confirm all pass without modification.
5. Add the three new tests from §4.3; confirm they pass.
6. Run the bench; confirm cellx p50 ≤ 2.6 µs and the other two workloads
   stay within 10% of current.
7. Run typecheck, build, size, biome — all clean.
8. Commit with message
   `perf(signals): lazy stale propagation for cellx-shaped graphs`.
   Do NOT include `[bench-bump]` — this is a perf win, not a bench-bump.
9. Open the PR.

If any step fails, halt and write a continuation note. The bench gate
will not let a regression land; trust the gate.
