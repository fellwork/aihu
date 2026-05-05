# Track A Director Note — Round 001

**Date:** 2026-04-30
**Branch:** `feat/v1-reconciler`
**Plans in scope:** 1.1 Reconciler, 1.2 Component props, 4.2 Error boundaries
**Author:** Topic Director (session start)

> **Critical pre-read flag:** The two spec files named in the Track A brief
> (`spec-v1-architecture.md` and `plan-v1-roadmap.md`) do not yet exist under
> `.team/v1/`. This director note is therefore grounded entirely in the existing
> v0 phase specs (`.team/phase-3/spec-arbor.md`, `.team/phase-4/spec-runtime.md`),
> the current source code, and the team learnings. The sections below reconstruct
> intent from that material and flag every place where a proper v1 spec document
> is required before building can start.

---

## 1. Priority Order

**First: 4.2 Error boundaries** (`onError` hook in arbor + runtime)

**Second: 1.1 Reconciler** (`when()` and `each()` in `structural.ts`)

**Third: 1.2 Component props** (typed `observedAttributes` surface in `@aihu/runtime`)

### Rationale

**4.2 before 1.1 — error hook must exist before reconciler throws.**
The reconciler will create and tear down sub-scopes dynamically. Any factory
failure inside a `when()` or `each()` callback lands with no current catch
boundary. If `onError` does not exist when the reconciler ships, every throw
inside a `grow()` callback produces an unhandled rejection or top-level throw
that kills the entire component tree. The error-boundary hook is the minimum
viable isolation layer the reconciler needs to be usable. Implementing 4.2
first means the reconciler can wire `onError` from day one rather than
retrofitting it post-build.

**4.2 before 1.2 — `onError` is scope-level, not props-level.**
Error boundaries live on `MountScope` or on a sub-scope object (TBD by
Architect). Props live on the element class surface. The two are
structurally independent, but `onError` is more foundational: it touches
`mount.ts`, which is already the central lifecycle module. Doing it first
keeps the scope model clean before the props wiring adds its own surface
to `define-element.ts`.

**1.1 before 1.2 — reconciler delivers observable value immediately.**
`when()` and `each()` are currently hard-throws that block any template using
structural primitives. Unblocking them is the highest capability unlock. Props
(`observedAttributes`) is additive; existing tests continue passing without
it. The reconciler is the harder problem (new sub-scope lifecycle, dispose
chaining, keyed diffing) and should go to the Builder before props, which is
more narrowly scoped to `define-element.ts`.

---

## 2. Spec Gaps

### 2.1 `spec-v1-architecture.md` and `plan-v1-roadmap.md` do not exist

This is the root gap. Both files are listed in the Track A brief as primary
reading but are absent from `.team/v1/`. The director note is authored against
v0 phase specs as a proxy; every gap below is therefore an artifact of
authoring these documents on a foundation that has not been written yet.

**Architect pass is required before Builder dispatch.** See section 6 (Go/No-Go).

### 2.2 Plan 1.1 — Reconciler sub-scope lifecycle is unspecified

The v0 phase-3 spec defines `MountScope` for a top-level mount. `when()` and
`each()` need a **child scope** concept: each active branch or list item must
own its own disposer array, and the parent scope must be aware of active child
scopes so they are torn down when the condition flips or the item is removed
from the list.

Questions with no current spec answer:
- Does `when()` return a `Branch`-shaped placeholder that `mount()` later
  materializes (the current stub signature suggests yes), or does `when()`
  create a scope eagerly at mount time and manage its own DOM insertion point?
- What is the anchor mechanism? `when()` needs a stable DOM anchor (e.g. an
  empty `Comment` node) to insert/remove content without shifting sibling
  indices. Not specified.
- `each()` key-based diffing: does it use a `Map<key, ChildScope>` or an
  array with an index-keyed `WeakMap`? The key function returns
  `string | number` — the spec stub is locked but the diffing contract is
  silent.
