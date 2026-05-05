# aihu v0 — Vertical Slice Design

**Status:** Draft
**Date:** 2026-04-23
**Repo:** fellwork/aihu
**Scope:** First working slice of the aihu meta-framework

---

## 1. Context

aihu is a **reactive meta-framework with a Vue/Nuxt-shaped authoring baseline and radically different internals**, targeting a research thesis of *smaller payload + more capability* than Vue/React. The project is greenfield; this spec covers only the first of eleven sub-projects that together form the full framework.

**Positioning:**
- **Authoring baseline (what users write):** SFC format (with our fourth `<agent>` section), composables, file-based routing, modules, layouts, middleware, server routes — Vue/Nuxt-shaped so ecosystem fluency transfers.
- **Internals (what makes it different):** arbor persistent reactive tree (no VDOM reallocation), signals as the reactive primitive, Rust/OXC/Rolldown build pipeline, MCP-first agent protocol, signal-graph resumable hydration, edge-native server runtime, AI profile-guided optimization.
- **Ecosystem intent:** Vue/Nuxt users should be able to port code mechanically and adopt file-by-file. **Specific compat mechanisms are deliberately deferred** to sub-project #11's own design cycle, when evidence from built sub-projects can inform the choice. Positioning is locked; mechanism is not.

The full framework eventually includes: reactive rendering (arbor), routing, SSR + resumable hydration, agent-facing protocol (MCP-shaped), meta-framework glue (file routing, data, modules, config), edge/CDN adapters, AI-driven profile-guided optimization, and a compat/porting layer. None of that is in this spec.

**This spec is the vertical slice** — the smallest end-to-end pipeline that proves the core thesis holds: a hand-authored `.aihu` SFC compiling through our own Rust compiler, loaded by Vite, and running in a real browser as a reactive custom element.

## 2. Foundation

- **Node.js**, **Vite 8+**, **Rolldown** (Rust-based Rollup replacement) are external, pinned dependencies — the foundation floor.
- Everything above that floor is written in-tree. Nuxt / Vue / UnJS / Nitro are reference shapes, not dependencies.
- Build-time: Rust + OXC.
- Runtime: TypeScript, shipped to browsers.
- Rolldown and Vite 8 are moving targets; we expect to chase breaking changes on pre-release infra.

## 3. Goals

1. Author a `.aihu` single-file component with four sections (`<template>`, `<script>`, `<style>`, `<agent>`) and render it reactively in Chromium via the Vite dev server.
2. Prove the architectural boundaries (parser → compiler → Vite plugin → TS runtime) are stable enough to build the next nine sub-projects on.
3. Ship a full test pyramid and CI regression gates from day 0.
4. Keep the browser runtime under 4 KB gzipped.

## 4. Non-goals (v0)

- No SSR, streaming, or resumable hydration.
- No routing or file-based pages.
- No structural reactivity (`when` / `each` declared-but-stubbed).
- No prod build pipeline (dev-server only).
- No MCP server; `<agent>` blocks are captured as static metadata only.
- No CLI / scaffolding, no VSCode extension, no docs site.
- No slot support, no cross-component imports, no template type inference.
- No edge adapters, no AI PGO pipeline.

Explicit anti-goals — enthusiasm traps to resist mid-sprint — are enumerated in section 11.

## 5. Architecture

### 5.1 Language boundary

| Layer | Language | Tooling |
|---|---|---|
| SFC parser | Rust | OXC |
| Compiler (SFC → JS) | Rust | OXC codegen |
| Vite plugin | Rust + napi-rs | Rolldown-native hooks where possible |
| Runtime: signals, arbor, WC wiring, agent accessor | TypeScript | tsc / vitest |

Build-time world is Rust/OXC. Runtime world is TypeScript. Clean boundary, each language in its strongest role.

### 5.2 Monorepo layout

