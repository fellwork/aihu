# Aihu v1 — Roadmap

**Status:** PLANNING — 2026-04-30
**Prerequisite:** Compiler v0 complete (Phases C-0 → C-4), `main` at `597e932`
**Architecture reference:** `.team/v1/spec-v1-architecture.md`

Everything here is ordered. Items earlier in the list are dependencies of items later.
Parallel-safe pairs are noted explicitly — they can run on separate branches simultaneously.

---

## Phase 1 — Core runtime (blocks all UI work)

### 1.1 · Reconciler — `when()` and `each()`

**Package:** `@aihu/arbor`
**Branch convention:** `feat/v1-reconciler`
**Parallel-safe with:** 1.2, 1.3 (different packages)

The stubs in `packages/arbor/src/structural.ts` throw `ArborNotImplementedError`. This is the most visible gap — no conditional or list rendering works at all.

**Scope:**
- `when(condition: Signal<boolean>, grow: () => Branch | Leaf): Branch`
  - When condition flips true: call `grow()`, mount result, wire disposers to the when-scope
  - When condition flips false: dispose the when-scope, remove nodes
  - Uses a child `MountScope` — `when`'s dispose is nested under parent scope dispose
- `each(list: Signal<T[]>, key: (item: T) => string | number, grow: (item, index) => Branch | Leaf): Branch`
  - Keyed reconciliation: preserve DOM nodes for stable keys, move/add/remove for changes
  - Key stability is the entire performance story — key function is mandatory
  - Index signal passed to `grow` is reactive (updates on reorder without remounting)

**Acceptance criteria:**
- `when` flips DOM correctly on condition changes — mounts, unmounts, no memory leak (dispose chain works)
- `each` preserves DOM identity for stable keys — no remount on reorder
- `each` handles add, remove, reorder in a single `list` write (batched)
- Existing 255 tests still pass (zero regressions)
- `bun run size` passes — when/each adds ≤ 0.5 kB gz to `@aihu/arbor`
- Bench: `each` 100-item reorder ≤ 2× vanilla `innerHTML` replacement (not a regression target, just a sanity bound)

---

### 1.2 · Component props — typed `observedAttributes` surface

**Package:** `@aihu/runtime`, compiler Phase C-5
**Branch convention:** `feat/v1-props`
**Parallel-safe with:** 1.1, 1.3

`defineComponent`'s `SetupContext` currently has `{ host, element }` only. Components can't receive typed data from parents.

**Scope:**
- Add `attrs: Signal<Record<string, string>>` to `SetupContext` — reactive, updates on `attributeChangedCallback`
- Add `defineProps<T>()` helper: declares which attributes are observed + how to coerce them (string → number, string → boolean, etc.)
- Compiler: `<script setup>` with `defineProps<{ count: number, label: string }>()` → `static observedAttributes = ['count', 'label']` + coercion in `attributeChangedCallback`
- For hand-authored components: `defineProps` is called in setup, returns a signal of the coerced props object

**Acceptance criteria:**
- Parent writes `element.setAttribute('count', '5')` → child's `attrs().count` signal updates to `5` (number, not string)
- `defineProps` with `{ disabled: boolean }` → `disabled=""` → `true`, attribute absent → `false`
- Required props throw a `RuntimeError` if absent at connect time (dev mode only — `__DEV__` guard)
- Compiler emits correct `static observedAttributes` from `defineProps` type argument

---

### 1.3 · Scoped styles — `<style>` block → shadow root

**Package:** Compiler Phase C-5
**Branch convention:** `feat/v1-scoped-styles`
**Parallel-safe with:** 1.1, 1.2

OQ-C7 deferred scoped styles. Shadow DOM makes this nearly free — the compiler just needs to inject the `<style>` block's text content into the shadow root.

**Scope:**
- Compiler: if `<style>` block is present, emit `const __style__ = new CSSStyleSheet(); __style__.replaceSync(cssText)` + `this.shadowRoot.adoptedStyleSheets = [__style__]` in `connectedCallback`
- Compiler: `<style scoped>` (default) — CSS is injected into shadow root only, naturally scoped
- Compiler: `<style global>` — CSS is injected into `document` (for resets, fonts, etc.)
- Remove the "warn and ignore" behavior from Phase C-0; `<style>` blocks are now compiled

**Acceptance criteria:**
- `<style scoped>` CSS rules apply inside shadow root and nowhere else
- `<style global>` CSS rules apply to document
- Multiple components with the same class name don't pollute each other's styles
- `CSSStyleSheet.replaceSync` is used (constructable stylesheets, not `<style>` element injection) for performance

---

### 1.4 · Slots — content projection

