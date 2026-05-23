# CSS Engine Plan 2 — AST Scanner, Scoped Output & WC-Native Variants

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Plan 1's stub class-list input with a real AST-consuming scanner that walks an `.aihu` SFC's parsed template, port the full Tailwind v4 utility table, emit per-SFC CSS scoped into the component's shadow DOM (no global utility stylesheet), implement the WC-native variants (`host:`, `host-context-dark:`, `slotted:`, `slotted-img:`, `part-*:`) and the standard Tailwind variants (`hover:`, `focus:`, `dark:`, `md:`, `[&>div]:`), parse the `@theme` directive, and add an AST-hashed incremental compilation cache.

**Architecture:** This plan turns the bootstrap engine (Plan 1: "take a class list, return flat CSS") into a real per-SFC compiler driven by the compiler's AST. The single largest dependency is the new `compileToAst(source): SfcAst` export from `@aihu/compiler` (bridge item `v1.0.10a-compiler-ast-export`) — its contract is specified in `docs/superpowers/specs/compiler-ast-export-hook.md` and **must land before Task 2 of this plan**. The scanner branches on the three class-forms (`Attr::Static`, `Attr::Binding`, `Attr::Macro`) exactly as the compiler routes them.

**Tech Stack:** Rust 2021 (`aihu-css-core` crate), `insta` snapshot tests, `serde` + `serde_json` (AST deserialization), TypeScript via `rolldown`, Bun runtime, Moon orchestrator. Browser baseline Chrome/Edge 113+, Safari 16.4+, Firefox 113+ (per ratified `decision-baseline-browser-window`).

**Scope boundary:**
- ✅ AST scanner consuming `SfcAst` from `@aihu/compiler`; replaces the stub class-list input
- ✅ Full Tailwind v4 utility table (colors, spacing, layout, typography, borders, effects) + arbitrary-value bracket syntax (`bg-[#1a1d24]`, `w-[34ch]`)
- ✅ Scoped-output emitter: per-SFC CSS embedded in shadow DOM, no global utility stylesheet
- ✅ WC-native variants: `host:`, `host-context-dark:`, `slotted:`, `slotted-img:`, `part-*:`
- ✅ Standard variants: `hover:`, `focus:`, `dark:` (custom-property cascade, NOT `:host-context()`), `md:`, `[&>div]:` arbitrary-selector
- ✅ `@theme` directive parser + token registration; aihu brand tokens baked as default
- ✅ AST-hashed per-SFC compilation cache (incremental rebuild < 30 ms)
- ❌ NO style packs as separate CSS files (Plan 3)
- ❌ NO progressive features (`view-transition:`, `anchor:`, `popover:`, `text-balance:`) (Plan 3)
- ❌ NO `cn()` runtime (Plan 3)
- ❌ NO `@aihu/primitives` / `@aihu/ui` (Plans 4–5)

