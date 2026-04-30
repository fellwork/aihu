# Build Manifest — Plan 4.2 (Error Boundaries + Push-Pop Stack Fix)

**Branch:** `feat/v1-error-boundaries`
**Date:** 2026-04-30
**Builder:** Claude Sonnet 4.6
**Prerequisite commit:** `79e86a6` (phase0 agent-readiness verifier corrections)
**Status:** DONE

---

## Files Changed

| File | Change |
|---|---|
| `packages/arbor/src/types.ts` | Added `ErrorHandler` type and `MountOptions` interface (Architect §1.6 exact text) |
| `packages/arbor/src/attrs.ts` | Added `errorHandler?: ErrorHandler` as 4th parameter to `MountEffectFn` type and `_applyAttrs` function |
| `packages/arbor/src/mount.ts` | (a) `_activeMountDisposers` replaced by `_mountDisposersStack` push-pop stack (§2.3); (b) `_currentMountDisposers()` accessor added; (c) `_mountEffect` gains `errorHandler?: ErrorHandler` param + try/catch with `disposeRef` pattern; (d) `mount()` gains `options?: MountOptions` 3rd param with sync materialize error catch |
| `packages/arbor/src/materialize.ts` | Added `errorHandler?: ErrorHandler` parameter; threaded through to all `mountEffect` and `_applyAttrs` call sites |
| `packages/arbor/src/index.ts` | Added `ErrorHandler` and `MountOptions` to public type exports |
| `packages/arbor/tests/mount.test.ts` | Added 4 new `onError` / error boundary tests (T1–T4) + `vi` import |
| `.team/v1/build-manifest-4.2.md` | This file |

---

## Size: Pre / Post

| Package | Before | After | Delta | Budget |
|---|---|---|---|---|
| `@scribe/arbor` | 1.28 kB gz | 1.38 kB gz | +100 B | ≤ 2048 B ✓ |
| `@scribe/runtime` | 438 B gz | 438 B gz | 0 B | ≤ 1024 B ✓ |

**Headroom remaining for Plan 1.1:** 2048 − 1382 = ~666 B (vs. Architect's ~559 B estimate — actual delta of ~100 B is lower than the 160 B estimate, leaving more headroom).

---

## Test Count: Before / After

| Suite | Before | After |
|---|---|---|
| `packages/arbor/tests/mount.test.ts` | 21 | 25 |
| All tests (`bun run test`) | 255 | 259 |

All 4 new tests (T1–T4) pass. All 255 pre-existing tests continue to pass.

---

## Implementation Notes

### Push-Pop Stack Fix (Director override per §5.1)

Replaced `let _activeMountDisposers: Dispose[] | null = null` with:
- `const _mountDisposersStack: Array<Dispose[]> = []`
- `export function _currentMountDisposers(): Dispose[] | null` accessor

Push happens before `_materialize`; pop happens in `finally`. This correctly supports re-entrant `mount()` calls (required by Plan 1.1 reconciler).

### Error Handler — `disposeRef` Pattern

The `_mountEffect` implementation uses a `disposeRef: { fn: Dispose | null }` to avoid a temporal dead zone (TDZ) issue. When `effect()` runs its body synchronously on creation, `const dispose = effect(...)` hasn't been assigned yet. Using a `const dispose` inside the effect body's catch block would throw `ReferenceError` on the first run. The `disposeRef` pattern avoids this:
- `disposeRef.fn` is `null` during the initial synchronous run
- `disposeRef.fn` is set to `dispose` immediately after `effect()` returns
- On subsequent (reactive) runs, `disposeRef.fn?.()` correctly self-disposes the effect

This means: if an effect throws on its **first synchronous run** (initial materialization), it cannot self-dispose via the ref — but the error propagates up through `_materialize` and is caught by `mount()`'s try/catch, which calls `errorHandler` once and the scope is returned in a partially-materialized state. The effect was never subscribed (threw before subscribing), so no re-fire will occur.

### Sync Materialize Error Handling

`mount()` wraps `_materialize` in try/catch. If caught and `errorHandler` is defined, the handler is called with `(error, pathBase)`. If `errorHandler` returns a `Node`, it is stored (stub — `// Plan 1.1: materialize fallback here`). The `finally` block safely pops the disposers stack without double-popping.

### Runtime (`@scribe/runtime`)

No changes per Architect §1.5 and Director §5.1. `defineComponent` does not wire `onError` in Plan 4.2. The `MountOptions` third parameter on `mount()` is optional; existing `MountFn` callers are unaffected.

---

## Verifier Checklist (Director §5.5)

- [x] `packages/arbor/src/types.ts` contains `ErrorHandler` and `MountOptions` per Architect §1.6
- [x] `packages/arbor/src/index.ts` exports `ErrorHandler` and `MountOptions` as named exports
- [x] `StructuralNode` is NOT exported from `packages/arbor/src/index.ts`
- [x] `mount()` signature: `mount(node: Node, host: Element | ShadowRoot, options?: MountOptions): MountScope`
- [x] `_mountEffect` signature adds `errorHandler?: ErrorHandler` as 4th parameter
- [x] `MountEffectFn` type in `attrs.ts` adds `errorHandler?: ErrorHandler` as 4th parameter
- [x] `_materialize` passes `errorHandler` through to all `mountEffect` and `_applyAttrs` call sites
- [x] `_activeMountDisposers` single-slot replaced by `_mountDisposersStack` with push/pop
- [x] `_currentMountDisposers()` function present and returns top of stack or null
- [x] Tests T1–T4 pass
- [x] All 255 pre-existing tests pass (`bun run test` exit code 0) → 259 total
- [x] `bun run size` passes: `@scribe/arbor` = 1.38 kB ≤ 2048 B
- [x] No existing `mount()` call sites in tests require modification
- [x] `attrs.test.ts` — all 9 existing tests pass without modification

---

## Deviations from Spec

**None** — except one implementation-level deviation documented in "Implementation Notes" above:

The Architect spec §1.6 shows `dispose()` called directly inside the effect body's catch block. This would cause a TDZ ReferenceError on the first synchronous run (when `const dispose = effect(...)` hasn't returned yet). The implementation uses a `disposeRef` wrapper instead — functionally identical semantics (effects that throw on first run cannot self-dispose, but they also cannot re-subscribe, so no re-fire occurs; effects that throw on subsequent runs self-dispose via `disposeRef.fn?.()`). This deviation is an implementation correctness fix, not a behavioral change.