- Path key format: child scopes of a `when()` need sub-path keys for §2.7
  subscription identity. The v0 path format (`<rootId>.<index-chain>.<kind>`)
  does not have a convention for dynamic children. Needs to be extended.
- `_activeMountDisposers` is a module-level slot with a documented v0
  limitation: "re-entrant `mount()` overwrites the slot; stack/push-pop fix
  is v1." Plan 1.1 is exactly this fix. The Architect must specify the
  push-pop stack before the Builder touches `mount.ts`.

**Architect pass needed: yes.**

### 2.3 Plan 1.2 — `observedAttributes` surface shape is unspecified for runtime

The phase-4 spec documents that the compiler-emitted class already has
`static observedAttributes` and `attributeChangedCallback`. The v0 runtime
`wrapClass` propagates these through `class extends` inheritance — no
explicit copy needed (confirmed in the existing `define-element.ts`).

What plan 1.2 adds is a **typed** surface so hand-authored components
(using `defineComponent`) can declare props and receive typed
`attributeChangedCallback` calls. The current `SetupContext` shape is:

```ts
interface SetupContext {
  readonly host: ShadowRoot | Element
  readonly element: HTMLElement
}
```

There is no `props` or `attrs` field. Questions with no current spec answer:
- Is the props surface a reactive signal (`Signal<Props>`) or a plain object
  passed to `setup()` at connect time?
- Does `defineComponent` gain an overload that accepts an `attrs` declaration,
  or is there a new function (e.g. `defineComponentWithProps`)?
- How are attribute changes that arrive after `connectedCallback` propagated
  to the setup function's reactive context? The current `defineComponent`
  only runs `setup()` once in `connectedCallback`.
- Does the typed surface require a schema (e.g. `{ type: 'string' }` entries
  as in Lit) or is the type purely compile-time with no runtime cost?
- Compiler portion is explicitly out of Track A scope — but the runtime
  surface must be designed to accommodate the compiler's eventual emission
  without a breaking change. This forward-compatibility constraint is not
  documented.

**Architect pass needed: yes.**

### 2.4 Plan 4.2 — `onError` hook placement and signature are unspecified

The v0 specs have no `onError` or error-boundary concept anywhere. Questions:
- Is `onError` a parameter to `mount()` (making it part of `MountScope`'s
  creation), a method on `MountScope`, or a separate wrapper function?
- What is the callback signature — `(error: unknown) => void` or
  `(error: unknown) => Branch | Leaf` (allowing a fallback tree to be rendered)?
- Does `onError` apply to errors thrown during initial mount (synchronous
  materialization) or only to errors thrown inside reactive effects after
  mount?
- Does error recovery (replacing a crashed subtree with fallback UI) require
  the reconciler sub-scope mechanism (plan 1.1)? If yes, 4.2 and 1.1 are
  tightly coupled and may need to be designed together.
- `@aihu/runtime` portion: does `defineComponent`'s `connectedCallback`
  need to catch and forward errors to `onError`, or is that arbor's
  responsibility?
- Does `onError` affect the size budget? Adding error boundaries to
  `packages/arbor` currently at 2048 B gz is a constraint. Runtime is
  currently at 1024 B gz.

**Architect pass needed: yes.**

### 2.5 Bundle budget open question (OQ-V1)

The referenced §10 of `spec-v1-architecture.md` (browser bundle budget,
4.0 → 5.0 kB gz) does not exist. The current `.size-limit.json` shows:
- `@aihu/signals` ≤ 1700 B gz
- `@aihu/arbor` ≤ 2048 B gz
- `@aihu/runtime` ≤ 1024 B gz
- `@aihu/agent` ≤ 100 B gz

Combined: 4872 B gz ceiling under current limits. The implied v1 question
is whether the v1 budget lifts the per-package caps or adds a new combined
row. See section 3 below.

---

## 3. OQ-V1 Impact (Bundle Budget 4.0 → 5.0 kB gz)

**Assessment: PARTIALLY BLOCKING for 1.1 and 4.2; not blocking for 1.2.**