**Reference spec:** Architect R7.1 CSS-engine spec `22d3a66e-e7fe-4fce-a191-1c003abb70fa` (§2.3 milestone `css-2`, §3 edges #1/#5, §4 decisions). AST contract: `docs/superpowers/specs/compiler-ast-export-hook.md`. Compiler ground truth: `packages/compiler/src/parser/directives.rs`, `types.rs`.

**Maps to plan-items** (milestone group `css-2` in plan `aihu-v1-css-engine`; per-item slugs are not addressable — items referenced by title):

| Task | `css-2` item title | Priority |
|---|---|---|
| 2 | AST-consuming scanner in aihu-css-core replaces stub class-list input | HIGH |
| 3 | Full Tailwind v4 utility table ported into tokens.rs / generated table | HIGH |
| 4 | Scoped-output emitter: per-SFC CSS embedded in shadow DOM, no global utility stylesheet | HIGH |
| 5 | WC-native variants: host:, host-context-dark:, slotted:, slotted-img:, part-*: | HIGH |
| 6 | Standard Tailwind variants: hover:, focus:, dark:, md:, [&>div]: | HIGH |
| 7 | @theme directive parser + token registration; aihu brand tokens baked as default | MEDIUM |
| 8 | AST-hashed per-SFC compilation cache for incremental rebuilds | MEDIUM |

---

## File Structure

This plan creates or modifies the following files (all under `packages/css-engine/`):

**Depends on (must exist first):**
- `@aihu/compiler` `compileToAst(source): SfcAst` export + `aihu-compile --ast-json` flag (bridge item `v1.0.10a-compiler-ast-export`)

**Create under `packages/css-engine/crates/aihu-css-core/src/`:**
- `ast.rs` — serde `Deserialize` mirror of `SfcAst` / `SfcNode` / `SfcAttr` (the JSON the compiler emits)
- `scanner.rs` — walks `SfcAst` template, extracts the dedup'd utility set + macro-class set
- `variants.rs` — variant prefix parser + selector resolver (WC-native + standard)
- `emit.rs` — scoped-output emitter (`:host`-embedded per-SFC CSS)
- `theme.rs` — `@theme` directive parser + token registry
- `cache.rs` — AST-hashed per-SFC compilation cache

**Modify:**
- `crates/aihu-css-core/src/lib.rs` — new `compile_sfc(ast: &SfcAst) -> String` entry; keep `compile_classes` for back-compat
- `crates/aihu-css-core/src/tokens.rs` — expand bootstrap subset to the full Tailwind v4 table (or move to a generated table)
- `crates/aihu-css-core/src/bin/main.rs` — accept `--ast-json` stdin (an `SfcAst`) in addition to the Plan 1 class-list mode
- `crates/aihu-css-core/Cargo.toml` — already has `serde`/`serde_json` from Plan 1; no change expected
- `src/index.ts` — new `compileSfc(source: string): string` that pipes `compileToAst` output into the Rust scanner
- `tests/` + `crates/.../tests/snapshots/` — new fixtures + insta snapshots

**NOT modified:** `.size-limit.json` (engine remains build-time-only; no browser-bundle row per `.size-limit.README.md` and ratified `decision-browser-size-budget-impact`).

---

## Task 1: Precheck — Plan 1 green, AST hook landed, clean tree

**Files:** none — verification only

- [ ] **Step 1: Confirm Plan 1 acceptance still passes**

Run from `c:/git/fellwork/aihu`:
```
cargo test -p aihu-css-core
cargo test -p aihu-compiler
```
Expected: Plan 1's 3 css-core tests pass; all compiler tests pass.

- [ ] **Step 2: Confirm the AST hook exists**

The bridge item `v1.0.10a-compiler-ast-export` MUST be landed first. Verify:
```
echo '@template { <button class="btn">Go</button> }' | target/release/aihu-compile --stdin --tag Probe --ast-json
```
Expected: a JSON object with `"tag":"Probe"` and an `attrs` array containing `{ "kind": "static", "name": "class", "value": "btn" }`.

If the `--ast-json` flag is unknown, **stop**: Plan 2 is blocked on `v1.0.10a-compiler-ast-export`. Do not proceed; route the AST-hook Builder mini-track first (see `docs/superpowers/specs/compiler-ast-export-hook.md`).

- [ ] **Step 3: Clean working tree**

Run: `git -C c:/git/fellwork/aihu status` — expect clean (or only the Plan 2 docs). If dirty, ask the user before proceeding.

---

## Task 2: AST-consuming scanner replaces stub class-list input

> Maps to `css-2` item **"AST-consuming scanner in aihu-css-core replaces stub class-list input"** (HIGH). Depends on `css-1-ts-layer-e2e` + `v1.0.10a-compiler-ast-export`.

**Files:**
- Create: `crates/aihu-css-core/src/ast.rs`
- Create: `crates/aihu-css-core/src/scanner.rs`
- Modify: `crates/aihu-css-core/src/lib.rs`

- [ ] **Step 1: Write the failing scanner test (TDD)**

Create `crates/aihu-css-core/tests/scanner.rs`:
```rust
use aihu_css_core::{scan_ast, SfcAst};

fn fixture_ast() -> SfcAst {
    // Deserialized from the compiler's --ast-json output for:
    //   <button class="base" $class={cn('btn', size)} $class:loading={busy}>Go</button>
    serde_json::from_str(include_str!("fixtures/button.ast.json")).unwrap()
}

#[test]
fn extracts_static_form_a() {
    let set = scan_ast(&fixture_ast());
    assert!(set.contains("base"));
}

#[test]
fn extracts_binding_string_literals_form_b() {
    let set = scan_ast(&fixture_ast());
    assert!(set.contains("btn")); // string literal inside cn('btn', size)
    assert!(!set.contains("size")); // identifier — not statically resolvable
}

#[test]
fn extracts_macro_class_toggle_form_c() {
    let set = scan_ast(&fixture_ast());
    assert!(set.contains("loading")); // from $class:loading={busy}
}

#[test]
fn skips_non_class_macros() {
    // $on.click / $if must never enter the utility set
    let set = scan_ast(&fixture_ast());
    assert!(!set.iter().any(|c| c.contains("click") || c == "if"));
}
```

Create `crates/aihu-css-core/tests/fixtures/button.ast.json` from the real `aihu-compile --ast-json` output (Task 1 Step 2 confirms the shape).

- [ ] **Step 2: Implement `ast.rs` — the serde `Deserialize` mirror**

Mirror the wire format from `docs/superpowers/specs/compiler-ast-export-hook.md` §4.1. Use serde tagged enums so `kind`/`form` discriminators map to Rust variants:
```rust
#[derive(Debug, Deserialize)]
pub struct SfcAst {
    pub tag: String,
    pub style: Option<SfcStyleBlock>,
    pub template: Option<Vec<SfcNode>>,
    pub meta: SfcMeta,
    #[serde(rename = "astVersion")]
    pub ast_version: u32,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SfcAttr {
    Static { name: String, value: String },          // Form A
    Binding { name: String, expr: String },           // Form B
    Macro { name: String, value: SfcMacroValue },      // Form C (+ on:/bind:/if/…)
}
// … SfcNode, SfcMacroValue, SfcStyleBlock, SfcMeta likewise
```
Assert `ast_version == 1` on entry; reject mismatches with a clear error (the §6 Q3 evolution policy).

- [ ] **Step 3: Implement `scanner.rs` — branch on the three forms**

The scanner walks `template` recursively and collects a `BTreeSet<String>` (sorted, dedup'd) of utility class literals. Per `docs/superpowers/specs/compiler-ast-export-hook.md` §3:
- **`SfcAttr::Static { name: "class", value }`** → split `value` on ASCII whitespace; push each token.
- **`SfcAttr::Binding { name: "class", expr }`** → if `expr.trim_start().starts_with('[')`, parse array elements and push string-literal elements; else extract embedded string literals from the scalar expr. Track unresolved identifiers in a separate `unresolved: Vec<String>` for `aihu css doctor` diagnostics later.
- **`SfcAttr::Macro { name, .. }`** where `name.starts_with("class:")` → push `name.strip_prefix("class:")`.
- **Any other `SfcAttr`** (`on:click`, `if`, `bind:value`, non-`class` static/binding) → ignore.
- **Component / `macroElement` nodes** → skip their `class` attrs (they own their own shadow scope — edge E10).

- [ ] **Step 4: Wire `compile_sfc` in `lib.rs`**

```rust
pub fn compile_sfc(ast: &SfcAst) -> String {
    let classes = scan_ast(ast); // BTreeSet<String>
    compile_classes(&classes.into_iter().collect::<Vec<_>>())
}
```
Keep `compile_classes` exported (Plan 1 back-compat). Re-export `scan_ast`, `SfcAst`.

- [ ] **Step 5: Tests green, commit**

Run: `cargo test -p aihu-css-core` — expect all scanner tests + Plan 1 tests pass.
```
git add crates/aihu-css-core/src/ast.rs crates/aihu-css-core/src/scanner.rs crates/aihu-css-core/src/lib.rs crates/aihu-css-core/tests/scanner.rs crates/aihu-css-core/tests/fixtures/button.ast.json
git commit -m "feat(css-engine): AST-consuming scanner over SfcAst (three class-forms)"
```

---

## Task 3: Port the full Tailwind v4 utility table

> Maps to `css-2` item **"Full Tailwind v4 utility table ported into tokens.rs / generated table"** (HIGH). Depends on the scanner (Task 2).

**Files:**
- Modify: `crates/aihu-css-core/src/tokens.rs`
- Create (optional): `crates/aihu-css-core/build.rs` + `crates/aihu-css-core/utility-table.csv` if generating the table

- [ ] **Step 1: Decide hand-table vs generated table**

The bootstrap `tokens.rs` (Plan 1) is a `match` over ~12 literals. The full table is ~hundreds of utilities across 6 categories (colors, spacing, layout, typography, borders, effects). Choose:
- **(a) Generated table:** a `build.rs` that reads a checked-in `utility-table.csv` (or a Tailwind v4 reference dump) and emits a static `phf`/`match` map. Cleaner for maintenance and the hard-fork stance (`decision-css-hard-fork-vs-upstream`: "we take inspiration on new utility additions, not source merges").
- **(b) Hand-expanded `match`:** simpler, but a wall of literals.

Recommendation: **(a)** for colors/spacing/typography (regular grids), **(b)** for the long tail. Document the choice in `tokens.rs` header.

- [ ] **Step 2: Implement arbitrary-value bracket syntax**

`bg-[#1a1d24]`, `w-[34ch]`, `text-[14px]` — the value inside `[...]` is emitted verbatim into the property. Add a `parse_arbitrary(class) -> Option<(prop, value)>` helper that splits on the first `-[` and trims the trailing `]`. Map the prefix (`bg`, `w`, `text`) to its CSS property.

- [ ] **Step 3: Snapshot the category coverage**

Add insta snapshots per category (`tests/snapshot.rs`): one `compile_classes` call per category exercising ~5 representative utilities + one arbitrary-value class. Run `cargo insta accept --package aihu-css-core`.

- [ ] **Step 4: Commit**
```
git add crates/aihu-css-core/src/tokens.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): full Tailwind v4 utility table + arbitrary-value brackets"
```

---

## Task 4: Scoped-output emitter (`:host`-embedded per-SFC CSS)

> Maps to `css-2` item **"Scoped-output emitter: per-SFC CSS embedded in shadow DOM, no global utility stylesheet"** (HIGH). Depends on Task 3. Ratifies `decision-css-output-strategy` + `decision-baseline-browser-window`.

**Files:**
- Create: `crates/aihu-css-core/src/emit.rs`
- Modify: `crates/aihu-css-core/src/lib.rs`

- [ ] **Step 1: Define the two output modes**

`OutputMode::Flat` (Plan 1 default — `.class { ... }` rules) and `OutputMode::Scoped` (new default for `compile_sfc`). Scoped mode wraps the emitted rules so they live inside the SFC's shadow root — there is NO global utility stylesheet. Each SFC's CSS is self-contained.

- [ ] **Step 2: Implement scoped emission**

Per spec §6.3 (scoped-output). Emit native CSS nesting (allowed by the baseline browser window — Chrome/Edge 113+, Safari 16.4+, Firefox 113+; ratified `decision-baseline-browser-window`). The output is a single CSS string the compiler folds into the component's `<style>` inside the shadow root (no runtime injection — preserves the "vanilla custom elements, no hydration" thesis). Fold the authored `@style` block content (from `SfcAst.style.content` when `scope == "scoped"`) into the same output; pass `scope == "global"` content through unscoped (edge E6).

- [ ] **Step 3: Snapshot scoped vs flat**

Add insta snapshots covering: (a) flat output for a class list; (b) scoped output for a real SFC AST; (c) an SFC with a scoped `@style` block folded in; (d) an SFC with a `$global` style block passed through. Accept snapshots.

- [ ] **Step 4: Commit**
```
git add crates/aihu-css-core/src/emit.rs crates/aihu-css-core/src/lib.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): scoped shadow-DOM output emitter (no global utility sheet)"
```

---

## Task 5: WC-native variants (`host:`, `host-context-dark:`, `slotted:`, `slotted-img:`, `part-*:`)

> Maps to `css-2` item **"WC-native variants: host:, host-context-dark:, slotted:, slotted-img:, part-*:"** (HIGH). Depends on Task 4. Ratifies `decision-firefox-host-context-workaround`.

**Files:**
- Create: `crates/aihu-css-core/src/variants.rs`
- Modify: `crates/aihu-css-core/src/scanner.rs` (split prefix from base class), `crates/aihu-css-core/src/emit.rs`

- [ ] **Step 1: Parse variant prefixes**

A utility class may carry one or more `variant:` prefixes (`host:bg-primary`, `slotted-img:rounded-lg`, `part-thumb:bg-accent`). Add `split_variants(class) -> (Vec<Variant>, base_class)` to `variants.rs`. The scanner (Task 2) must store the FULL prefixed token so this split happens at emit time.

- [ ] **Step 2: Map each WC-native variant to its selector**

| Variant | Emitted selector form | Notes |
|---|---|---|
| `host:` | `:host { ... }` | the component element itself |
| `host-context-dark:` | custom-property cascade toggle (NOT `:host-context()`) | per `decision-firefox-host-context-workaround` — Firefox lacks `:host-context()`; emit a `--`-prefixed token toggle scoped to `:root`/`.dark` instead |
| `slotted:` | `::slotted(*) { ... }` | slotted light-DOM children |
| `slotted-img:` | `::slotted(img) { ... }` | slotted images specifically |
| `part-<name>:` | `::part(<name>) { ... }` | exposed shadow parts |

- [ ] **Step 2a: Implement the `host-context-dark:` custom-property cascade**

This is the load-bearing Firefox workaround. `host-context-dark:bg-surface` must NOT compile to `:host-context(.dark)` (unsupported in Firefox). Instead emit the dark value behind an inherited custom property that the consumer toggles in `:root`/`.dark` scope. Document the consumer contract in the variant's doc comment + a snapshot.

- [ ] **Step 3: Variant resolver tests**

One test per variant in `tests/variants.rs` asserting the emitted selector. Add an insta snapshot for a multi-variant SFC. Accept snapshots.

- [ ] **Step 4: Commit**
```
git add crates/aihu-css-core/src/variants.rs crates/aihu-css-core/src/scanner.rs crates/aihu-css-core/src/emit.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): WC-native variants (host/slotted/part) + Firefox-safe dark cascade"
```

---

## Task 6: Standard Tailwind variants (`hover:`, `focus:`, `dark:`, `md:`, `[&>div]:`)

> Maps to `css-2` item **"Standard Tailwind variants: hover:, focus:, dark:, md:, [&>div]:"** (HIGH). Depends on Task 4 (and reuses Task 5's `split_variants`). Ratifies `decision-firefox-host-context-workaround` for `dark:`.

**Files:**
- Modify: `crates/aihu-css-core/src/variants.rs`, `crates/aihu-css-core/src/emit.rs`

- [ ] **Step 1: Pseudo-class variants**

`hover:` → `:hover`, `focus:` → `:focus`, `focus-visible:`, `active:`, `disabled:` — append the pseudo-class to the base selector inside the scoped rule.

- [ ] **Step 2: `dark:` via custom-property cascade (NOT `:host-context()`)**

Per `decision-firefox-host-context-workaround`: `dark:bg-surface` compiles to a custom-property toggle in the consumer's `:root`/`.dark` scope, not a `:host-context(.dark)` selector. Reuse the Task 5 Step 2a mechanism. Add a snapshot proving no `:host-context` appears in `dark:` output.

- [ ] **Step 3: Responsive `md:` (and `sm:`/`lg:`/`xl:`/`2xl:`)**

Wrap the rule in `@media (min-width: <breakpoint>) { ... }`. Breakpoints come from the theme registry (Task 7) with sane defaults if no `@theme` overrides them.

- [ ] **Step 4: Arbitrary-selector `[&>div]:`**

`[&>div]:text-primary` → emit `& > div { color: ... }` (native nesting; `&` allowed by the baseline). Parse the bracket, substitute `&` for the host selector.

- [ ] **Step 5: Variant tests + snapshots, commit**

Test each variant; snapshot a class carrying stacked variants (`md:hover:bg-primary`). Accept.
```
git add crates/aihu-css-core/src/variants.rs crates/aihu-css-core/src/emit.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): standard variants (hover/focus/dark/md/arbitrary-selector)"
```

---

## Task 7: `@theme` directive parser + default aihu brand tokens

> Maps to `css-2` item **"@theme directive parser + token registration; aihu brand tokens baked as default"** (MEDIUM). Depends on Task 4.

**Files:**
- Create: `crates/aihu-css-core/src/theme.rs`
- Modify: `crates/aihu-css-core/src/emit.rs`, `crates/aihu-css-core/src/lib.rs`

- [ ] **Step 1: Parse `@theme { --color-primary: oklch(...); }` from a style block**

The `@theme` directive declares design tokens. Parse it from `SfcAst.style.content` (or a project-level theme file). Register each `--token: value` into a `ThemeRegistry`. Emit `oklch()` directly (allowed by the baseline — `decision-baseline-browser-window`).

- [ ] **Step 2: Bake aihu brand tokens as the default registry**

Seed the registry with the aihu brand tokens (extracted from `apps/docs/style.css` — the same source Plan 3's `aihu-default` style pack will use). `@theme` overrides merge over these defaults.

- [ ] **Step 3: Wire breakpoints into the registry**

The `md:`/`sm:`/etc. breakpoints (Task 6 Step 3) read from the theme registry so `@theme` can override them.

- [ ] **Step 4: Tests + snapshot, commit**

Snapshot a default-token compile and an `@theme`-override compile. Accept.
```
git add crates/aihu-css-core/src/theme.rs crates/aihu-css-core/src/emit.rs crates/aihu-css-core/src/lib.rs crates/aihu-css-core/tests
git commit -m "feat(css-engine): @theme directive parser + default aihu brand tokens"
```

---

## Task 8: AST-hashed per-SFC incremental compilation cache

> Maps to `css-2` item **"AST-hashed per-SFC compilation cache for incremental rebuilds"** (MEDIUM). Depends on Task 3.

**Files:**
- Create: `crates/aihu-css-core/src/cache.rs`
- Modify: `crates/aihu-css-core/src/lib.rs`

- [ ] **Step 1: Hash the AST + theme inputs**

Compute a stable hash over `(SfcAst, ThemeRegistry version)`. A change to either invalidates the cache entry. Use a fast non-cryptographic hash (e.g. `std::hash::DefaultHasher` or `fxhash`); the goal is change-detection, not security.

- [ ] **Step 2: Memoize compiled output keyed by hash**

`compile_sfc_cached(ast, &mut cache)` returns the prior output on a hash hit, recompiles + stores on a miss. Cache lives in-process (the Vite plugin / `aihu css build` holds it across the dev session).

- [ ] **Step 3: Prove the perf bar**

Add a bench/test: second compile of an unchanged SFC must be **sub-30 ms** (the `css-6-perf-bench` gate later asserts this across a 50-SFC fixture; here just prove the cache hit path is near-instant). Add a `tests/cache.rs` asserting a hit returns identical output and skips recompilation (e.g. via a recompile counter).

- [ ] **Step 4: Commit**
```
git add crates/aihu-css-core/src/cache.rs crates/aihu-css-core/src/lib.rs crates/aihu-css-core/tests/cache.rs
git commit -m "feat(css-engine): AST-hashed per-SFC incremental compilation cache"
```

---

## Task 9: TS bridge — `compileSfc(source)` end-to-end

**Files:**
- Modify: `packages/css-engine/src/index.ts`
- Modify: `crates/aihu-css-core/src/bin/main.rs`
- Create: `packages/css-engine/tests/sfc-e2e.test.ts` + fixture `.aihu` files

- [ ] **Step 1: Add `--ast-json` stdin mode to the css-compile binary**

`aihu-css-compile --ast-json` reads an `SfcAst` JSON from stdin (the output of `aihu-compile --ast-json`) and emits scoped CSS. Keep the Plan 1 class-list mode for back-compat.

- [ ] **Step 2: Implement `compileSfc(source: string): string` in TS**

Pipe: `compileToAst(source)` (from `@aihu/compiler`) → JSON → `aihu-css-compile --ast-json` → scoped CSS string. Mirror the subprocess pattern in `src/index.ts`'s existing `compile()`.

- [ ] **Step 3: End-to-end Vitest test**

Create `tests/sfc-e2e.test.ts`: compile a real fixture `.aihu` SFC (`<button class="bg-primary p-4" $class:loading={busy}>`) and assert the output contains scoped `:host`-wrapped rules for `bg-primary`, `p-4`, and `loading`.

- [ ] **Step 4: typecheck + build + commit**

Run `bun run typecheck`, `bun run build`, `bun run test` from `packages/css-engine/`.
```
git add packages/css-engine/src/index.ts crates/aihu-css-core/src/bin/main.rs packages/css-engine/tests
git commit -m "feat(css-engine): TS compileSfc() bridges compiler AST → scoped CSS"
```

---

## Task 10: Verify acceptance criteria

**Files:** none — verification only

The Plan 2 milestone (`css-2`) is complete when:

- [ ] `cargo test -p aihu-css-core` passes (scanner, tokens, emit, variants, theme, cache suites)
- [ ] `cargo test -p aihu-compiler` still passes (no regression from the AST hook)
- [ ] The scanner correctly distinguishes Form A (`Attr::Static`), Form B (`Attr::Binding`), Form C (`Attr::Macro` `class:`) — asserted by `tests/scanner.rs`
- [ ] Full utility table compiles all 6 categories + arbitrary-value brackets (snapshots)
- [ ] Scoped output contains NO global utility stylesheet; each SFC's CSS is `:host`-embedded
- [ ] WC-native + standard variants resolve to correct selectors; `dark:` / `host-context-dark:` emit a custom-property cascade with NO `:host-context()` in output
- [ ] `@theme` overrides merge over baked aihu brand tokens
- [ ] Second compile of an unchanged SFC is sub-30 ms (cache hit)
- [ ] `bun run test` / `typecheck` / `build` pass in `packages/css-engine/`
- [ ] `.size-limit.json` is unchanged (engine stays build-time-only)

If any fail, do not mark complete — fix in place or open a follow-up.

---

## Task 11: Hand off to Plan 3

**Files:** none

After Plan 2, the engine compiles a real `.aihu` SFC end-to-end: AST in, scoped CSS out, with the full utility table, all variants, theming, and incremental caching. **What it does NOT do yet:** ship style packs as CSS files, emit progressive `@supports`-gated features, or expose the `cn()` runtime helper. Plan 3 (`docs/superpowers/plans/2026-05-22-css-engine-plan-3-style-packs.md`) adds those.

---

## Anti-goals for Plan 2

- **Don't write style packs** (`aihu-default.css`, `aihu-graphite.css`) — Plan 3.
- **Don't add progressive features** (`view-transition:`, `anchor:`, `popover:`, `text-balance:`) — Plan 3. They need the `ProgressiveFeature` trait, not the variant resolver.
- **Don't build the `cn()` runtime** — Plan 3, once there is real utility output to merge.
- **Don't add a long-running daemon** for the binary unless the cache (Task 8) provably can't hit the perf bar — premature.
- **Don't emit legacy vendor prefixes or `@supports` fallback chains** — the ratified baseline window (`decision-baseline-browser-window`) lets us emit native nesting + `oklch()` directly.
- **Don't re-parse `.aihu` source with regex in the scanner** — consume the AST only (Risk #4). If the AST is missing data, extend `compileToAst`, don't regex around it.
- **Don't touch `packages/primitives` / `packages/ui`** — they don't exist until Plans 4–5.

---

## Self-review checklist (run after writing this plan)

- [ ] Every task maps to a named `css-2` item (table at top)
- [ ] The three class-forms (Static/Binding/Macro) are grounded in the real compiler routing (`directives.rs`) via the AST-hook spec
- [ ] The Firefox `:host-context()` workaround (`decision-firefox-host-context-workaround`) is honored in BOTH `host-context-dark:` and `dark:`
- [ ] Scoped output asserts NO global stylesheet (`decision-css-output-strategy`)
- [ ] `.size-limit.json` is explicitly NOT modified (`decision-browser-size-budget-impact`)
- [ ] Plan 2's hard dependency on `v1.0.10a-compiler-ast-export` is gated in Task 1 (stop-if-missing)
- [ ] No "TODO"/"TBD" in any task; each step has a concrete file + command/snapshot
