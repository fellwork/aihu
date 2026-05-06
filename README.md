# Aihu

> **Aihu — agentic discovery and interaction, for human purpose.**
>
> Say *EYE-hoo* · 爱护 (*àihù*) · *"to cherish and protect."*

A complete meta-framework for the agentic web. You write `.aihu` Single-File Components — block-structured (`@state`, `@template`, `@style`, `@agent`, `@route`) — and a Rust compiler emits standards-compliant Web Components AND machine-readable agent manifests. The runtime is sub-2 kB. Every component shipped by every Aihu app is discoverable by AI agents and callable as a tool — in service of whatever a human is building.

> **Status:** v1 shipped 2026-05-03 (17 plans complete). v1.1 in progress — release pipeline, examples portfolio, SFC primitive roadmap landed; npm publish at `0.1.x` rolling out. See [`docs/roadmap/SUMMARY.md`](./docs/roadmap/SUMMARY.md) for the full plan.

[![CI](https://github.com/fellwork/aihu/actions/workflows/plan-a.yml/badge.svg)](https://github.com/fellwork/aihu/actions/workflows/plan-a.yml)
[![release](https://github.com/fellwork/aihu/actions/workflows/release.yml/badge.svg)](https://github.com/fellwork/aihu/actions/workflows/release.yml)
[![@aihu/signals on npm](https://img.shields.io/npm/v/@aihu/signals.svg?label=@aihu/signals)](https://www.npmjs.com/package/@aihu/signals)
[![tests](https://img.shields.io/badge/tests-607%20TS%20%7C%20222%20Rust%20passing-brightgreen)](#)
[![packages](https://img.shields.io/badge/packages-19-blue)](#packages)
[![llms.txt](https://img.shields.io/badge/llms.txt-supported-blueviolet)](#compliance)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue?logo=anthropic)](#compliance)
[![Agent Ready](https://img.shields.io/badge/agent--ready-yes-brightgreen)](#compliance)

---

## Quickstart

```bash
# Scaffold a new app
bunx @aihu/cli app my-app
cd my-app
bun install
bun run dev      # http://localhost:5173

# Or run the canonical examples portfolio in parallel
git clone https://github.com/fellwork/aihu
cd aihu && bun install
bun run dev:examples
```

For an SFC tour, see [`examples/live-counter/`](./examples/live-counter) (~40 LOC) or jump to the [13-example portfolio](./examples/README.md).

---

## What it is

Aihu is a **complete meta-framework for the agentic web**. You write `.aihu` Single-File Components — block-structured (`@state`, `@template`, `@style`, `@agent`, `@route`) — and the Rust compiler emits standards-compliant Web Components AND machine-readable agent manifests. The runtime is sub-2 kB. The framework includes:

- **Reactive runtime core** — push-based signals, computeds, effects, batched writes (`@aihu/signals` + `@aihu/arbor`). 122× faster than vanilla DOM on targeted reactive updates.
- **Compiler with WASM build** — Rust-native CLI binary published per platform, plus a WASM bundle for browser playgrounds (Directive 1).
- **Agentic discovery** — every component declares its agent surface in a co-located `@agent` block. The compiler emits an MCP tool schema. Plugins for A2A and ACP protocols ship in-tree.
- **File-based routing + SSR** — `@aihu/router` + `@aihu/server` give you full meta-framework capability: nested routes, loaders, hydration, cookies, server actions.
- **Auth, data, context, plugin system** — zero-dep `@aihu/*` packages compose into the meta-framework. SFC primitives for `<$guard>`, `$user`, `$resource`, `<$liveRegion>`, `<$focusTrap>`, `<$router>`, `<$link>`, `<$outlet>`, `$beforeNavigate`/`$afterNavigate` (arch-5 §6 v1.1 M1).
- **Cloud adapters** — `@aihu/adapter-cloudflare`, `@aihu/adapter-vercel` ship in-tree.
- **DX toolchain** — `@aihu/cli` (`aihu app`/`page`/`component`/`plugin`/`dev`/`build`), VSCode extension (Volar-style language server, in flight).

The output is **vanilla custom elements**: no framework lock-in at the consumer boundary, no global context, no hydration step — and every component is, by construction, agent-callable.

## Why "meta-framework"?

Aihu lets you build **whole apps**, not just components. The "meta" word is doing two jobs:

- **It is meta in the layer sense.** `@aihu/signals` (reactive primitive) → `@aihu/arbor` (DOM mounting) → `@aihu/runtime` (custom-element wiring) → `@aihu/router` (file-based routing) → `@aihu/server` (SSR + edge) → `@aihu/app` (the integrated framework). Each layer is usable on its own; stacked they are a meta-framework.
- **It is meta in the Next.js / Nuxt / SvelteKit sense.** File-based routing replaces the boilerplate other meta-frameworks impose. SSR, loaders, cookies, auth, and data are first-class — not bolt-ons. The agent surface is woven into the SFC, not exposed via a separate API gateway. Cloud adapters are in-tree, not third-party.

Aihu is to Lit what Next.js is to React — a complete app framework that uses the underlying runtime as one layer of many. Compare to: Solid (single-package), Lit (templating + base class only), Vue (proxy-based, ships its own scheduler). Only Aihu makes the agent surface a first-class block of the SFC.

---

## Features

### Reactive runtime
- Push-based signals + computeds + effects with batched writes (`@aihu/signals`, ~1.8 kB gz)
- Direct DOM patching with no virtual DOM (`@aihu/arbor`, ~2.1 kB gz; **122× faster than vanilla** on targeted reactive updates)
- Synchronous mount + LIFO teardown via `branch` / `leaf` / `mount` primitives
- `defineComponent` runtime that registers compiled SFCs as custom elements (`@aihu/runtime`)

### Compiler & toolchain
- Rust-native compiler reads `.aihu` SFCs and emits `class extends HTMLElement` calling `mount(buildTree(), this.shadowRoot)`
- Per-platform pre-built binaries via `npm install @aihu/compiler` (M1: Linux, macOS, Windows, aarch64-Linux; SHA256-verified)
- WASM build for browser playgrounds (compile latency target: <200ms for a 50-line SFC, bundle <1 MB initial JS)
- Scoped styles, slots, reconciler (`when`/`each`), TS template-typed templates, error boundaries, HMR, islands, full hydration

### Agent surface (built-in)
- `@agent` block on every SFC declares exposed state + actions; compiler emits a matching MCP tool schema alongside the Web Component
- A2A + ACP protocol implementations in-tree (`@aihu/agent-a2a`, `@aihu/agent-acp`)
- `@aihu/agent-service` is the server-side execution surface; live-binding (RFC, APPROVED) wires `@agent` actions to the actual runtime signal graph
- `@aihu/agent-readiness` emits `llms.txt`, MCP Server Card (SEP-1649), and `robots.txt` from any Aihu app — no manual config

### Meta-framework capabilities
- File-based routing with nested routes, layouts, route plugins (`@aihu/router`)
- Server-side rendering, streaming, loaders, cookies, full hydration, islands (`@aihu/server`)
- Async-context request primitives (`@aihu/context`)
- Reactive resource + loader protocol (`@aihu/data`)
- SFC primitives shipping in v1.1 M1: `<$guard>`, `$user`, `$resource`, `<$liveRegion>`, `<$focusTrap>`, `<$router>`, `<$link>`, `<$outlet>`, `$beforeNavigate`, `$afterNavigate` (arch-5 §6)
- Cloud adapters: `@aihu/adapter-cloudflare`, `@aihu/adapter-vercel`

### DX
- `aihu` CLI: scaffolding (`app` / `page` / `component` / `plugin`), `dev`, `build` (`@aihu/cli`)
- VSCode extension with TextMate grammar today, Volar-style language server in flight (`packages/vscode-aihu`, `packages/language-server` M2)
- 13-example portfolio with parallel `bun run dev:examples` launcher
- Shared design system in `examples/_shared/`
- Bun + Moon + Rolldown + Biome + Vitest + size-limit toolchain

### Compliance
- **llms.txt** — every Aihu app is discoverable by AI tools out of the box
- **MCP** — Anthropic Model Context Protocol compatible (Server Card, tool schemas, resources)
- **Agent-Ready** — every component shipped by every Aihu app has an agent surface
- **WCAG 2.1** a11y — `<$liveRegion>`, `<$focusTrap>`, `<$skipLink>` core primitives (arch-5 §5)

---

## v1.1 progress

After v1 cutover (2026-05-03), v1.1 development is in flight. Three PRs already landed; two more are in-flight builders.

| Track | PR | What | Status |
|---|---|---|---|
| Release pipeline | [#61](https://github.com/fellwork/aihu/pull/61) | aarch64-linux build target + WASM bundle for browser playground + SHA256 sidecars + verified install | merged |
| Examples polish | [#62](https://github.com/fellwork/aihu/pull/62) | 6 examples polished (EX-01..05 + EX-08) with `@agent` blocks, dark-mode tokens, mobile-responsive CSS, smoke tests, parallel dev launcher | merged |
| SFC primitives roadmap | [#63](https://github.com/fellwork/aihu/pull/63) | [arch-5](./docs/roadmap/arch-5-sfc-primitives.md) — 27 new primitives across design, styles, data, auth, i18n, a11y, routing; 25 RFC stubs; new `@aihu/i18n` plugin proposed | merged |
| npm publish pipeline | (in flight) | Changesets-based versioning + `publish-packages` job + tier A/B/C/D at `0.1.0` early-access | building |
| Release-workflow hardening | (in flight) | commitlint via Husky + branch protection + `RELEASING.md` runbook | building |

### Held pending RFC
- **Live-binding** (RFC #56) — reactive component-instance registry connecting `@agent` actions to live signals. APPROVED in design; security review of §9 in progress per Directive 3.
- **`<playground-embed>` custom element** — interactive `.aihu` playground on the homepage. Gates on the WASM bundle published in `releases/latest` (i.e. on the first `v1.1.0` tag push).

---

## Project posture

This is a **research codebase**. The phases are sequenced so each layer's design decisions are pinned by a binding spec before code lands; performance regressions block merge; bench receipts are mandatory on every runtime PR. See `.team/phase-3/spec-arbor.md` §0.5 for the full posture statement.

All 17 v1 plans shipped 2026-05-03. Packages are at `1.0.0` as of the v1 cutover (Plan 7.1).

> **Dep-free thesis (v1 contract).** Aihu is dep-free at runtime — every package's `dependencies` list is empty (Learning #49). This is a v1 contract.

---

## Performance

All results from `bench/`. Measured with [mitata](https://github.com/nicolo-ribaudo/mitata) + Bun 1.3.8. p50 latencies shown. Full tables in `bench/signals/RESULTS.md` and `bench/arbor/RESULTS.md`.

<!-- BEGIN_AUTOGEN: performance -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

### `@aihu/signals` vs SOTA reactive libraries

*Source: [`bench/signals/RESULTS.md`](./bench/signals/RESULTS.md). p50 latency shown for each competitor.*

| Workload | @aihu/signals | alien-signals | @preact/signals-core | @vue/reactivity | solid-js | s-js |
|---|---:|---:|---:|---:|---:|---:|
| `cellx` | 415.89 ns | 716.09 ns | 572.12 ns | 954.10 ns | 1.52 µs | 653.78 ns |
| `batched-writes-100` | 2.69 µs | 3.64 µs | 4.47 µs | 8.34 µs | 6.76 µs | 2.66 µs |
| `dynamic-deps` | 585.94 ns | 1.35 µs | 952.44 ns | 3.93 µs | 1.10 µs | 649.54 ns |
| `creation-1to1000` | 87.63 µs | 96.43 µs | 57.70 µs | 89.86 µs | 72.50 µs | 72.16 µs |
| `deep-propagation-100` | 2.88 µs | 2.25 µs | 3.48 µs | 4.86 µs | 6.89 µs | 2.63 µs |

### `@aihu/arbor` vs SOTA DOM-binding libraries

*Source: [`bench/arbor/RESULTS.md`](./bench/arbor/RESULTS.md). JSDOM workloads, p50 latency.*

| Workload | @aihu/arbor | lit-html | solid-js | @vue/runtime-dom | preact | vanilla |
|---|---:|---:|---:|---:|---:|---:|
| `mount-10k-leaves` | 37.43 ms | 5.46 s | — | — | 65.53 ms | 91.06 ms |
| `mount-deep-100x10` | 3.15 ms | 61.25 ms | — | — | 8.79 ms | 23.48 ms |
| `mount-wide-1000` | 8.06 ms | 52.33 ms | — | — | 9.79 ms | 12.51 ms |
| `update-1-of-10k-leaves` | 25.00 ns | 635.80 µs | — | — | 1.64 ms | 3.14 µs |
| `krausest-1k-cycle` | 22.27 ms | 79.42 ms | — | — | 19.71 ms | 16.46 ms |

<sub><i>Auto-generated on commit `68a61e6`.</i></sub>

<!-- END_AUTOGEN: performance -->

> The `update-1-of-10k-leaves` 122× win comes from arbor's `leaf()` binding to `textNode.nodeValue` (direct property set) vs. vanilla's `element.textContent` (child-list walk). This is not a measurement artifact — it reflects the bind-target choice in `materialize.ts`.

> solid-js and @vue/runtime-dom ERROR in all JSDOM workloads (client-only API / `SVGElement` not defined). Browser-native comparison deferred to Round N+2 Playwright runner.

### Bundle size (gz)

Per-package gates enforced by `bun run size`:

<!-- BEGIN_AUTOGEN: bundle-sizes -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Package | Size (gz) | Limit | Status |
|---|---:|---:|:---:|
| `@aihu/context` | 248 B | 300 B | pass |
| `@aihu/signals` | 1.67 kB | 1970 B | pass |
| `@aihu/arbor` | 2.05 kB | 2200 B | pass |
| `@aihu/runtime` | 2.02 kB | 2100 B | pass |
| `@aihu/agent` | 142 B | 200 B | pass |
| `@aihu/data` | 774 B | 800 B | pass |
| `@aihu/router` | 2.02 kB | 2400 B | pass |
| `@aihu/agent-service` | 579 B | 600 B | pass |
| `@aihu/agent-acp` | 591 B | 600 B | pass |
| `@aihu/agent-a2a` | 721 B | 750 B | pass |
| `@aihu/app` | 741 B | 800 B | pass |

<sub><i>Auto-generated on commit `68a61e6`.</i></sub>

<!-- END_AUTOGEN: bundle-sizes -->

> **Per-package rows are the contract; combined is reported, not budgeted.** The pre-v1 "≤ 3.46 kB combined" target was retired at v1 cutover (Plan 7.1) — packages grew to support hydration, islands, error boundaries, and reconciliation. Each row in `.size-limit.json` is the binding gate. See [`.size-limit.README.md`](./.size-limit.README.md).

---

## Layout

> **Publish status:** Tier A/B/C/D packages publishing at `0.1.x` early-access via the [v1.1 publish pipeline](#v11-progress). Tier E (held) stays private until live-binding RATIFIES.

See [`packages/`](./packages) for all packages on disk. By tier:

- **Browser runtime (sized, ships to client):** `@aihu/signals`, `@aihu/arbor`, `@aihu/runtime`, `@aihu/context`, `@aihu/agent`.
- **Server / edge / data (sized):** `@aihu/router`, `@aihu/data`, `@aihu/agent-service`, `@aihu/agent-acp`, `@aihu/agent-a2a`. Plus `@aihu/server` (SSR + back-compat router alias), `@aihu/agent-readiness` (`llms.txt`, MCP Server Card, robots, Vite plugin), `@aihu/app` (top-level integration).
- **Cloud adapters (in-tree):** `@aihu/adapter-cloudflare`, `@aihu/adapter-vercel`.
- **Build-time only (not shipped):** `@aihu/compiler` (Rust SFC compiler), `@aihu/cli` (`aihu app`, `aihu dev`, `aihu build`), `@aihu/plugin` (plugin contract types).
- **Editor:** `vscode-aihu` (TextMate grammar + snippets; Volar LSP in M2).

### Packages

<!-- BEGIN_AUTOGEN: packages -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Package | Version | Description |
|---|---|---|
| [`@aihu/adapter-cloudflare`](./packages/adapter-cloudflare) | `0.1.0` | Cloudflare Workers/Pages deployment adapter for @aihu/app. |
| [`@aihu/adapter-vercel`](./packages/adapter-vercel) | `0.1.0` | Vercel deployment adapter for @aihu/app. |
| [`@aihu/agent`](./packages/agent) | `0.1.0` | Agent primitives — the foundation of aihu agent-readiness. |
| [`@aihu/agent-a2a`](./packages/agent-a2a) | `0.1.0` | A2A (Agent-to-Agent) protocol bindings for @aihu/agent-service. |
| [`@aihu/agent-acp`](./packages/agent-acp) | `0.1.0` | ACP (Agent Control Protocol) bindings for @aihu/agent-service. |
| [`@aihu/agent-readiness`](./packages/agent-readiness) | `0.1.0` | Discovery + readiness manifest emitter so agents can introspect aihu apps. |
| [`@aihu/agent-service`](./packages/agent-service) | `0.1.0` | Service-side agent runtime (server-hosted agent endpoints). |
| [`@aihu/app`](./packages/app) | `0.1.0` | Top-level app integration — wires runtime, router, and adapters into a Vite app. |
| [`@aihu/arbor`](./packages/arbor) | `0.1.0` | Reactive component tree (the rendering layer that consumes @aihu/signals). |
| [`@aihu/cli`](./packages/cli) | `0.1.0` | Aihu CLI (`aihu`, `create-aihu`) — scaffolding, dev, build commands. |
| [`@aihu/compiler`](./packages/compiler) | `0.1.0` | Single File Component (.aihu) compiler — Rust binary + JS glue. |
| [`@aihu/context`](./packages/context) | `0.1.0` | Async-context-friendly request/SSR context primitives for aihu. |
| [`@aihu/data`](./packages/data) | `0.1.0` | Reactive data loaders and resource primitives for aihu. |
| [`@aihu/plugin`](./packages/plugin) | `0.1.0` | Plugin substrate shared by @aihu/server and the meta-framework — runtime hook surface. |
| [`@aihu/router`](./packages/router) | `0.1.0` | File-based router for the aihu meta-framework. |
| [`@aihu/runtime`](./packages/runtime) | `0.1.0` | Single File Component (.aihu) runtime — registers custom elements compiled by @aihu/compiler. |
| [`@aihu/server`](./packages/server) | `0.1.0` | Server runtime + native renderer (napi-rs) for aihu SSR. |
| [`@aihu/signals`](./packages/signals) | `0.1.0` | Tiny reactive signals — the reactive primitive at the core of aihu. |
| [`vscode-aihu`](./packages/vscode-aihu) | `1.0.0` | Syntax highlighting, snippets, and language support for .aihu Single File Components |

<sub><i>Auto-generated on commit `68a61e6`.</i></sub>

<!-- END_AUTOGEN: packages -->

---

## Examples

13-example portfolio under [`examples/`](./examples). Six are M1-polished with full `@agent` surfaces, dark-mode tokens, and smoke tests:

<!-- BEGIN_AUTOGEN: examples -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| # | Folder | What it teaches | Port |
|---|---|---|---|
| 01 | [`blog-loader/`](./examples/blog-loader) | A server-rendered post page demonstrating aihu's loader pattern. | — |
| 02 | [`blog-router/`](./examples/blog-router) | A 3-page blog demonstrating aihu's file-based routing. | — |
| 03 | [`color-theme/`](./examples/color-theme) | `$reactive(...)` in `@style` plus `$global { }` to propagate tokens beyond component scope — and `$media` macro for responsive breakpoint... | 5105 |
| 04 | [`css-pluggability/`](./examples/css-pluggability) | A worked example showing how to plug **Tailwind CSS** into a aihu app, plus documented swap paths to **UnoCSS**, **Pico CSS**, and **vani... | — |
| 05 | [`hacker-news/`](./examples/hacker-news) | A aihu port of the canonical Hacker News reader. Hits the live HN API. M1 polish: dark-mode token pass, `@agent` block on the index page,... | 5108 |
| 06 | [`live-counter/`](./examples/live-counter) | the smallest possible aihu component — state, event handlers, a reactive text node, and an agent surface, in one file. | 5101 |
| 07 | [`temperature-converter/`](./examples/temperature-converter) | two-way binding plus a computed-derived counterpart (7GUIs #2), and an agent surface that lets AI tools read and write the temperature on... | 5102 |
| 08 | [`timer/`](./examples/timer) | lifecycle hooks, reactive derivations, and an agent surface that lets AI monitor timer progress and trigger resets on the human's behalf ... | 5103 |
| 09 | [`todo-mvc/`](./examples/todo-mvc) | the canonical TodoMVC — list reactivity, filtering, computed derivations, keyed iteration, localStorage persistence, and an agent surface... | 5104 |

<sub><i>Auto-generated on commit `68a61e6`.</i></sub>

<!-- END_AUTOGEN: examples -->

Run all polished examples in parallel:

```bash
bun run dev:examples
```

The remaining examples ship in M2.

---

## Toolchain

- **Runtime:** [Bun](https://bun.sh) ≥ 1.3.0, Node ≥ 20.18.0. Both required (`engines` enforced).
- **Bundler:** [Rolldown](https://rolldown.rs) — Rust-based, OXC ecosystem.
- **Test:** [Vitest](https://vitest.dev) + jsdom + [fast-check](https://github.com/dubzzz/fast-check) (property tests).
- **Lint/format:** [Biome](https://biomejs.dev).
- **Task runner:** [Moon](https://moonrepo.dev) — `moon run :build`, `moon run :typecheck`.
- **Size budget:** [size-limit](https://github.com/ai/size-limit) gates per-package gzipped bundles.
- **Tool versions:** pinned via [proto](https://moonrepo.dev/proto) (`.prototools`).

---

## Workspace dev loop

```bash
bun install
bun run build      # build all packages
bun run test       # 607 TS tests + 222 Rust tests (unit + integration + compliance)
bun run size       # per-package gzipped bundle gates
bun run check      # biome lint + format
bash scripts/check-boundary.sh   # AC-7: hard boundary (no client imports in server layer)
bash scripts/check-edge-safe.sh  # AC-6: no Node-only globals in dist bundles
bun run test:quality              # Lighthouse gate (≥ 90 on perf/a11y/best-practices/seo)
```

Run the bench suites:

```bash
cd bench/signals && bun src/runner.ts   # signals vs SOTA
cd bench/arbor   && bun src/runner.ts   # arbor vs SOTA (JSDOM)
```

Use the packages directly:

```ts
import { signal, computed, effect } from '@aihu/signals'
import { branch, leaf, mount } from '@aihu/arbor'
import { defineComponent } from '@aihu/runtime'
import { registerAgentMetadata } from '@aihu/agent'

const [count, setCount] = signal(0)
const tree = branch('div', null, [leaf([count, setCount])])
const scope = mount(tree, document.body)
setCount(1) // DOM updates synchronously via nodeValue
scope.dispose()
```

Edge / server (fetch-API, works on Cloudflare Workers, Deno, Bun) — request-router shape from `@aihu/server`. Two distinct routing APIs ship in aihu: `@aihu/server.createRequestRouter` builds a fetch-API request handler from an explicit route manifest (shown below), while `@aihu/router.createRouter` powers file-based routing via the v1 Vite plugin (`viteRouterPlugin`); see [`docs/site/routing-layouts.md`](./docs/site/routing-layouts.md).

```ts
import { createRequestRouter, defineRoute, json } from '@aihu/server'
import { createAgentReadinessRoutes } from '@aihu/agent-readiness'

const ar = createAgentReadinessRoutes({
  name: 'My App',
  endpoint: 'https://myapp.workers.dev/mcp',
  summary: 'A aihu-powered app.',
})

const router = createRequestRouter({
  routes: [
    defineRoute('/llms.txt', ar.llmsTxt),
    defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
    defineRoute('/robots.txt', ar.robotsTxt),
    defineRoute('/api/hello', () => json({ hello: 'world' })),
  ],
})

// Cloudflare Worker
export default { fetch: router }
// Deno / Bun
// Deno.serve(router)  |  Bun.serve({ fetch: router })
```

---

## Compliance

The agent-protocol badges are backed by real test gates in `bun run test`.

| Gate | Tests | Status |
|---|---|---|
| `llms.txt` format (llmstxt.org spec) | 9 tests in `packages/agent-readiness/tests/compliance/llms-txt-spec.test.ts` | passing |
| MCP Server Card schema (SEP-1649) | 14 tests in `packages/agent-readiness/tests/compliance/mcp-server-card-schema.test.ts` | passing |
| `robots.txt` RFC 9309 | 7 tests in `packages/agent-readiness/tests/compliance/robots-rfc9309.test.ts` | passing |
| isitagentready.com endpoint checklist | 7 tests in `packages/agent-readiness/tests/compliance/isitagentready.test.ts` | passing |
| SSR output structural checks | 12 tests in `packages/server/tests/compliance/ssr-output.test.ts` | passing |
| Lighthouse quality gate (≥ 90 all categories) | `bun run test:quality` via `scripts/lighthouse.ts` | passing |

Run all compliance checks: `bun run test && bun run test:quality`

---

## Reference

- **Roadmap (start here):** [`docs/roadmap/SUMMARY.md`](./docs/roadmap/SUMMARY.md) — v1.1 master plan, milestone schedule, dependency graph.
- **User directives:** [`docs/roadmap/_user-directives.md`](./docs/roadmap/_user-directives.md) — Directive 0 (project mantra) and Directive 3 (locked decisions).

### Architecture tracks

<!-- BEGIN_AUTOGEN: reference -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

#### Roadmap tracks

- [`docs/roadmap/arch-1-website.md`](./docs/roadmap/arch-1-website.md) — Architecture Spec: Aihu Project Website + Documentation (v1.1+)
- [`docs/roadmap/arch-2-examples.md`](./docs/roadmap/arch-2-examples.md) — Architecture Spec — Examples Polish + Website Integration
- [`docs/roadmap/arch-3-plugins.md`](./docs/roadmap/arch-3-plugins.md) — Architecture Spec — SOTA Plugins + Magna Integration
- [`docs/roadmap/arch-4-dx-tools.md`](./docs/roadmap/arch-4-dx-tools.md) — Architecture Spec — DX Tooling, Language Server, Agentic Surface
- [`docs/roadmap/arch-5-sfc-primitives.md`](./docs/roadmap/arch-5-sfc-primitives.md) — Architecture Spec — SFC Component Primitives: Audit + 7-Dimension Design
- [`docs/roadmap/arch-6-cli-templates.md`](./docs/roadmap/arch-6-cli-templates.md) — Architecture Spec — CLI Templates v0.2.0

#### Specs (ratified + RFC)

- [`docs/superpowers/specs/2026-04-23-aihu-v0-vertical-slice-design.md`](./docs/superpowers/specs/2026-04-23-aihu-v0-vertical-slice-design.md) — aihu v0 — Vertical Slice Design _(Draft)_
- [`docs/superpowers/specs/2026-05-02-spec-block-structure.md`](./docs/superpowers/specs/2026-05-02-spec-block-structure.md) — Block Structure — `@aihu/compiler` _(Ratified 2026-05-02)_
- [`docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md`](./docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md) — Macro Vocabulary — `@aihu/compiler` _(Ratified 2026-05-02)_
- [`docs/superpowers/specs/2026-05-02-spec-plugin-contract.md`](./docs/superpowers/specs/2026-05-02-spec-plugin-contract.md) — Plugin Contract — `@aihu/compiler` _(Ratified 2026-05-02)_
- [`docs/superpowers/specs/2026-05-02-spec-template-attribute-syntax.md`](./docs/superpowers/specs/2026-05-02-spec-template-attribute-syntax.md) — Template Attribute Syntax — `@aihu/compiler` _(Ratified 2026-05-02)_
- [`docs/superpowers/specs/2026-05-05-spec-live-binding.md`](./docs/superpowers/specs/2026-05-05-spec-live-binding.md) — Live-Binding Architecture — `@aihu/arbor` + `@aihu/agent-service` _(APPROVED per Directive 3)_

<sub><i>Auto-generated on commit `68a61e6`.</i></sub>

<!-- END_AUTOGEN: reference -->

### Process docs

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — fork, branch, conventional-commits, changesets, dep-free thesis.
- [`docs/RELEASING.md`](./docs/RELEASING.md) — changeset workflow, release PR, npm publish pipeline.
- [`docs/site/`](./docs/site) — 12-page user guide: introduction, installation, getting-started, authoring-components, authoring-agents, reactivity, ssr-hydration, routing-layouts, data-fetching, deployment, api-reference, authoring-plugins.
- [`docs/cli.md`](./docs/cli.md) — CLI reference.
- **CLI:** [`@aihu/cli`](./packages/cli) — `npx aihu app`, `npx aihu migrate`.

### Pre-v1 phase specs (historical, still binding)

- [`.team/phase-2/spec-signals.md`](./.team/phase-2/spec-signals.md), [`.team/phase-3/spec-arbor.md`](./.team/phase-3/spec-arbor.md), [`.team/phase-4/spec-runtime.md`](./.team/phase-4/spec-runtime.md), [`.team/phase-5/spec-agent.md`](./.team/phase-5/spec-agent.md), [`.team/agent-readiness/spec-agent-readiness.md`](./.team/agent-readiness/spec-agent-readiness.md).
- Phase retros: `.team/phase-*/retro.md`, `.team/round-n1/retro.md`, [`.team/agent-readiness/retro-phase1-3.md`](./.team/agent-readiness/retro-phase1-3.md).
- Learnings: [`.team/learnings.md`](./.team/learnings.md).

### Bench harness

- [`bench/signals/HARNESS.md`](./bench/signals/HARNESS.md), [`bench/signals/RESULTS.md`](./bench/signals/RESULTS.md)
- [`bench/arbor/HARNESS.md`](./bench/arbor/HARNESS.md), [`bench/arbor/RESULTS.md`](./bench/arbor/RESULTS.md)

---

## License

MIT
