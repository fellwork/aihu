# Track A Director Note — Round 002

**Date:** 2026-04-30
**Branch:** `feat/track-a-*` (convention per Architect spec)
**Plans in scope:** 4.2 (Error boundaries), 1.1 (Reconciler), 1.2 (Component props)
**Author:** Topic Director, Round 2
**Prerequisite reads:** `scout-report-track-a.md`, `spec-track-a-architect-round-001.md`,
`spec-v1-architecture-ratified.md` (§12 OQ-V1), `plan-v1-roadmap.md`

---

## 1. Budget Decision

**Decision: Proceed with the existing 2048 B arbor cap, with property mangling enabled as a
required build step for Plan 1.1 (not an emergency lever — a mandatory one).**

### The numbers in full

The Architect's own §2.7 projects:

| Stage | Arbor gz |
|---|---|
| Current (measured, Architect §1.7) | 1329 B |
| After Plan 4.2 (+140 B) | ~1469 B |
| After Plan 1.1 (+575 B) | ~2044 B |
| Cap | 2048 B |
| **Projected headroom after both** | **~4 B** |

The Scout's baseline measurement is slightly lower (1.28 kB = 1280 B gz), putting the
post-4.2 estimate at ~1420 B and the post-1.1 estimate at ~1995 B — leaving roughly 53 B.
The difference is consistent with a cache vs. clean rebuild discrepancy; the Architect's
1329 B figure is the more conservative and trustworthy baseline for planning.

The OQ-V1 ratification (§12 of `spec-v1-architecture-ratified.md`) used a 500 B reconciler
estimate and stated the existing 2048 B limit absorbs it with 219 B buffer. The Architect's
§2.7 revised that estimate upward to 575 B after fully speccing the diff algorithm. This is
not a contradiction — the OQ-V1 estimate preceded the detailed design. The Architect's number
supersedes it.

### Why not raise the cap

OQ-V1 is ratified. Raising the arbor cap now would require reopening a closed architectural
decision with no new evidence beyond the Architect's own estimates — estimates that come with
the explicit note "property mangling is the emergency lever" and a four-step size-rescue plan.
The reconciler was always planned for v1; the budget was set to accommodate it. The Architect
has already scoped the escape hatches in priority order. The correct response is to execute
those escape hatches proactively, not to widen the cap before a single line is written.

### Why not split the reconciler (core `when()` first, `each()` later)

The Architect spec puts `_reconcileList` at ~280 B of the ~575 B total, with
`_materializeStructural` + `_reconcileConditional` at ~200 B and factory implementations at
~60 B. A conditional-only first pass saves roughly 280 B — enough to land without property
mangling. However, the split creates a partially-valid public API: `each()` would continue
throwing during the conditional-only phase, and the `ChildScope` type and teardown protocol
that `when()` and `each()` share would need to be written twice if the split changes during
landing. The Architect's diff algorithm specifies `activeScopes` as a shared `Map` abstraction.
Splitting here is more bookkeeping complexity than it saves.

### The required build discipline for Plan 1.1

**Property mangling is not optional for Plan 1.1. It is a required part of the implementation.**

The Architect cites it as the third-level optimization after two algorithmic consolidations.
The Builder must treat it as first-order: the internal `ChildScope` field names
(`_disposers`, `_anchor`, `_children`, `appendedNodes`, `key`) are named for readability in
source, not for bundle size. Rolldown's property mangling compresses them aggressively. This
is the same technique used in bench/arbor and confirmed viable (Round N+1 receipts).

**Mandatory sequence for Plan 1.1:**

1. Implement `_teardownChildScope` first. It is shared between `when()` and `each()`. If the
   shared-teardown path is written as one function early, options 1 and 2 from the Architect's
   rescue plan are already captured.
2. Run `bun run size` after each sub-task (factory impls, conditional reconciler, list
   reconciler, push-pop stack). Do not wait until the full plan is complete.
