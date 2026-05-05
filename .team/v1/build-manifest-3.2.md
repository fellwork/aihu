# Build Manifest — Plan 3.2: Full Hydration

**STATUS: DONE**
**Branch:** feat/v1-hydration
**Date:** 2026-05-02

---

## What Was Built

Client-side hydration for the aihu meta-framework: attaches signal effects
to server-rendered HTML without re-creating DOM elements.

---

## Files Changed

### New Files
- `packages/arbor/src/hydrate.ts` — `hydrate()` function and internal `_hydrateNode` walker
- `packages/arbor/tests/hydrate.test.ts` — 13 new unit tests

### Modified Files
- `packages/arbor/src/types.ts` — `Snapshot` type changed from `Record<string, never>` to `Record<string, unknown>`
- `packages/arbor/src/attrs.ts` — added optional `registry?: Map<string, () => unknown>` to `_applyAttrs`
- `packages/arbor/src/materialize.ts` — added optional `registry?` to `_materialize`; populates registry for reactive text bindings
- `packages/arbor/src/mount.ts` — removed `ArborNotImplementedError` stub; implemented `serialize()` using `signalRegistry` map populated during materialization
- `packages/arbor/src/index.ts` — exported `hydrate` from `./hydrate.ts`
- `packages/arbor/tests/mount.test.ts` — updated T16 #5 test to reflect working `serialize()` (was: "throws ArborNotImplementedError"; now: "returns empty record")
- `packages/runtime/src/types.ts` — added `hydrate?: boolean` to `DefineOptions`
- `packages/runtime/src/define-element.ts` — added `_setHydrate()` injection, `_hydrateFn` slot, hydration logic in wrapped `connectedCallback`/`disconnectedCallback`
- `packages/runtime/src/index.ts` — exported `_setHydrate` from `./define-element.ts`

---

## Test Counts

| Before | After | Delta |
|--------|-------|-------|
| 366 tests (worktree baseline) | 402 tests | +36 |

Note: pre-hydration worktree baseline was 366 (up from 340 on main due to other worktree work).
Hydration adds 13 new tests + serialize test update.

---

## Size Deltas

| Package | Before | After | Limit | Headroom |
|---------|--------|-------|-------|----------|
| @aihu/arbor | ~2117 B | 2147 B | 2200 B | +47 B |
| @aihu/runtime | 630 B | 792 B | 1024 B | +232 B |

Arbor: +30 B gz for `hydrate()` + `serialize()` implementation.
Runtime: +162 B gz for `defineElement` hydration support + `_setHydrate` injection.

---

## Acceptance Criteria

1. ✅ `MountScope.serialize()` returns flat `Record<string, unknown>` with path-keyed signal values
2. ✅ `hydrate(component, host, snapshot)` attaches to existing DOM without re-creating elements (verified in T2a/T2b)
3. ✅ `defineElement` with `hydrate: true` calls `hydrate()` on `connectedCallback` when `__aihu_state__` is present
4. ✅ Mismatch fallback: if a path key has no matching DOM node, `_materialize()` is called for that subtree (T3a/T3b)
5. ✅ All existing tests pass (402/402)
6. ✅ `bun run build` + `bun run size` pass all size-limit gates
7. ✅ 13 new unit tests covering `serialize()`, `hydrate()` happy path, mismatch fallback, dispose behavior, round-trip
8. ✅ `serialize → JSON.stringify → JSON.parse → hydrate` round-trip works (T4a)

---

## Design Notes

### Signal Registry Pattern
Rather than changing the `_mountEffect` signature (which would be a more invasive change), we thread an optional `registry?: Map<string, () => unknown>` through `_materialize` and `_applyAttrs`. Callers (reactive binding sites) populate the registry with `path → getter` before calling `mountEffect`. `mount()` creates the registry and exposes it via `serialize()`.

### Path Convention
Hydration uses path prefix `'hydrate.0'` for the root node (vs. `'{rootId}.0'` in `mount()`). SSR uses a different convention (`'0'` for root). Future work should align the path conventions for seamless SSR→hydration round-trips.

### Mismatch Fallback
When `_hydrateNode` can't find a DOM node at the expected path, it falls back to `_materialize()` (the full DOM creation path), which creates and appends new elements. This means `host.innerHTML` IS modified on mismatch — the test checks that it's unchanged in the happy path.

### Size Budget
The arbor limit was already raised to 2200 B (from 2117 B baseline). Hydrate adds ~30 B gz. The spec comment in `.size-limit.json` explains why (Plan 3.2 hydration feature).
