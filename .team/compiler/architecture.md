# Compiler Track Architecture Spec
**Document:** `.team/compiler/architecture.md`
**Role:** Architect
**Date:** 2026-04-30
**Track:** `compiler`
**Based on:** `plan-compiler.md`, `scout-report.md`, `director-notes/round-001-2026-04-30.md`

---

## 1. Rust Toolchain Bootstrap (C-0 Prerequisite)

### `.prototools`

Add one line to the existing `.prototools` at the repo root:

```
rust = "1.87.0"
```

Final file contents after modification:

```
bun = "1.3.8"
node = "22.12.0"
rust = "1.87.0"
```

### `rust-toolchain.toml`

Create at repo root. Exact contents:

```toml
[toolchain]
channel = "1.87.0"
```

This file is read by `cargo`, `rustup`, and `rust-analyzer`. Both the proto pin and this file must stay in sync at `1.87.0`.

### Cargo Workspace

There is no `Cargo.toml` at the repo root. `packages/compiler/` is a **standalone crate**, not a workspace member, for v0. Do not create a root `Cargo.toml`.

---

## 2. Package Structure — Phase C-0 Files

The Builder must create exactly these files for Phase C-0. No other files.

```
packages/compiler/
  Cargo.toml
  src/
    lib.rs
    types.rs
    parser/
      mod.rs
      sfc.rs
  tests/
    sfc_split.rs
```

### `packages/compiler/Cargo.toml` — Exact Contents

```toml
[package]
name    = "scribe-compiler"
version = "0.1.0"
edition = "2021"

[dev-dependencies]
insta = "1"
```

No runtime dependencies in Phase C-0. The splitter is pure string processing. The `insta` crate is dev-only.

### `packages/compiler/src/lib.rs` — Public API Surface

This file declares the public module tree and re-exports. Phase C-0 surface only:

```rust
pub mod parser;
pub mod types;

pub use types::{CompileError, ScribeSource, ScriptMeta};

pub fn compile(source: &str) -> Result<ScribeSource<'_>, CompileError> {
    parser::sfc::parse(source)
}
```

No implementation logic in `lib.rs`. Implementation lives in `parser/sfc.rs`.

### `packages/compiler/src/parser/mod.rs`

```rust
pub mod sfc;
```

No other modules in C-0. `template.rs` and `directives.rs` are Phase C-1 modules and must not be declared here.

### `packages/compiler/src/parser/sfc.rs`

Module responsible for the SFC block splitter. Public surface:

```rust
pub fn parse(source: &str) -> Result<crate::types::ScribeSource<'_>, crate::types::CompileError>
```

### `packages/compiler/tests/sfc_split.rs`

Integration test file. Contains all 5 named snapshot tests specified in Section 6. Uses `insta::assert_debug_snapshot!`.

---

## 3. Core Types — Phase C-0

### File: `packages/compiler/src/types.rs`

The Builder must produce exactly these types. No additional fields may be added or removed in Phase C-0 without a spec amendment.

```rust
#[derive(Debug, PartialEq)]
pub struct ScribeSource<'a> {
    pub script:   Option<&'a str>,
    pub template: Option<&'a str>,
    pub style:    Option<&'a str>,
}

#[derive(Debug, PartialEq)]
pub struct ScriptMeta {
    pub name: Option<String>,
}

#[derive(Debug)]
pub struct CompileError {
    pub message: String,
    pub line:    usize,
    pub col:     usize,
}
```

**Trait requirements:**
- `ScribeSource<'a>`: derive `Debug` and `PartialEq` — required for `insta` snapshot assertions.
- `ScriptMeta`: derive `Debug` and `PartialEq`.
- `CompileError`: derive `Debug`. Must implement `std::fmt::Display` and `std::error::Error`. Display format: `"line {line}, col {col}: {message}"`.

---

## 4. Public API Contract — `compile()`

### Signature

```rust
pub fn compile(source: &str) -> Result<ScribeSource<'_>, CompileError>
```

The lifetime `'_` ties returned string slices directly to the input `source`. No heap allocation for block content.

### Behavior Contract

| Input | Expected result |
|---|---|
| Valid source with all three blocks | `Ok(ScribeSource { script: Some(s), template: Some(t), style: Some(u) })` — inner content, tags excluded, whitespace trimmed |
| Empty string or no recognized blocks | `Ok(ScribeSource { script: None, template: None, style: None })` — not an error |
| `<script setup>` only | `Ok(ScribeSource { script: Some(s), template: None, style: None })` |
| Duplicate block tags | `Err(CompileError { message: "duplicate <template> block", line: L, col: 0 })` |
| Unclosed tag | `Err(CompileError { message: "unclosed <template> block", line: L, col: 0 })` — never panics |

**Tag stripping:** Opening and closing block tags are excluded from the returned slices.

**Whitespace trimming:** `str::trim()` applied to each block's inner content. Internal whitespace preserved exactly.

---

## 5. SFC Block Splitter Algorithm

### Recognized Block Tags

| Block | Opening tag | Closing tag |
|---|---|---|
| script | `<script setup` (may have additional attributes) | `</script>` |
| template | `<template>` | `</template>` |
| style | `<style>` (may have additional attributes) | `</style>` |

A plain `<script>` tag (without `setup`) is not recognized. This matches the Vue SFC convention.

### Case Sensitivity

Block detection is **case-sensitive**. `<Template>`, `<SCRIPT SETUP>` are not recognized. v0 only accepts lowercase.

### Attribute Extraction — `name` Attribute

When encountering `<script setup`, extract the `name` attribute if present.

```rust
fn extract_script_meta(tag_text: &str) -> ScriptMeta
// e.g., "<script setup name=\"x-counter\">" → ScriptMeta { name: Some("x-counter") }
// "<script setup>" → ScriptMeta { name: None }
```

`ScriptMeta` is computed internally in Phase C-0 but not yet exposed in `ScribeSource`. It will be wired into the public API in Phase C-3.

### Duplicate Block Handling

Second occurrence of same block type → `Err(CompileError)`. Never silently takes first or last. Error message: `"duplicate <template> block"`, `"duplicate <script setup> block"`, or `"duplicate <style> block"`.

### Depth Tracking for Nested Tags

The splitter tracks nesting depth to find the correct closing tag for `<template>` blocks (which may contain inner `<template>` tags). Same logic applies to `<style>`. `<script>` depth tracking not required in v0.

### Ordering and Inter-Block Text

Blocks may appear in any order. Text between blocks is silently discarded.

---

## 6. Named Snapshot Test Cases — Phase C-0

All five in `packages/compiler/tests/sfc_split.rs`. Use `insta::assert_debug_snapshot!`. Run `cargo insta accept` after first passing run to commit `.snap` files. The committed `.snap` files are part of the deliverable.

