# Build Manifest — Builder B3 (Variant B Template Syntax + R4 Typed-Conv + Sidecar)

**Branch:** `feat/template-syntax-v2-b3`
**Parent:** `feat/template-syntax-v2` @ `da53779`
**Builder:** B3 (Mode 2, iteration 3 of 5 — the largest round)
**Date:** 2026-05-06
**Tags:** `topic:aihu-template-syntax track:userland-dx round:b3 builder-output`
**Director note source:** `.team/director-notes/template-syntax-007.md` §3 (refined B3 brief)
**Architect spec:** `docs/superpowers/specs/2026-05-06-spec-template-syntax-v2.md` (Variant B)
**Sample catalog:** `docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-samples.md`
**Investigation note:** `.team/build-manifests/b3-investigation.md` (B3a/B3b seam analysis)

## Status: B3 PARTIAL — surfaces B3a/B3b re-cut request

**B3a delivered in this round (compiler-side):**
- 12 of 17 ACs pass; 5 ACs (codemod + corpus + idempotency + emit body-call) deferred to B3b
- 1660 LOC combined (1155 src + 505 tests). Just OVER the 1500 LOC ceiling per Director r7 §6 #8.
- Surface invoked PROACTIVELY at investigation time (before code) because the realistic codemod
  scope alone is ~620 src + ~120 tests = ~740 LOC additional, which would push the round to
  ~2400 LOC combined — definitively in re-cut territory.
- B3b dispatch covers: codemod (`packages/compiler/js/codemods/template-syntax/migrate.ts`),
  body-call migration with AST-aware scope tracking, corpus migration of 62 in-aihu-repo
  `.aihu` files, codemod CLI (`aihu codemod template-syntax`), and codemod idempotency tests.

## Per-phase delta

### Phase 1+2 — Variant B block-tag parser + codegen (commit `7968d59`)

**Files changed:**
- `packages/compiler/src/types.rs` — adds `IfBlock`, `EachBlock`, `HtmlBlock` variants to
  `TemplateNode` enum. +17 LOC.
- `packages/compiler/src/parser/template.rs` — adds block-tag parser. New `BlockBoundary`
  enum signals `{:else}`, `{:else if}`, `{:empty}`, `{/if}`, `{/each}` to recursive
  `parse_nodes_with_boundary`. New `parse_each_header` handles `<list> as <item>[, <idx>] [(<key>)]`
  with proper string/paren/bracket-aware ` as ` location. +540 LOC.
- `packages/compiler/src/codegen/emit.rs` — adds `emit_if_block` (negated-conds chain
  composes else-if via sibling `when()` calls since `when()` is single-branch),
  `emit_each_block` ({:empty} dual-when shape), `emit_html_block` (mirrors `$html` IIFE).
  Extends `collect_helpers_recursive` for new variants. +180 LOC.

**Acceptance criteria evidence:**
- AC #5: `b3_ac5_block_if_lowers_to_when` / `b3_ac5_block_if_else_chain_lowers_to_negated_when_siblings`
  / `b3_ac5_block_each_lowers_to_each_call` / `b3_ac5_block_each_with_empty_emits_dual_when` /
  `b3_ac5_block_each_lambda_lhs_unhoisted` (b3_variant_b.rs).
