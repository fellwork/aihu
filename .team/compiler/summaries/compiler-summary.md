# Compiler Track Topic Summary

**Track:** `compiler`
**Status:** COMPLETE — C-0 through C-4 shipped
**Last updated:** 2026-05-01 (session 6 cleanup)
**Author:** Builder (session 6)

---

## 1. What the compiler does

The aihu compiler transforms `.aihu` Single-File Components (SFCs) into
TypeScript that the `@aihu/runtime` + `@aihu/arbor` packages can execute
as vanilla custom elements. No framework runtime is emitted — the output is
pure TypeScript that calls `defineElement` (which wraps `customElements.define`)
with a `defineComponent` setup function.

**Input format (`.aihu` SFC):**

```aihu
<script setup name="aihu-counter">
import { signal } from '@aihu/signals'
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

**Emit form (locked — do not change without a spec amendment):**

```typescript
import { branch, leaf } from '@aihu/arbor'
import type { Signal } from '@aihu/signals'
import { signal } from '@aihu/signals'
import { defineComponent, defineElement } from '@aihu/runtime'

defineElement('aihu-counter', defineComponent((_ctx) => {
  const [count, setCount] = signal(0)
  const increment = () => setCount(c => c + 1)

  return branch('div', { class: 'counter' }, [
    branch('span', null, [leaf([count, setCount] as unknown as Signal<string>)]),
    branch('button', { onclick: increment }, [leaf('+')])
  ])
}))
```

Key decisions baked into the emit form:
- Tag name comes from the filename stem or `name` attribute on `<script setup>` (OQ-C6).
- `defineElement` at module top-level — side-effect call, no `export default`.
- `_ctx` parameter always present (suppresses `noUnusedParameters` warning).
- `as unknown as Signal<string>` cast is required because `leaf()` takes `Signal<string>` but signals are typed as `Signal<number>` etc. (OQ-C10).
- `import type { Signal }` for zero runtime bytes (erased at build).

---

## 2. Architecture — phases and key types

The compiler is a standalone Rust crate (`aihu-compiler` at
`packages/compiler/`) plus a thin TypeScript npm package (`@aihu/compiler`
at `packages/compiler/js/index.ts`).

### Pipeline phases

| Phase | What it does | Key file |
|-------|-------------|----------|
| C-0 | SFC block splitter — parse `<script setup>`, `<template>`, `<style>` | `src/parser/sfc.rs` |
| C-1 | Template parser — recursive descent, produces `Vec<TemplateNode>` | `src/parser/template.rs` |
| C-2 | Signal identity resolver — scans script lines for `[getter, setter] = signal(...)` | `src/codegen/signals.rs` |
| C-3 | TypeScript codegen — emits the canonical emit form | `src/codegen/emit.rs` |
| C-4 | CLI binary + npm/Vite wrapper | `src/bin/main.rs`, `js/index.ts` |

### Key Rust types

**`AihuSource<'a>`** (`src/types.rs`) — result of the SFC block splitter.
Holds `script`, `template`, `style` as `Option<&'a str>` (zero-copy slices
into the source string) plus `meta: ScriptMeta` (holds the `name` attribute
from `<script setup name="...">`).

**`CompileUnit<'a>`** (`src/types.rs`) — bundles `AihuSource` with the
parsed template AST (`template_ast: Option<Vec<TemplateNode>>`). Produced by
`compile_full()`. Used as the input to `emit()`.

**`TemplateNode`** (`src/types.rs`) — recursive AST enum:
- `Element { tag, attrs, children }` — HTML element
- `Text(String)` — literal text content
- `Interpolation(String)` — `{{ identifier }}` reference

Uses owned `String` throughout (not `&'a str`) so the AST lifetime is
independent of the source string.

**`Attr`** (`src/types.rs`) — attribute variant:
- `Static { name, value }` — plain HTML attribute
- `Binding { name, expr }` — `:attr="expr"` binding
- `Event { name, handler }` — `@event="handler"` binding

**`SignalMap`** (`src/codegen/signals.rs`) — newtype over
`BTreeMap<String, String>` mapping getter names to setter names (e.g.,
`{"count" => "setCount"}`). `BTreeMap` guarantees deterministic iteration
order, which is essential for stable snapshot tests. Was `HashMap` in
sessions 1–5; switched to `BTreeMap` in session 6 cleanup (OQ-C16 amendment).

**`emit(unit: &CompileUnit, tag_name: &str) -> String`** (`src/codegen/emit.rs`) —
the top-level codegen entry point. Calls `resolve_signals()` internally,
emits warnings for `<style>` blocks and single-word tag names, then assembles
the full TypeScript output string.

### Public API surface (`src/lib.rs`)