### Test 1: `split_valid_full`

**Input:**
```
<script setup>
import { signal } from '@scribe/signals'

const [count, setCount] = signal(0)
</script>

<template>
  <div>{{ count }}</div>
</template>

<style>
div { color: red; }
</style>
```

**Expected:** `script=Some("import { signal } from '@scribe/signals'\n\nconst [count, setCount] = signal(0)")`, `template=Some("<div>{{ count }}</div>")`, `style=Some("div { color: red; }")`

### Test 2: `split_missing_template`

**Input:**
```
<script setup>
const x = 1
</script>
```

**Expected:** `script=Some("const x = 1")`, `template=None`, `style=None`

### Test 3: `split_missing_script`

**Input:**
```
<template>
  <span>hello</span>
</template>
```

**Expected:** `script=None`, `template=Some("<span>hello</span>")`, `style=None`

### Test 4: `split_extra_whitespace`

**Input** (leading blank lines, extra blank lines between and within blocks):
```


<script setup>

  const y = 2

</script>


<template>

  <p>text</p>

</template>


```

**Expected:** `script=Some("const y = 2")`, `template=Some("<p>text</p>")`, `style=None`

### Test 5: `split_style_only`

**Input:**
```
<style>
body { margin: 0; }
</style>
```

**Expected:** `script=None`, `template=None`, `style=Some("body { margin: 0; }")` — no panic.

---

## 7. Phase C-3 TypeScript Emit Target — Acceptance Snapshot

### Input: `counter.scribe`

```scribe
<script setup>
import { signal } from '@scribe/signals'

const [count, setCount] = signal(0)
const increment = () => setCount(c => c + 1)
</script>

<template>
  <div class="counter">
    <span>{{ count }}</span>
    <button @click="increment">+</button>
  </div>
</template>
```

### Required Output: `counter.ts`

```typescript
import { branch, leaf } from '@scribe/arbor'
import type { Signal } from '@scribe/signals'
import { signal } from '@scribe/signals'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('counter', defineComponent((_ctx) => {
  const [count, setCount] = signal(0)
  const increment = () => setCount(c => c + 1)

  return branch('div', { class: 'counter' }, [
    branch('span', null, [leaf([count, setCount] as unknown as Signal<string>)]),
    branch('button', { onclick: increment }, [leaf('+')])
  ])
}))
```

### Locked Design Decisions

**`as unknown as Signal<string>` cast:** `leaf()` accepts `Signal<string>`. The signal `[count, setCount]` is `Signal<number>`. TypeScript doesn't allow a direct cast — `as unknown` as intermediate is required. At runtime, `leaf()` discriminates by `Array.isArray(value)`, so the type parameter is irrelevant. v0 workaround; v1 widens `leaf()` to `Signal<unknown>`.

**`_ctx` parameter:** `Setup` type receives `ctx: SetupContext`. When unused, the underscore prefix suppresses TypeScript's `noUnusedParameters` warning. All generated setup functions must use `_ctx`.

**`import type { Signal }` vs. `import { Signal }`:** `Signal` is type-only — erased at build. `import type` ensures zero runtime bytes. The value import `import { signal }` is separate.

**`import { signal }` passthrough:** The compiler passes the entire `<script setup>` import block through verbatim. It does not analyze which imports are used in the template.

**`defineElement` at module level:** Calls `customElements.define()` as a side-effect. Returns void. Must be at the top level of the emitted file, not inside any function. No `export default`.

**Tag name derivation:** Filename stem (`counter` from `counter.scribe`). Optional explicit override via `name` attribute on `<script setup>`. v0 warning if no hyphen in tag name: `"warning: tag name '{name}' has no hyphen — custom element names should contain a hyphen per the web spec"`. No error — proceed anyway.

**Root fragment handling:** Multiple root children → `branch(null, null, [...children])`. Not an error.

---

## 8. Acceptance Criteria — All Phases

### Phase C-0: Scaffold + SFC Block Splitter

| # | Criterion | Check |
|---|---|---|
| C0-1 | `packages/compiler/Cargo.toml` with `name = "scribe-compiler"`, `edition = "2021"` | `grep 'scribe-compiler' packages/compiler/Cargo.toml` |
| C0-2 | `.prototools` contains `rust = "1.87.0"` | `grep 'rust = "1.87.0"' .prototools` |
| C0-3 | `rust-toolchain.toml` at repo root with `channel = "1.87.0"` | `grep 'channel = "1.87.0"' rust-toolchain.toml` |
| C0-4 | `cargo test` exits 0 | `cd packages/compiler && cargo test` |
| C0-5 | All 5 named snapshot functions present | `grep -E "fn split_(valid_full|missing_template|missing_script|extra_whitespace|style_only)" packages/compiler/tests/sfc_split.rs` |
| C0-6 | Snapshot `.snap` files committed | `ls packages/compiler/tests/snapshots/` |
| C0-7 | `cargo clippy -- -D warnings` exits 0 | `cd packages/compiler && cargo clippy -- -D warnings` |
| C0-8 | `cargo fmt --check` exits 0 | `cd packages/compiler && cargo fmt --check` |
| C0-9 | No files outside `packages/compiler/`, `.prototools`, `rust-toolchain.toml` modified | `git diff --name-only HEAD` |
| C0-10 | `CompileError` implements `std::error::Error` | Build passes |
| C0-11 | `compile("")` returns `Ok(ScribeSource { script: None, template: None, style: None })` | Unit test |

### Phase C-1: Template Parser

| # | Criterion | Check |
|---|---|---|
| C1-1 | `TemplateNode` and `Attr` enums with all variants in `types.rs` | `cargo check` |
| C1-2 | `pub meta: ScriptMeta` field in `ScribeSource<'a>`; all 5 existing sfc_split snapshots re-accepted with `meta` field present | `cargo insta review` |
| C1-3 | `parse_template(input: &str) -> Result<Vec<TemplateNode>, CompileError>` in `parser/template.rs` | `cargo check` |
| C1-4 | All 10 named snapshot tests in `tests/template_parse.rs` passing; `.snap` files committed | `cargo test` |
| C1-5 | `v-show` (or any unknown `v-` directive) → `Err` with message containing `"unknown directive 'v-show'"` | Test case |
| C1-6 | `v-if` / `v-for` → `Err` with exact message `"v-if / v-for directives are not supported in v0; see v1 roadmap"` | Test case |
| C1-7 | Self-closing tag → `Err` with message `"self-closing tags are not supported in v0 template parser"` | Test case |
| C1-8 | Interpolation with non-identifier content → `Err` with message `"interpolation must be a single identifier in v0; expressions are not supported"` | Test case |
| C1-9 | `parser/mod.rs` declares `pub mod directives; pub mod sfc; pub mod template;` in alphabetical order | File check |
| C1-10 | `lib.rs` re-exports `Attr`, `CompileError`, `ScribeSource`, `ScriptMeta`, `TemplateNode` | `cargo check` |
| C1-11 | `cargo clippy -- -D warnings` and `cargo fmt --check` clean; no files outside `packages/compiler/` modified | CI |