- Lambda-LHS landmine fix: parser preserves `events.filter(e => e.ok)` verbatim — no hoist
  required (Variant B's block-tag header accepts arbitrary expressions before ` as `).

### Phase 3+4+5 — Dot-form + class-array + $ref + W202/C500 (commit `98244b1`)

**Files changed:**
- `packages/compiler/src/parser/directives.rs` — `parse_macro_attr` now accepts BOTH
  `$on.click` (canonical Variant B) AND `$on:click` (v1 colon-form, with W202 deprecation
  warning to stderr). Internally normalized to colon-form so all existing emit-side
  `strip_prefix("on:")` / `strip_prefix("bind:")` logic continues working byte-identically.
  +106 LOC.
- `packages/compiler/src/codegen/emit.rs` — `class={[...]}` array form lowers via inline
  `__aihu_cls` helper (clsx-shaped: filters falsy, joins truthy strings with spaces);
  `$ref={signal}` finally lowers to setter-call-on-mount (closes Scout D1.4 silent-drop bug);
  unknown $-directives emit C500 via stderr (codemod will promote to compile-error in B3b).
  +120 LOC.

**Acceptance criteria evidence:**
- AC #6: `b3_ac6_dot_form_on_click_lowers_to_onclick_attr` / `b3_ac6_dot_form_bind_value_lowers_with_writeback`
  / `b3_ac6_v1_colon_form_still_compiles_during_transition` (b3_variant_b.rs).
- AC #7: `b3_ac7_class_array_form_lowers_with_helper` / `b3_ac7_class_string_unchanged`
  (b3_variant_b.rs).
- AC #8: `b3_ac8_html_block_lowers_with_effect` (b3_variant_b.rs).
- AC #16 (compiler-side): C500 stderr surface; codemod-side promotion deferred to B3b.

### Phase 6 — R4 typed-conv at $bind.value write site (commit `a130905`)

**Files changed:**
- `packages/compiler/src/codegen/emit.rs` — extends R4 write-back emit to wrap user-input
  in `__aihu_conv(getter(), e.target.value)`. Inline runtime helper inspects
  `typeof currentValue` and parses input-string accordingly (Number for numeric signals;
  boolean for boolean; identity for string). Mirrors R1's `_convert` direction at the
  read side per Director r7 §2 Surface 1 defense. +30 LOC src + ~30 LOC helper.
- `packages/compiler/tests/macro_attrs.rs` + `b2_fixtures.rs` — existing R4 tests updated
  to match the new typed-conv emit shape. +17 LOC delta.
- `packages/compiler/tests/b3_variant_b.rs` — 17 new B3 acceptance tests added.
  +421 LOC.
- `packages/compiler/tests/fixtures/b3-variant-b/` — 3 new fixtures: block-tags-basic,
  html-block, dot-form-bind. +70 LOC fixture.

**Acceptance criteria evidence:**
- AC #11: `b3_ac11_typed_conv_helper_emitted_for_value_bind` / `b3_ac11_typed_conv_skipped_for_checked_bind`.
  Numeric example: `signal(0)` + `$bind.value={count}`; user types '5'; signal stores `5` not `'5'`.

### Phase 7 — Per-SFC `.aihu.ts` sidecar (commit `9e5685a`)

**Files changed:**
- `packages/compiler/src/codegen/emit.rs` — adds `sidecar_ts: Option<String>` field to
  `EmitResult`. New `emit_sidecar_ts` walks the template AST, collects every curly
  expression/$on handler/$bind expr/{#if cond}/{#each list}/{@html expr}/text interpolation,
  and emits a synthetic TS function body wrapping each in `void (...);`. Permissive
  preamble re-declares signal/computed/onMount/onCleanup/onAdopt/onAttributeChange/$emit/$event
  with `any`-shape signatures so tsc has framework globals in scope. +120 LOC.

**Acceptance criteria evidence:**
- AC #12: `b3_ac12_sidecar_ts_contains_template_expressions` (sidecar contains `{#if}`
  cond + interpolation) / `b3_ac12_sidecar_ts_includes_emit_and_event_decls`.
- Closes Scout D4's near-zero TS-coverage baseline at the per-SFC level.
- Consumer toolchains (vite plugin / moon) write the sidecar adjacent to source as
  `<file>.aihu.ts` (deferred to B3b infra alongside codemod scaffolding).

## Acceptance criteria status

| # | AC | Status |
|---|---|---|
| 1 | `cargo check --workspace` (compiler) passes | ✅ B3a |
| 2 | `cargo test -p aihu-compiler` passes (323 → 358; +35 new B3 tests) | ✅ B3a |
| 3 | `bun run typecheck` passes (27 tasks; 25 cached, 2 ran clean) | ✅ B3a |
| 4 | `bun run test` passes (834 + 5 skipped, no regressions) | ✅ B3a |
| 5 | `{#if}/{#each}/{:else if}/{:else}/{:empty}` works | ✅ B3a |
| 6 | `$on.click` + `$bind.value` dot-form works (+W202 colon-form compat) | ✅ B3a |
| 7 | `class={[…]}` array form lowers correctly | ✅ B3a |
| 8 | `{@html expr}` Svelte-style works | ✅ B3a |
| 9 | `$emit.<name>(payload)` typed payload via `$event` | ⏳ B3b |
| 10 | Listener `$on.<custom-event>={handler}` typed | ⏳ B3b |
| 11 | R4 typed-conv at `$bind.value` write site | ✅ B3a |
| 12 | Sidecar `.aihu.ts` emitted | ✅ B3a |
| 13 | Codemod round-trips 13 prober fixtures | ⏳ B3b |
| 14 | Codemod migrates 62 in-aihu-repo files | ⏳ B3b |
| 15 | Codemod idempotent | ⏳ B3b |
| 16 | C500 fires on remaining v1 syntax (compiler-side stderr surface in place) | ⚠️ B3a partial; B3b promotes to compile-error |
| 17 | All pre-push hooks pass (Biome + typecheck + test + build + size + size-rows) | ✅ B3a |

**12/17 ACs pass in B3a; 5 ACs (#9, #10, #13, #14, #15) deferred to B3b.**

## Test totals

| Suite | Pre-B3 | Post-B3a | Delta |
|---|---|---|---|
| `cargo test -p aihu-compiler` | 323 | 358 | +35 |
| `bun run test` | 834 (+5 skipped) | 834 (+5 skipped) | +0 (no regressions) |

All 19 b3_variant_b.rs tests pass. R4 fixture/test updates from B2 still pass with new
typed-conv shape.

## Decisions (Builder picks)

1. **B3a/B3b seam invoked proactively.** Investigation note (`.team/build-manifests/b3-investigation.md`)
   documented the seam analysis before writing code. The codemod is partition-able from
   the compiler-side work because compiler accepts BOTH v1 colon-form AND v2 dot-form
   during the transition window — codemod authoring isn't on the critical path for the
   compiler's correctness.

2. **Else-if chain lowers to negated-cond sibling when() calls.** Arbor's `when(cond, grow)`
   takes a single branch — there's no built-in else slot. To preserve the runtime contract
   without invasive changes, B3 emits sibling `createIfBoundary` calls for each branch with
   the synthesized `!(c0) && !(c1) && (cN)` condition. This may double-evaluate condition
   expressions on update — acceptable for v0.3, optimization watchpoint for later.

3. **{:empty} as dual-when sibling pattern.** Same rationale: sibling `createIfBoundary(populated, ...)
   + createIfBoundary(empty, ...)` rather than introducing a new runtime primitive.

4. **`$ref={signal}` setter detection.** When the ref target is a registered signal in
   `signal_map` with a setter, emits `setMyEl(_el)`; for plain identifier (no setter),
   emits `myEl = _el`. Mirrors the existing emit pattern and stays consistent with
   how `$bind` discriminates registered-signal from plain-let.

5. **`__aihu_conv` runtime helper inline-emitted.** Avoids a runtime-package dep
   addition (would force size-budget bump). The 100-byte helper is conditionally emitted
   only when `$bind.<non-checked>` appears in the template.

6. **`__aihu_cls` for class array form.** Same rationale: SFC-internal helper, conditional
   emission. Joins truthy strings with spaces; falsy filtered.

7. **Sidecar `.aihu.ts` minimal preamble.** Re-declares signal/computed/onMount/onCleanup/
   onAdopt/onAttributeChange/$emit/$event with permissive `any`-shape signatures. Precise
   typing depth (matching R1's prop-type info into sidecar) is a watched item for B3b
   when typed payloads via `$event:` collection lands.

8. **C500 stderr surface, not hard error.** B3a does NOT promote unknown directives to
   compile errors because some legitimate v1 directives still appear in unmigrated corpus
   (e.g., the prober fixtures use colon-form $on:/$bind: extensively). B3b's codemod
   migrates the corpus first, then the C500 promotion to hard error becomes safe.

## Surfaced for Director r8

1. **B3a/B3b re-cut justified by surface trigger.** B3a's 1660 LOC src+tests is just
   over the 1500 ceiling. Adding the codemod's ~740 additional LOC would push the round
   to ~2400 LOC — strict re-cut territory per Director r7 §6 #8. **Recommend dispatching
   B3b as a separate Builder dispatch off post-B3a parent.** B3b scope: codemod implementation
   (template-syntax/migrate.ts) + body-call AST-aware migration + corpus migration of 62
   .aihu files + 13 prober-fixture round-trip tests + idempotency test + codemod CLI subcommand.

2. **Sidecar emission needs consumer-side wiring.** The compiler now produces
   `EmitResult.sidecar_ts: Option<String>`. The vite plugin + moon graph need to write the
   sidecar adjacent to source (`<file>.aihu.ts`) and include it in `tsc --noEmit` discovery
   for the AC #12 + #17 to be end-to-end true at the build-pipeline level. **B3b should
   include this consumer-side wiring** because the sidecar discovery cost was unknown when
   Director r7 §6 #10 wrote the surface condition.

3. **`$event:` collection + `$emit.<name>(payload)` + listener typed-payload deferred.**
   ACs #9 + #10 require:
   - Adding `Event` variant to `CollectionKind` enum
   - Extending the parse_state_macros validator + emit code for the new collection
   - Compile-time resolution of `$emit.<name>` against the `$event` collection (C501 if
     missing)
   - Sidecar enrichment to carry `$event` payload types through to the listener side
   This is ~150-200 LOC additional compiler work. **Recommend folding into B3b** alongside
   the codemod, or splitting B3b into B3b-codemod + B3c-emit if B3b alone hits the ceiling.

4. **Body-call migration scope-tracking unproven.** The AST-aware `propName.x → propName().x`
   migration that R1 brings in (and that B3b's codemod must handle for the corpus) was
   estimated at ~80-150 LOC by Director r7 but the realistic cost depends on whether
   destructuring patterns and dynamic property access (`{ ...props }` spread, `props['dyn']`)
   need to be handled at depth. **B3b Builder may surface for B3b/B3c re-cut if the
   AST scope-tracking turns into research project.**

## Branch state

- Commits on `feat/template-syntax-v2-b3` (4 phase-commits):
  - `7968d59` — feat(compiler): variant b block-tag {#if}/{#each}/{@html} parser+codegen
  - `98244b1` — feat(compiler): $on./$bind. dot-form + class array + $ref + W202/C500
  - `a130905` — feat(compiler): r4 typed-conv at bind.value + b3 acceptance tests
  - `9e5685a` — feat(compiler): per-sfc .aihu.ts sidecar for template type-safety
- Pushed to `origin/feat/template-syntax-v2-b3`.
- Pre-push hooks (Biome CI + typecheck + test + build + size + size-rows + sync-readme)
  all pass on each commit.

## Time spent

~5 hours wall-clock (within the 4-6 hour budget; surface threshold at 6 not breached).

*— End of B3a build manifest. STATUS line below.*
