# Compiler Track — Rust SFC Compiler for `.aihu` Single-File Components

**Track:** `compiler`
**Branch convention:** `feat/compiler-*`
**Parallel-safe:** YES — zero overlap with `test-quality` (Round N+2) track. All work lives in `packages/compiler/` and a new `packages/vite-plugin-router/` (optional Phase 2). No changes to existing packages.
**Prerequisite:** `main` at `cf99d76` (agent-readiness + README badges). No runtime package changes required before Phase 1.

---

## Goal

The Rust SFC compiler is the remaining v0 → v1 gate. It reads `.aihu` single-file component files, parses the template and setup script, and emits TypeScript/JavaScript that calls `@aihu/arbor` primitives directly — no JSX runtime, no virtual DOM, no template strings.

The hand-authored equivalent (`defineComponent` with explicit `branch`/`leaf` calls) already works. The compiler makes `.aihu` files a first-class authoring surface.

---

## What a `.aihu` file looks like

```aihu
<script setup>
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

The compiler emits (conceptually):

```typescript
import { branch, leaf, mount } from '@aihu/arbor'
import { signal } from '@aihu/signals'
import { defineComponent } from '@aihu/runtime'

export default defineComponent({
  tag: 'x-counter',         // derived from filename or <script setup name="x-counter">
  setup(ctx) {
    const [count, setCount] = signal(0)
    const increment = () => setCount(c => c + 1)

    return branch('div', { class: 'counter' }, [
      branch('span', null, [leaf([count, setCount])]),
      branch('button', { onclick: increment }, [leaf('+')])
    ])
  }
})
```

The output is a valid TypeScript module. `defineComponent` + `mount` handle the custom element lifecycle.

---

## Open questions that block the Architect spec (must be answered in Phase 0 Scout)

**OQ-C1 (HIGH) — Template syntax: subset of HTML or custom DSL?**
Two options:
- A: Parse as HTML, extract aihu-specific attributes (`{{ }}` interpolation, `@event`, `:attr`) as a thin layer on top of standard HTML parsing.
- B: Custom grammar (like Vue's template compiler). More powerful; much larger compiler scope.
Recommendation: Option A for v0. HTML-first, aihu directives are attribute/text transforms only.

**OQ-C2 (HIGH) — Interpolation: `{{ expr }}` only, or full expression support?**
- v0: `{{ identifier }}` only — direct signal/value binding. No `{{ a + b }}`, no method calls in template.
- v1+: arbitrary expressions.
`{{ count }}` in a text node → `leaf([count, setCount])` requires the compiler to know `count` is the read-half of a signal. This requires type inference or a naming convention.

**OQ-C3 (HIGH) — Signal identity: how does the compiler know `count` is readable?**
Options:
- A: Naming convention — `const [foo, setFoo] = signal(...)` → `foo` is a signal read, `setFoo` is the setter.
- B: Type inference — parse the setup script, infer from `signal()` return type.
- C: Explicit annotation — `@signal const count = signal(0)`.
Option A is deterministic and requires no type inference. Recommended for v0.

**OQ-C4 (MEDIUM) — Event binding: `@click` → `onclick` or `addEventListener`?**
`branch()` accepts an attrs object. For event handlers, the current arbor implementation sets `element[key] = value` for string-keyed attrs. `onclick` as a property assignment works for intrinsic events. Recommendation: `@click` → `{ onclick: handler }` for v0.

**OQ-C5 (MEDIUM) — Conditional and list rendering (`v-if` / `v-for` equivalent)?**
`branch` children is a static array — no reconciler in v0. Conditionals and lists require the `when` and `each` stubs, which throw `ArborNotImplementedError`. v0 compiler: no conditional or list directives. They are parse errors with a helpful message.

**OQ-C6 (MEDIUM) — Component tag name: filename or explicit declaration?**
- A: Filename: `my-counter.aihu` → tag `my-counter` (requires hyphen per custom elements spec)
- B: Explicit: `<script setup name="my-counter">` or `defineComponent({ tag: 'my-counter' })`
Recommendation: filename-derived for v0, explicit override optional.

**OQ-C7 (LOW) — Scoped styles?**
`<style>` block in `.aihu` files is common in Vue/Svelte. For v0, scoped styles are deferred — the compiler emits a warning if a `<style>` block is present and ignores it.

**OQ-C8 (LOW) — Source maps?**
Rolldown/Vite expect source maps for dev experience. The compiler should emit `.aihu → .ts` source map. This is a known Rust complexity — use `oxc_sourcemap` or similar from the OXC ecosystem since rolldown already uses OXC.

---

## Implementation approach

### Language: Rust

- Uses the [OXC](https://oxc.rs) ecosystem (parser, transformer, codegen) — already in the project's toolchain via rolldown.
- The `.aihu` template is NOT valid JavaScript, so OXC's JS parser cannot parse the template block directly. The template parser is a separate HTML-ish parser.
- Recommended crate for HTML parsing: `html5ever` or a hand-rolled recursive descent (the template grammar is simple in v0).

### Package structure

```
packages/compiler/
  Cargo.toml                 name = "aihu-compiler"
  src/
    main.rs                  CLI entrypoint: aihu-compile <file> [--out <dir>]
    lib.rs                   public API: compile(source: &str) -> Result<Output>
    parser/
      sfc.rs                 Split source into <script setup> + <template> + <style> blocks
      template.rs            Parse template HTML → TemplateAst
      directives.rs          Extract {{ }}, @event, :attr directives from TemplateAst
    codegen/
      mod.rs                 TemplateAst → arbor call tree (TypeScript AST or string)
      signals.rs             Signal identity resolution (naming convention)
      attrs.rs               Attribute + event binding emission
    types.rs                 TemplateAst, DirectiveKind, ScfcBlock, CompileOutput
  tests/
    snapshots/               Input .aihu → expected output .ts pairs (insta snapshots)
    fixtures/
      counter.aihu         Basic signal + event
      static.aihu          No signals (pure static tree)
      nested.aihu          Nested branches
      error-conditional.aihu  Should fail with helpful message
