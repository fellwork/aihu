# Build Manifest — form-wave-c

**Branch:** `feat/form-wave-c`  
**Commit:** `feat(compiler,cli): $form collection + F-3b conditional deps + F-5b env rename`  
**Date:** 2026-05-07  
**Author:** Builder agent (form-wave-c)

---

## Deliverables

### D1: `$form` collection — Rust compiler (`CollectionKind::Form`)

| File | Change |
|------|--------|
| `packages/compiler/src/types.rs` | Add `Form` variant to `CollectionKind` enum |
| `packages/compiler/src/parser/state_macros.rs` | Add `"form"` to keyword table, `keyword_len` (4), `keyword_name`, `c440` error arm, `emit_collection_entry` arm, `parse_object_collection` key validation |
| `packages/compiler/src/codegen/emit.rs` | Add `emit_form_wiring()` function, integrate into `emit_function_form()`, handle shared `attachInternals()` guard with `$aria`, emit `static formAssociated = true` via `_aihuFormEl_*.formAssociated = true` post-define |
| `packages/compiler/tests/form_collection.rs` | 5 integration tests (see AC table below) |

### D2: F-3b — `appPeerDepsConditional` render pass

| File | Change |
|------|--------|
| `packages/cli/src/scaffold-pipeline.ts` | Add `__APP_CONDITIONAL_DEPS__` to `PLACEHOLDER_TOKENS`, add `buildConditionalDepLines()`, wire into `buildSubstitutions()` |
| `packages/templates/cf-team/template/apps/web/package.json.tmpl` | Remove hardcoded auth deps, add `__APP_CONDITIONAL_DEPS__` placeholder |
| `packages/cli/tests/scaffold-pipeline.test.ts` | 3 new F-3b tests |

### D3: F-5b — `conditionalFiles` `rename` field

| File | Change |
|------|--------|
| `packages/cli/src/template-manifest.ts` | Add optional `rename?: string` to `ConditionalFile`, update `validateConditionalFile` |
| `packages/cli/src/scaffold-pipeline.ts` | Update `enumerateFiles()` to apply `rename` when set |
| `packages/templates/cf-team/template.config.ts` | Add `rename: '.env.example'` to all 3 `.env.example.*` entries |
| `packages/cli/tests/scaffold-pipeline.test.ts` | 3 new F-5b tests |
| `packages/cli/tests/scaffold-and-compile.test.ts` | Update integration test to check `.env.example` (not provider-suffixed files) |

---

## Acceptance Criteria Table

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | `static formAssociated = true` emitted for any SFC with `$form` | PASS — `form_basic_value` |
| AC-2 | `$form: { value: name }` emits `setFormValue` inside `effect()` | PASS — `form_basic_value` |
| AC-3 | `$form: { validity: () => ({...}) }` emits `setValidity` call | PASS — `form_validity` |
| AC-4 | `$form` + `$aria` emits exactly one `attachInternals()` call | PASS — `form_and_aria_share_internals` |
| AC-5 | SFC without `$form` emits no form-related code | PASS — `form_no_overhead` |
| AC-6 | All 5 `form_collection` Rust tests pass | PASS — 5/5 |
| AC-7 | `auth=better-auth` → package.json contains `"better-auth"` only | PASS — F-3b test |
| AC-8 | `auth=kinde` → package.json contains `@kinde-oss` only | PASS — F-3b test |
| AC-9 | `auth=better-auth` → scaffolded file at `apps/web/.env.example` | PASS — F-5b test + scaffold-and-compile |
| AC-10 | CLI tests pass for F-3b and F-5b scenarios | PASS — 171/171 |

---

## Test Results

### Rust (cargo test -p aihu-compiler)
- 5/5 `form_collection` tests PASS
- 0 regressions across all existing test suites

### TypeScript (vitest)
- 171 tests PASS, 3 skipped (compile-gate, require `AIHU_SCAFFOLD_COMPILE=1`)
- 0 failures

---

## Implementation Notes

- **`attachInternals()` singleton guard**: When both `$aria` and `$form` are declared, `emit_form_wiring()` detects the presence of `aria_wiring` and strips the duplicate guard line. Only one `attachInternals()` call is emitted.
- **`formAssociated`**: Emitted as `_aihuFormEl_<tag>.formAssociated = true` after the `defineElement()` call, since `defineComponent` returns a class (not a class body literal). The variable name uses the tag with hyphens replaced by underscores.
- **`__APP_CONDITIONAL_DEPS__`**: Expands to a JSON fragment with leading comma+newline when deps match, or empty string when none match. No trailing comma — the placeholder is placed after the last unconditional dep.
- **F-5b rename**: Applied in `enumerateFiles()` only when the file's `when` condition passes. Non-matching files are excluded entirely (not renamed).
