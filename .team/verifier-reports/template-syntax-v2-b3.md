# Verifier Report — V3 (B3a PARTIAL audit)

**Verifier:** V3
**Topic:** `topic:aihu-template-syntax track:userland-dx`
**Round:** v3 (audits B3a's 12 in-scope ACs from a 17-AC spec)
**Audit target:** `feat/template-syntax-v2-b3` @ HEAD `155454f`
**Parent:** `feat/template-syntax-v2` @ `da53779`
**Date:** 2026-05-06
**Tags:** `topic:aihu-template-syntax track:userland-dx round:v3 audit-target:feat/template-syntax-v2-b3 partial-round:b3a`

## Method

Read all 5 commit diffs end-to-end. Reran `cargo test -p aihu-compiler` (358 passed, matches manifest 323→358 +35), `bun run typecheck` (27 tasks; 26 cached + 1 ran clean), `bun run test` (834 passed + 5 skipped, no regressions). Cross-checked over-implementation and re-cut justification.

## Per-AC verdict (12 in-scope; 5 deferred to B3b — not audited here)

| AC | Topic | Verdict | Sample evidence (path:line) |
|---|---|---|---|
| AC1 | `cargo check --workspace` | **PASS** | `packages/compiler/` cargo check clean in 0.31s |
| AC2 | `cargo test -p aihu-compiler` 358 pass (+35 new) | **PASS** | Reran locally; 358 total passing; 19 new in `tests/b3_variant_b.rs` + 16 in lib parser tests (5 in `parser::directives::tests::b3_*` + 11 in `parser::template::tests::block_*`) |
| AC3 | `bun run typecheck` | **PASS** | 27 moon tasks; 1 ran clean, 26 cached |
| AC4 | `bun run test` 834 + 5 skipped | **PASS** | 86 test files, 834 passed + 5 skipped, 0 failures |
| AC5 | `{#if}/{#each}/{:else if}/{:else}/{:empty}` Variant B | **PASS** | Parser: `packages/compiler/src/parser/template.rs:96-273` (BlockBoundary enum, parse_if_block_body, parse_each_block_body, parse_at_block, parse_block_boundary). Codegen: `emit.rs:2082-2295` (emit_if_block, emit_each_block, emit_html_block). Tests: `tests/b3_variant_b.rs:31-114` covers all 5 forms; `block_if_simple`, `block_if_else`, `block_if_elseif_chain`, `block_each_simple`, `block_each_with_key`, `block_each_with_idx_and_key`, `block_each_lambda_lhs`, `block_each_with_empty`, `block_html_simple` all in lib tests |
| AC6 | `$on.click` + `$bind.value` dot-form + W202 colon compat | **PASS-with-caveat** | Parser: `directives.rs:139-167` accepts both forms; W202 emitted via `eprintln!` on colon path (line 161). Tests: `tests/b3_variant_b.rs:128-176` covers all three behaviors. **Caveat**: no automated test asserts W202 stderr emission specifically — only code inspection confirms eprintln fires. Behavior correct by code path; not regression-protected against accidental removal. |
| AC7 | `class={[…]}` array form | **PASS** | Helper definition: `emit.rs:493-496` (`__aihu_cls`). Detection: `emit.rs:2705-2716` (binding name == "class" + expr starts with `[`). Helper filters truthy strings, joins with spaces, drops null/undefined/false/0/non-string. Tests: `b3_ac7_class_array_form_lowers_with_helper` + `b3_ac7_class_string_unchanged` (regression) |
| AC8 | `{@html expr}` Svelte-style | **PASS** | Parser: `template.rs:218-230` (parse_at_block accepts only `html`). Codegen: `emit.rs:2294-2300` mirrors v1 `$html` IIFE pattern with `createContextualFragment`. Test: `b3_ac8_html_block_lowers_with_effect` + fixture `b3_fixture_html_block`. Escape-by-default elsewhere preserved (no changes to text interpolation emit). |
| AC11 | R4 typed-conv at `$bind.value` write site | **PASS** | Helper: `emit.rs:497-505` (`__aihu_conv`); inspects typeof current value (number/boolean/string fallback). Emit: `emit.rs:2786-2792` (`__aihu_conv(getter(), e.target.value)`). Numeric and string signals both covered. Tests: `b3_ac11_typed_conv_helper_emitted_for_value_bind` + `b3_ac11_typed_conv_skipped_for_checked_bind`. B2 R4 fixture tests updated to match new emit shape (`tests/macro_attrs.rs:380` + `tests/b2_fixtures.rs:71`). Mirrors R1's `_convert` direction at the write site as Director r7 §2 Surface 1 specifies. |
| AC12 | Sidecar `.aihu.ts` emit | **PARTIAL — sidecar emitted but consumer wiring deferred** | Compiler emits `EmitResult.sidecar_ts: Option<String>` at `emit.rs:33-37`. `emit_sidecar_ts` at `emit.rs:147-201` walks template AST, collects expressions via `collect_template_exprs` (recursive over Element/MacroElement/Interpolation/IfBlock/EachBlock/HtmlBlock). Preamble declares `signal/computed/onMount/onCleanup/onAdopt/onAttributeChange/$emit/$event` as `any`-shape. Tests: `b3_ac12_sidecar_ts_contains_template_expressions` + `b3_ac12_sidecar_ts_includes_emit_and_event_decls` confirm in-memory shape. **However** — **no consumer-side wiring lands**. Grep across all `.ts/.js/.mjs` in `packages/` finds zero references to `sidecar_ts`, no `writeFileSync.*aihu\.ts`, no vite plugin update, no moon task running `tsc --noEmit` over `**/*.aihu.ts`. Director r7 §3.C #12 spec wording: "Sidecar `.aihu.ts` emitted for every SFC; tsc covers template expressions (per spec §11.c: numeric vs Date type mismatch surfaces tsc error in sidecar)." End-to-end intent ("tsc surfaces type errors at the sidecar level") is NOT met because no .aihu.ts files exist on disk and tsc never sees them. **Per V3 method instruction: emit-only counts as partial; AC12 does NOT fully pass.** Builder explicitly acknowledges this in manifest §3.7 + §6 Surfaced #2. |
| AC16 | C500 on remaining v1 syntax | **PASS-with-caveat** | C500 surface: `emit.rs:3117-3127` — eprintln stderr message "C500: unknown directive `$<name>` — ignored". **Caveat**: this is a stderr WARNING, not a hard compile error. Director r7 §3.B.12 says "Clear diagnostic when v1 syntax encountered post-codemod" and AC16 says "C500 fires" — the stderr surface is a defensible interpretation of "fires" given the transition-window posture (codemod hasn't run yet, so erroring on v1 colon-form would break the corpus). Builder's manifest acknowledges B3b will promote to compile-error. PASS for B3a's intent; not full hard-error semantics. |
| AC17 | Pre-push hooks pass | **PASS** | All cargo + bun checks rerun green; manifest claim verified. |

## Under-implementation findings

1. **AC12 sidecar consumer wiring deferred** — material. The compiler-side emit lands, but the spec's end-to-end intent (tsc surfacing type errors at the sidecar level via `**/*.aihu.ts` discovery) is not met. Builder surfaced this proactively. Per V3 method §2 instruction, AC12 is marked PARTIAL not PASS.

2. **AC6 W202 not asserted by automated test** — minor. The eprintln is unconditional on colon-form encounter; behavior is correct, but no test guards against silent removal. Recommend B3b add a `Command::output()` capture test that asserts the stderr line is emitted.

3. **AC16 C500 is stderr warning, not hard error** — minor and explicitly documented by Builder. Defensible for B3a's transition-window posture; B3b promotes.

## Over-implementation findings

**None material.** Verified:
- Files changed (`git diff --name-only`): 12 files, all in `packages/compiler/src/`, `packages/compiler/tests/`, and `.team/build-manifests/`. No build/CI/vite/moon changes.
- Zero codemod code: no `packages/compiler/js/codemods/template-syntax/` files exist on this branch.
- Zero corpus migration: no `.aihu` files outside `tests/fixtures/b3-variant-b/` were modified.
- Zero `$event:` collection / `$emit.<name>` compile-time resolution code. `$emit` and `$event` appear ONLY in the sidecar preamble as `any`-shape `declare const` — not parsed, not validated, not lowered. AC9/AC10 cleanly deferred.
- R1/R2/R3/Q3/Q4 settled territory untouched: no `define-component.ts` changes, no `$lifecycle`/`$show`/`bind-reflect` runtime changes. R4 emit shape was modified inline (typed-conv wrap) per Director r7 §2 Surface 1 explicit decision; B2 R4 tests were updated to match new shape (acceptable; not regression).
- Build/CI pipeline untouched (vite plugin, moon, package.json scripts).

## Re-cut justification check

**Honest re-cut.**

1. **LOC math accurate.** `git diff --shortstat`: 1660 src+tests insertions (excluding `.team/` manifest files). Builder's 1155 src + 505 tests = 1660 verified. Investigation note's split (1168 src + 514 tests in my count vs Builder's 1155 + 505) is within 1-2% which is normal counting variation.

2. **1500 LOC trigger crossed by 110 LOC.** This is genuinely "just over"; not a 2x overshoot suggesting hidden completable work.

3. **Investigation note documents the seam.** `.team/build-manifests/b3-investigation.md:1-130` explicitly walks the B3a/B3b partition pre-code, with realistic LOC table (line 27-46 estimates the codemod alone at ~620 src + ~120 tests = ~740 additional LOC, which would push to ~2400 combined). The seam is honest: compiler accepts both v1 colon-form AND v2 dot-form during transition (verified by `b3_ac6_v1_colon_form_still_compiles_during_transition`), so the codemod is not on the critical path for compiler correctness.

4. **No hidden codemod work.** No `migrate.ts` file, no AST scope-tracking utility, no codemod CLI subcommand on this branch. Builder did not start the codemod and then surface — the surface was raised before any codemod code was written.

5. **Three of the 5 deferred ACs (#13/#14/#15) are codemod-dependent** by definition — they cannot be tested without the codemod existing. AC9/AC10 ($event collection + $emit typed-payload listener) are honestly compiler-side work that could have landed in B3a but the Builder grouped them with B3b to keep the round under the surface trigger. The grouping is defensible: AC9/AC10 require ~150-200 LOC additional compiler work which would push B3a to ~1860 LOC.

## Final verdict

**V3 NEEDS_FIX** — not for hidden work, but specifically because **AC12 does not pass end-to-end as the spec requires**.

The disposition options are:

a. **Accept AC12 as PARTIAL and treat as effective PASS** for B3a, formalizing the consumer-side wiring as the first sub-AC of B3b's dispatch. This is what the Builder requests in their manifest.

b. **Hold AC12 as fail** and require a small follow-up commit on this branch to land the vite plugin + moon `tsc --noEmit *.aihu.ts` wiring (~50-100 LOC infra).

Per V3 method §2 explicit instruction ("If AC12's intent is not end-to-end true because CI doesn't run it, then AC12 does NOT pass"), I record verdict **NEEDS_FIX** with the recommendation that **option (a) is also acceptable governance** because:

- Builder surfaced the partial honestly in manifest §6 and §3.7
- The sidecar consumer wiring (file write + tsc inclusion) is genuinely small but bundles cleanly with codemod consumer-side wiring (vite plugin already needs touching for codemod CLI registration)
- Director r8 governance can re-cut explicitly: AC12 → B3b with the wiring as a named sub-AC

If Director r8 chooses option (a), the rest of the verification is **PASS for 11 of 12 in-scope ACs** with AC12 explicitly handed to B3b. The re-cut request itself is honest. No hidden completable work.

### Pass count

- **PASS: 11/12 in-scope ACs** (AC1, AC2, AC3, AC4, AC5, AC6, AC7, AC8, AC11, AC16, AC17)
- **PARTIAL: AC12** (sidecar emit lands; consumer wiring + tsc CI deferred)
- **Deferred (not audited in V3): AC9, AC10, AC13, AC14, AC15**

### Top under-implementation finding

AC12: sidecar emit ≠ end-to-end tsc-covers-template; consumer wiring deferred to B3b infra.

### Top over-implementation finding

None.

### Re-cut justification

**Honest.** LOC trigger crossed by ~7%; investigation note documents the seam pre-code; no hidden codemod work; AC9/AC10 grouping with B3b is defensible.

---

*— End of V3 verification report.*