```

### Vite / rolldown integration

```
packages/compiler/
  js/                        Node.js binding (napi-rs or wasm-bindgen)
    index.ts                 exports transform(source, id): { code, map }
    package.json             name: "@aihu/compiler"
```

The Vite plugin (in `packages/vite-plugin-router/` or `packages/agent-readiness/src/vite-plugin.ts` extension) registers a transform hook for `*.aihu` files:

```typescript
// In a Vite plugin:
transform(code, id) {
  if (!id.endsWith('.aihu')) return
  return compilerTransform(code, id)  // calls @aihu/compiler wasm/napi binding
}
```

---

## Implementation phases

### Phase C-0 — Scaffold + SFC block splitter

**Files:** `packages/compiler/Cargo.toml`, `src/lib.rs`, `src/parser/sfc.rs`
**Deliverable:** `compile(source)` splits a `.aihu` file into `{ script: Option<&str>, template: Option<&str>, style: Option<&str> }` blocks. No template parsing yet.
**Tests:** 5 snapshot tests — valid split, missing template, missing script, extra whitespace, `<style>` block present.

### Phase C-1 — Template parser → TemplateAst

**Files:** `src/parser/template.rs`, `src/parser/directives.rs`, `src/types.rs`
**Deliverable:** Parse the template block into a `TemplateAst`:
```rust
enum TemplateNode {
  Element { tag: String, attrs: Vec<Attr>, children: Vec<TemplateNode> },
  Text(String),
  Interpolation(String),  // {{ identifier }}
}
enum Attr {
  Static { name: String, value: String },
  Binding { name: String, expr: String },   // :attr="expr"
  Event { name: String, handler: String },  // @event="handler"
}
```
**Tests:** 10 snapshot tests covering all node kinds + error cases (invalid `{{ }}`, unknown directive).

### Phase C-2 — Signal identity resolver

**Files:** `src/codegen/signals.rs`
**Deliverable:** Parse `<script setup>` block for `const [foo, setFoo] = signal(...)` declarations. Build a `SignalMap { read: "foo", write: "setFoo" }`. Used by codegen to decide: `{{ foo }}` → `leaf([foo, setFoo])` vs. `{{ title }}` (non-signal) → `leaf("literal-or-computed")`.
**Tests:** 6 tests — standard naming, renamed destructure, non-signal variable, multiple signals, `computed()` (read-only, no setter).

### Phase C-3 — Codegen: TemplateAst → TypeScript emit

**Files:** `src/codegen/mod.rs`, `src/codegen/attrs.rs`
**Deliverable:** Walk `TemplateAst`, emit TypeScript source string:
- `Element` → `branch(tag, attrs_object_or_null, children_array)`
- `Text` → `leaf('literal string')`
- `Interpolation(id)` — if signal: `leaf([id, setId])` — if plain var: `leaf(id)`
- `@event` attrs → `{ onclick: handler }` (or `on${event}`)
- `:attr` bindings → computed attr value (expression passed through)
- Full `.aihu` → `.ts` output wraps in `defineComponent({ tag, setup(ctx) { ...script...; return branch(...) } })`

**Tests:** 10 snapshot tests — counter, static tree, nested, event handler, attr binding.

### Phase C-4 — CLI + Vite integration

**Files:** `src/main.rs`, `packages/compiler/js/` (napi-rs or wasm binding)
**Deliverable:**
- `aihu-compile counter.aihu` emits `counter.ts` to stdout or `--out` dir
- `@aihu/compiler` npm package with `transform(source, id)` function
- Vite plugin transform hook in a new `packages/vite-plugin-router/src/aihu-transform.ts`
- Source map output

**Tests:** CLI integration tests (run the binary on fixture files), Vite transform tests.

---

## File ownership map (parallel-safety proof)

| File/directory | Round N+2 | Compiler |
|---|---|---|
| `packages/compiler/` | ❌ | ✅ new |
| `packages/vite-plugin-router/` | ❌ | ✅ new (Phase C-4) |
| `packages/*/src/` | ❌ untouched | ❌ untouched |
| `packages/*/tests/compliance/` | ✅ new | ❌ |
| `demo/` | ✅ new | ❌ |
| `scripts/lighthouse.ts` | ✅ new | ❌ |
| `.team/round-n2/` | ✅ | ❌ |
| `.team/compiler/` | ❌ | ✅ |

Zero overlap. Safe to run on parallel branches.

---

## Acceptance criteria

**Phase C-0 complete:** `compile()` splits a `.aihu` source into blocks without panicking on edge cases.

**Phase C-1 complete:** All template constructs used in v0 parse to correct `TemplateAst` nodes. Invalid directives produce a compile error with file + line number.

**Phase C-2 complete:** Signal map built correctly from `const [read, write] = signal(...)` convention for all v0 signal patterns.

**Phase C-3 complete:** `packages/compiler/tests/snapshots/counter.aihu.snap` matches expected TypeScript output exactly. `bun run test` on the JS binding passes.

**Phase C-4 complete:** `bun vite build` on a project with a `.aihu` component produces valid `dist/` output. `defineComponent` receives the emitted class and registers it as a custom element.

**v0 compiler complete (all phases):**
- [ ] `.aihu` → `.ts` transform works for static trees, signal bindings, and event handlers
- [ ] Conditionals and list rendering produce a compile error with a clear message pointing to v1 roadmap
- [ ] Source maps correct (Vite dev server shows `.aihu` source in devtools)
- [ ] `README.md` status block: "Rust SFC compiler: v0 ✓" removes the v0 → v1 gate callout

---

## Suggested Scout brief (session start)

> Read `packages/runtime/src/` (specifically `defineComponent` and `defineElement`) to understand the exact shape the compiler output must produce. Read `packages/arbor/src/mount.ts` to confirm `branch`/`leaf` call signatures. Check whether a `Cargo.toml` or any Rust source exists anywhere in the repo. Check `.prototools` for Rust toolchain version pin. Report the exact TypeScript type signature of `defineComponent`'s `setup` callback return value — the compiler must emit a return type that satisfies it.

---

*Plan authored: 2026-04-30. Prerequisite: `main` at `cf99d76`. Parallel-safe with Round N+2 (`test-quality` track).*