```
fellwork/aihu/
├── crates/
│   ├── aihu-parser/         # SFC parsing, OXC-powered
│   ├── aihu-compiler/       # AST→AST emitter producing WC class JS
│   └── aihu-vite-plugin/    # napi-rs bridge + Rolldown-native hooks
├── packages/
│   ├── @aihu/signals/       # pure signal primitives (~1 KB gz)
│   ├── @aihu/arbor/         # reactive tree: branch/leaf/mount (~2 KB gz)
│   ├── @aihu/runtime/       # WC helpers, defineElement (~1 KB gz)
│   ├── @aihu/agent/         # getAgentMetadata accessor
│   └── @aihu/dev/           # Vite preset wiring it all together
├── examples/
│   └── hello-aihu/          # v0 hello-world, primary integration test
├── docs/
│   └── superpowers/specs/     # design docs
└── .github/workflows/
```

pnpm workspaces + Cargo workspaces. No Nx / Turbo / Lerna.

## 6. The arbor rendering model

arbor is a persistent reactive tree. Nodes exist for as long as they are mounted; they are not rebuilt on update. Attributes, text, and child lists are signals. Updates propagate via signal effects. Structural changes trigger scoped reconciliation of *only* the affected subtree.

### 6.1 Why persistent-reactive (not VDOM, not compile-to-imperative)

VDOM's historical role was to avoid wasted re-computation. Signals already solve that — they tell you exactly what changed, you never re-run code that doesn't need to change. Shipping both is paying for overlap.

Compile-to-imperative (Svelte-style) saves bytes but spreads reactivity wiring across every compiled component, making runtime evolution (future features: MCP, resumability, dev tools) require recompilation of every component.

arbor owns the reactivity-to-DOM wiring at runtime. The compiler produces declarative tree descriptions. This costs a few hundred bytes more than Svelte-style but unlocks a single debugging surface, evolvable runtime, serializable trees (critical for SSR + MCP), and inspectable state (critical for dev tools).

### 6.2 Node tiers

- **`branch`** — element or unnamed grouping with a reactive children list. Participates in structural reconciliation.
- **`leaf`** — terminal node: reactive text node, or empty element with no children. No children-list machinery.

Two tiers, not three. Lifecycle scope lives in the `mount()` return value (`MountScope`), not in a distinct "root" node type. This matches Vue / React / Solid / Svelte precedent.

### 6.3 Primitives (in `@aihu/arbor`)

```ts
branch(tag: string | null, attrs?: AttrMap, children?: ChildList): Branch
leaf(value: Signal<string> | string): Leaf
leaf.element(tag: string, attrs?: AttrMap): Leaf   // empty element (img, br, input, ...)

// AttrMap values:
//   - static primitive (string | number | boolean)  → set once, never updates
//   - Signal<T>                                     → subscribed; DOM attribute updates when signal changes
//   - Function prefixed `on*` (e.g. onClick)        → added via addEventListener, not treated as reactive
type AttrMap = Record<string, string | number | boolean | Signal<unknown> | EventHandler>

// Structural primitives — declared in v0, implemented in v1
when(signal: Signal<bool>, grow: () => Branch | Leaf): Branch
each<T>(signal: Signal<T[]>, key: (t: T) => Key, grow: (t: T, i: number) => Branch | Leaf): Branch

mount(node: Branch | Leaf, host: Element): MountScope
// MountScope owns lifecycle, disposers, agent context, SSR boundary:
interface MountScope {
  dispose(): void
  agent: AgentContext      // stub in v0, live in sub-project #7
  serialize(): Snapshot    // stub in v0, live in sub-project #6
}
```

`branch(null, ..., [...])` is the grouping case (what other frameworks call a fragment).

### 6.4 Compile-time branch-vs-leaf decision

The SFC compiler decides branch vs leaf from the template:

| Template | Emission |
|---|---|
| `<div></div>` | `leaf.element('div')` |
| `<div>{{x}}</div>` | `branch('div', {}, [leaf(x)])` |
| `<div><slot/></div>` | `branch('div', ...)` (slot = dynamic children) |
| `<img src="...">` | `leaf.element('img', {src: ...})` |