3. If arbor gz exceeds 2048 B at any sub-task boundary, enable property mangling in the
   rolldown config before proceeding to the next sub-task. Do not accumulate debt.
4. If property mangling is enabled and the limit is still exceeded, file a builder-blocker
   before writing more code. Do not silently raise the number.

**One authorized pre-emptive step:** The Builder may enable rolldown property mangling at the
start of Plan 1.1 (before writing any reconciler code) to establish the true baseline with
mangling on. If mangling alone drops the 1469 B post-4.2 baseline by even 80–100 B, the
headroom picture improves significantly and the team avoids a mid-build scramble.

---

## 2. Scout Findings Review

### 2.1 `_activeMountDisposers` — corrected understanding

**The Round 1 concern was partially misconceived. The slot is not a communication channel
into `_mountEffect`.** Scout Task 2 confirms:

- `_mountEffect` (lines 69–79 of `mount.ts`) receives `disposers` as an explicit parameter
  passed by `_materialize`. It does NOT read the module-level `_activeMountDisposers` slot.
- The slot exists only for a future binding-layer inspection sub-project (#7 per JSDoc at
  lines 36–42 of `mount.ts`). It is currently set before `_materialize` runs and nulled in
  the `finally` block.
- **There is no re-entrant `mount()` path in v0 today.** `_materialize` never calls `mount()`.
  The re-entry risk is theoretical — it will become real when `when()`/`each()` child scopes
  are created inside reactive effects during Plan 1.1.

**Track state update required:** The Do-Not-Break invariant in `state-track-a.md` reads:
> "Scope-collector contract: `_activeMountDisposers` is `@internal`. The push-pop stack fix
> must not change the behavior visible to `_mountEffect` callers."

This remains correct. The push-pop stack fix (Architect §2.3) replaces the module-level slot
with a stack. Since `_mountEffect` never reads the slot directly (confirmed by Scout), the
behavioral contract for `_mountEffect` callers is unaffected. The state file invariant is
accurate as written — no correction needed there.

**New Track state addition:** Add to the Round Log that the `_activeMountDisposers` finding
was verified by Scout: the slot is inspection-only, not a flow-of-control channel for
`_mountEffect`.

### 2.2 `_materialize` structure — critical finding for Plan 1.1

Scout Task 4 confirms the `_materialize` handling structure: it is two `if` guards (not a
switch), where the second guard's fallthrough (lines 93–103) handles all non-leaf nodes as
tagged branches. A `kind: 'structural'` node that is not `kind: 'leaf'` would fall through to
the tagged-branch path and attempt `document.createElement(node.tag)` — broken behavior.

**This confirms the Architect's §2.6 decision is mandatory, not optional.** Adding the
`if (node.kind === 'structural')` guard before the existing fallthrough is a required
implementation step. The Builder must not try to work around this by returning a regular
`Branch` from `when()`/`each()` — the reactive update mechanism requires `_materialize` to
register the structural effect, which only happens via the new `'structural'` arm.

### 2.3 No blockers from Scout findings

All other Scout findings are confirmatory rather than blocking:

- Push-pop stack target confirmed (lines 117 + 123 of `mount.ts`): set before `try`,
  nulled in `finally`. The Architect's §2.3 spec maps directly to these lines.
- LIFO dispose loop confirmed (lines 134–137). Effect disposers and DOM removal are
  fully separated — `appendedNodes` is not in `disposers`.
- `untrack` confirmed available from `@aihu/signals` and not yet used in arbor.
  The reconciler will use it to read the condition/list signal during initial `_materialize`
  traversal without subscribing the outer traversal effect.
- 255 passing tests. Zero failures. Clean baseline.
- `SetupContext` gap confirmed for Plan 1.2 (no `attributeChangedCallback`, no
  `static observedAttributes` on `Component` class from `defineComponent`).
- `when()`/`each()` return type is declared `Branch` on the stubs. Changing to
  `StructuralNode` is a non-breaking change (stubs always throw; no compiled consumer
  can have depended on the `Branch` return type from these functions).

