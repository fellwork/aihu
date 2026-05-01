# Director Note — Track A Round 004
**Date:** 2026-05-01
**Director:** Topic Director
**Scope:** Round 004 session direction

---

## § On-thesis assessment

Track A is on-thesis and on-schedule. The sequence 4.2 → 1.1 → 1.2 is progressing exactly as
planned. Plans 4.2 and 1.1 are complete and merged to `main` (commits `8223dbb` and `75ba4e1`
respectively). The Scout's live verification on 2026-05-01 confirms 313 tests passing (up from
255 at session start), arbor at 2151 B gz against the 2200 B cap, and runtime at 504 B gz
against the 1024 B cap. Plan 1.2 is the only unblocked, spec-ready Builder target. No drift.

One anti-pattern to flag: the arbor bundle absorbed a signals-bundling spillover from the
6.2-P1 implementation that pushed it close to the adjusted 2200 B cap. **Arbor headroom is
49 B — critically tight.** However, Plan 1.2 targets `@scribe/runtime` exclusively and does
not touch arbor. The 49 B constraint does not block this session. It is a firm constraint for
any future Plan 1.3 (Scoped Styles), Plan 1.4 (Slots), or any arbor-touching work.

Track C 6.2-P1 remains on CONDITIONAL PASS. The Linux/macOS bench run required for full sign-off
cannot happen on Windows. This is a known, acknowledged carry; it does not block Track A.

---

## § Priority order for this session

**1. Builder — Plan 1.2 (Component props, `@scribe/runtime`).** This is the only unblocked,
spec-complete target. The Architect spec at `.team/v1/spec-track-a-architect-round-001.md` §3
covers it fully: `defineComponent` options-form overload, `attrs` array field, per-attribute
`Signal<string>` via `_setSignal` injection, `attributeChangedCallback` wiring, `AttrContext<A>`
intersection type. Runtime has 520 B headroom — the Architect estimates ~195 B delta, leaving
~325 B post-1.2.

**2. Verifier — Plan 1.2.** Immediately after Builder PR. Use the acceptance criteria in §4 of
the Architect spec verbatim. Do not proceed to any downstream plan until the Verifier signs off.

**3. Track state update.** Update `state-track-a.md` round log and status table to record
Round 004 outcome and Plan 1.2 completion.

**4. Do not start Plan 1.3 or 1.4 this session.** Plan 1.3 (Scoped Styles) is compiler work
and is parallel-safe in principle, but the compiler track has open cleanup items (BTreeMap,
Vite investigation, topic summary from session 6). Plan 1.4 (Slots) depends on Plan 1.2 landing
first. Neither is scoped for this session.

---

## § Scope signal

**continue**

Track A is executing cleanly on the established 4.2 → 1.1 → 1.2 sequence. Plan 1.2 is fully
specified, unblocked, and the only work the Builder should touch this session. No scope change
or track switch is warranted.

---

## § Refined brief for Builder (Plan 1.2)

### Branch name

```
feat/v1-props
```

Base off `main` at HEAD `6a8f54b`.

### Files to create / modify

| File | Change |
|---|---|
| `packages/runtime/src/types.ts` | Add `ComponentOptions<A>`, `AttrContext<A>`; add `import type { Signal } from '@scribe/signals'` (type-only) |
| `packages/runtime/src/define-component.ts` | Add `_setSignal` injection + guard; add `defineComponent` overload; implement options-form branch: signal creation loop, `ATTR_SIGNALS_SYM` symbol slot, `static observedAttributes`, `attributeChangedCallback` |
| `packages/runtime/src/index.ts` | Export `ComponentOptions`; do NOT export `AttrContext` (internal intersection type); do NOT export `ATTR_SIGNALS_SYM` |
| `packages/runtime/tests/define-component.test.ts` | Add minimum 6 new tests (see below) |

No changes to `packages/arbor/`, `packages/signals/`, or any other package.

### Acceptance criteria (verbatim from Architect spec §4, Plan 1.2)

- `defineComponent(setup)` — existing function-form call sites unchanged and passing tests
- `defineComponent({ attrs: ['count'] as const, setup })` — returns a class with `static observedAttributes = ['count']`
- `wrapClass` wraps the returned class → `observedAttributes` inherited (existing test 4 in `define-element.test.ts` still passes)
- `attributeChangedCallback('count', null, '5')` called after connect → `ctx.attrs.count` signal reads `'5'`
- Signal returned via `ctx.attrs.count` is a valid `@scribe/signals` `Signal<string>` (can be passed to `leaf(signal)`)
- `_setSignal(signal)` must be called before any element with `attrs` connects; throws `RuntimeError` if not
- `bun run size` — `@scribe/runtime` ≤ 1024 B gz passes
- `bun run test` — all pre-existing tests pass; minimum 6 new tests in `packages/runtime/tests/define-component.test.ts`

### Minimum 6 new tests (in `define-component.test.ts`)

| # | Test |
|---|---|
| T1 | `defineComponent(setup)` function-form still returns an HTMLElement class; existing 4 tests unaffected |
| T2 | `defineComponent({ attrs: ['count'] as const, setup })` sets `static observedAttributes = ['count']` on the returned class |
| T3 | After `connectedCallback`, `ctx.attrs.count` is a `Signal<string>` readable with the current attribute value |
| T4 | `attributeChangedCallback('count', null, '5')` after connect → `ctx.attrs.count` signal reads `'5'` |
| T5 | `_setSignal` not called before connect of an attrs-using component → throws `RuntimeError` |
| T6 | `defineComponent` with `attrs: ['a', 'b'] as const` → two independent `Signal<string>` values; changing `a` does not affect `b`'s signal value |

### Implementation constraints (Do-not-break)

