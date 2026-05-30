# CSS Engine — Recipe-Authoring Engine Support (`@meta`, `@apply`-in-`@style`, variant validation)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. This plan touches the Rust SFC compiler (`packages/compiler`) AND the Rust CSS core (`packages/css-engine/crates/aihu-css-core`) AND the TS bridge — Rust-heavy, `insta` snapshot conventions. **Eng-reviewed + Codex outside-voice 2026-05-29; decisions locked in the REVIEW DECISIONS section. Ships as THREE sequenced PRs.**

**Why this plan exists:** Plan 5 (`@aihu/ui`) shipped four working recipes, but the build proved the engine does NOT support the spec's recipe-authoring model (master spec §9.2). Recipes compile today only via workarounds (literal `var(--color-*)` + an unexpanded `@apply` base line, metadata in catalog `meta.json` instead of `@meta`, variant-typo guard at the catalog layer). This plan closes the gaps so recipes author as the spec describes — and so the headline compile-time optimization (utility expansion inside recipe `@style`) actually exists.

**Goal (3 capabilities — pluggable compile-time packs DROPPED, see R-DROP-PACKS):**
1. **`@apply` expansion inside `@style`** — `@apply bg-primary hover:bg-accent` inside a `@style` rule inlines base-utility declarations into the current rule and lifts variant tokens to nested selectors. The optimization that doesn't happen today.
2. **`@meta {}` SFC block** — the compiler parses a `@meta` block (lenient JSON5-style body) into `SfcMeta { variants, slots, dependencies, registryDependencies }`, surfaced on the AST.
3. **Compile-time variant validation** — when `@meta.variants` is declared, an undeclared `[data-{axis}="x"]` selector in `@style` is a build error.