---

## 3. Architect Decisions Review

### 3.1 Spec gaps from Round 1 — resolved

All three gaps from Round 1 (§2.2–§2.4 of the Round 001 director note) are fully resolved:

| Round 1 gap | Resolution in Architect spec |
|---|---|
| 4.2: `onError` signature, placement, recovery model | Fully specified: §1.1–§1.6. `mount(node, host, { onError })`. Notify-only in 4.2, fallback rendering activated in 1.1 using the same `ErrorHandler` type. |
| 1.1: DOM anchor, child-scope lifecycle, push-pop stack, keyed diff | Fully specified: §2.1–§2.6. `ChildScope` type, `Comment` anchor, complete keyed diff algorithm in §2.4, push-pop stack in §2.3. |
| 1.2: Props surface shape, reactivity model, SetupContext compat | Fully specified: §3.1–§3.4. `attrs` options field, per-attribute `Signal<string>`, `AttrContext<A>` intersection, `_setSignal` injection pattern. |

### 3.2 `StructuralNode` approach — clearly specified

The `StructuralNode` type in §2.6 is clean and implementable without ambiguity:
- All fields always present (null for unused union arms) — satisfies spec §2.9 shape-locking.
- The `_materialize` new case (`kind === 'structural'`) is specified exactly, including
  delegation to `_materializeStructural` in `structural.ts` (not `materialize.ts`).
- The `ChildList` union update (`Branch | Leaf | StructuralNode`) is a local change to
  `types.ts` that does not affect any exported public API.
- `StructuralNode` is explicitly listed as NOT to be exported from `index.ts` (Architect
  Do-Not-Break constraint #12). This is correct — it is an implementation detail.

### 3.3 `_setSignal` injection pattern — clearly specified

The Architect §3.5 closes this with a one-sentence decision: "inject via `_setSignal(signal)`
at app boot, consistent with the existing `_setMount` pattern." The acceptance criteria in §4
(Plan 1.2) include a specific test: `_setSignal(signal)` must be called before any element
with `attrs` connects; throws `RuntimeError` if not. This is unambiguous and consistent with
the existing `_setMount` pattern in `define-component.ts`.

### 3.4 Anti-pattern check — acceptance criteria vs. original roadmap

Comparing the Architect's §4 acceptance criteria against `plan-v1-roadmap.md`:

**Plan 1.1 (Reconciler):**
- Roadmap criterion: "each preserves DOM identity for stable keys — no remount on reorder."
  Architect criteria: "Signal update reordering items → DOM order matches new key order; no
  old scopes recreated." Equivalent.
- Roadmap criterion: "bun run size passes — when/each adds ≤ 0.5 kB gz to `@aihu/arbor`."
  Architect: "bun run size — `@aihu/arbor` ≤ 2048 B gz passes (watch carefully — ~4 B
  headroom after 4.2)." The roadmap's "≤ 0.5 kB gz" delta criterion is slightly weaker
  than the Architect's absolute limit check — 0.5 kB from 1329 B = 1829 B, well within 2048 B.
  The Architect's absolute check is strictly correct.
- Roadmap criterion: "Bench: `each` 100-item reorder ≤ 2× vanilla `innerHTML` replacement."
  **This criterion is ABSENT from the Architect's acceptance criteria in §4.** The Builder must
  include a bench gate. See §5 (Builder brief) below for the addition.
- Roadmap criterion: "Index signal passed to `grow` is reactive (updates on reorder without
  remounting)." **This criterion is ABSENT from the Architect's §4.** The Architect's diff
  algorithm (§2.4 step 7) addresses this only in passing: "pass the index from
  `newItems.indexOf(item)` when creating new scopes." This applies only to new scope creation,
  not to existing scopes that move. Existing scopes do not have their index updated reactively
  — they are not remounted, so `index` at the time of `grow()` was called is frozen. The
  roadmap's "reactive index signal" implies `index` should be a `Signal<number>` that updates
  on reorder. **This is a scope gap.** See §3.5 below.