Rule: if the template statically shows no children *and* the element is not a slot host, emit a leaf. Otherwise branch.

### 6.5 Signal API

Two styles over one primitive, so we can measure which ergonomics win:

```ts
// function-style (Solid-shaped)
const [count, setCount] = signal(0)
count()          // read
setCount(n => n + 1)   // write

// runes-style (Svelte 5 shaped)
const count = $state(0)
count            // read
count = count + 1   // write (compiled to setter)
```

Both compile to the same underlying signal cells.

### 6.6 Runtime size budget

| Package | Target (gz) |
|---|---|
| `@aihu/signals` | ~1.0 KB |
| `@aihu/arbor` | ~2.0 KB |
| `@aihu/runtime` | ~1.0 KB |
| `@aihu/agent` | negligible |
| **Total** | **≤ 4.0 KB** |

For comparison: minimal React hello-world ~44 KB, Vue 3 ~40 KB, Preact ~4.5 KB, Solid ~7 KB, Svelte ~2 KB, Qwik ~1 KB initial.

**Gate condition:** CI fails if the combined minified+gzipped size of `@aihu/signals` + `@aihu/arbor` + `@aihu/runtime` + `@aihu/agent` exceeds **4096 bytes**. Budget changes require an explicit PR against `.size-limit.config`.

## 7. Components of the v0 slice

### 7.1 `aihu-parser` (Rust crate)

Consumes `.aihu` bytes. Returns:

```rust
SfcDescriptor {
  template: TemplateAst,       // HTML-ish AST with interpolations + directives
  script:   OxcProgram,        // parsed TS/JS
  style:    Option<StyleBlock>,
  agent:    Option<AgentBlock>,
}
```

Diagnostics are structured, carry stable codes, byte-offset spans, severity, message, optional help text, and related labels.

### 7.2 `aihu-compiler` (Rust crate)

`SfcDescriptor` → `OxcProgram` (JS module AST) via OXC codegen. Produces:
- `class <ComponentName> extends HTMLElement` with `connectedCallback` / `disconnectedCallback` / `attributeChangedCallback`.
- Signal cell construction from `<script>` state declarations. The compiler recognizes **both** signal styles:
  - function-style: `const [count, setCount] = signal(0)`
  - runes-style: `const count = $state(0)` (compiled to the same underlying cell + getter/setter sugar)
- arbor tree construction (`branch` / `leaf` calls) from `<template>`.
- `mount(tree, shadowRoot)` in `connectedCallback`; `scope.dispose()` in `disconnectedCallback`.
- Static `export const agentMetadata = {...}` from the captured `<agent>` block.
- `defineElement('tag-name', ClassName)` at module level.

Knows nothing about Vite. Knows nothing about the runtime's internals beyond the public API of `@aihu/arbor` + `@aihu/signals` + `@aihu/runtime`.

### 7.3 `aihu-vite-plugin` (Rust + napi-rs)

Transforms `.aihu` imports. Hooks Rolldown-native where available; falls back to JS-shaped hooks for the Vite dev-server middleware path. Owns HMR for `.aihu` files — component replacement, best-effort state preservation. Reports structured diagnostics to the Vite overlay.

Knows nothing about the runtime.

### 7.4 `@aihu/signals`

- `signal<T>(init): Signal<T>` — function-style read/write
- `$state<T>(init): T` — runes-style, compiled sugar over the same primitive
- `computed(fn)`
- `effect(fn)`
- Circular dependency detection with typed error.

**Design constraint (for future ecosystem compat):** Primitives must be designed such that a Vue-compatible surface (e.g., `.value` accessor, `watchEffect` alias) can be layered on in sub-project #11 without changes to the core. The exact compat surface is not decided here — just keep the core plastic enough to accept one.

Standalone package — could be consumed from any framework, which makes it individually benchmarkable and independently testable.

### 7.5 `@aihu/arbor`

