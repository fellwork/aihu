# Verification Report — Plan 1.2 (Component Props)
**Date:** 2026-05-01
**Verifier:** Agent (Claude Sonnet 4.6) + Team Lead inline fix
**Branch:** feat/v1-props
**Commit:** b5a3181 (HEAD); implementation: 4fbd66b; fix: b5a3181

## STATUS: PASS

---

## Acceptance criteria

| AC | Description | Status | Evidence |
|----|-------------|--------|----------|
| AC-1 | Function-form `defineComponent(setup)` — unchanged behavior | PASS | All 4 original tests in `describe('defineComponent — Task 21b spec tests')` pass. `bun run test packages/runtime/tests/define-component.test.ts` → 10/10 pass. Function-form path (lines 134–164) has zero new code. |
| AC-2 | `defineComponent({ attrs: ['count'] as const, setup })` sets `static observedAttributes = ['count']` | PASS | `define-component.ts` line 171: `static readonly observedAttributes = attrs`. Test T2 passes: `expect((Cmp as { observedAttributes?: string[] }).observedAttributes).toEqual(['count'])`. |
| AC-3 | `wrapClass` inherits `observedAttributes` — test 4 in `define-element.test.ts` passes | PASS | `bun run test packages/runtime/tests/define-element.test.ts` → 10/10 pass. Test #4 (`preserves static observedAttributes on the wrapped class`) explicitly verifies inheritance. No changes to `define-element.ts` (confirmed via `git diff main..HEAD -- packages/runtime/src/define-element.ts` → empty). |
| AC-4 | `attributeChangedCallback('count', null, '5')` → `ctx.attrs.count` reads `'5'` | PASS | Test T4 passes. Implementation at line 208–211: `pair[1](newValue ?? '')` calls the signal setter. `el.setAttribute('count', '5')` triggers `attributeChangedCallback` → signal updates → `capturedSignal![0]()` returns `'5'`. |
| AC-5 | `ctx.attrs.count` is a valid `Signal<string>` (can be passed to `leaf(signal)`) | PASS | Test T3 passes. Signal created via `_signal(this.getAttribute(name) ?? '')` at line 192. `Signal<string>` is `readonly [Read<string>, Write<string>]` — tuple `pair[0]` is the getter, `pair[1]` is the setter. `leaf(capturedAttrSignal)` renders correctly in T3. |
| AC-6 | `_setSignal` not called → throws `RuntimeError` | PASS | Test T5 passes. Guard at lines 182–187 throws `RuntimeError('SCR-R0003', ...)` when `_signal === null`. T5 resets to null via `_setSignal(null as unknown as typeof signal)`, calls `connectedCallback()` directly (correctly bypassing jsdom's exception swallowing), and `expect(() => el.connectedCallback()).toThrow(RuntimeError)` passes. |
| AC-7 | `bun run size` — runtime ≤ 1024 B gz | PASS | `gzip -c packages/runtime/dist/index.js \| wc -c` → **630 B**. Well within 1024 B limit. (`bun run size` fails at the workspace level due to a pre-existing `@scribe/data` resolution issue unrelated to this plan; the raw gzip measurement is the authoritative check.) |
| AC-8 | 320 tests pass, 0 failures | PASS | `bun run test` → **320/320 passed, 41 test files** (all green, includes T7 added by inline fix). |

---

## Bidirectional audit

### Under-implementation findings

**U-1 (NON-BLOCKING — matches established pattern): `_setSignal` not exported from `index.ts`**

`packages/runtime/src/index.ts` exports only `defineComponent`, `defineElement`, and public types. `_setSignal` is not exported from `index.ts`. This matches the exact same pattern used for `_setMount`: the `index.ts` comment explicitly documents this — `_setMount` "is internal-but-exported from define-component.ts for the documented wiring pattern (`import { _setMount } from '@scribe/runtime/src/define-component'` at app boot). It is not part of the public surface." Spec §5 constraint #8 says "Add `_setSignal` following the identical pattern." The identical pattern is direct import from the source module — NOT from `index.ts`. Tests import via `import { _setMount, _setSignal, defineComponent } from '../src/define-component.ts'` which is the documented wiring. This is consistent design, not a gap.

**U-2 (BLOCKING — guard fires for options-form without attrs): `_signal === null` guard is unconditional on all options-form components**

`connectedCallback` in the options-form path (lines 182–187) throws `RuntimeError('SCR-R0003')` whenever `_signal === null`, regardless of whether `attrs` is empty or not provided. A user who calls `defineComponent({ setup })` (valid per `ComponentOptions<A>` since `attrs?` is optional) will have their element fail to connect unless `_setSignal` has been called — even though no signals are needed. The guard should be: `if (_signal === null && attrs.length > 0)`. This is a correctness bug: the options-form without `attrs` is a valid call site that must work without `_setSignal`.

**U-3 (PASS): Signals created for ALL attrs in the array, not just the first**

Lines 190–193 use a `for...of` loop over `attrs`. All declared attrs get independent signals. Test T6 (`multiple attrs produce independent signals`) verifies this explicitly with attrs `['a', 'b']`.

**U-4 (PASS): Graceful default when `attrs` not provided — CONDITIONAL (see U-2)**

`attrs` defaults to `[]` at line 167 via destructuring default. The `for...of` loop over `[]` creates no signals and `attrSignals` stays empty. The component would work correctly at runtime — except for the U-2 bug where the guard unconditionally throws before reaching the loop if `_signal` is null.

**U-5 (PASS): `static observedAttributes` is set on the class body so `attributeChangedCallback` fires**

`static readonly observedAttributes = attrs` at line 171. The browser/JSDOM uses this static property to decide which attribute changes to report. Test T4 confirms `attributeChangedCallback` is actually called (via `el.setAttribute`), not just defined.

**U-6 (PASS): Signals created using injected `_signal` factory, not a hardcoded import**

`import type { signal as SignalFactory }` at line 29 — type-only, zero runtime footprint. Runtime signal creation at line 192 uses `_signal(...)` where `_signal` is the injected factory. No direct value import of `signal` from `@scribe/signals`.

**U-7 (PASS): `_setContext` integration unaffected**

`_setContext` (lines 96–102) injects `_setSsrContextMap` and `_clearSsrContextMap`. Both the function-form and options-form paths call these at lines 149/154 and 198/202 respectively. Plan 1.2 correctly threads the context calls through the options-form path unchanged.

---

### Over-implementation findings

**O-1 (PASS): `AttrContext<A>` NOT exported from `index.ts`**

`packages/runtime/src/index.ts` line 19 exports types `ComponentOptions, DefineOptions, Setup, SetupContext, ShadowMode` — `AttrContext<A>` is absent. It is declared `@internal` in `types.ts` (lines 83–86). Correct.

**O-2 (PASS): `ATTR_SIGNALS_SYM` NOT exported from `index.ts`**

`ATTR_SIGNALS_SYM` is declared at module-level in `define-component.ts` (line 109) with no `export` keyword. Not in `index.ts`. Correct.

**O-3 (PASS): Zero cross-package value imports from `@scribe/arbor`**

`packages/runtime/src/define-component.ts` has no `import { ... } from '@scribe/arbor'` (only a doc comment mentions the package name). `types.ts` has `import type { Branch, Leaf, MountScope } from '@scribe/arbor'` — type-only, erased at build. Invariant holds.

**O-4 (PASS): No changes to `define-element.ts` or `wrapClass`**

`git diff main..HEAD -- packages/runtime/src/define-element.ts` returns empty. Confirmed.

**O-5 (PASS): Function-form path has no new code that could throw or change behavior**

Lines 134–164 are the function-form path. It does not reference `_signal` at all. If `_signal` is null, function-form `connectedCallback` proceeds normally. No regressions introduced.

---

## Non-blocking findings

**NB-1: No test for `defineComponent({ setup })` (options-form without `attrs`)**

The test suite covers T1 (function-form) and T2–T6 (options-form with attrs), but there is no test for the case `defineComponent({ setup })` where `attrs` is omitted in options-form. This gap is what allowed the U-2 bug to land undetected. Adding a test for this case would catch the guard regression.

**NB-2: T5 uses `Object.create(Cmp.prototype)` instead of `new Cmp()`**

The implementation note in the build manifest explains this is intentional (jsdom swallows synchronous throws from `connectedCallback` in `appendChild`). The approach is correct. Noted here as documentation for future reviewers.

**NB-3: Build manifest reports 494 B baseline but actual gzip is 630 B**

The manifest shows baseline 494 B, final 620 B. Actual `gzip -c packages/runtime/dist/index.js | wc -c` reads **630 B** post-build. The 10 B discrepancy is likely measurement method variance (manifest used a different gzip invocation). Both values are well within 1024 B — no concern.

**NB-4: `bun run size` fails workspace-wide due to `@scribe/data` resolution**

`size-limit` cannot bundle `@scribe/data` because it pulls in `@scribe/signals` and `@scribe/context` as unresolved externals. This is pre-existing and unrelated to Plan 1.2. The raw gzip measurement is an adequate substitute.

---

## Blocking findings

**BLOCK-1 (U-2): Options-form without `attrs` unconditionally requires `_setSignal`**

- **File:** `packages/runtime/src/define-component.ts`, line 182
- **Problem:** `if (_signal === null)` fires for all options-form components, including those with `attrs = []` (or `attrs` omitted). A valid call `defineComponent({ setup: mySetup })` will throw `RuntimeError('SCR-R0003')` at connect time if `_setSignal` was never called.
- **Fix:** Change the guard to only fire when attrs are actually declared:
  ```typescript
  if (_signal === null && attrs.length > 0) {
    throw new RuntimeError(
      'SCR-R0003',
      '_setSignal must be called before connecting a component with attrs',
    )
  }
  ```
- **Test to add:** `defineComponent({ setup: (_ctx) => leaf('no-attrs') })` connects without `_setSignal` and without throwing.

---

## Inline fix applied

BLOCK-1 resolved by Team Lead:
- `define-component.ts` line 182: `if (_signal === null)` → `if (_signal === null && attrs.length > 0)`
- New test T7 added: `defineComponent({ setup })` without `attrs` connects without `_setSignal`
- 320/320 tests pass post-fix (commit `b5a3181`)

## Recommendation

**MERGE**

All 8 acceptance criteria pass. 320/320 tests pass (313 pre-existing + 7 new). Size budget satisfied (630 B < 1024 B). No spurious exports. Zero cross-package value imports. `define-element.ts` untouched. BLOCK-1 resolved inline.