### Phase C-2: Signal Identity Resolver

| # | Criterion | Check |
|---|---|---|
| C2-1 | `SignalMap` in `src/codegen/signals.rs` maps read-name to write-name | `cargo check` |
| C2-2 | `const [foo, setFoo] = signal(...)` → `SignalMap { "foo" => "setFoo" }` | Unit test |
| C2-3 | Non-signal var not in `SignalMap` | Unit test |
| C2-4 | Multiple signals all captured | Unit test |
| C2-5 | 6 snapshot tests passing | `cargo test` |
| C2-6 | Clippy + fmt clean | — |

### Phase C-3: Codegen

| # | Criterion | Check |
|---|---|---|
| C3-1 | `tests/snapshots/counter.scribe.snap` matches exact TypeScript in Section 7 | `cargo test` |
| C3-2 | Emitted TypeScript compiles without error | `bun tsc --noEmit` on emitted output |
| C3-3 | 10 snapshot tests in `tests/codegen.rs`, all passing | `cargo test` |
| C3-4 | `@click` → `{ onclick: fn }` (not `{ click: fn }`) | Snapshot assertion |
| C3-5 | Signal in `{{ }}` → `leaf([read, write] as unknown as Signal<string>)` | Snapshot assertion |
| C3-6 | Plain var in `{{ }}` → `leaf(varName)` (no cast) | Snapshot assertion |
| C3-7 | `<style>` block → warning to stderr, not in output | Snapshot + stderr |
| C3-8 | `_ctx` in all generated `defineComponent` calls | Snapshot assertion |
| C3-9 | `import type { Signal }` in emitted imports when signals used | Snapshot assertion |
| C3-10 | No `export default` in emitted output | Snapshot assertion |
| C3-11 | Clippy + fmt clean | — |

> **Consumer constraint — `_setMount`:** `defineComponent` relies on `_setMount(mount)` injection from `@scribe/runtime`. Any application consuming compiler-emitted `.scribe` components must call `_setMount(mount)` once at app boot, before any custom element connects. The compiler does not emit this call. This is an application bootstrap requirement, not a compiler concern. Consider adding a comment to emitted code in Phase C-4.

### Phase C-4: CLI + Vite Integration

| # | Criterion | Check |
|---|---|---|
| C4-1 | `scribe-compile counter.scribe` → TypeScript to stdout | Manual |
| C4-2 | `scribe-compile counter.scribe --out dist/` → `dist/counter.ts` | Manual |
| C4-3 | Exit code 1 on error with `file:line: message` on stderr | Manual |
| C4-4 | `@scribe/compiler` npm package exports `transform(source, id): { code, map }` | `bun run test` |
| C4-5 | Vite transform hook registered for `*.scribe` | Integration test |
| C4-6 | `bun vite build` with `.scribe` component → valid `dist/` | Integration test |
| C4-7 | Source map maps back to `.scribe` source lines | Devtools check |

---

## 9. File Ownership and Safety Matrix

### Writable (compiler track)

| Path | Notes |
|---|---|
| `packages/compiler/` | New — fully owned by compiler track |
| `.prototools` | Add `rust = "1.87.0"` line only; do not modify `bun` or `node` lines |
| `rust-toolchain.toml` (repo root) | New file |
| `.team/compiler/` | Track working documents |

### Read-Only (compiler track must not modify)

| Path | Owner |
|---|---|
| `packages/arbor/` | Core package |
| `packages/runtime/` | Core package |
| `packages/signals/` | Core package |
| `packages/server/` | Core package |
| `packages/agent-readiness/` | Core package |
| `packages/*/tests/compliance/` | Round N+2 test-quality track |
| `demo/` | Round N+2 test-quality track |
| `scripts/` | Round N+2 test-quality track |
| `AGENTS.*.db` | Agent framework infrastructure |
| `.mcp.json` | Agent framework infrastructure |
| `package.json` (root) | Do not modify |
| `bun.lock` | Do not modify |

---

## 10. Open Questions — All Resolved

| OQ | Resolution |
|---|---|
| OQ-C1: Template syntax | Option A — HTML-first, scribe directives as thin transform layer |
| OQ-C2: Interpolation | `{{ identifier }}` only in v0; expressions are a compile error |
| OQ-C3: Signal identity | Naming convention: `[foo, setFoo] = signal(...)` |
| OQ-C4: Event binding | `@click` → `{ onclick: fn }` |
| OQ-C5: Conditionals/lists | Compile error: `"v-if / v-for directives are not supported in v0; see v1 roadmap"` |
| OQ-C6: Tag name | Filename stem; optional `name` attribute on `<script setup>` |
| OQ-C7: Scoped styles | Warn to stderr, ignore in output |
| OQ-C8: Source maps | Deferred to Phase C-4 |
| OQ-C9: Emit pattern | Option A — `defineElement('tag', defineComponent((_ctx) => { ... }))` |
| OQ-C10: `leaf()` Signal type | `as unknown as Signal<string>` cast in emitted code |
| OQ-C11: Rust toolchain | `rust = "1.87.0"` in `.prototools` + `rust-toolchain.toml` at root |

---

---

## 11. ScribeSource Amendment — Phase C-1

### 11.1 Amended `types.rs`

Add `pub meta: ScriptMeta` field to `ScribeSource<'a>`:

```rust
#[derive(Debug, PartialEq)]
pub struct ScribeSource<'a> {
    pub script:   Option<&'a str>,
    pub template: Option<&'a str>,
    pub style:    Option<&'a str>,
    pub meta:     ScriptMeta,
}
```

Add `TemplateNode` and `Attr` enums to `types.rs`:

```rust
#[derive(Debug, PartialEq)]
pub enum TemplateNode {
    Element { tag: String, attrs: Vec<Attr>, children: Vec<TemplateNode> },
    Text(String),
    Interpolation(String),
}

#[derive(Debug, PartialEq)]
pub enum Attr {
    Static  { name: String, value:   String },
    Binding { name: String, expr:    String },
    Event   { name: String, handler: String },
}
```