Primitives from section 6.3. Mount / dispose / MountScope. `when` and `each` ship as stubs that throw `NotImplementedError` — the API shape is locked; the reconciler lands in v1.

### 7.6 `@aihu/runtime`

WC-specific concerns: `defineElement(spec)`, shadow-root handling, custom-element lifecycle wiring. Thin layer over `customElements.define`.

### 7.7 `@aihu/agent`

```ts
getAgentMetadata(tag: string): AgentMetadata | undefined
```

Reads the compiler-emitted `agentMetadata` static export. Zero runtime cost unless called. No MCP server in v0.

### 7.8 `@aihu/dev`

Vite preset. Imports and registers the Vite plugin. `vite.config.ts` consumers:

```ts
import { defineConfig } from 'vite'
import { aihu } from '@aihu/dev'
export default defineConfig({ plugins: [aihu()] })
```

### 7.9 `examples/hello-aihu`

Single `.aihu` SFC with all four sections. Counter state, button, interpolation. Doubles as the primary Playwright integration test.

## 8. Data flow

Life of a `.aihu` file:

```
.aihu file bytes
      ▼
aihu-parser          → SfcDescriptor { template, script, style, agent }
      ▼
aihu-compiler        → OxcProgram (JS module AST)
      ▼
OXC codegen            → JS source string + sourcemap
      ▼
Vite / Rolldown bundle (with @aihu/runtime family imports resolved)
      ▼
Browser loads module   → customElements.define registers tag
      ▼
Page contains <hello-aihu>
      ▼
Browser instantiates   → connectedCallback
      ▼
constructor builds arbor tree (branch/leaf calls)
      ▼
mount(tree, shadowRoot) → MountScope created, signals wired to DOM
      ▼
signal.set() triggers only the dependent effects → targeted DOM mutation
      ▼
disconnectedCallback   → scope.dispose() → effects disposed, DOM cleaned
```

**Key properties:**
- No runtime template compiler. All compilation is build-time.
- Sourcemaps land in the original `.aihu` file, not generated JS.
- HMR swaps one component's class; state survival is best-effort in v0.
- arbor tree is the single source of truth for rendering and (eventually) agent consumption.

## 9. The `<agent>` block

### 9.1 Authoring shape (YAML body)

```html
<agent>
describes: "Counter increment button"
state:
  count: "Current count value"
actions:
  increment: "Increment the counter by one"
</agent>
```

Three top-level fields, forward-compatible with MCP semantics:
- `describes` → MCP prompt/description
- `state` → MCP resources (reactive state)
- `actions` → MCP tools (callable operations)

Unknown fields are preserved, not rejected — we will add fields without breaking old SFCs.

### 9.2 v0 compiler behavior

Emitted as a frozen static module export:

```js
export const agentMetadata = {
  tag: 'hello-aihu',
  describes: "Counter increment button",
  state: { count: "Current count value" },
  actions: { increment: "Increment the counter by one" }
}
```

### 9.3 v0 runtime behavior

Nothing, beyond `getAgentMetadata(tag)` returning the frozen object. No MCP server, no live signal binding, no agent invocation. That is sub-project #7's scope.

### 9.4 Why YAML

Multi-line prose descriptions are ergonomic in YAML, miserable in JSON. Custom DSL doesn't earn its weight. SFC already has four languages (template, TS, CSS, YAML) — a fifth custom DSL would be overreach.

## 10. Error handling

### 10.1 Build-time (Rust)

All diagnostics are structured:

```rust
Diagnostic {
  code:     DiagnosticCode,        // stable ID e.g. SCB-P0102
  severity: Error | Warning,
  span:     SourceSpan,            // byte offsets
  message:  &str,
  help:     Option<&str>,
  related:  Vec<Label>
}
```

Codes are stable, documented, link-resolvable. Rendered in the Vite dev overlay with the original `.aihu` source.

**v0 error codes include:** malformed SFC, invalid template, unparseable `<script>`, duplicate sections, unknown `<agent>` top-level key, signal used before declaration.