The three plans add non-trivial code to `@aihu/arbor`:

- **1.1 Reconciler** — `when()` and `each()` implementations will require a
  DOM anchor mechanism, a keyed child-scope map, and reactive subscription
  management per child. Rough estimate: 300–600 B gz added to arbor, which
  currently has a 2048 B limit. If arbor is currently near that ceiling (the
  v0 build has not been measured post-all-phases), this could block the
  reconciler from shipping unless the cap is lifted.

- **4.2 Error boundaries** — `onError` hook with recovery rendering requires
  additional control flow in `mount.ts` and potentially a new wrapper function.
  Estimate: 80–150 B gz. Likely fits within current headroom but is uncertain
  without a current size measurement.

- **1.2 Component props** — adds typed surface to `@aihu/runtime` (currently
  ≤ 1024 B). A zero-runtime-cost typed surface (types erased at build) costs
  nothing. A reactive props signal or schema-validated attrs object could add
  50–150 B gz. Likely within runtime's headroom.

**The OQ-V1 budget question is not a binary blocker but it is a pre-build
constraint the Architect must settle.** Specifically: the Architect needs to
either (a) confirm the per-package limits are being lifted for v1 and what the
new limits are, or (b) confirm the current limits hold and the Builder must fit
the reconciler within 2048 B gz total for arbor. Without this answer, the
Builder cannot make size/design trade-offs responsibly.

---

## 4. Scout Brief