**Design constraint: `TemplateNode` and `Attr` use owned `String` throughout — not `&'a str` slices.** Text node content and interpolation identifiers are produced by stripping delimiters (`{{`, `}}`), not by pointing into contiguous substrings of the source. Carrying `'a` lifetime slices into `TemplateNode` would bind the AST lifetime to the source string and complicate the C-2/C-3 pipeline.

### 11.2 Amended `sfc.rs`

At the line that currently reads `let _meta = extract_script_meta(tag_text)`, store the result and include it in the `ScribeSource` return value. When no `<script setup>` block is present, supply `meta: ScriptMeta { name: None }`.

### 11.3 Snapshot Re-acceptance

After amending `ScribeSource`, run `cargo insta accept` to re-accept all 5 existing sfc_split snapshots. The Verifier must confirm `meta` appears in all 5 re-accepted `.snap` files — `meta: ScriptMeta { name: None }` in all five (no existing test uses the `name` attribute on `<script setup>`).

---

## 12. Template Parser Algorithm — Phase C-1

### 12.1 Parsing Strategy

**Recursive descent. Hand-rolled. No third-party HTML parser crate. No event-driven (SAX-style) parsing.**

Public function:

```rust
pub fn parse_template(input: &str) -> Result<Vec<TemplateNode>, CompileError>
```

Private recursive helpers live in `parser/template.rs`. Directive helpers and identifier validation live in `parser/directives.rs`.

### 12.2 Tokenization

No separate token stream or token enum. The parser maintains a `pos: usize` cursor into the `&str` input, scanning for character boundaries directly — consistent with `sfc.rs` approach.

### 12.3 Text and Interpolation Splitting

Within content between element tags, scan for `{{` / `}}` boundaries:

1. Characters before the first `{{` → `TemplateNode::Text(s)` (if non-empty; preserve internal whitespace).
2. Span matching `{{ ... }}` (optional whitespace inside) → `TemplateNode::Interpolation(identifier)` — see 12.4.
3. Characters after `}}` before the next `<` or `{{` → another `TemplateNode::Text(s)`.
4. Multiple `Text` and `Interpolation` nodes may appear as siblings in a parent's `children` vec.

### 12.4 Identifier Validation

1. Strip `{{` and `}}` delimiters.
2. Apply `str::trim()` to the interior.
3. Validate against `[a-zA-Z_][a-zA-Z0-9_]*`.
4. If the trimmed result contains whitespace or does not match the pattern, return:

```
Err(CompileError { message: "interpolation must be a single identifier in v0; expressions are not supported", ... })
```

### 12.5 Attribute Prefix Discrimination

| Prefix | Result | Detail |
|--------|--------|--------|
| `@` | `Attr::Event { name, handler }` | Strip `@`, split on `=`; strip surrounding `"` from value |
| `:` | `Attr::Binding { name, expr }` | Strip `:`, split on `=`; strip surrounding `"` from value |
| `v-if` or `v-for` | `Err(CompileError)` | Message: `"v-if / v-for directives are not supported in v0; see v1 roadmap"` |
| Any other `v-` | `Err(CompileError)` | Message: `"unknown directive '{name}'; scribe v0 supports @event, :attr, and {{ identifier }} only"` |
| All others | `Attr::Static { name, value }` | Standard HTML attribute; strip surrounding `"` from value |

### 12.6 Self-Closing Tags

Self-closing tags (e.g., `<input />`, `<br/>`) are not supported in v0:

```
Err(CompileError { message: "self-closing tags are not supported in v0 template parser", ... })
```

### 12.7 Top-Level Text Nodes

A template whose content begins with non-tag characters yields a `TemplateNode::Text` node as a top-level sibling — not an error. `"hello world"` → `Ok(vec![Text("hello world")])`.

---

## 13. Phase C-1 File Structure

```
packages/compiler/
  src/
    lib.rs                    (amended — re-exports Attr, TemplateNode)
    types.rs                  (amended — TemplateNode, Attr enums; ScribeSource adds meta field)
    parser/
      mod.rs                  (amended — alphabetical: directives, sfc, template)
      sfc.rs                  (amended — wires ScriptMeta into ScribeSource return)
      template.rs             (new — parse_template() recursive descent)
      directives.rs           (new — directive helpers, identifier validation)
  tests/
    sfc_split.rs              (amended — re-accepted snapshots include meta field)
    template_parse.rs         (new — 10 snapshot tests)
    snapshots/                (amended — 5 re-accepted + 10 new .snap files)
```

### Amended `parser/mod.rs`

```rust
pub mod directives;
pub mod sfc;
pub mod template;
```

Alphabetical order. No `use` re-exports — callers use fully-qualified paths.

### Amended `lib.rs`

```rust
pub mod parser;
pub mod types;

pub use types::{Attr, CompileError, ScribeSource, ScriptMeta, TemplateNode};

pub fn compile(source: &str) -> Result<ScribeSource<'_>, CompileError> {
    parser::sfc::parse(source)
}
```

---

## 14. Named Snapshot Test Cases — Phase C-1

All 10 in `packages/compiler/tests/template_parse.rs`. Function under test: `parse_template(input: &str) -> Result<Vec<TemplateNode>, CompileError>`. Use `insta::assert_debug_snapshot!`.

| # | Test name | Input | Expected |
|---|---|---|---|
| 1 | `element_static_attrs` | `<div class="foo" id="bar"></div>` | `Ok([Element { tag: "div", attrs: [Static { name: "class", value: "foo" }, Static { name: "id", value: "bar" }], children: [] }])` |
| 2 | `element_no_attrs` | `<span></span>` | `Ok([Element { tag: "span", attrs: [], children: [] }])` |
| 3 | `text_interpolation_simple` | `<p>{{ count }}</p>` | `Ok([Element { tag: "p", attrs: [], children: [Interpolation("count")] }])` |
| 4 | `text_interpolation_mixed` | `<p>hello {{ name }}</p>` | `Ok([Element { tag: "p", attrs: [], children: [Text("hello "), Interpolation("name")] }])` |
| 5 | `event_binding` | `<button @click="increment"></button>` | `Ok([Element { tag: "button", attrs: [Event { name: "click", handler: "increment" }], children: [] }])` |
| 6 | `attr_binding` | `<span :class="cls"></span>` | `Ok([Element { tag: "span", attrs: [Binding { name: "class", expr: "cls" }], children: [] }])` |
| 7 | `nested_elements` | `<div><span>hello</span></div>` | `Ok([Element { tag: "div", attrs: [], children: [Element { tag: "span", attrs: [], children: [Text("hello")] }] }])` |
| 8 | `error_unknown_directive` | `<div v-show="x"></div>` | `Err` with message containing `"unknown directive 'v-show'"` |
| 9 | `error_v_if_directive` | `<div v-if="x"></div>` | `Err` with exact message `"v-if / v-for directives are not supported in v0; see v1 roadmap"` |
| 10 | `plain_text_node` | `hello world` | `Ok([Text("hello world")])` |