**Package:** `@aihu/arbor`, `@aihu/runtime`, compiler Phase C-5
**Branch convention:** `feat/v1-slots`
**Depends on:** 1.2 (props must exist first — slots are effectively unnamed children props)

Custom elements support `<slot>` natively through Shadow DOM. The compiler needs to emit `<slot>` elements, and arbor needs a `slot()` primitive for the tree-building layer.

**Scope:**
- `slot(name?: string): Leaf` — new arbor primitive that emits a `<slot>` DOM element
- Named slots: `slot('header')` → `<slot name="header">`
- Default slot: `slot()` → `<slot>`
- Compiler: `<slot>` in template → `slot()` call in emitted tree
- Compiler: `<slot name="x">` → `slot('x')`
- Light DOM content projection works natively — no runtime magic needed; Shadow DOM handles it

**Acceptance criteria:**
- Default slot projects parent light DOM content into shadow root
- Named slots project correctly
- Multiple named slots in one component work
- `slot()` adds ≤ 50 B gz to `@aihu/arbor`

---

## Phase 2 — Context and data (unlocks composition)

### 2.1 · Context API — `@aihu/context`

**Package:** new `packages/context/`
**Branch convention:** `feat/v1-context`
**Depends on:** 1.1 (reconciler must exist — context needs to propagate through dynamic trees)
**Parallel-safe with:** 2.2 (context must land first, but the two can overlap)

Unblocks `@aihu/data` (cache store), `@aihu/agent-service` (service handle), and deeply nested component communication without prop drilling.

**Scope:**
- `createContext<T>(defaultValue?: T): ContextToken<T>`
- `provide<T>(token, value: Signal<T> | T): void` — called in setup, sets context on the host element via a hidden DOM attribute keyed by token ID
- `inject<T>(token): Signal<T>` — called in setup, walks `parentElement` chain to find nearest provider
- Throws `ContextError` if no provider and no default value
- SSR-safe: during `renderToString`, context is propagated through the virtual render tree (no DOM traversal needed)

**Acceptance criteria:**
- `inject` in a deeply nested child receives the nearest ancestor provider's signal
- Updating the provider's signal propagates to all inject sites reactively
- Two separate `createContext` calls with the same `T` don't interfere
- `ContextError` thrown with component name + token description for debuggability
- `bun run size` passes — target ≤ 0.2 kB gz

---

### 2.2 · Data protocol — `@aihu/data`

**Package:** new `packages/data/`
**Branch convention:** `feat/v1-data`
**Depends on:** 2.1 (context provides the cache store), 1.1 (when/each needed to render loading/error/ready states)

**Scope:**
- `createResource<T>(key, fetcher, options?)` — full implementation per `spec-v1-architecture.md §6`
- `DataState<T>` discriminated union: idle | loading | ready | error | streaming
- Module-level cache (keyed by cache key string) with staleTime / cacheTime eviction
- `provide(DataCacheToken, cache)` / `inject(DataCacheToken)` — cache is context-provided so it's testable and SSR-injectable
- SSR dehydration: during `renderToString`, collect all `ready` resources → serialize to `__aihu_state__`
- Client rehydration: before first fetch, check `__aihu_state__` for matching key

**Acceptance criteria:**
- Two components with the same cache key share one fetch (deduplication)
- Changing the key signal triggers a new fetch; previous result is evicted after `cacheTime`
- SSR: server-fetched data reaches client without a second network request
- `staleTime: 60_000` — resource is not refetched if cache is < 60s old
- Works with any async function — no HTTP/GraphQL coupling in the package itself
- `bun run size` passes — target ≤ 0.4 kB gz

---

## Phase 3 — SSR / hydration chain

### 3.1 · Streaming SSR

**Package:** `@aihu/server`
**Branch convention:** `feat/v1-streaming-ssr`
**Depends on:** 2.2 (data dehydration must exist to stream a complete document)

`renderToString` returns `Promise<string>`. SOTA frameworks stream HTML in chunks — the browser can start rendering before the full document arrives.

**Scope:**
- `renderToStream(component, opts): ReadableStream<string>` — new function alongside `renderToString`
- Streams `<!DOCTYPE html><html><head>…</head><body>` immediately, then streams component subtrees as they resolve
- Async components (those using `createResource`) stream their loading skeleton first, then flush their ready content as a `<template>` + client-side swap script
- `opts.head` and `opts.serializer` work identically to `renderToString`
- `renderToString` becomes a thin wrapper: `renderToStream` → collect all chunks → join

