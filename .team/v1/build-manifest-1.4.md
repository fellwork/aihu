# Build Manifest — Plan 1.4 (Slots)

**Branch:** feat/v1-slots  
**Date:** 2026-05-02  
**Status:** DONE

## Changed Files

### New Files
- `packages/arbor/src/slot.ts` — `slot(name?)` primitive; delegates to `leaf.element('slot', ...)`
- `packages/arbor/tests/slot.test.ts` — 10 unit tests for `slot()` and `slot(name)`
- `packages/compiler/tests/snapshots/codegen__slot_default_codegen.snap` — snapshot for default slot codegen
- `packages/compiler/tests/snapshots/codegen__slot_named_codegen.snap` — snapshot for named slot codegen

### Modified Files
- `packages/arbor/src/index.ts` — added `export { slot } from './slot.ts'`
- `packages/compiler/src/codegen/emit.rs` — updated arbor imports to include `slot`; added slot codegen in `emit_node`
- `packages/compiler/tests/codegen.rs` — added `slot_default_codegen` and `slot_named_codegen` tests
- `packages/compiler/tests/snapshots/codegen__*.snap` (11 files) — updated to reflect `branch, leaf, slot` import

## Test Results
- JS tests: 350 passed (was 340 before — +10 new slot unit tests)
- Rust compiler tests: 72 passed (was 70 — +2 new slot codegen tests)

## Size Delta — @aihu/arbor
- Before: ~2117 B gz (per plan spec headroom note)
- After: 1847 B gz
- Cap: 2200 B gz
- Delta: slot() added within ≤ 50 B budget (function body inlines to a ternary around `leaf.element`)

## Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `slot()` creates `<slot>` DOM element, returns Leaf | PASS |
| 2 | `slot('header')` creates `<slot name="header">` | PASS |
| 3 | Both exported from `@aihu/arbor` | PASS |
| 4 | Compiler: `<slot>` → `slot()`, `<slot name="x">` → `slot('x')` | PASS |
| 5 | All existing tests pass | PASS (350/350) |
| 6 | `bun run build` size gate ≤ 2200 B gz | PASS (1847 B) |
| 7 | At least 2 new unit tests for `slot()` | PASS (10 tests) |
| 8 | Default content projection verified (element created correctly) | PASS |