**Plan 1.2 (Props):**
- Roadmap criterion: "Parent writes `element.setAttribute('count', '5')` → child's
  `attrs().count` signal updates to `5` (number, not string)." Architect's reactivity model
  gives `ctx.attrs.count` as `Signal<string>`, not a coerced number signal. The roadmap
  implies coercion (`number`, not string); the Architect decision is string-only with coercion
  deferred (or to be done in user code). This is a substantive difference.
  **The Director resolves this in favor of the Architect's design: string-only for v1.**
  The roadmap's coercion requirement (string → number, string → boolean) was drafted before
  the Architect evaluated the runtime cost and API complexity. String-only `Signal<string>` is
  correct for a v1 hand-authored component API. Coercion is application-layer concern.
  The Builder acceptance criteria in §5 below reflect this resolution explicitly.

**Plan 4.2 (Error boundaries):**
- Roadmap criterion: "Nested boundaries: inner catches first; outer catches if inner
  re-throws." Architect §1.4 covers this: the propagation model re-throws when no handler is
  present, letting the outer scope's `_mountEffect` catch it. Equivalent.
- Roadmap criterion: "No boundary: error logged, component removed from DOM, sibling
  components unaffected." Architect §1.4: "if no scope has one, error propagates to the
  browser's uncaught-error handler." The "component removed from DOM" part of the roadmap
  criterion is not covered — the Architect's design leaves the partially-rendered scope in
  place but stops the specific effect from firing again. This is a minor divergence; the
  browser's uncaught-error handler is the correct place for this behavior, not forced DOM
  removal. **Director resolution: Accept the Architect's model. A broken scope stays
  partially rendered until `dispose()` is called by the consumer. No forced DOM removal.**

### 3.5 Reactive index scope gap

The roadmap's "index signal passed to `grow` is reactive" requirement is not reflected in the
Architect's `grow(item, index: number)` signature (§2.4, §2.6 `listGrow` field). The
Architect passes `index` as a plain number at scope creation time.

**Director decision: The reactive index requirement is descoped from v1 Plan 1.1.** The
accepted signature `each<T>(list, key, grow: (item: T, index: number) => Branch | Leaf)`
passes `index` as a plain number. The `plan-v1-roadmap.md` language was aspirational; the
Architect's design correctly chose the simpler interface. A reactive index would require
`grow` to receive a `Signal<number>` — a more complex API that forces `grow` callbacks to
handle signals, which is inconsistent with how `when(condition, grow)` works. The keyed
identity guarantee (stable keys → stable DOM nodes) is the primary performance story, and
that is fully specified. The Builder documents the `index` parameter as a snapshot value
(correct at the time the item is initially mounted; does not update on reorder) in the JSDoc.

---

## 4. Go / No-Go for Builder 4.2

**GO. Plan 4.2 is ready for Builder dispatch immediately.**

All prerequisites are satisfied:

- Scout confirms 772 B headroom in arbor at current baseline. The Architect's 140 B estimate
  leaves ~579 B post-4.2 — comfortable margin.
- Architect spec §1.1–§1.7 provides a complete, unambiguous implementation spec including
  exact TypeScript interfaces, modified function signatures, and the try/catch wrapping
  pattern inside `_mountEffect`.
- The `MountOptions` interface is type-only — zero bytes. The `options?.onError` guard path
  adds only ~35 B to `mount()`. The `_mountEffect` try/catch wrapping adds ~80 B.
- The 4-test minimum (Architect §4, Plan 4.2) is sufficient for the Verifier.
- No dependency on Plan 1.1 or 1.2 for the Plan 4.2 scope (notify-only behavior; fallback
  rendering is explicitly stubbed to a one-line guard for Plan 1.1 activation).
- Branch: `feat/track-a-error-boundaries` (follow Architect convention `feat/track-a-*`).