**v0 warnings include:** style block without scope, empty `<agent>` block, unused signal, leaf-where-branch-expected (compiler sanity check).

### 10.2 Runtime (TypeScript)

- `ArborError` (typed, with code + dev-mode origin).
- Mount errors throw synchronously.
- Signal circular deps throw with chain context.
- Structural errors (`when` / `each` grow-function throws) caught by an optional `onError(scope, handler)` registered on `MountScope`; affected subtree replaced with a fallback branch.

No silent failures. No try/catch that hides problems.

### 10.3 Dev-server feedback

- Build errors → Vite overlay, sourcemapped into `.aihu`.
- Runtime errors → `window.onerror` → HMR channel → dev-server terminal.
- HMR compile failures → overlay until fixed; old component keeps running in browser.

### 10.4 Production posture (design-preserving, not implemented in v0)

v0 ships no prod build pipeline. However, error structures are designed up front so the prod posture is achievable without refactor later: errors in prod builds will carry stable codes only (no source content); a `aihu-errors.map` build artifact (not shipped) will resolve codes → origins for monitoring. v0's only responsibility is to *not paint into a corner* that would prevent this later.

## 11. Testing

### 11.1 Pyramid

- **Rust unit (cargo + `insta`):** parser outputs snapshot-locked; compiler emissions snapshot-locked; one test per diagnostic code.
- **TS unit (vitest + `fast-check`):** signal invariants property-tested; arbor mount/dispose in JSDOM; agent accessor behavior; runtime WC lifecycle.
- **Integration:** Vite plugin harness (real plugin, ephemeral Vite config, `.aihu` fixtures); cross-package mount tests in JSDOM.
- **Browser (Playwright + headless Chromium):** `examples/hello-aihu` is the primary e2e — click increments, only the text node mutates, unmount cleans up.

### 11.2 Regression gates (CI, fail-closed)

- Rust: `cargo fmt --check`, `clippy -D warnings`, `cargo test`, `insta review` (no unreviewed snapshots).
- TS: `pnpm lint`, `pnpm typecheck`, `pnpm test`, microbench regression (mount-10k-leaves p50 regression > 10% fails).
- Integration: `pnpm test:integration`.
- Browser: `pnpm test:e2e`.
- **Bundle size gate**: fails if the combined minified+gzipped size of `@aihu/signals` + `@aihu/arbor` + `@aihu/runtime` + `@aihu/agent` exceeds 4096 bytes. Budget changes require an explicit PR against `.size-limit.config`.

### 11.3 Philosophy

Two non-negotiables:
1. Every behavior claim in this spec has a test. If we cannot test it, we cannot claim it.
2. Regression gates are as strict as correctness gates. Bundle size, benchmark latency, and snapshots all fail CI on drift.

### 11.4 Not tested in v0