**Notes:**
- Test 6 uses `<span>` intentionally — avoids self-closing tag restriction.
- Test 8: `v-show` is the representative unknown directive. Verifier must confirm `v-if`/`v-for` is caught by a separate path (test 9).
- Error tests: `line`/`col` values are not oracle-checked in C-1 snapshots.

---


## 15. C-2 Amendment — Signal Identity Resolver

### 15.1 New Type: `CompileUnit<'a>`

Add to `src/types.rs`:

```rust
#[derive(Debug)]
pub struct CompileUnit<'a> {
    pub source: ScribeSource<'a>,
    pub template_ast: Option<Vec<TemplateNode>>,
}
```

`CompileUnit` bundles `ScribeSource` with the parsed template AST. `SignalMap` is NOT stored — computed on demand by `resolve_signals()`.

### 15.2 Two-Function Public API

```rust
// Unchanged from C-0/C-1 — zero snapshot churn:
pub fn compile(source: &str) -> Result<ScribeSource<'_>, CompileError>

// New in C-2:
pub fn compile_full(source: &str) -> Result<CompileUnit<'_>, CompileError>
```

### 15.3 `SignalMap` Type

```rust
#[derive(Debug, Default, PartialEq)]
pub struct SignalMap(pub HashMap<String, String>);

pub fn resolve_signals(script: &str) -> SignalMap
```

Non-fallible. Scans lines matching `const [getter, setter] = signal(...)` via `"const ["` prefix guard.

### 15.4 `src/codegen/` Module Structure (C-2)

```
src/codegen/
  mod.rs       -- pub mod signals; pub use signals::{resolve_signals, SignalMap}
  signals.rs   -- SignalMap + resolve_signals()
```

### 15.5 Six Named Snapshot Tests (Phase C-2)

In `tests/signal_resolve.rs` using `insta::assert_debug_snapshot!`:

| # | Test name | Expected |
|---|---|---|
| 1 | `single_signal` | `SignalMap({"count": "setCount"})` |
| 2 | `multiple_signals` | Two entries |
| 3 | `non_signal_var_excluded` | `SignalMap({})` |
| 4 | `mixed_vars_and_signals` | One entry (non-signals skipped) |
| 5 | `empty_script` | `SignalMap({})` |
| 6 | `name_attr_script_meta` | `SignalMap({"foo": "setFoo"})` |

---
## 16. C-3 Amendment — TypeScript Codegen Algorithm

### 16.1 File Structure Delta

| File | Action |
|---|---|
| `src/codegen/emit.rs` | NEW |
| `src/codegen/mod.rs` | AMENDED |
| `src/lib.rs` | AMENDED |
| `tests/codegen.rs` | NEW -- 10 snapshot tests |

`src/codegen/mod.rs` final content:

```rust
pub mod emit;
pub mod signals;

pub use emit::emit;
pub use signals::{resolve_signals, SignalMap};
```

`src/lib.rs` amended re-export line:

```rust
pub use codegen::{emit, resolve_signals, SignalMap};
```

### 16.2 `emit()` Function Skeleton

```rust
pub fn emit(unit: &CompileUnit, tag_name: &str) -> String {
    let signal_map = resolve_signals(unit.source.script.unwrap_or(""));

    if unit.source.style.is_some() {
        eprintln!("warning: <style> block ignored in v0 output");
    }

    if !tag_name.contains('-') {
        eprintln!(
            "warning: tag '{}' does not contain a hyphen; \
             custom element names must include '-'",
            tag_name
        );
    }

    let imports = build_imports(&signal_map);
    let script_body = extract_script_body(unit.source.script.unwrap_or(""));
    let template_nodes = unit.template_ast.as_deref().unwrap_or(&[]);
    let return_expr = emit_nodes(template_nodes, &signal_map, "    ");

    let body = if script_body.is_empty() {
        format!("  return {}\n", return_expr)
    } else {
        format!("{}\n\n  return {}\n", script_body, return_expr)
    };

    format!(
        "{}\n\ndefineElement('{}', defineComponent((_ctx) => {{\n{}}}))\n",
        imports, tag_name, body
    )
}
```

### 16.3 Import Block Algorithm

```rust
fn build_imports(signal_map: &SignalMap) -> String {
    if signal_map.0.is_empty() {
        ["import { branch, leaf } from '@scribe/arbor'",
         "import { defineComponent, defineElement } from '@scribe/runtime'"]
        .join("\n")
    } else {
        ["import { branch, leaf } from '@scribe/arbor'",
         "import type { Signal } from '@scribe/signals'",
         "import { signal } from '@scribe/signals'",
         "import { defineComponent, defineElement } from '@scribe/runtime'"]
        .join("\n")
    }
}
```

Order is fixed and static. Omit Signal-related lines when `signal_map.0.is_empty()`.

### 16.4 Script Passthrough Algorithm

```rust
fn extract_script_body(script: &str) -> String {
    let filtered: Vec<&str> = script
        .lines()
        .filter(|l| {
            let t = l.trim();
            !t.starts_with("import ") && !t.starts_with("import\t")
        })
        .collect();

    let start = filtered.iter().position(|l| !l.trim().is_empty())
        .unwrap_or(filtered.len());
    let end = filtered.iter().rposition(|l| !l.trim().is_empty())
        .map(|i| i + 1).unwrap_or(0);

    if start >= end { return String::new(); }

    filtered[start..end]
        .iter()
        .map(|l| format!("  {}", l))
        .collect::<Vec<_>>()
        .join("\n")
}
```

Each non-import line prefixed with 2 spaces for the `defineComponent` body indent.

### 16.5 Template Walk Algorithm

`emit_nodes(nodes, signal_map, child_indent)` rules:
- 0 non-empty nodes: `"branch(null, null, [])"`
- 1 node: forward to `emit_node` directly
- 2+ nodes: root fragment with multiline format

`emit_node(node, signal_map, child_indent)` rules:
- `Text(s)`: if `s.trim()` empty → `""` (skip); else `leaf('<trimmed>')`
- `Interpolation(id)`: if `signal_map.0.get(id)` = Some(setter) → `leaf([id, setter] as unknown as Signal<string>)`; else `leaf(id)`
- `Element { tag, attrs, children }`:
  - 0 non-empty children: `branch('<tag>', <attrs>, [])`
  - Any child is `Element` → **multiline**: children prefixed by `child_indent`, closing `]` at `child_indent[..len-2]`
  - All children are Text/Interpolation → **inline**: `branch('<tag>', <attrs>, [child1, child2, ...])`