**Acceptance criteria:**
- First byte time: `<head>` chunk arrives before any async data resolves
- Lighthouse: streaming variant scores identically on all categories
- Edge environments (Cloudflare Workers, Deno, Bun): `ReadableStream` works natively — no Node.js stream APIs

---

### 3.2 · Full hydration — sub-project #6

**Package:** `@aihu/arbor`, `@aihu/server`, `@aihu/runtime`
**Branch convention:** `feat/v1-hydration`
**Depends on:** 3.1, 2.2
**Note:** Path keys are already wired in every `_mountEffect` — this is the infrastructure sub-project #6 was designed around.

**Scope:**
- `MountScope.serialize()` — walks path key → Dispose map, calls each signal's current value, returns `Record<string, unknown>`
- `hydrate(component, host, snapshot)` — new function in `@aihu/arbor`
  - Reads `__aihu_state__` from the DOM (written by SSR)
  - Walks the pre-rendered DOM using path keys as anchors
  - Wires signal effects to existing DOM nodes (no re-creation of elements)
  - On mismatch between expected and actual DOM: falls back to full mount + DOM replace
- `defineElement` gains a `hydrate` option: when true, `connectedCallback` calls `hydrate` instead of `mount` if `__aihu_state__` is present

**Acceptance criteria:**
- No flicker: client hydration attaches to SSR HTML without DOM replacement for matching components
- `scope.serialize()` round-trips: `serialize → JSON.stringify → JSON.parse → hydrate` restores exact signal state
- Mismatch fallback works: altered SSR HTML triggers clean re-mount, no crash
- Path key coverage: every `leaf([signal, setter])` has a stable `data-aihu-path` attribute after SSR

---

### 3.3 · Islands / partial hydration

**Package:** `@aihu/runtime`, Vite plugin
**Branch convention:** `feat/v1-islands`
**Depends on:** 3.2

Custom elements are naturally islands — each `<x-counter>` is independently hydratable. This plan makes that explicit and adds compiler/toolchain support for declaring which elements are interactive.

**Scope:**
- Vite plugin option: `islands: true` — marks components as interactive or static
- Compiler: `<script setup>` with no signals → emit as static island (no `hydrate`, no JS delivered to client)
- Compiler: `<script setup>` with signals → emit as interactive island (JS delivered, hydrates on load)
- `defer` attribute on custom element: `<x-counter defer>` → hydrates when element enters viewport (Intersection Observer)
- Build output: static islands emit HTML only; interactive islands emit HTML + a small JS chunk

**Acceptance criteria:**
- Static component with no signals: zero client JS for that component
- Deferred hydration: element does not request its JS until it enters the viewport
- Total JS delivered on an islands page with 3 static + 2 interactive components: only the 2 interactive bundles downloaded

---

## Phase 4 — Developer experience

### 4.1 · HMR — hot module replacement

**Package:** `@aihu/runtime`, Vite plugin
**Branch convention:** `feat/v1-hmr`
**Depends on:** 1.2 (props must exist — HMR re-runs setup with existing props)
**Parallel-safe with:** 4.2, 4.3

Vite's `import.meta.hot` API lets modules register update handlers. When a `.aihu` file changes, the component should re-run `setup()` and re-mount without a full page reload.

**Scope:**
- Runtime: `_hmrReplace(element, newSetup)` — disposes the current `MountScope`, re-runs `newSetup(ctx)`, mounts new tree into the same host
- Vite plugin: registers `import.meta.hot.accept()` in emitted JS; on update calls `_hmrReplace` for each connected instance of the updated element
- Signal state preservation: if the new setup has the same signal names/types, preserve values across HMR (best-effort — schema change = reset)
- `<style>` block changes: hot-reload CSS without touching JS at all

**Acceptance criteria:**
- Editing template in a `.aihu` file: DOM updates without page reload in < 200ms
- Editing setup logic: component re-mounts with preserved signal values where compatible
- Editing `<style>` block: CSS updates without JS reload
- HMR code is dead-code eliminated from production builds (`__DEV__` guard)

---

### 4.2 · Error boundaries

**Package:** `@aihu/runtime`, `@aihu/arbor`
**Branch convention:** `feat/v1-error-boundaries`
**Parallel-safe with:** 4.1, 4.3

An unhandled throw in `setup()`, an effect, or a `when`/`each` grow function currently propagates uncaught. Production apps need graceful degradation.

**Scope:**
- `onError(handler: (err: unknown, info: ErrorInfo) => Branch | Leaf): void` — called in setup, registers a fallback tree factory for the current component scope
- Any throw inside the component's signal graph (setup, effects, grow functions) is caught at the nearest registered `onError`
- `ErrorInfo`: `{ tag: string, phase: 'setup' | 'effect' | 'render', pathKey: string }`
- Unhandled errors (no `onError` ancestor): emits to `window.onerror` / `console.error`, does NOT crash the entire app
- Compiler: `<error-boundary>` template element as sugar for `when(hasError, () => errorFallback())`