**Out of scope:** the stale platform-binary fix (shipped separately as PR #293, `0.1.2 → 0.1.3`); pluggable compile-time style packs (dropped — see R-DROP-PACKS).

---

## REVIEW DECISIONS — locked 2026-05-29 (plan-eng-review + Codex)

1. **R-SPLIT — three sequenced PRs.** Blast radius: the compiler parser is shared by every `.aihu`. PR-1 (engine/css-core), PR-2 (compiler), PR-3 (validation + recipe migration). See PR map below.
2. **R-APPLY-PARSE (D2) — `@apply` parses the `@style` CSS structure.** Base utility tokens inline as declarations into the current rule; variant tokens (`hover:`, `disabled:`, `data-*`, `group:`, `peer:`, `host:`, `dark`, media/container, arbitrary `[&...]`) lift to a nested selector on the current rule (`&:hover {…}`). NOT regex line-substitution, NOT `emit_token()` + string-strip — Codex confirmed the current variant logic is class-selector-centered, so `hover:bg-accent` must resolve to `.recipe:hover`, derived structurally.
3. **R-SERDE-TOLERANT (D3) — `SfcMeta` is forward/backward compatible.** Every new AST-JSON field is `#[serde(default)]`; the css-core deserializer does NOT `deny_unknown_fields`. A **cross-crate AST-JSON contract test** (old-shape JSON still parses; new field absent → default) lives in BOTH the compiler PR and the validation PR.
4. **R-META-AUTHORITATIVE (D5) — `@meta` is the single source of truth.** The Plan 5 `gen-registry` script extracts `@meta` from the compiled AST and emits the catalog; the hand-written `meta.json` is DELETED. No dual-source drift.
5. **R-SHARED-PARSER (D6) — one `@style`-rule parser.** Introduced in PR-1 (for `@apply`), reused by the validation pass. Validation runs in css-core (not the compiler), so it sequences AFTER PR-1 and lands in PR-3.
6. **R-APPLY-TESTS (D7) — full `@apply` edge matrix:** multi-token (`@apply a b c`), multiple `@apply` per rule, `@apply` in a nested rule, arbitrary-value utility (`bg-[#fff]`), plus base + variant + unknown-utility.
7. **R-JSON5 (D11) — `@meta` body is a lenient JSON5-style object literal** (unquoted keys, single OR double quotes, trailing commas), matching the spec §9.2 examples + the JS-ish `@state` block. `gen-registry` normalizes it to strict JSON for the catalog. (Codex: strict JSON would be the one foreign-looking block.)
8. **R-DROP-PACKS (D10, Codex) — pluggable compile-time packs are DROPPED.** Recipes already swap packs at runtime via `var(--color-*)`; baking per-pack `:host` literals at compile time is a contradictory second mechanism ("differs per pack" vs "pack-invariance" are opposite goals). Packs stay runtime-only. The `--pack` flag, `theme.rs` override, `TokenMap`/dark handling, and the pack cache-key are all removed from scope. Plan 5's R4 stays a deterministic-recompile assertion (honest about what the engine does).
9. **R-RESULT (Codex) — convert css-core to `Result` FIRST.** `emit_sfc_scoped`/`compile_sfc_scoped` return `String` today; hard-erroring on unknown `@apply` utilities or invalid variants requires converting the public API + cache API + binary exit + TS bridge to propagate errors. This is a precursor task at the head of PR-1.
10. **R-META-COEXIST (Codex) — define `@meta` vs existing `ScriptMeta.name`.** `ScriptMeta` already carries `name`. PR-2 must specify how `@meta` (recipe variants/slots/deps) coexists with the existing name/`route.name`/tag resolution — `@meta` does NOT redefine `name`; it adds recipe-catalog fields only.
11. **R-BRACE-REWRAP (Codex) — re-wrap the `@meta` body before parsing.** The block parser strips outer braces, leaving `key: value, …`; PR-2 re-wraps in `{ … }` before handing to the JSON5 parser.
12. **R-NO-PREMIGRATION-BREAK (Codex) — `@apply` expansion must not break current recipes.** Plan 5 recipes already contain an unexpanded `@apply` base line (`select-none`, `disabled:pointer-events-none`, …). The moment PR-1 enables expansion + hard-error, those tokens are resolved for real. PR-1 MUST include a regression test running every current recipe through `@apply` expansion and asserting all tokens resolve (no hard-error); any uncovered token is covered in the utility table or the recipe is fixed in PR-1.
13. **R-RELEASE-LOCKSTEP (Codex) — release the chain together.** Compiler AST + css-core binary + TS bridge + platform pins ship in lockstep (one coordinated release) so consumers never get mismatched AST/error behavior. Document in PR-3 closeout.

---

**Reference spec:** `docs/superpowers/specs/2026-05-10-...md` §6.2/§6.3/§9.2. Gap origin: Plan 5 build + `packages/ui/tests/recipe-compile.test.ts` header. Gap map (file:line anchors): see below. Builds on Plans 2–5.

---

## PR Map (R-SPLIT)

```
PR-1  ENGINE (css-core)         PR-2  COMPILER              PR-3  VALIDATION + MIGRATION
  Result conversion (R-RESULT)    @meta block parse           variant validation pass
  shared @style-rule parser       JSON5 body (R-JSON5)          (reuses PR-1 parser + PR-2 SfcMeta)
  @apply expansion (base+variant) brace re-wrap (R-BRACE)      migrate 4 recipes → @meta + @apply
  @apply edge matrix (R-APPLY-TESTS) SfcMeta + AST-JSON         gen-registry extracts @meta (R-META-AUTH)
  no-pre-migration-break test       tolerant serde (R-SERDE)   delete meta.json + update Plan 5 tests
  (R-NO-PREMIGRATION-BREAK)         @meta vs name (R-COEXIST)   cross-crate contract test (R-SERDE)
                                    cross-crate contract test  release lockstep (R-RELEASE)
        │                                  │                          │
        └────────── PR-1 first ────────────┴── PR-2 parallel-ok ──────┴── PR-3 needs PR-1 + PR-2
```
PR-1 and PR-2 touch disjoint crates (css-core vs compiler) and can develop in parallel; PR-3 depends on both. Release all three in lockstep (R-RELEASE).

---

## Gap map (verified file:line anchors)

- Block kinds: `packages/compiler/src/parser/sfc.rs` — `BlockKind` enum `:10-20`; `match_at_opener` name loop `:49-56`; `KNOWN_BLOCK_NAMES` `:364`; dispatch `:780-872`. Existing `ScriptMeta` carries only `name`.
- `@style` verbatim fold: `aihu-css-core/src/emit.rs:emit_sfc_scoped()` `:229-280` (fold ~`:264`); utility expansion `emit_with_progressive()` `:192-225`, `emit_token()` `:218`; variant logic `variants.rs:142-175`.
- TS bridge: `packages/css-engine/src/index.ts:233-241` (`compileSfc`), `:207-218` (`compile`); binary resolve `:123-164`.
- CSS cache: keys on AST hash + theme-version int; does NOT include `ast.meta` (R-SERDE/validation note).

---

## PR-1 (ENGINE) — `Result` conversion + shared `@style` parser + `@apply` expansion

### Task 1.1: Precheck
- [ ] Current binary resolves (PR #293 landed OR local `cargo build --release -p aihu-css-core`). `cargo test -p aihu-css-core` + `bunx vitest run packages/css-engine` green. `git status` clean.

### Task 1.2: Convert css-core emit to `Result` (R-RESULT)
- [ ] Convert `emit_sfc_scoped`/`compile_sfc_scoped` (+ the cache API + the `aihu-css-compile` binary's exit path + the `compileSfc`/`compile` TS bridge) from `String` to `Result<String, CompileError>` propagation. Binary exits non-zero + prints the error on `Err`; the bridge surfaces it as a thrown error with the message.
- [ ] Tests: an induced emit error propagates to a non-zero binary exit and a thrown bridge error; existing success paths unchanged (snapshot parity).
- [ ] Commit: `refactor(css-engine): emit returns Result (error propagation precursor)`

### Task 1.3: Shared `@style`-rule parser (R-SHARED-PARSER)
- [ ] New `aihu-css-core/src/style_parser.rs` (or similar): parse a `@style` block into a structured rule tree (selectors + declaration lists + `@apply` directives + nested at-rules), comment/string-aware, brace-nesting-aware. This is the single parser reused by `@apply` (Task 1.4) and validation (PR-3). Codex flagged a string scanner as a trap — this must be a real CSS-structure parse.
- [ ] Tests: parses comments, strings, nested `@media`/`@supports`, arbitrary values, multiple rules; round-trips unchanged CSS.
- [ ] Commit: `feat(css-engine): structured @style-rule parser (shared by @apply + validation)`

### Task 1.4: `@apply` expansion (R-APPLY-PARSE, R-APPLY-TESTS, R-NO-PREMIGRATION-BREAK)
- [ ] New `aihu-css-core/src/apply.rs`: for each rule from Task 1.3, replace its `@apply <tokens>` directives — **base** tokens inline their declarations into the current rule; **variant** tokens resolve structurally to a nested selector on the current rule (`&:hover {…}`, `&[data-state="open"] {…}`, dark-cascade, group/peer/host/slotted/part, media/container, arbitrary `[&...]`) using `variants.rs` logic, NOT `emit_token()`+string-strip. Unknown utility → `CompileError` (now possible via R-RESULT).
- [ ] Decide `@apply` in `$global` styles: variants that imply `&`/host scoping are rejected in `$global` with a clear error; base utilities allowed. Document.
- [ ] Tests (`insta`): base; single variant → nested; **multi-token `@apply a b c`; multiple `@apply` per rule; `@apply` in a nested rule; arbitrary-value `bg-[#fff]`**; unknown-utility error; `$global` variant rejection.
- [ ] **Regression (R-NO-PREMIGRATION-BREAK, CRITICAL):** run every current `packages/ui/registry/*/*.aihu` through `@apply` expansion; assert all tokens resolve (no hard-error). Cover any missing token in the utility table or fix the recipe here.
- [ ] Commit: `feat(css-engine): expand @apply inside @style (base inline, variant→nested)`

---

## PR-2 (COMPILER) — `@meta` block

### Task 2.1: `@meta` block parse (R-JSON5, R-BRACE-REWRAP, R-META-COEXIST)
- [ ] Add `BlockKind::Meta` (`sfc.rs:10-20`), `("meta", BlockKind::Meta)` (`:49-56`), `"meta"` to `KNOWN_BLOCK_NAMES` (`:364`), dispatch arm (`:780+`). Re-wrap the brace-stripped body in `{ … }` (R-BRACE-REWRAP), parse as **JSON5-style** (R-JSON5) into `SfcMeta { variants: Map<String,Vec<String>>, slots: Vec<String>, dependencies: Vec<String>, registryDependencies: Vec<String> }`. Duplicate `@meta` errors.
- [ ] **Coexistence (R-META-COEXIST):** `@meta` does NOT redefine `name` — `ScriptMeta.name`/`route.name`/tag resolution stay authoritative; `@meta` adds recipe-catalog fields only. Document the boundary in a code comment + the spec note.
- [ ] Tests: valid JSON5 (`@meta { variants: { variant: ['a','b'] }, slots: ['button'] }`) round-trips; unquoted keys + single quotes + trailing comma accepted; malformed errors with line info; duplicate errors; empty `@meta {}` → empty `SfcMeta`; `insta` AST snapshot.
- [ ] Commit: `feat(compiler): @meta SFC block (JSON5 body → SfcMeta)`

### Task 2.2: AST-JSON threading + tolerant serde (R-SERDE-TOLERANT)
- [ ] Add `SfcMeta` to the emitted AST-JSON. ALL new fields `#[serde(default)]`; the css-core input struct does NOT `deny_unknown_fields`.
- [ ] **Cross-crate AST-JSON contract test:** an old-shape AST-JSON (no `meta`) still deserializes (meta defaults empty); a new-shape JSON with `meta` round-trips. Mirror this test in PR-3.
- [ ] Commit: `feat(compiler): thread SfcMeta through AST-JSON (tolerant, defaulted)`

---

## PR-3 (VALIDATION + MIGRATION)

### Task 3.1: Compile-time variant validation (R-SHARED-PARSER, R-SERDE)
- [ ] New css-core `validate.rs`: using the Task 1.3 parser + the Task 2.2 `SfcMeta`, when `SfcMeta.variants[axis]` is declared, every `[data-{axis}="x"]` selector in `@style` whose `x` ∉ declared set → `CompileError` (actionable message). Handle selector forms Codex flagged: single/double-quoted + unquoted values, whitespace, `:is()`, comments/strings (already handled by the shared parser). SFCs with no `@meta` skip validation (no false positives).
- [ ] **Scope note (Codex):** validation checks `@style` SELECTORS only — it does NOT constrain runtime `$data-variant={…}` prop values. Document this narrowness.
- [ ] If the CSS cache returns cached CSS, ensure the cache key incorporates `ast.meta` so a `@meta` change re-runs validation (Codex: cache currently ignores `ast.meta`).
- [ ] Tests: declared passes; undeclared `[data-variant="bogus"]` errors; **multiple axes (variant + size) both validated**; `@meta`-less SFC unaffected; cross-crate contract test (mirror of Task 2.2).
- [ ] Commit: `feat(css-engine): compile-time @meta-variant validation`

### Task 3.2: Migrate recipes + single-source catalog (R-META-AUTHORITATIVE)
- [ ] Rewrite `packages/ui/registry/{button,card,badge,separator}/*.aihu`: add `@meta {}` (JSON5), convert the `@style` matrix to `@apply` (base + variant), drop the literal-`var()` workaround.
- [ ] `gen-registry` (Plan 5): extract `@meta` from the compiled AST → emit catalog `registry.json`; **DELETE the hand-written `meta.json`** files.
- [ ] **Regression (CRITICAL):** update Plan 5 `gen-registry.test.ts` + `add.test.ts` (they assume hand-written `meta.json`); add a test that `gen-registry` extracts `@meta` from a compiled `.aihu` and `aihu add button --prefix acme` still writes a correct recipe.
- [ ] Update `packages/ui/tests/recipe-compile.test.ts`: replace the "engine gap" caveats with real assertions (`@apply` expands to the same declarations as the equivalent utilities; engine-side variant validation rejects typos). Keep the deterministic-recompile assertion for pack-invariance (R-DROP-PACKS — no cross-pack compile exists).
- [ ] Commit: `refactor(ui): recipes use @meta + @apply; gen-registry extracts @meta (drop meta.json)`

### Task 3.3: Verify + release lockstep (R-RELEASE)
- [ ] `cargo test -p aihu-compiler` + `cargo test -p aihu-css-core` green; `bun run typecheck` + `bunx vitest run packages/css-engine packages/ui packages/cli/tests` green; primitives 67/67.
- [ ] `@apply` expands (full edge matrix); `@meta` parses (JSON5); undeclared variant errors at build; old-shape AST-JSON still parses; current recipes' `@apply` tokens all resolve.
- [ ] Release the compiler + css-core binary + TS bridge + platform pins **in lockstep** (one coordinated release); document in PR-3.

---

## NOT in scope
- **Pluggable compile-time packs** — dropped (R-DROP-PACKS); packs stay runtime-only via `var()`.
- **Stale binary fix** — shipped as PR #293 (`0.1.2 → 0.1.3`).
- **Runtime value typing of `$data-variant`** — validation checks `@style` selectors only (Task 3.1 scope note).
- **Full JS-expression `@meta`** — JSON5-only (R-JSON5); no arbitrary expression eval.
- **Storybook/Chromatic, Phase 2+ recipes, `aihu rename`** — Plan 6.

## What already exists (reused)
- `variants.rs` variant→selector logic (`:142-175`) — reused by `@apply` nested-selector resolution (NOT re-implemented).
- `emit_token()` declaration emission (`:218`) — the source of base-utility declarations.
- Plan 5 `gen-registry` — extended to extract `@meta` (R-META-AUTHORITATIVE), not rebuilt.
- The AST-JSON bridge (`compileSfc --ast-json`) — extended with tolerant `SfcMeta`.

## Failure modes
| Codepath | Failure | Test? | Handled? | Visible? |
|---|---|---|---|---|
| @apply expansion | unknown utility | YES (1.4) | YES (CompileError via R-RESULT) | clear build error |
| @apply expansion | breaks current recipes pre-migration | YES (R-NO-PREMIGRATION-BREAK, CRITICAL) | gate | caught in PR-1 |
| AST-JSON | version skew (old/new field) | YES (contract test, both PRs) | serde default | graceful |
| @meta parse | malformed JSON5 | YES (2.1) | line-info error | clear |
| validation | false positive on no-@meta SFC | YES (3.1) | skip-if-absent | none |
| gen-registry | @meta→catalog drift | mooted (single source, R-META-AUTH) | n/a | n/a |
| cache | stale validation on @meta change | YES (3.1 cache-key) | meta in key | none |

**No critical gaps** (every path tested + handled).

## Parallelization
PR-1 (css-core) and PR-2 (compiler) touch disjoint crates → parallel worktrees. PR-3 needs both → sequential after. Release lockstep (R-RELEASE).

## Implementation Tasks
- [ ] **T1 (P1)** — css-core — `Result` conversion precursor (R-RESULT). Files: `emit.rs`, binary, `index.ts`. Verify: induced error → non-zero exit + thrown bridge error.
- [ ] **T2 (P1)** — css-core — shared `@style`-rule parser (R-SHARED-PARSER). Files: `style_parser.rs`. Verify: comment/string/nested-at-rule parse tests.
- [ ] **T3 (P1)** — css-core — `@apply` expansion, base+variant, full edge matrix (R-APPLY-PARSE/TESTS). Files: `apply.rs`, `emit.rs`. Verify: insta matrix + no-pre-migration-break regression.
- [ ] **T4 (P1)** — compiler — `@meta` JSON5 block + brace re-wrap + name coexistence (R-JSON5/BRACE/COEXIST). Files: `sfc.rs`. Verify: `cargo test -p aihu-compiler`.
- [ ] **T5 (P1)** — compiler — tolerant `SfcMeta` AST-JSON + contract test (R-SERDE). Files: AST module. Verify: old-shape JSON parses.
- [ ] **T6 (P2)** — css-core — variant validation pass (R-SHARED-PARSER). Files: `validate.rs`. Verify: undeclared variant errors; multi-axis; no-@meta skip.
- [ ] **T7 (P1)** — ui — migrate recipes + gen-registry @meta extraction + drop meta.json + update Plan 5 tests (R-META-AUTH, regression). Files: `packages/ui/**`. Verify: `bunx vitest run packages/ui packages/cli/tests`.
- [ ] **T8 (P2)** — release — lockstep release of compiler+binary+bridge+pins (R-RELEASE). Verify: pins consistent; no mismatched AST/error behavior.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | ~24 raised; 2 cross-model tensions resolved (drop packs, JSON5), rest folded in |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | 8 issues, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **CODEX:** surfaced the `String→Result` precursor, brace re-wrap, `ScriptMeta` coexistence, `@apply`-breaks-current-recipes gate, `TokenMap`-loses-dark, and the contradiction in compile-time packs — all folded in or resolved.
- **CROSS-MODEL:** 2 tensions resolved by the user — (1) **dropped Phase 3** compile-time packs (packs stay runtime-`var()`); (2) **`@meta` = JSON5** not strict JSON. Strong overlap on `@apply` parsing, serde tolerance, single-source metadata, and the broken PR split.
- **UNRESOLVED:** 0 — all 11 decisions applied; scope reduced (packs dropped) and re-split into 3 PRs.
- **VERDICT:** ENG + CODEX CLEARED — ready to implement as PR-1 → (PR-2 ∥) → PR-3. Precursor: T1 `Result` conversion heads PR-1.