```rust
pub fn compile(source: &str) -> Result<AihuSource<'_>, CompileError>     // C-0/C-1
pub fn compile_full(source: &str) -> Result<CompileUnit<'_>, CompileError> // C-2+
pub fn emit(unit: &CompileUnit, tag_name: &str) -> String                  // C-3+
pub fn resolve_signals(script: &str) -> SignalMap                          // C-2+
```

### JS wrapper (`packages/compiler/js/index.ts`)

Two exports:
- `transform(source, id): { code, map }` — calls the `aihu-compile` binary
  via `execFileSync` in `--stdin --tag <stem>` mode. Used directly by
  `integrate.ts` and internally by the Vite plugin.
- `aihuCompilerPlugin(): VitePlugin` — Vite plugin with `enforce: 'pre'`
  that filters on `id.endsWith('.aihu')` and delegates to `transform()`.

Binary path resolution: `SCRIBE_COMPILE_BIN` env var → fallback to
`../target/release/aihu-compile[.exe]` relative to `dist/`.

---

## 3. Key design decisions (OQ resolutions)

**OQ-C1 — HTML-first template syntax:**
Option A selected. The template block is valid-ish HTML with aihu-specific
attribute prefixes (`@event`, `:bind`) as a thin transform layer. No
JSX-like syntax, no custom parser bootstrap. `<template>` content is parsed
by the recursive descent parser in `src/parser/template.rs`.

**OQ-C3 — Signal identity via naming convention:**
The compiler identifies signals by scanning for `const [getter, setter] = signal(...)`.
The naming convention (not a type system query) is the contract. Any
destructured `signal()` call with exactly two names is a signal pair. This
is the `resolve_signals()` function. Non-signal variables are not in
`SignalMap` and generate plain `leaf(varName)` without the cast.

**OQ-C9 — Emit pattern:**
Option A: `defineElement('tag', defineComponent((_ctx) => { ... }))`.
`defineElement` wraps `customElements.define`. `defineComponent` provides
the setup factory. No `export default`, no wrapper function. The call is a
module-level side effect, matching how custom elements are conventionally
registered.

**OQ-C16 — `SignalMap` concrete type (session 6 amendment):**
`SignalMap` was originally `HashMap<String, String>` (OQ-C16 closed as
"HashMap newtype" in C-2). In session 6, it was changed to
`BTreeMap<String, String>`. The `BTreeMap` produces alphabetically sorted
iteration order, eliminating the snapshot test non-determinism that caused
occasional CI failures when `HashMap`'s random seed produced different key
orderings across test runs. This is a backward-compatible internal change:
`SignalMap` is a newtype, so callers using `map.0.get(key)` are unaffected.
All 32 tests passed without snapshot re-acceptance (existing snapshots
happened to already be in alphabetical order).

---

## 4. Known limitations

**`{{ expr }}` is identifier-only (no sub-expressions):**
Interpolation in templates is restricted to single identifiers matching
`[a-zA-Z_][a-zA-Z0-9_]*`. Expressions like `{{ count + 1 }}` or
`{{ obj.prop }}` return a compile error:
`"interpolation must be a single identifier in v0; expressions are not supported"`.
This is by design (OQ-C2). Planned for v1.

**Conditionals and lists produce compile errors:**
`v-if` and `v-for` are not supported in v0:
`"v-if / v-for directives are not supported in v0; see v1 roadmap"`.
Unknown `v-` directives also error with a specific message. Neither
is silently ignored — failing loudly is intentional.

**`<style scoped>` (and all `<style>` blocks) are warned and ignored:**
`emit()` writes `warning: <style> block ignored in v0 output` to stderr
and produces no CSS output. Scoped styles are a v1 feature.

**No source maps (v0):**
`transform()` returns `{ code, map: null }`. The `//# sourceMappingURL=`
comment is never emitted. Source-map generation requires threading position
tracking through every `emit_node()` call and encoding VLQ base64 — deferred
to v1 (OQ-C8).

**Bun + Vite ESM incompatibility:**
`bun vite build` fails in `packages/compiler/fixtures/vite-counter` because:
1. `vite` is an optional `peerDependency` only — `bun install` does not
   install it automatically.
2. Even with Vite installed, Bun's Rollup4 bridge evaluates the vite config
   at load time via its internal bundler. If the Rust binary does not exist
   at `../target/release/aihu-compile`, `execFileSync` throws at config-load
   time, aborting the build before any `.aihu` file is transformed.

**Workaround:** Use `bun run integrate.ts` in the fixture directory
(preconditions: `cargo build --release` in `packages/compiler/`,
`bun install` at repo root). The `c4_transform_produces_typescript`
integration test (`tests/c4_integration.rs`, `#[ignore]`) uses this approach.

---

## 5. What a future engineer needs to know

### Extending the compiler (adding a codegen pass)

The pipeline from source to output is strictly linear:

```
source: &str
  → compile_full() → CompileUnit
  → emit(unit, tag_name) → String
```

To add a new codegen pass (e.g., CSS-in-JS extraction from `<style>`):
1. Add a new function in `src/codegen/` (e.g., `src/codegen/styles.rs`).
2. Declare it in `src/codegen/mod.rs`.
3. Call it from `emit()` in `src/codegen/emit.rs` alongside the existing
   `resolve_signals()` call.
4. Add snapshot tests in `tests/codegen.rs` covering the new behavior.
5. Re-accept updated snapshots with `UPDATE_EXPECT=1 cargo test -p aihu-compiler`.

Do not add new fields to `CompileUnit` for computed data that can be
re-derived on demand (per Section 15.1 of architecture.md: `SignalMap` is
computed on demand, not stored in `CompileUnit`).

### Snapshot test discipline

All 31 committed snapshot tests (excluding the `#[ignore]` integration test)
must pass before merging. The canonical tool to re-accept changed snapshots is:

```bash
UPDATE_EXPECT=1 cargo test -p aihu-compiler
```

or:

```bash
cargo insta review
```

Never manually edit `.snap` files. Snapshot content is authoritative — if a
snapshot needs changing, it is because the codegen output changed, and that
change must be intentional and reviewed.

Key snapshot groups:
- `tests/snapshots/sfc_split__*.snap` — 5 SFC block splitter tests + 1 unit test
- `tests/snapshots/template_parse__*.snap` — 10 template parser tests
- `tests/snapshots/signal_resolve__*.snap` — 6 signal resolver tests
- `tests/snapshots/codegen__*.snap` — 10 codegen tests

### The `counter_full` oracle

`tests/snapshots/codegen__counter_full.snap` is the end-to-end acceptance
oracle for the compiler. It contains the exact TypeScript output for
`fixtures/vite-counter/counter.aihu`. If this snapshot changes, the entire
compiler pipeline has changed. Treat any `counter_full` diff as a significant
event requiring deliberate review and a spec amendment in `architecture.md`
Section 7.

### Test count

`cargo test -p aihu-compiler` must exit 0 with:
- **32 passed, 1 ignored** (the `c4_transform_produces_typescript` integration
  test is `#[ignore]` by design — it requires a pre-built binary)

If the count drops below 32, a test was deleted. If it rises above 32, a new
test was added (update this document accordingly).

### Binary pre-build requirement

The Rust binary (`target/release/aihu-compile`) must be built manually
before running integration tests or the Vite plugin:

```bash
cd packages/compiler && cargo build --release
```

This is a known v0 limitation. The binary is not bundled with the npm package
and is not built automatically by any Moon task (see `moon.yml` comment).

---

## 6. File index (key paths)

| Path | Role |
|------|------|
| `packages/compiler/Cargo.toml` | Rust crate manifest; defines `aihu-compiler` lib + `aihu-compile` bin |
| `packages/compiler/src/lib.rs` | Public Rust API: `compile`, `compile_full`, `emit`, `resolve_signals` |
| `packages/compiler/src/types.rs` | Core types: `AihuSource`, `CompileUnit`, `TemplateNode`, `Attr`, `ScriptMeta`, `CompileError` |
| `packages/compiler/src/parser/sfc.rs` | SFC block splitter (C-0) |
| `packages/compiler/src/parser/template.rs` | Recursive descent template parser (C-1) |
| `packages/compiler/src/parser/directives.rs` | Directive helpers, identifier validation (C-1) |
| `packages/compiler/src/codegen/signals.rs` | `SignalMap` (BTreeMap) + `resolve_signals()` (C-2) |
| `packages/compiler/src/codegen/emit.rs` | TypeScript codegen: `emit()`, `build_imports()`, `extract_script_body()`, `emit_nodes()`, `emit_node()`, `emit_attrs()` (C-3) |
| `packages/compiler/src/bin/main.rs` | CLI binary: file mode + `--stdin --tag` mode (C-4) |
| `packages/compiler/js/index.ts` | npm/Vite wrapper: `transform()`, `aihuCompilerPlugin()` (C-4) |
| `packages/compiler/package.json` | `@aihu/compiler` npm package manifest |
| `packages/compiler/fixtures/vite-counter/` | Integration fixture: `counter.aihu`, `integrate.ts`, `vite.config.ts` |
| `packages/compiler/tests/c4_integration.rs` | `#[ignore]` integration test using `bun run integrate.ts` |
| `packages/compiler/tests/snapshots/codegen__counter_full.snap` | End-to-end oracle snapshot |
| `.team/compiler/architecture.md` | Full spec: sections 1–17, all OQ resolutions, acceptance criteria |
| `.team/compiler/state-compiler.md` | Phase tracking, open questions, deliverable log |