- No SSR (doesn't exist).
- No MCP protocol (captured only).
- No `when`/`each` behavior (stubs throw — that IS their test).
- No prod build optimization.
- No fuzzing (fast-check is the approximation).
- No visual regression (no styling).

## 12. Exit criteria — "v0 is done when"

All four must be true:

1. `examples/hello-aihu` runs in Chromium via Playwright; click increments counter; only the text node mutates.
2. All CI gates pass: cargo test, clippy, vitest, Playwright, bundle-size ≤ 4096 bytes gz, insta snapshots clean.
3. The `<agent>` block round-trips through the static export and is retrievable via `getAgentMetadata('hello-aihu')`.
4. A deliberately-malformed `.aihu` file produces a structured diagnostic rendered in the Vite overlay.

## 13. Anti-goals (scope-creep traps)

These come up in research projects, usually mid-sprint. Locking them "no" keeps scope honest:

- "Add a router" → no, sub-project #5.
- "Add SSR, it's not that hard" → no, sub-project #6.
- "Emit to multiple backends" → no, IR extraction deferred until two concrete emitters exist.
- "Start the MCP server" → no, sub-project #7.
- "Make `@aihu/signals` a generic Observable library" → no, keep it aihu-focused.

## 14. Key decisions, with rationale

| Decision | Choice | Why |
|---|---|---|
| Foundation floor | Node + Vite 8 + Rolldown | Modern, Rust-native bundling; avoids legacy Rollup architecture. |
| Build-time language | Rust + OXC | Aligns with Rolldown; AST compatibility; future-proof for AI-emission backends. |
| Runtime language | TypeScript | Size-critical code ships as JS; no WASM for sub-KB modules. |
| Rendering model | arbor (persistent reactive tree) | Unifies reactivity, MCP, SSR, dev tools into one serializable structure. |
| Node tiers | branch + leaf (two tiers) | Simpler than three-tier with trunk; scope lives in MountScope instead. |
| Component format | SFC with 4 sections | Familiar (Vue-like); `<agent>` as a first-class section. |
| `<agent>` body | YAML | Ergonomic for prose; maps cleanly to MCP. |
| VDOM | None (full Option Z) | Signals subsume VDOM's role; arbor handles structural change. Vue/React's reactive *primitives* are preserved (signal, computed, effect); what's eliminated is the per-update tree rebuild cost. |
| Signal API | Both function-style + runes | A/B which ergonomics win over time. |
| IR | Deferred | Extract when two concrete backends exist; not before. |
| MCP server | Deferred to sub-project #7 | v0 captures metadata only. |

## 15. Open questions (to resolve before or during implementation)

1. **Signal API default in docs/examples** — function-style or runes-style? Both exist; docs should lead with one.
2. **Shadow DOM vs light DOM for v0** — shadow DOM gives us style scoping for free but complicates future slot work. Light DOM defers the scoping question. *Leaning shadow DOM for v0.*
3. **Exact napi-rs boundary** — which compiler hooks cross into Node synchronously vs via worker threads. Perf profile at first integration test.
4. **HMR state preservation contract** — v0 is best-effort; what "best-effort" means precisely (signals survive if signature unchanged?) needs a decision before HMR is implemented.
5. **Template directive set in v0** — confirmed: `{{ expr }}` interpolation and `@event="handler"` event binding. What else must v0 support? (Proposed: none.)
6. **Ecosystem compat mechanisms (sub-project #11)** — deliberately deferred. Strategies (codemod rewrite, API-compatible primitives, runtime shim, Nuxt-module compat layer, reverse Vue-adapter) will be chosen during #11's own design cycle, informed by evidence from sub-projects #4–#8. Positioning is locked to "Vue/Nuxt ecosystem-bridged"; mechanism is not.

## 16. Sub-project roadmap (context for reviewers)

This spec covers sub-project #4 of eleven:

1. Signal library foundation — subsumed into this spec as `@aihu/signals`.
2. SFC parser — subsumed as `aihu-parser`.
3. arbor runtime + lifecycle — subsumed as `@aihu/arbor`.
4. **Compiler + Vite plugin** — **THIS SPEC**.
5. Router — **Nuxt-shape target** (file-based conventions mirror Nuxt's).
6. SSR + resumable hydration.
7. Agent layer (MCP server, three-layered consumption: signal-graph protocol / structured endpoints / enriched HTML).
8. Meta-framework glue (file routing, data layer, modules, config) — **Nuxt-shape target** (module API designed for Nuxt module portability, mechanism chosen in #8's design cycle).
9. Edge adapters + CDN optimization — **edge-native design** (not Node-first-then-adapted).
10. AI profile-guided optimization pipeline.
11. **Compat & porting layer** — Vue/Nuxt ecosystem bridge. Positioning locked (see §1); specific mechanisms (codemod / API-compat / runtime shim / Nuxt-module compat / reverse Vue-adapter) chosen in #11's own design cycle, informed by evidence from #4–#8.

Each subsequent sub-project gets its own brainstorm → spec → plan → implementation cycle.