**The one addition to acceptance criteria (beyond Architect §4):** The `MountEffectFn` type
alias in `attrs.ts` gains the `errorHandler?: ErrorHandler` parameter. This type change must
not break any existing `attrs.test.ts` test that spies on `mountEffect` — the added parameter
is optional, so existing spy calls that pass `(disposers, fn, path)` remain valid. The
Verifier checks that `attrs.test.ts` still passes without modification.

---

## 5. Refined Builder Brief — Plan 4.2

### 5.1 Files to modify

| File | Change |
|---|---|
| `packages/arbor/src/types.ts` | Add `ErrorHandler` type and `MountOptions` interface (Architect §1.6 exact text) |
| `packages/arbor/src/attrs.ts` | Add `errorHandler?: ErrorHandler` as 4th parameter to `MountEffectFn` type alias |
| `packages/arbor/src/mount.ts` | (a) Add `options?: MountOptions` as 3rd param to `mount()`; (b) replace `_activeMountDisposers` slot assignment/clear with push-pop stack per Architect §2.3 — **do this now, not in Plan 1.1, so the push-pop infrastructure is in place before the reconciler is written**; (c) update `_mountEffect` signature to add `errorHandler?: ErrorHandler`; (d) wrap effect body in try/catch per Architect §1.6; (e) wrap `_materialize` call in try/catch in `mount()` per Architect §1.3 |
| `packages/arbor/src/materialize.ts` | Add `errorHandler?: ErrorHandler` parameter to `_materialize`; pass through to every `mountEffect` call site |
| `packages/arbor/src/index.ts` | Export `ErrorHandler` and `MountOptions` as public types |
| `packages/arbor/tests/mount.test.ts` | Add minimum 4 new tests (see §5.3) |

> **Note on push-pop stack in Plan 4.2:** The Architect placed the `_activeMountDisposers`
> push-pop stack fix in Plan 1.1 (§2.3). The Director overrides this sequencing. The
> push-pop stack fix modifies `mount.ts` — the same file Plan 4.2 is already modifying.
> Doing the stack fix in Plan 1.1 would require a merge conflict resolution with Plan 4.2.
> The push-pop stack fix is small (~20 B, per Architect §2.3) and has no behavior change for
> Plan 4.2 consumers (the stack with one item is identical to the single-slot behavior). Move
> it to Plan 4.2 to minimize inter-plan coupling. The Builder credits the ~20 B against Plan
> 4.2's size estimate — post-4.2 arbor target is now ~1489 B (1329 + 140 + 20), leaving ~559 B
> headroom before 1.1.

### 5.2 Exact behavior spec for `onError`

**Trigger conditions:**

1. **Synchronous `_materialize` error during `mount()`:** The `mount()` function's call to
   `_materialize(...)` is wrapped in `try/catch`. If caught and `options?.onError` is defined,
   call `options.onError(error, pathBase)`. If `options.onError` returns a `Node`, store it
   on the `MountScope` as `_pendingFallback` (unexported field) — do NOT materialize it in
   Plan 4.2. If no `options.onError`, rethrow so the caller's `mount()` call throws as
   before.

2. **Reactive effect error in `_mountEffect`:** The `effect()` body inside `_mountEffect` is
   wrapped in `try/catch` when `errorHandler` is defined. If caught: (a) call
   `errorHandler(err, path)`; (b) call `dispose()` on the current effect to prevent further
   throws from the same binding. The `dispose()` call is safe inside the effect body per the
   Architect's note (the `dispose` reference is captured in closure before the effect runs;
   `@aihu/signals` treats self-dispose as idempotent).

**When `onError` is NOT provided:**
- `_mountEffect` runs the effect body without any try/catch (no overhead on the hot path).
- `mount()` does not catch `_materialize` errors. Behavior is identical to v0.

**When `onError` returns `void`:**
- For synchronous errors: `mount()` continues and returns the `MountScope`. The scope may be
  partially materialized (nodes up to the throw point exist in the DOM). This is intentional.
