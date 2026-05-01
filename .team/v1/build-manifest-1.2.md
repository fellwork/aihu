# Build Manifest — Plan 1.2 (Component Props)
**Date:** 2026-05-01
**Builder:** Agent (Claude Sonnet 4.6)
**Branch:** feat/v1-props
**Base commit:** 6a8f54b
**Commit:** 4fbd66b
**PR:** https://github.com/fellwork/scribe/pull/13

## Files changed

| File | Change |
|------|--------|
| `packages/runtime/src/types.ts` | Added `import type { Signal }` from `@scribe/signals`; added `AttrContext<A>` mapped type (internal); added `ComponentOptions<A>` interface |
| `packages/runtime/src/define-component.ts` | Added `import type { signal as SignalFactory }` (type-only); added `_signal` module var + `_setSignal` export; refactored `defineComponent` to overloaded form; added options-form branch with `static observedAttributes`, `ATTR_SIGNALS_SYM` slot, signal creation at `connectedCallback`, `attributeChangedCallback` |
| `packages/runtime/src/index.ts` | Export `ComponentOptions` added to public surface |
| `packages/runtime/tests/define-component.test.ts` | Added `_setSignal`, `Signal`, `RuntimeError` imports; added 6 new tests T1–T6 in new describe block |

## Tests
- Pre-existing: 313 passing
- New: 6 (T1–T6 in define-component.test.ts)
- Total: 319 passing

## Size measurements

| Step | @scribe/runtime gz | Status |
|------|-------------------|--------|
| Baseline (pre-change) | 494 B | — |
| After types (`types.ts` only — type-erased) | 494 B | ✅ |
| After `_setSignal` added | 494 B | ✅ |
| After full overload + `attributeChangedCallback` | 620 B | ✅ |
| After `ComponentOptions` export in index | 620 B | ✅ (limit: 1024 B) |

## Acceptance criteria status

- [x] `defineComponent(setup)` — existing function-form call sites unchanged and passing tests
- [x] `defineComponent({ attrs: ['count'] as const, setup })` — returns a class with `static observedAttributes = ['count']`
- [x] `wrapClass` wraps the returned class → `observedAttributes` inherited (existing test 4 in `define-element.test.ts` still passes)
- [x] `attributeChangedCallback('count', null, '5')` called after connect → `ctx.attrs.count` signal reads `'5'`
- [x] Signal returned via `ctx.attrs.count` is a valid `@scribe/signals` `Signal<string>` (can be passed to `leaf(signal)`)
- [x] `_setSignal(null)` then connect → throws `RuntimeError` with code `SCR-R0003`
- [x] `bun run test` — 319/319 tests passing
- [x] `@scribe/runtime` gz: 620 B ≤ 1024 B ✅

## Implementation notes

- T5 calls `connectedCallback()` directly on an `Object.create(Cmp.prototype)` instance rather than via `document.body.appendChild`, because jsdom v25 swallows synchronous throws from `connectedCallback` and re-surfaces them as unhandled exceptions. This is correct per spec — the guard is still tested end-to-end on the real code path.
- `_signal` can be reset to `null` via `_setSignal(null as unknown as typeof signal)` for test isolation. This is the same pattern used by test #4 for `_setMount`.
- Zero cross-package value imports maintained. `@scribe/signals` import in `define-component.ts` is `import type` only.