**Acceptance criteria:**
- Setup throw in child: parent's `onError` fires, fallback tree renders, rest of app continues
- Effect throw (signal update error): caught at nearest `onError` boundary
- Nested boundaries: inner catches first; outer catches if inner re-throws
- No boundary: error logged, component removed from DOM, sibling components unaffected

---

### 4.3 · TypeScript template type-checking

**Package:** Compiler Phase C-6
**Branch convention:** `feat/v1-ts-template`
**Depends on:** 1.2 (props), 1.4 (slots) — type system must cover the full component surface

Vue has `vue-tsc`. Aihu's compiler emits TypeScript — the template type-checking is done by removing the `as unknown as Signal<string>` casts and emitting precise types instead.

**Scope:**
- Compiler: resolve `{{ expr }}` types from the setup script's TypeScript AST (via OXC)
- Compiler: `:attr="expr"` — verify `expr` type is assignable to the attribute's declared type
- Compiler: `@event="handler"` — verify `handler` is `(e: EventType) => void`
- Compiler: `defineProps<T>()` type argument → attribute type map (for parent template type-checking)
- Generated output has precise types — `tsc --noEmit` on emitted `.ts` catches template errors

**Acceptance criteria:**
- `{{ nonexistent }}` — TypeScript error: property does not exist
- `:disabled="stringValue"` where `disabled` expects boolean — TypeScript error
- `@click="handlerWithWrongSignature"` — TypeScript error
- Valid templates: `tsc --noEmit` clean

---

## Phase 5 — Agentic layer

### 5.1 · AgentManifest + `<agent>` block compiler support

**Package:** `@aihu/agent` (v1 additions), Compiler Phase C-5
**Branch convention:** `feat/v1-agent-manifest`
**Depends on:** Compiler C-4 complete, spec-v1-architecture.md §3–§5 ratified

**Scope:**
- `@aihu/agent` v1 additions: `AgentManifest`, `AgentStateDecl`, `AgentActionDecl`, `AgentBindings` types per spec §3.1
- `registerAgentManifest(manifest)` — replaces/extends `registerAgentMetadata` (backward compatible)
- Compiler C-5: parse `<agent>` block per grammar in spec §4.1
- Compiler C-5: emit `__agentManifest__` static export per spec §4.4
- Compiler C-5: emit `__agentBindings__` factory function per spec §4.4
- Compiler C-5: dual-mode action codegen per spec §5

**Acceptance criteria:**
- Counter example `.aihu` → `__agentManifest__` matches snapshot exactly
- Form example with `sets:` → `__agentBindings__().actions.submit('Alice', 'alice@x.com')` pre-fills signals and returns `{ status: 'done' | 'error' }`
- Private signal not in `<agent>` block → not in manifest, not in bindings
- `registerAgentManifest` backward-compatible: old `registerAgentMetadata` callers still work

---

### 5.2 · `@aihu/agent-service`

**Package:** new `packages/agent-service/`
**Branch convention:** `feat/v1-agent-service`
**Depends on:** 5.1, 2.1 (context for service handle propagation)
**Layer 4 — server/edge only**

**Scope:**
- `createAgentService(options)` — discovers all registered manifests, manages bindings lifecycle
- Attaches to a aihu app's router as middleware
- MCP adapter: maps `AgentManifest` to MCP server tools/resources (replaces current static `McpServerCard` approach)
- `AgentService.getManifest()` — returns aggregated app-level manifest for discovery endpoints

**Acceptance criteria:**
- MCP `tools/call increment` → routes to correct component binding → signal updates → response returned
- State subscription: MCP resource subscription → signal change → SSE event emitted
- Unmounted component: binding released, calls return 404-equivalent
- Backward compatible with existing `@aihu/agent-readiness` static card generation

---

### 5.3 · A2A and ACP adapters

**Package:** new `packages/agent-a2a/`, `packages/agent-acp/`
**Branch convention:** `feat/v1-a2a-adapter`, `feat/v1-acp-adapter`
**Depends on:** 5.2
**Parallel-safe with each other**

**Scope (A2A):**
- `mountA2aAdapter(service, options)` — exposes the agent service over Google A2A protocol
- `/.well-known/agent.json` discovery endpoint
- Task submission → routes to action binding
- Streaming task updates via SSE for `streaming: true` actions

**Scope (ACP):**
- `mountAcpAdapter(service, options)` — exposes over ACP protocol
- ACP agent card endpoint
- Message → action routing