- For reactive effect errors: the effect is disposed; all other effects in the scope continue
  firing normally.

**When `onError` returns a `Node`:**
- Store on `MountScope._pendingFallback`. A comment `// Plan 1.1: materialize fallback here`
  marks the stub. Do NOT call `_materialize` or modify the DOM in Plan 4.2.

**`dispose()` interaction:**
- Calling `dispose()` on a scope with a registered `onError` does NOT invoke `onError`.
  `onError` is an error handler, not a lifecycle hook.
- The `disposed` flag check (existing idempotency guard) runs before any dispose logic, so a
  scope that was disposed after an error being handled is correctly inert.

### 5.3 Tests to add — Plan 4.2 (minimum 4, in `packages/arbor/tests/mount.test.ts`)

| # | Test name | What to assert |
|---|---|---|
| T1 | `onError: synchronous materialize throw → handler called with error and path` | Call `mount(nodeThrowingOnMaterialize, host, { onError: spy })`. Assert `spy` called once with the thrown value and a non-empty path string. Assert `mount()` does NOT throw. |
| T2 | `onError: reactive effect throw → handler called; subsequent signal writes are no-op for that binding` | Mount a node with a reactive text leaf backed by a signal. Provide `onError: spy`. Write a new signal value that causes the effect body to throw. Assert `spy` called once. Write another signal value. Assert `spy` still called only once (effect is disposed). Assert the DOM did not update after the first throw. |
| T3 | `no onError: materialize throw propagates from mount()` | Call `mount(nodeThrowingOnMaterialize, host)` with no options. Assert `mount()` throws the original error. |
| T4 | `onError returning void: other bindings in same scope continue updating` | Mount a scope with two reactive leaf nodes. Only one has a signal that throws. Provide `onError: spy`. Trigger the throwing signal update. Assert `spy` called once. Trigger a write to the non-throwing signal. Assert the DOM updates correctly for the non-throwing binding. |

### 5.4 Size gate

After Plan 4.2 (including push-pop stack), run:

```
bun run size
```

Expected: `@aihu/arbor` ≤ 2048 B gz. Target landing size: ~1489 B (840 B headroom before
Plan 1.1 begins). If the actual post-4.2 size exceeds 1550 B, investigate before committing —
the Architect's estimates are well-founded and overrun indicates something was added beyond
spec. Do not raise the cap. Report the discrepancy.

### 5.5 Verifier checklist for Plan 4.2

The Verifier checks each item independently and reports pass/fail:

- [ ] `packages/arbor/src/types.ts` contains `ErrorHandler` and `MountOptions` exactly as
      specified in Architect §1.6 (type signatures match verbatim)
- [ ] `packages/arbor/src/index.ts` exports `ErrorHandler` and `MountOptions` as named
      exports alongside existing exports (grep: `export type { ..., MountOptions, ErrorHandler }`)
- [ ] `StructuralNode` is NOT exported from `packages/arbor/src/index.ts` (not applicable yet,
      but establish the check now since `index.ts` is being modified)
- [ ] `mount()` signature in `packages/arbor/src/mount.ts` is
      `mount(node: Node, host: Element | ShadowRoot, options?: MountOptions): MountScope`
- [ ] `_mountEffect` signature in `packages/arbor/src/mount.ts` adds
      `errorHandler?: ErrorHandler` as 4th parameter
- [ ] `MountEffectFn` type in `packages/arbor/src/attrs.ts` adds
      `errorHandler?: ErrorHandler` as 4th parameter
- [ ] `_materialize` in `packages/arbor/src/materialize.ts` passes `errorHandler` through
      to every `mountEffect(...)` call (check all call sites — text leaf at line ~57, attr
      wiring via `_applyAttrs`)
- [ ] `_activeMountDisposers` single-slot is replaced by `_mountDisposersStack: Array<Dispose[]>`
      with push before `_materialize` and pop in `finally` (Architect §2.3 exactly)