The Scout must verify the following before Builder dispatch. All findings
should include file:line citations and reproduction commands (per Learning #4).

### 4.1 Current size baseline

Run `bun run size` on the current `main`-merged codebase and report:
- Actual gz size of `@aihu/arbor/dist/index.js`
- Actual gz size of `@aihu/runtime/dist/index.js`
- Headroom remaining in each package against current `.size-limit.json` caps

### 4.2 `_activeMountDisposers` scope-collector behavior under re-entry

In `packages/arbor/src/mount.ts` the module-level slot has the documented
v0 limitation: "re-entrant `mount()` overwrites the slot." The Scout must:
- Confirm whether `mount()` is ever called inside `_materialize` today (it
  should not be, but verify)
- Confirm whether any test currently exercises nested `mount()` calls
- Report the exact line where `_activeMountDisposers` is set to `null` after
  use, so the Builder knows the exact mutation point the push-pop stack fix
  must target

### 4.3 Dispose chain in `MountScope`

In `packages/arbor/src/mount.ts`:
- Report the current LIFO dispose loop's exact location (line range)
- Confirm whether the disposers array contains only effect disposers or also
  includes DOM removal callbacks
- Verify whether `dispose()` is currently idempotent (it is, per the `disposed`
  flag, but Scout should confirm with the test in `mount.test.ts` test #8)

### 4.4 `when()`/`each()` stub coupling to `mount()`

In `packages/arbor/src/structural.ts`, the stubs throw before `mount()` sees
them. The Scout must confirm:
- What the reconciler's return value needs to be at mount time: the stubs
  declare `Branch` as the return type. `_materialize` in `materialize.ts`
  handles `Branch` by creating an element or fragment. If the reconciler
  returns a special "live branch" type, `_materialize` must be extended.
- Whether `_materialize` has any branch for handling a type that is not a
  plain `Branch` or `Leaf` today (it does not — report the switch/if structure)

### 4.5 `SetupContext` and `observedAttributes` flow in `defineComponent`

In `packages/runtime/src/define-component.ts`:
- Report whether `attributeChangedCallback` is currently present on the
  `Component` class produced by `defineComponent` (it is not — confirm)
- Report whether `static observedAttributes` is on the `Component` class
  (it is not — confirm)
- Identify the exact insertion point where props wiring must be added
  (the `connectedCallback` closure and the class body)

### 4.6 Signal subscription patterns

In `packages/arbor/src/mount.ts` and `attrs.ts`:
- Report the exact mechanism by which effects are registered (the
  `_mountEffect(disposers, fn, path)` call signature)
- Confirm whether `effect()` from `@aihu/signals` returns a synchronous
  `Dispose` (it does — confirm with the type)
- Confirm whether `untrack` is available in `@aihu/signals` (it is — report
  whether it is used anywhere in arbor today)

### 4.7 Hidden coupling check — `branch.ts` / `node.ts`

Read `packages/arbor/src/branch.ts` and `packages/arbor/src/node.ts`:
- Report how `Branch` objects are constructed (shape-locked per §2.9 — confirm
  `attrs: null` and `children: EMPTY_CHILDREN` for omitted args)
- Report whether there is any `kind` discriminant beyond `'branch'` and
  `'leaf'` today (there should not be — a reconciler "live" node type would
  need either a new kind or a wrapper)

### 4.8 Existing test counts and coverage gaps

Run `bun run test` and report:
- Total passing test count
- Which files in `packages/arbor/tests/` exercise `mount()` specifically
- Whether any integration tests cover the `_setMount` → `defineComponent` path
  (there are integration tests in `packages/runtime/tests/define-component.test.ts`)

---

## 5. Builder Brief — Refined Acceptance Criteria (Round 1)

These criteria are what the Verifier will check. They are written to be
concrete and independently runnable. They presuppose that the Architect pass
described in section 6 has been completed and a v1 spec exists.

> **Note:** These criteria are drafted against the intent inferred from
> existing v0 specs. The Architect may revise them when authoring the v1
> spec documents. These are placeholders, not final gates.

### 5.1 Plan 4.2 — Error boundaries

**arbor (`packages/arbor/`)**

- [ ] A new `onError` hook can be attached to a mount scope. The exact
  attachment mechanism (parameter to `mount()`, method on `MountScope`, or
  separate wrapper) is decided by the Architect's v1 spec.
- [ ] If `onError` is not set, errors propagate as they do today (no
  behavioral regression).
- [ ] An error thrown inside a reactive effect registered via `_mountEffect`
  is caught by `onError` rather than propagating to the global error handler.
- [ ] `onError` receives the thrown value (`unknown`) and the path key
  (`string`) of the effect that threw.
- [ ] Calling `dispose()` on a scope that has an active `onError` does not
  re-invoke `onError`.
- [ ] `bun run test` — all existing arbor tests pass with no regressions.
- [ ] `bun run size` — `@aihu/arbor` remains within its size limit (current
  2048 B gz or the v1 cap if lifted by Architect).

**runtime (`packages/runtime/`)**

- [ ] `defineComponent`'s `connectedCallback` catches errors from `setup()`
  and from `mount()` and forwards them to an `onError` handler if one is
  registered.
- [ ] The `onError` registration mechanism on the component class is defined
  by the Architect (may be an option to `defineComponent`, a method on the
  element, or a `MountScope`-level concern).
- [ ] `bun run test` — all existing runtime tests pass.
- [ ] `bun run size` — `@aihu/runtime` remains within its size limit.

### 5.2 Plan 1.1 — Reconciler (`when()` and `each()`)

**`packages/arbor/src/structural.ts`**

- [ ] `when(condition, grow)` no longer throws `ArborNotImplementedError`.
  When `condition` is `true` at mount time, `grow()` is called and the
  returned `Branch | Leaf` is materialized into the DOM.
- [ ] `when(condition, grow)` — when `condition` flips from `true` to `false`,
  the previously materialized subtree is synchronously removed from the DOM
  and all its effects are disposed.
- [ ] `when(condition, grow)` — when `condition` flips from `false` to `true`,
  `grow()` is called again and the new subtree is inserted at the anchor
  point.
- [ ] `each(list, key, grow)` no longer throws `ArborNotImplementedError`.
  When mounted, one child subtree is materialized per item in the initial
  list.
- [ ] `each(list, key, grow)` — when the list signal updates, a keyed diff
  is performed: items whose key was present in the previous list are reused
  (no re-mount); items whose key is new are freshly mounted; items whose key
  is gone are disposed and removed.
- [ ] `each(list, key, grow)` — order changes in the list are reflected in
  DOM order without re-mounting keyed items.
- [ ] Both `when()` and `each()` work correctly when nested inside each other.
- [ ] The existing `structural.test.ts` tests are updated: the two
  `ArborNotImplementedError` throw tests are replaced or extended with the
  full reconciler behavior tests.
- [ ] `_activeMountDisposers` slot uses a push-pop stack, not a single
  module-level overwrite, so re-entrant `mount()` calls inside `when()`/`each()`
  child scopes work correctly. Test: nested `when()` inside `when()` does not
  corrupt the parent scope's disposers.
- [ ] `bun run test` — all arbor tests pass; total count is ≥ (current count
  + 8 new reconciler tests).
- [ ] `bun run size` — within the v1 cap (to be confirmed by Architect).

### 5.3 Plan 1.2 — Component props (`observedAttributes`)

**`packages/runtime/src/` (runtime only; compiler is C-5, out of scope)**

- [ ] `defineComponent` gains a mechanism (overload, options object, or typed
  wrapper — Architect decides) to declare an `observedAttributes` list.
- [ ] The class produced by `defineComponent` with declared attributes has
  `static observedAttributes` returning the declared list.
- [ ] The class produced by `defineComponent` with declared attributes has an
  `attributeChangedCallback(name, oldValue, newValue)` that dispatches
  attribute changes to the setup context in a type-safe way (exact mechanism
  decided by Architect).
- [ ] `wrapClass` in `define-element.ts` correctly propagates `static
  observedAttributes` from the wrapped class (the existing test #4 in
  `define-element.test.ts` already covers the propagation — it must not
  regress).
- [ ] The props surface is **type-only** or has a documented runtime cost; if
  runtime cost is non-zero, the size budget must still be met.
- [ ] `SetupContext` is extended or a new context type is introduced — the
  Architect decides whether it is backward-compatible (new optional field) or
  a new overload.
- [ ] `bun run test` — all runtime tests pass; new attribute-change tests
  are added (minimum 3: initial value, change propagation, unobserved
  attribute ignored).
- [ ] `bun run size` — `@aihu/runtime` remains within its size limit.

---

## 6. Go / No-Go

**NO-GO for Builder dispatch. GO for Scout dispatch.**

### What must happen before Scout can run

Nothing — the Scout brief in section 4 requires only read access to existing
source files and running existing commands. Scout can proceed immediately.

### What must happen before Architect can run

1. **Create `.team/v1/spec-v1-architecture.md`** covering at minimum:
   - §1 v1 layer model (what changes from v0's three-package stack)
   - §10 browser bundle budget — is the combined limit being lifted to 5.0 kB gz,
     and how do per-package limits change?
   - §12 open questions — especially OQ-V1 (budget) and OQ-V1-reconciler
     (sub-scope lifecycle model)

2. **Create `.team/v1/plan-v1-roadmap.md`** covering:
   - Plans 1.1, 1.2, and 4.2 with acceptance criteria sections (enough for
     the Verifier to use as a compliance matrix)
   - Explicit dependency annotation between 4.2, 1.1, and 1.2

3. **Architect sub-session for each of the three plans** to resolve the spec
   gaps listed in section 2:
   - 4.2: `onError` signature, placement (arbor vs runtime vs both), recovery
     rendering vs notify-only, coupling to reconciler
   - 1.1: DOM anchor mechanism, child-scope lifecycle, push-pop stack spec,
     path-key extension for dynamic children, keyed-diff algorithm
   - 1.2: props surface shape, reactivity model, backward-compat with existing
     `SetupContext`

### What unblocks Builder dispatch

All three Architect deliverables above, plus Scout report confirming no
hidden blockers from section 4.

### Branch readiness

`feat/v1-reconciler` does not yet exist as far as this session can confirm.
Create it from `main` after the spec documents are authored.