`child_indent` = indent string for children in multiline format. Pass `"    "` (4 spaces) from `emit()`.

### 16.6 `emit_attrs` Algorithm

- Empty attrs → `"null"`
- `Attr::Static { name, value }` → `name: 'value'`
- `Attr::Binding { name, expr }` → `name: expr`
- `Attr::Event { name, handler }` → `on<name>: handler` (unconditional `on`-prefix)
- Format: `{ pair1, pair2, ... }` (no trailing comma)

### 16.7 Counter Fixture Indentation Trace

Signal map: `{"count" -> "setCount"}`.

`emit_nodes([div], signal_map, "    ")`:
- 1 node -> `emit_node(div, "    ")`
- div has Element children (span, button) -> **multiline**, child_indent=`"    "`, parent_indent=`"  "`
- `emit_node(span, "      ")`: children=[Interp("count")], all leaves -> inline
  -> `branch('span', null, [leaf([count, setCount] as unknown as Signal<string>)])`
- `emit_node(button, "      ")`: attrs=`{ onclick: increment }`, children=[Text("+")], all leaves -> inline
  -> `branch('button', { onclick: increment }, [leaf('+')])`
- Multiline result:

```
branch('div', { class: 'counter' }, [
    branch('span', null, [leaf([count, setCount] as unknown as Signal<string>)]),
    branch('button', { onclick: increment }, [leaf('+')])
  ])
```

`extract_script_body` strips import line, prefixes with 2 spaces:

```
  const [count, setCount] = signal(0)
  const increment = () => setCount(c => c + 1)
```

Final assembled output matches Section 7 oracle exactly:

```typescript
import { branch, leaf } from '@scribe/arbor'
import type { Signal } from '@scribe/signals'
import { signal } from '@scribe/signals'
import { defineComponent, defineElement } from '@scribe/runtime'

defineElement('counter', defineComponent((_ctx) => {
  const [count, setCount] = signal(0)
  const increment = () => setCount(c => c + 1)

  return branch('div', { class: 'counter' }, [
    branch('span', null, [leaf([count, setCount] as unknown as Signal<string>)]),
    branch('button', { onclick: increment }, [leaf('+')])
  ])
}))
```

### 16.8 Ten Snapshot Test Cases — Phase C-3

All in `tests/codegen.rs` using `insta::assert_snapshot!`.

**Test 1: `counter_full`** Full counter fixture (Section 7). `tag_name = "counter"`. Expected: Section 7 oracle. Covers C3-1.

**Test 2: `no_signals_plain_leaf`** Source: `<script setup>\nconst message = 'hello'\n</script>\n<template><p>{{ message }}</p></template>`. `tag_name = "x-msg"`. Expected: 2-line imports; `leaf(message)` no cast. Covers C3-6, C3-9.

**Test 3: `event_attr_onclick`** Source includes `<button @click="handler">click</button>`. Expected: `{ onclick: handler }`. Covers C3-4.

**Test 4: `signal_leaf_cast`** Source: script with `const [val, setVal] = signal(0)`, template `<span>{{ val }}</span>`. Expected: `leaf([val, setVal] as unknown as Signal<string>)`. Covers C3-5.

**Test 5: `plain_var_no_cast`** Source: script with `const title = 'hello'`, template `<h1>{{ title }}</h1>`. Expected: `leaf(title)` no cast. Covers C3-6.

**Test 6: `style_block_warning`** Source: counter + `<style>div{}</style>`. Expected: style content absent from return value. Covers C3-7.

**Test 7: `ctx_param_present`** Any valid source. Expected: output contains `defineComponent((_ctx)`. Covers C3-8.

**Test 8: `import_type_signal_present`** Source with signals. Expected: `import type { Signal } from '@scribe/signals'` present. Covers C3-9.

**Test 9: `no_export_default`** Any valid source. Use `assert!(!output.contains("export default"))` + snapshot. Covers C3-10.

**Test 10: `static_attr_passthrough`** Source: `<template><div class="counter"></div></template>`. Expected: `{ class: 'counter' }` in output.

### 16.9 Style Guard Placement

```rust
if unit.source.style.is_some() {
    eprintln!("warning: <style> block ignored in v0 output");
}
```

Immediately after `resolve_signals()`. C3-7 snapshot tests the return value; stderr is not snapshot-tested.

---

## 17. C-4 Amendment — CLI + Vite Integration

### 17.1 Directory Layout Delta

Files introduced or amended by Phase C-4. Every path is relative to the repo root.

**Amended files:**

| Path | Change |
|---|---|
| `packages/compiler/Cargo.toml` | Add `[[bin]]` section |
| `packages/compiler/src/lib.rs` | No change required — `compile_full` and `emit` are already exported |

**New files:**

| Path | Description |
|---|---|
| `packages/compiler/src/bin/main.rs` | CLI binary — file-path and `--stdin` modes |
| `packages/compiler/js/index.ts` | TS wrapper — `transform()` + `scribeCompilerPlugin()` |
| `packages/compiler/package.json` | npm package manifest for `@scribe/compiler` |
| `packages/compiler/moon.yml` | Moon project config |
| `packages/compiler/rolldown.config.ts` | Rolldown build config |
| `packages/compiler/tsconfig.json` | Per-package TS config |
| `packages/compiler/fixtures/vite-counter/counter.scribe` | Integration fixture — minimal counter component |
| `packages/compiler/fixtures/vite-counter/vite.config.ts` | Vite config using the plugin pre-build |
| `packages/compiler/fixtures/vite-counter/index.html` | Minimal HTML entry |
| `packages/compiler/fixtures/vite-counter/main.ts` | Minimal entry script |
| `packages/compiler/tests/c4_integration.rs` | Rust integration test (C4-6) |

`lib.rs` requires no change. The public surface (`compile_full`, `emit`) is already exported as of C-3.

---

### 17.2 `Cargo.toml` Amendments

Append after the existing `[dev-dependencies]` block:

```toml
[[bin]]
name = "scribe-compile"
path = "src/bin/main.rs"
```

No new `[dependencies]` entries: the CLI uses only `std::env::args()`, `std::fs`, `std::path::Path`, `std::process`, and `std::io` — all in `std`. Final `Cargo.toml` after amendment:

```toml
[package]
name    = "scribe-compiler"
version = "0.1.0"
edition = "2021"

[dev-dependencies]
insta = "1"

[[bin]]
name = "scribe-compile"
path = "src/bin/main.rs"
```

---

### 17.3 CLI Algorithm — `packages/compiler/src/bin/main.rs`

The binary supports two mutually exclusive input modes:

- **File mode (default):** `argv[1]` is a file path. The binary reads the file from disk.
- **Stdin mode:** `--stdin` flag present. The binary reads source from stdin. The tag name is derived from the `--tag <name>` argument (required in `--stdin` mode).

**Complete algorithm:**

```
1. args = std::env::args().collect::<Vec<String>>()

2. Detect --stdin flag:
   stdin_mode = args.contains(&"--stdin".to_string())

3. Detect --out <dir>:
   out_dir: Option<String> = None
   scan args for "--out"; if found, next element is out_dir value
   if "--out" is last arg (no value follows) → eprintln!("error: --out requires a directory argument") + exit(1)

4. Branch on stdin_mode:

   === STDIN MODE ===
   4a. Find --tag <name>:
       scan args for "--tag"; next element is tag_override value
       if "--tag" missing or no value → eprintln!("error: --stdin mode requires --tag <name>") + exit(1)

   4b. Read source from stdin:
       use std::io::Read
       let mut source = String::new()
       std::io::stdin().read_to_string(&mut source)
           .unwrap_or_else(|e| { eprintln!("error reading stdin: {}", e); exit(1) })

   4c. file_stem = tag_override value (already validated above)

   === FILE MODE ===
   4d. file_path = args.get(1):
       if None or value starts with "--" →
           eprintln!("usage: scribe-compile <file.scribe> [--out <dir>]")
           exit(1)

   4e. Read file:
       source = std::fs::read_to_string(&file_path)
           .unwrap_or_else(|e| { eprintln!("{}: {}", file_path, e); exit(1) })

   4f. Derive stem from file path:
       file_stem = std::path::Path::new(&file_path)
           .file_stem()
           .and_then(|s| s.to_str())
           .unwrap_or_else(|| { eprintln!("error: cannot derive stem from path '{}'", file_path); exit(1) })
           .to_string()

5. Compile:
   unit = scribe_compiler::compile_full(&source)
       .unwrap_or_else(|e| {
           // In file mode:  eprintln!("{}:{}: {}", file_path, e.line, e.message)
           // In stdin mode: eprintln!("<stdin>:{}: {}", e.line, e.message)
           process::exit(1)
       })

6. Resolve tag name (meta.name override — OQ-C6):
   tag_name = match &unit.source.meta.name {
       Some(name) => name.clone(),
       None       => file_stem,
   }

7. Emit:
   output = scribe_compiler::emit(&unit, &tag_name)

8. Write output:
   if let Some(dir) = out_dir {
       out_file = format!("{}/{}.ts", dir, tag_name)
       std::fs::create_dir_all(&dir) + std::fs::write(&out_file, &output) with error handling
   } else {
       print!("{}", output)   // emit() already appends a trailing newline
   }

9. exit(0) implicitly
```

**Stderr format strings:**

- File mode compile error: `"{}:{}: {}", file_path, e.line, e.message`
- Stdin mode compile error: `"<stdin>:{}: {}", e.line, e.message`
- `e.col` is NOT included — always `0` in current parser output; extend in v1 if needed.

**Imports required:**

```rust
use std::io::Read;
use std::process;
```

All other items (`std::env`, `std::fs`, `std::path::Path`) referenced by full path inline.

---

### 17.4 Tag Name Derivation Algorithm

| Context | Initial name source | Override mechanism |
|---|---|---|
| CLI file mode | `Path::new(argv[1]).file_stem()` | `unit.source.meta.name` overwrites in step 6 |
| CLI stdin mode | `--tag` argument | `unit.source.meta.name` overwrites in step 6 |
| Vite transform | `basename(id, '.scribe')` | Passed as `--tag`; binary applies meta.name override internally |

The Vite TypeScript wrapper does not need to inspect the output to re-derive the name — the binary handles the override and emits `defineElement('<resolved-name>', ...)` directly.

---

### 17.5 `packages/compiler/js/index.ts` Shape

**Design: Option B — `--stdin` flag.** The Vite `transform` hook receives `(code: string, id: string)` — Vite has already read the file. Passing `id` to the binary would cause a double-read and would fail for virtual modules. Writing to a temp file requires cleanup and is fragile on Windows. Adding `--stdin` to the CLI is ~15 lines of Rust and produces a clean, race-free data path.

**Complete file content:**

```typescript
/**
 * @scribe/compiler — TypeScript wrapper around the scribe-compile Rust binary.
 */
import { execFileSync } from 'node:child_process'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// Binary resolution: env var override, fallback to relative path from dist/
const binPath: string =
  process.env['SCRIBE_COMPILE_BIN'] ??
  resolve(dirname(fileURLToPath(import.meta.url)), '../target/release/scribe-compile')

// Minimal VitePlugin interface — avoids importing from 'vite' at compile time.
// Structurally compatible with Vite's Plugin type.
interface VitePlugin {
  readonly name: string
  transform?: (
    code: string,
    id: string,
  ) => { code: string; map: null } | null | undefined
}

/**
 * Compile a .scribe source string to TypeScript.
 * map is null — source maps are deferred to v1 (OQ-C8)
 */
export function transform(source: string, id: string): { code: string; map: null } {
  const stem = basename(id, '.scribe')
  const code = execFileSync(binPath, ['--stdin', '--tag', stem], {
    input: source,
    encoding: 'utf8',
  })
  return {
    code,
    map: null, // source maps deferred to v1 (OQ-C8)
  }
}

/**
 * Vite plugin that compiles .scribe files to TypeScript during build and dev.
 */
export function scribeCompilerPlugin(): VitePlugin {
  return {
    name: 'scribe-compiler',
    transform(code, id) {
      if (!id.endsWith('.scribe')) return undefined
      return transform(code, id)
    },
  }
}
```

`execFileSync` throws if the child exits non-zero — the error propagates to Vite with full stderr content (`file:line: message`). `encoding: 'utf8'` makes it return `string`. `input: source` pipes to the child's stdin.

---

### 17.6 `package.json` for `@scribe/compiler`

```json
{
  "name": "@scribe/compiler",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "rolldown -c",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "vite": ">=5.0.0"
  },
  "peerDependenciesMeta": {
    "vite": { "optional": true }
  }
}
```

No `dependencies` on other `@scribe/*` packages — the TS wrapper shell-execs the Rust binary only.

---

### 17.7 `moon.yml` for `@scribe/compiler`

```yaml
# yaml-language-server: $schema=https://moonrepo.dev/schemas/project.json
language: typescript
layer: library

# NOTE: The Rust binary is NOT built automatically by any Moon task.
# Run `cargo build --release` manually before integration tests or using the Vite plugin.
# See architecture.md §17, decision T2.

tasks:
  build:
    command: "rolldown -c"
    inputs:
      - "js/**/*.ts"
      - "rolldown.config.ts"
    outputs:
      - "dist"

  typecheck:
    command: "tsc --noEmit"
    inputs:
      - "js/**/*.ts"
      - "tsconfig.json"
```

