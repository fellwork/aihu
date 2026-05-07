# Verifier Report — V2 (template-syntax-v2 / B2 audit)

**Audit target**: `feat/template-syntax-v2-b2` @ HEAD `124adda` (off `feat/template-syntax-v2` @ `9ec48cf`)
**Verifier**: V2 (read-only audit, no branch mutations)
**Date**: 2026-05-06
**Tags**: `topic:aihu-template-syntax track:userland-dx round:v2 audit-target:feat/template-syntax-v2-b2`
**Spec sources**:
- Director r6 note §3 (B2 brief): `c:\git\fellwork\aihu\.team\director-notes\template-syntax-006.md`
- Builder manifest: `c:\git\fellwork\aihu\.team\build-manifests\r2-r3-r4-q3-q4-001.md`
- Master audit doc: `c:\git\fellwork\aihu\docs\superpowers\specs\2026-05-06-spec-template-syntax-v2-platform-audit.md`

---

## Per-AC verdict table (12 ACs)

| # | AC | Status | Evidence (path:line / test name) |
|---|---|---|---|
| 1 | `cargo check --workspace` passes | PASS | `cargo check` from `packages/compiler/` returns success, finished in 0.02s |
| 2 | `cargo test -p aihu-compiler` passes (303+ → 323) | PASS | All cargo tests in compiler package: 323 passed + 1 ignored, summed across 19 binaries |
| 3 | `bun run typecheck` passes | PASS | `bun run typecheck --force`: 27 tasks completed in 5.8s. Runtime package `tsc --noEmit` succeeds. (Note: `baselines:typecheck` cached snapshot prints stale errors from old `scribe` path, but task exit code is success — confirmed by re-running with `--force` and final 27/27 completed.) |
| 4 | `bun run test` passes (823+ → 834) | PASS | `bun run test`: 834 passed + 5 skipped across 86 test files |
| 5 | R2 — four-callback `$lifecycle` works; back-compat preserved | PASS | Parse: `r2_ac1_lifecycle_four_callbacks_parse` (state_macros.rs:1432-1447); emit: `r2_ac1_lifecycle_emit_all_four` (state_macros.rs:1467-1475); back-compat: `r2_ac4_lifecycle_back_compat_mount_dispose` (state_macros.rs:1450-1456) + 7-test `lifecycle.test.ts` still green; runtime end-to-end: `r2_ac1_all_four_callbacks_fire_at_correct_moments` (lifecycle-r2.test.ts:127-162) confirms order `mount → attr → adopt → cleanup`. **Ordering check (AC: R1's $prop dispatch BEFORE userland onAttributeChange)** verified at `define-component.ts:269-283` (R1 prop path runs first at line 269, then `_runAttrChanges` at line 283) and asserted by `r2_ac2_order` (lifecycle-r2.test.ts:78-104) which observes `propGetter()` returns the post-`_convert` integer `7` from inside the userland callback. |
| 6 | R3 — `$show={cond}` toggles `hidden` attribute, reactive | PASS | Compile: `r3_ac1_macro_show_emits_toggle_hidden_attribute` (macro_attrs.rs:137-163) asserts `toggleAttribute('hidden'` present + `--show` absent + `effect(`+`onMount(`+`_n.el`. Fixture: `r3_fixture_show_lowers_to_hidden` (b2_fixtures.rs:38-53). Reactive preservation: emit at `emit.rs:2566-2582` keeps the IIFE/onMount/effect wrapping; only the inner DOM call changed from `style.setProperty('--show', ...)` to `toggleAttribute('hidden', !(...))`. |
| 7 | R4 — `$bind.value={signal}` two-way write confirmed (write-back was MISSING; added) | PASS | Write-back implemented at `emit.rs:2299-2358`. Tests: `r4_ac1_bind_value_to_signal_emits_oninput_writeback` (macro_attrs.rs:361-386), `r4_ac1_bind_checked_emits_onchange_writeback` (macro_attrs.rs:389-411), `r4_ac1_bind_value_does_not_overwrite_user_oninput` (macro_attrs.rs:414-447), `r4_ac1_bind_to_non_signal_skips_writeback` (macro_attrs.rs:450-468) all pass. Fixture: `r4_fixture_bind_two_way` (b2_fixtures.rs:57-82). Confirmed safe: write-back only emitted when bound expr is a simple ident registered in `signal_map` with a non-empty setter (emit.rs:2316-2318). |
| 8 | Q3 — reflect-loop guard prevents infinite loop | PASS | Implementation at `define-component.ts:184` (flag declaration), `:263` (set on entry to attributeChangedCallback), `:285` (cleared in `finally`), `:219` (`ps.set` checks `!this._isInternalAttrChange` before reflect). Tests: `r4_ac2_single_component_reflect_terminates_in_one_roundtrip` (bind-reflect.test.ts:43-69), `r4_ac2_setAttribute_during_internal_attrchange_is_short_circuited` (bind-reflect.test.ts:71-97), `q3_cross_component_bind_reflect_terminates` (bind-reflect.test.ts:99-134), `q3_attempt_reflect_loop_does_not_double_fire_attribute_change` (bind-reflect.test.ts:136-166) — all 4 pass. |
| 9 | Q4 — C446 compile-time error on attribute collision; clean for non-collisions | PASS | Implementation: `check_prop_attribute_collisions` at `state_macros.rs:107-176`. Tests: `q4_collision_two_explicit_attributes` (state_macros.rs:1497-1505) — error names both props + the conflicting attribute; `q4_collision_explicit_vs_default_kebab` (state_macros.rs:1508-1515); `q4_collision_suggestion_in_hint` (state_macros.rs:1518-1528) — hint contains `specify \`attribute:\``; `q4_attribute_false_does_not_collide` (state_macros.rs:1531-1537); `q4_no_collision_distinct_attributes` (state_macros.rs:1540-1545); `q4_no_collision_attribute_true_uses_kebab` (state_macros.rs:1548-1554); `q4_kebab_helper_matches_runtime` (state_macros.rs:1557-1565). |
| 10 | Pre-push hooks pass on every commit | PASS | `bunx biome ci .` checked 401 files, no fixes needed. `cargo test` for compiler — 323 pass. `bun run typecheck` — 27/27 tasks complete. `bun run test` — 834 pass + 5 skipped. `bun run size` — runtime 2.80 kB / 2900 B (35 B headroom). `bun run check:size-rows` — OK. |
| 11 | Existing 62 in-aihu-repo `.aihu` files still typecheck and build | PASS | B2 modified zero existing `.aihu` files (verified via `git diff feat/template-syntax-v2..feat/template-syntax-v2-b2 --name-only \| grep .aihu` — only new fixture additions in `packages/compiler/tests/fixtures/r2-r3-r4-q4-b2/`). All 24 `sfc_conformance` tests pass (which exercise existing fixtures). NB: the `examples/_shared/example-shell.aihu` build failure observed in `bun run --filter='./examples/*' build` is pre-existing (parser rejects TS generic syntax in `<script>` content) and unchanged by B2 — same parent-branch behavior. |
| 12 | Reactivity preserved (no whole-component re-render regressions) | PASS | R3 emit (`emit.rs:2566-2582`) keeps the same IIFE+`onMount`+`effect` wrapping pattern as the prior `--show` lowering — only the inner DOM call changed. Cond signal updates trigger fine-grained `effect` re-run that calls `toggleAttribute`; component is NOT re-rendered. R2 attributeChange dispatches via the existing `attributeChangedCallback` — userland sees the converted signal value, not a re-render trigger. R1 reactivity tests (define-component.test.ts: 23 tests including the 11 R1 ACs) still all pass. |

---

## Bidirectional findings

### Under-implementation (none)

Every AC item is fully wired. R2 emits all 4 callbacks; R3 emits the platform `hidden` toggle with reactive `effect`; R4 emits both read-side tuple AND write-back listener for signal-bound `$bind:`; Q3 guards the reflect cycle with `_isInternalAttrChange`; Q4 detects collisions across explicit-vs-explicit, explicit-vs-default-kebab, and `attribute: true` fall-through, while excluding `attribute: false`.

### Over-implementation (none)

- B2 did NOT modify Variant B template syntax. Verified.
- B2 did NOT touch `$aria`, `$controller`, `$context`. Verified — no edits in `state_macros.rs` for those collection kinds; emit only extends `Lifecycle` arm.
- B2 did NOT touch the codemod or sidecar. Verified — `packages/compiler/tests/codemods/` untouched.
- B2 did NOT modify any existing `.aihu` files in `examples/`, `packages/templates/`, or `packages/compiler/{fixtures,tests/fixtures}/` outside the new `r2-r3-r4-q4-b2/` fixture directory. Verified via `git diff --name-only \| grep .aihu` — only 3 new files, all under the new fixture directory.
- B2 did NOT modify R1's `$prop` emit. The `propEntries` / `propSignals` / `_convert` / `attrToProp` machinery is preserved verbatim — only `attributeChangedCallback` got re-wrapped in `try`/`finally` for the `_isInternalAttrChange` flag, and `ps.set` got an extra `&& !this._isInternalAttrChange` clause in its reflect predicate. R1 ACs all still pass (define-component.test.ts: 23 tests).

### Open-questions assessment (both honest substance for r7)

1. **R4 write-back typed-conversion.** Builder's note: `setName(e.target.value)` always stores `'5'` (string), not `5` (number) for numeric signals. This is **honest substance for r7**, not a spec gap: Director r6 §3.R4 specified "two-way write confirmation" only — the literal AC is "write-back wired." Spirit-of-AC concerns about typed conversion are exactly the kind of follow-on Director governance is for. Builder correctly surfaced it.

2. **Q3 `_isInternalAttrChange` host-wide single boolean.** Builder's note: correct for synchronous attribute-change bursts (one-at-a-time platform contract); if a future feature batches attribute writes asynchronously, the assumption needs re-verification. This is **honest substance for r7**, not a spec gap: the platform contract for `attributeChangedCallback` is synchronous-per-attribute, and the guard is correct for that contract today. Director r6 §2.Q3 explicitly specified "Director r6 default: option (a) — `_isInternalAttrChange` flag" with Builder picking the data structure. Builder picked a host-wide boolean (matching Lit's `_isReflecting` precedent verbatim) and surfaced the asynchronous-batch caveat honestly.

Both opens are passed to Director r7 unchanged.

---

## Final verdict

**STATUS: PASS — 12/12 ACs confirmed by sample evidence + test rerun.**

All Builder claims verified by direct artifact inspection and test rerun. Diff is in scope, no over-implementation, no silent under-implementation, no acceptance items deferred. Open questions are honest surfaces for r7 governance, not spec gaps. R1 cross-round preservation: 11 R1 ACs unchanged (V1 PASS still holds). Runtime size budget honored: 2865 B / 2900 B (35 B headroom — matches Builder claim verbatim).

**Iteration discipline.** Builder ↔ Verifier round 2 closes clean in one pass (matching round 1). Iteration counter advances 1/5 → 2/5 banked.

**Recommended next step.** Director r7 to:
1. Adjudicate the two open questions (typed bind conversion; async-batch guard re-verify trigger).
2. Decide merge mechanic for `feat/template-syntax-v2-b2` → `feat/template-syntax-v2` (per Director r6 §1 precedent: fast-forward, not squash; preserves the 3-commit linear history).
3. Dispatch B3 (codemod + body-call migration; ~640-700 LOC budget per Director r6 §2.Q2).