1. **Zero cross-package value imports in `@scribe/runtime`.** Use `import type { Signal }` from
   `@scribe/signals` for types only. Inject the `signal()` factory via `_setSignal(signal)` at
   app boot — the same pattern as `_setMount`. Add a module-level `let _signal: typeof signal | null = null`
   and throw `RuntimeError('_setSignal must be called before connecting a component with attrs')` if
   it is null when `attributeChangedCallback` fires.

2. **`defineComponent(setup: Setup)` function-form must not require `_setSignal`.** Plain
   function-form components do not use attr signals and must work even if `_setSignal` was
   never called. The guard is only triggered when the options-form is used and an attr changes.

3. **`wrapClass` is not modified.** `static observedAttributes` set directly on the class body
   is inherited via prototype chain automatically — confirmed by test 4 in `define-element.test.ts`.

4. **`ATTR_SIGNALS_SYM` is a module-level `Symbol()` — not exported from `index.ts`.** The
   signal setters map is stored on element instances keyed by this symbol.

5. **`attributeChangedCallback` wiring:**
   ```typescript
   attributeChangedCallback(name: string, _old: string | null, newValue: string | null): void {
     const setter = (this as any)[ATTR_SIGNALS_SYM]?.[name]?.[1]
     if (setter !== undefined) setter(newValue ?? '')
   }
   ```
   Initial signal value is `el.getAttribute(name) ?? ''` at `connectedCallback` time.

6. **`static observedAttributes = attrs`** set on the class body inside `defineComponent`'s
   options-form branch. TypeScript class syntax supports this inside a returned class expression.

7. **Size gate is mandatory after each task.** Run `bun run size` after (a) types changes,
   (b) `_setSignal` injection, (c) options-form overload, (d) full `attributeChangedCallback`
   wiring. The Architect estimates ~195 B total delta. If any sub-task pushes runtime above
   800 B gz, investigate before continuing — do not accumulate debt and check at the end.

### TDD order

1. Write tests T1–T6 first. T1 confirms no regression on function-form (should pass immediately).
   T2–T6 will fail until implementation is complete.
2. Implement `_setSignal` injection pattern + `RuntimeError` guard. Run T5 → expect pass.
3. Implement `defineComponent` overload resolution + `static observedAttributes`. Run T2 → expect pass.
4. Implement signal creation loop + `ATTR_SIGNALS_SYM` slot in `connectedCallback`. Run T3 → expect pass.
5. Implement `attributeChangedCallback`. Run T4, T6 → expect pass.
6. Run full `bun run test` (all 313 tests must pass).
7. Run `bun run size` — `@scribe/runtime` ≤ 1024 B gz required. Record actual gz in PR description.

### Deliverable

Commit pushed to `feat/v1-props`. PR title:

```
feat(runtime): Plan 1.2 — typed observedAttributes + per-attr Signal<string> via _setSignal
```

---

## § Surface-to-user triggers

No decisions require user input before proceeding. All design decisions for Plan 1.2 are
resolved in the Architect spec (§3.1–§3.5). Specifically:

- **String-only vs. coerced signals:** Resolved as string-only (`Signal<string>`) in the
  Round 002 director note. Coercion is user-space. Builder does not implement coercion.
- **`_setSignal` pattern vs. static import:** Resolved by the Architect as injection pattern.
- **`AttrContext<A>` intersection vs. new context type:** Resolved by the Architect as intersection.
- **`wrapClass` changes:** Resolved as "no changes needed" by the Architect (§3.4).

The one item to surface **after** Plan 1.2 lands: Plan 1.3 (Scoped Styles) and Plan 1.4 (Slots)
scope decisions. Plan 1.3 is compiler work requiring a compiler track state update and cleanup
from session 6 (BTreeMap, Vite investigation). Plan 1.4 depends on 1.2. The Director will open
Round 005 to sequence these once the Round 004 Verifier signs off on Plan 1.2.

---

## § Continuity check

**Iteration budget:** Round 004 is the fourth Track A round. Plans 4.2 and 1.1 consumed rounds
2 and 3 respectively (both delivered first-try within a single session each). Plan 1.2 is smaller
in scope than either predecessor (~195 B vs. ~140 B for 4.2, vs. ~560+ B for 1.1) and is
isolated to a single package. There is no iteration budget concern.

**Scope since last round:** Unchanged. The Director note for Round 003 (not formalized as a
separate file — captured in the Track A state file update) confirmed Plan 1.2 as the next
target. The Scout's live verification on 2026-05-01 confirms that assessment. No new OQs have
opened on the Track A surface.

**Size trajectory:**

| Stage | Arbor gz | Runtime gz |
|---|---|---|
| Round 003 close (post-1.1) | 2151 B / 2200 B cap — 49 B left | 504 B / 1024 B cap — 520 B left |
| After Plan 1.2 (est.) | unchanged | ~699 B / 1024 B cap — ~325 B left |

Arbor is not touched by Plan 1.2. Any future arbor change (Plan 1.4 Slots being the next
arbor-touching plan) must be scoped against 49 B headroom or a cap-raise decision must be
opened before Builder dispatch. That is a Round 005 concern, not Round 004.

**Carry items (not blocking Plan 1.2):**

- Track C 6.2-P1 CONDITIONAL PASS — needs Linux/macOS bench. Windows only. Cannot close here.
- `size-limit` CLI failure on `@scribe/data` — pre-existing tooling issue, not a regression.
- Compiler session 6 cleanup (BTreeMap, Vite investigation, topic summary) — open but not on
  the Track A critical path.
- Background tasks for `disposeRef` first-run race (Session 002) and shape-locking/ChildScope.key
  (Session 003) — LOW priority, do not gate 1.2.

*Round 004 direction complete. Builder Plan 1.2 is cleared for dispatch.*