---

### 17.8 `rolldown.config.ts` for `@scribe/compiler`

```typescript
import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'js/index.ts',
  external: ['vite', 'node:child_process', 'node:path', 'node:url'],
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,
  },
  plugins: [dts()],
})
```

`process` global does not need to be in the external list — it is a global in Node/Bun.

---

### 17.9 Integration Test Fixture and C4-6 Test

#### `packages/compiler/fixtures/vite-counter/counter.scribe`

```
<script setup name="scribe-counter">
import { signal } from '@scribe/signals'

const [count, setCount] = signal(0)
const increment = () => setCount(c => c + 1)
</script>

<template>
  <div class="counter">
    <span>{{ count }}</span>
    <button @click="increment">+</button>
  </div>
</template>
```

`name="scribe-counter"` exercises the OQ-C6 meta.name override. The CLI emits `defineElement('scribe-counter', ...)`.

#### `packages/compiler/fixtures/vite-counter/vite.config.ts`

```typescript
import { defineConfig } from 'vite'
// Imports directly from source tree (pre-build).
// After `bun run build` in packages/compiler/, change to '@scribe/compiler'.
import { scribeCompilerPlugin } from '../../../js/index.ts'

export default defineConfig({
  plugins: [scribeCompilerPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: { input: 'index.html' },
  },
})
```

#### `packages/compiler/fixtures/vite-counter/index.html`

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>scribe counter fixture</title>
  </head>
  <body>
    <scribe-counter></scribe-counter>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

#### `packages/compiler/fixtures/vite-counter/main.ts`

```typescript
import './counter.scribe'
```

#### `packages/compiler/tests/c4_integration.rs`

```rust
/// C4-6 Integration test: `bun vite build` with a .scribe component → non-empty dist/.
///
/// PRECONDITIONS (manual):
///   1. `cd packages/compiler && cargo build --release`
///   2. `bun install` at repo root
#[test]
#[ignore]
fn c4_vite_build_produces_dist() {
    use std::path::Path;
    use std::process::Command;

    let fixture_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures/vite-counter");

    let dist_dir = fixture_dir.join("dist");
    if dist_dir.exists() {
        std::fs::remove_dir_all(&dist_dir).expect("failed to clean fixture dist/");
    }

    let status = Command::new("bun")
        .args(["vite", "build"])
        .current_dir(&fixture_dir)
        .status()
        .expect("failed to spawn `bun vite build`");

    assert!(status.success(), "`bun vite build` exited non-zero: {}", status);
    assert!(dist_dir.exists(), "dist/ was not created");

    let entries: Vec<_> = std::fs::read_dir(&dist_dir)
        .expect("failed to read dist/")
        .filter_map(|e| e.ok())
        .collect();

    assert!(!entries.is_empty(), "dist/ exists but is empty");
}
```

`#[ignore]` — run explicitly: `cargo test -- --ignored c4_vite_build_produces_dist`

---

### 17.10 C4-7 Null-Map Stub

`js/index.ts` returns `{ code, map: null }` with the comment `// source maps deferred to v1 (OQ-C8)`. The CLI emits no `.map` file and no `//# sourceMappingURL=` comment. C4-7 replacement criterion: Verifier asserts `map` field is `null` and no map data is emitted.

---

### 17.11 Acceptance Criteria Mapping

| Criterion | File / Function | How It Satisfies |
|---|---|---|
| **C4-1** `scribe-compile counter.scribe` → stdout | `src/bin/main.rs` file mode, `print!("{}", output)` | Reads file, compile_full + emit, prints to stdout |
| **C4-2** `--out dist/` → `dist/counter.ts` | `src/bin/main.rs` `--out` branch, `fs::write` | Tag name resolves to `counter`; writes `dist/counter.ts` |
| **C4-3** Exit 1, `file:line: message` on stderr | `src/bin/main.rs` step 5 error handler | `e.line` + `e.message` from `CompileError`; `process::exit(1)` |
| **C4-4** `@scribe/compiler` exports `transform()` | `js/index.ts` `export function transform(...)` | Re-exported through `dist/index.js` after build |
| **C4-5** Vite hook for `*.scribe` | `js/index.ts` `scribeCompilerPlugin().transform` | Filters `id.endsWith('.scribe')` |
| **C4-6** `bun vite build` → valid `dist/` | `fixtures/vite-counter/` + `tests/c4_integration.rs` | `#[ignore]` test: asserts exit 0 + non-empty `dist/` |
| **C4-7-stub** `map: null` with comment | `js/index.ts` return statement | `map: null, // source maps deferred to v1 (OQ-C8)` |

**Verifier commands:**

```bash
# C4-1
cd packages/compiler && cargo build --release
./target/release/scribe-compile fixtures/vite-counter/counter.scribe

# C4-2
./target/release/scribe-compile fixtures/vite-counter/counter.scribe --out /tmp/out/
ls /tmp/out/

# C4-3
echo "bad source" > /tmp/bad.scribe
./target/release/scribe-compile /tmp/bad.scribe; echo "exit: $?"

# C4-4
cd packages/compiler && bun run build
node -e "import('@scribe/compiler').then(m => console.log(typeof m.transform))"

# C4-5
grep 'endsWith.*\.scribe' packages/compiler/js/index.ts

# C4-6
cargo test -- --ignored c4_vite_build_produces_dist

# C4-7-stub
grep 'source maps deferred' packages/compiler/js/index.ts
```

---

### 17.12 `tsconfig.json` for `@scribe/compiler`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./js",
    "declaration": true,
    "declarationDir": "./dist"
  },
  "include": ["js/**/*.ts"]
}
```

`rootDir: "./js"` matches the TS source tree. No `DOM` lib — this package runs in Node/Bun only.

---

## STATUS

DONE -- Spec covers full compiler track C-0 through C-4. C-1 amendment (Sections 11-14) added 2026-04-30. C-2 amendment (Section 15) documented 2026-04-30: CompileUnit, compile_full(), SignalMap, resolve_signals(), 6 tests. C-3 amendment (Section 16) added 2026-04-30: emit() algorithm, import block, script passthrough, template walk (emit_nodes/emit_node/emit_attrs), counter fixture trace, 10 test cases. C-4 amendment (Section 17) added 2026-04-30: CLI binary (file + stdin modes), tag name derivation, TS wrapper with scribeCompilerPlugin(), package.json, moon.yml, rolldown.config.ts, tsconfig.json, integration fixture, C4-6 Rust integration test (#[ignore]), C4-7 null-map stub, Verifier checklist.