- [ ] `_currentMountDisposers()` function is present and returns the top of the stack or null
- [ ] Tests T1–T4 above all pass
- [ ] All 255 pre-existing tests pass (`bun run test` exit code 0)
- [ ] `bun run size` passes with `@aihu/arbor` ≤ 2048 B gz
- [ ] No existing `mount()` call site in tests requires modification (the `options` param
      is optional — grep `mount(` in test files to confirm all callers are unaffected)
- [ ] `attrs.test.ts` — all 9 existing tests pass without modification (the 4th parameter
      on `MountEffectFn` is optional; spy calls with 3 args remain valid)

---

## 6. Dependency Chain

**Confirmed ordering: 4.2 → 1.1 → 1.2**

### Plan 4.2 (now — Builder can be dispatched immediately)

Deliverables: `ErrorHandler`, `MountOptions`, `mount()` options parameter, `_mountEffect`
try/catch, push-pop stack fix, 4+ new tests, `bun run size` green.

### Plan 1.1 (after 4.2 Verifier pass)

Requires 4.2 because: `_materializeStructural` uses `_mountEffect` and must pass
`errorHandler` through to child scopes. The reconciler's grow callbacks may throw; those
throws must hit the `onError` handler (Architect §1.4 parent-scope fallback model). Without
4.2's `ErrorHandler` type and `_mountEffect` error wrapping, the reconciler cannot wire error
boundaries into child scope materialization.

Additional Plan 1.1 pre-conditions (already in 4.2 if the Director's push-pop override in
§5.1 is followed): push-pop stack fix is already landed. Plan 1.1 Builder does NOT need to
touch `mount.ts` for the stack fix — only for adding `_materializeStructural` invocation from
`_materialize`.

**Plan 1.1 Builder must establish the property mangling baseline first** (per §1, Budget
Decision). Run `bun run size` against the post-4.2 build with and without property mangling
enabled to quantify the headroom before writing a single reconciler line.

### Plan 1.2 (after 1.1 Verifier pass)

Requires 1.1 because: `@aihu/context` (Plan 2.1, downstream dependency) requires the
reconciler to exist. More directly, `defineComponent` with `attrs` should work correctly
inside `each()` items — this means `_setSignal` injection and the per-attribute signal
creation must work in sub-scope mounted components, not just top-level mounts. If 1.1 is not
complete, no real-world test of Plan 1.2 inside a list rendering exists.

Plan 1.2 is isolated to `@aihu/runtime` (`define-component.ts`, `types.ts`). It does not
modify `@aihu/arbor`. It can begin as soon as the 1.1 Verifier signs off.

### Plan 1.2 scope correction (roadmap vs. Architect design)

The roadmap's `plan-v1-roadmap.md §1.2` acceptance criterion referencing `attrs().count`
returning a coerced number is NOT the Architect's design. The acceptance criteria in §5 of
the Architect spec (and carried forward in this note) use string-only `Signal<string>`. The
Builder for Plan 1.2 implements string-only. Coercion is a user-space concern in v1.

---

## 7. Track State Updates Required

The following updates must be applied to `.team/v1/state-track-a.md` before Builder dispatch:

1. Update the **Round Log** to record Round 002 completion.
2. Update the **Status Table**: Architect status → DONE for all three plans; Builder 4.2 →
   DISPATCHED (when the Builder session begins).
3. Add to **Key Artifacts**: `spec-track-a-architect-round-001.md` as DONE.
4. Add to the **Do-Not-Break invariants** the note about `_activeMountDisposers`:
   > "The `_activeMountDisposers` slot (confirmed by Scout as inspection-only, not used by
   > `_mountEffect` directly) is replaced by `_mountDisposersStack` in Plan 4.2. The public
   > behavior of `_mountEffect` is unchanged."
5. Update **Plans in Scope** status for Plan 4.2 to "Builder ready."

---

*Round 002 complete. Builder 4.2 is cleared for dispatch.*