---

## Phase 6 — Application layer

### 6.1 · File-based routing — `@aihu/router`

**Package:** new `packages/router/`
**Branch convention:** `feat/v1-router`
**Depends on:** 2.2 (data integration), 2.1 (context for route params)

Vite plugin that scans `pages/` directory, generates a route manifest, and wires it to `createRouter` from `@aihu/server`.

**Scope:**
- `pages/index.ts` → `GET /`
- `pages/[id].ts` → `GET /:id` (dynamic segment)
- `pages/[...all].ts` → catch-all
- Route modules export a `default` component and optional `loader`
- Vite plugin generates the manifest at build time; dev server uses it for HMR

---

### 6.2 · Signals deep-chain optimization

**Package:** `@aihu/signals`
**Branch convention:** `feat/v1-signals-deepchain`
**Depends on:** nothing (standalone)
**Parallel-safe with:** everything

Learning #26: aihu loses 1.65× on 100-deep linear chains vs. alien-signals. The gap is documented and the fix (version-counter short-circuit) is identified.

**Scope:**
- Investigate alien-signals' version-counter approach
- Implement or disprove as a fix for the deep-propagation-100 benchmark
- Target: ≤ 1.1× gap (from 1.65×) without regressing shallow-diamond wins
- Bench receipt mandatory before merge

---

## Phase 7 — v1 cutover

### 7.1 · v1 cutover

**Branch convention:** `release/v1`
**Depends on:** All phases 1–5 complete; phase 6 optional

**Scope:**
- Remove "Rust SFC compiler is the remaining v0 → v1 gate" callout from README
- Update README: v1 feature table, bundle sizes, test count
- Re-enable GHA auto-triggers (push/PR) — remove `workflow_dispatch` only note
- Publish packages to npm registry: `@aihu/signals`, `@aihu/arbor`, `@aihu/runtime`, `@aihu/agent`, `@aihu/server`, `@aihu/agent-readiness`, `@aihu/context`, `@aihu/data`
- Package versions: all 1.0.0
- Add `LICENSE` file

---

## Dependency graph (visual)

```
1.1 Reconciler ──────────────────────────────────┐
1.2 Props ────────────────────────────────────────┤
1.3 Scoped styles (parallel with 1.1, 1.2)        │
1.4 Slots (needs 1.2)                             │
                                                   ▼
2.1 Context ──────────────────────────────────────┐
2.2 Data (needs 2.1, 1.1)                         │
                                                   ▼
3.1 Streaming SSR (needs 2.2) ────────────────────┐
3.2 Full hydration (needs 3.1, 2.2)               │
3.3 Islands (needs 3.2)                           │
                                                   │
4.1 HMR (needs 1.2, parallel with 4.2/4.3) ───────┤
4.2 Error boundaries (parallel)                    │
4.3 TS template types (needs 1.2, 1.4)            │
                                                   ▼
5.1 AgentManifest + <agent> compiler ─────────────┐
5.2 AgentService (needs 5.1, 2.1)                 │
5.3 A2A/ACP adapters (needs 5.2, parallel)        │
                                                   ▼
6.1 File-based routing (needs 2.2)
6.2 Signals optimization (parallel with everything)
                                                   ▼
7.1 v1 cutover
```

---

## Parallel-safe pairs (can run simultaneously)

| Pair | Safe? | Note |
|---|---|---|
| 1.1 + 1.2 + 1.3 | ✓ | Different packages |
| 2.1 + (start of) 2.2 | Partial | 2.2 must wait for 2.1 to land |
| 4.1 + 4.2 + 4.3 | ✓ | Different packages/compiler phases |
| 5.3-a2a + 5.3-acp | ✓ | Entirely separate packages |
| 6.2 + anything | ✓ | Signals package is isolated |
| Compiler track + any runtime track | ✓ | `packages/compiler/` never touches `packages/*/src/` |

---

## Plan count summary

| Phase | Plans | New packages |
|---|---|---|
| 1 — Core runtime | 4 | — |
| 2 — Context + data | 2 | `@aihu/context`, `@aihu/data` |
| 3 — SSR/hydration | 3 | — |
| 4 — DX | 3 | — |
| 5 — Agentic | 3 | `@aihu/agent-service`, `@aihu/agent-a2a`, `@aihu/agent-acp` |
| 6 — Application | 2 | `@aihu/router`, `@aihu/data-fetch` |
| 7 — Cutover | 1 | — |
| **Total** | **18** | **6** |

---

*Authored: 2026-04-30. Requires architecture spec ratification before any Phase 1+ Builder dispatch.*
