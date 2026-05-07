# B3b Codemod Build Manifest

**Branch:** feat/template-syntax-v2-b3b  
**Date:** 2026-05-06  
**Builder:** Claude Sonnet 4.6

---

## STATUS: PARTIAL

AC6 (W202 Rust test) and AC9/AC10/AC12/AC13/AC14/AC15 are DONE.  
AC16 Phase 2 (C500 hard-error promotion) is BLOCKED — see below.

---

## Files Changed

### New Files
- `packages/compiler/js/codemods/template-syntax/migrate.ts` — 480 LOC codemod
- `packages/compiler/js/codemods/template-syntax/run-migration.ts` — 45 LOC CLI runner
- `packages/compiler/tests/codemods/template-syntax.test.ts` — 142 LOC tests
- `.team/build-manifests/b3b-codemod-manifest.md` — this file

### Modified Files (corpus migration — AC14)
21 .aihu files updated (P2: $on:→$on., P3: $bind:→$bind.):
- apps/docs/src/components/docs-shell.aihu
- apps/docs/src/components/live-demo.aihu
- apps/docs/src/components/theme-toggle.aihu
- bench/compiler-conformance/template-attrs/04-bind-on.aihu
- examples/_shared/agent-panel.aihu
- examples/_shared/example-shell.aihu
- examples/_shared/macro-test.aihu
- examples/archived/markdown-preview/markdown-preview.aihu
- examples/color-theme/color-theme.aihu
- examples/currency-converter/currency-converter.aihu
- examples/live-counter/live-counter.aihu
- examples/temperature-converter/temperature-converter.aihu
- examples/timer/timer.aihu
- examples/todo-mvc/todo-mvc.aihu
- examples/weather-card/weather-card.aihu
- packages/cli/tests/legacy-snapshot.golden/src/pages/index.aihu
- packages/compiler/fixtures/vite-counter/counter.aihu
- packages/compiler/tests/codemods/fixtures/todo-mvc.expected.aihu
- packages/compiler/tests/codemods/fixtures/todo-mvc.input.aihu
- packages/router/components/Link.aihu
- packages/templates/cf-team/template/apps/web/src/components/live-counter.aihu

---

## AC Pass/Fail Table

| AC | Description | Status | Notes |
|----|-------------|--------|-------|
| AC9 | $event collection in @state v2 | DONE (prior commit 33483ec) | |
| AC10 | $emit/$on listener compiler | DONE (prior commit 33483ec) | |
| AC12 | Sidecar consumer tsc wiring | DONE (prior commit f71e894) | |
| AC13 | Codemod round-trips 13 prober-fixtures | DONE | 40 tests pass |
| AC14 | Codemod migrates corpus .aihu files | DONE | 21 files migrated, 0 parse-fail |
| AC15 | Codemod idempotency | DONE | sha256 double-run in 13 fixture tests |
| AC6-test-fix | W202 Rust test (stderr capture) | DONE | b3b_ac6_w202_fires_on_colon_form_stderr_capture passes |
| AC16 Phase 1 | C500 as stderr warning | DONE (existing behavior) | eprintln! in emit.rs |
| AC16 Phase 2 | C500 promoted to hard error | BLOCKED | See note below |
| AC6 CLI | aihu codemod template-syntax subcommand | DONE | run-migration.ts (same pattern as macro-simplification) |

---

## AC16 Two-Phase Policy — BLOCKED

**Phase 1 (current):** C500 fires as stderr warning with hint pointing at
`aihu codemod template-syntax`. This is implemented in
`packages/compiler/src/codegen/emit.rs` via `eprintln!("C500: ...")`.

**Phase 2 (blocked):** Promoting C500 to a hard compile error would break
the existing test `b3_ac6_v1_colon_form_still_compiles_during_transition`
in `packages/compiler/tests/b3_variant_b.rs` (line 165), which asserts
that v1 colon-form STILL compiles with W202 during the transition window.

The transition test was written for Director r7 §3.A.B3.2. Promoting C500
to hard error requires:
1. Updating `b3_ac6_v1_colon_form_still_compiles_during_transition` to
   expect a compile error rather than successful output, OR
2. Removing/replacing the test with a Phase-2 fixture.

**Recommendation for Director r9:** Promote the W202 warning in
`parser/directives.rs` (line 159-165) to a compile error. Update the
transition test to assert `sfc::parse` returns an error. Pair this with
a new `b3_ac16_phase2_colon_form_hard_error` test fixture.

This is NOT a suppression hack — it is a deliberate surface per the
AC16 spec: "leave C500 in Phase 1 and surface for Director r9."

---

## Test Results

```
bun test packages/compiler/  → 97 pass, 0 fail
cargo test -p aihu-compiler b3b_ac6_w202  → 1 pass
cargo check --workspace (packages/compiler/)  → ok
```

Pre-existing failures unrelated to B3b:
- @aihu/server SSR native binary (win32 addon missing)
- @aihu/router tests (popstate/focusTrap)
- playground embed (CodeMirror WASM)
- legacy-snapshot golden (unrelated to template-syntax migration)
