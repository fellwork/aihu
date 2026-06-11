# Aihu

> **Aihu — agentic discovery and interaction, for human purpose.**
>
> Say *EYE-hoo* · 爱护 (*àihù*) · *"to cherish and protect."*

Aihu builds **durable Web Components your AI agent can read and drive — not disposable UI it has to generate.** An agent inspects a real component through its llms.txt + MCP manifest and calls its actions on the live, on-screen instance. The thing the user sees is the thing the agent drives, not a throwaway interface regenerated every turn.

You author `.aihu` single-file components; a Rust compiler emits standards-based **Web Components** *plus* the machine-readable agent manifest — no separate API layer to build.

**Generative UI vs. durable components.** Most "agent UI" today is disposable: the model emits HTML or JSON that renders once and vanishes (MCP Apps, generated iframes). Aihu is the inverse — real, inspectable, reusable custom elements an agent drives over a server-mediated capability bridge, with the server holding auth and policy. Durable wins when the UI has to be trusted, styled, and reused.

Under the hood it's a complete meta-framework — routing, SSR, auth, data loading, and cloud adapters included. The runtime is **sub-2 kB**, output is **vanilla custom elements** (no lock-in, no hydration step), with **zero runtime dependencies**, and reactive updates run 122× faster than vanilla DOM on targeted writes ([benchmarks below](#performance)).

> **Status:** actively developed, shipping in `v1.0.x` releases. The `v1.0.0` milestone tag is held until the styling engine and UI components land — see [Project status](#project-status).

[![CI](https://github.com/fellwork/aihu/actions/workflows/plan-a.yml/badge.svg)](https://github.com/fellwork/aihu/actions/workflows/plan-a.yml)
[![release](https://github.com/fellwork/aihu/actions/workflows/release.yml/badge.svg)](https://github.com/fellwork/aihu/actions/workflows/release.yml)
[![@aihu/signals on npm](https://img.shields.io/npm/v/@aihu/signals.svg?label=@aihu/signals)](https://www.npmjs.com/package/@aihu/signals)
[![tests](https://img.shields.io/badge/tests-1281%20TS%20%7C%20492%20Rust%20passing-brightgreen)](#)
[![packages](https://img.shields.io/badge/packages-20-blue)](#packages)
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

You write a component in a single `.aihu` file — markup, state, styles, and (optionally) its agent interface, all in one place. The compiler turns it into a plain custom element that runs anywhere Web Components run. What you get:

- **A tiny reactive core** — signals, computeds, and effects in under 2 kB, with direct DOM updates and no virtual DOM (`@aihu/signals` + `@aihu/arbor`).
- **A real Rust compiler** — pre-built per platform, plus a WebAssembly build for in-browser playgrounds.
- **Agent-callable by default** — declare a component's `@agent` interface and the compiler emits a matching AI tool schema (MCP), alongside A2A and ACP protocol support.
- **A complete app framework** — file-based routing, server-side rendering, loaders, cookies, and server actions (`@aihu/router` + `@aihu/server`).
- **Batteries included** — auth, data loading, context, a plugin system, and accessible UI primitives — all dependency-free.
- **Deploy anywhere** — first-party Cloudflare and Vercel adapters.
- **A real toolchain** — a CLI for scaffolding and builds (`aihu app`/`page`/`component`/`plugin`/`dev`/`build`) and a VS Code extension.

The output is **plain custom elements**: nothing locks you in at the consumer boundary, there's no global runtime and no hydration step — and every component is, by construction, callable by an AI agent.

## How it compares

Most component libraries give you a way to build *components*. Aihu gives you a way to build *apps* — routing, server-side rendering, data, and deployment are first-class, not add-ons.

**Aihu is to Lit what Next.js is to React:** a full app framework built on a small Web Components runtime. Solid is a single reactive package; Lit is templating plus a base class; Vue ships its own scheduler and virtual DOM. Aihu layers cleanly — use just the signals, just the runtime, or the whole framework — and it's the only one where every component is also an AI-callable tool, built into the file format itself.

---

## Features

### Reactive runtime
- Push-based signals, computeds, and effects with batched writes (`@aihu/signals`, ~1.8 kB gz)
- Direct DOM updates, no virtual DOM (`@aihu/arbor`, ~2.1 kB gz — **122× faster than vanilla** on targeted updates)
- Synchronous mount with predictable teardown
- Compiled components register as standard custom elements (`@aihu/runtime`)

### Compiler & toolchain
- Rust-native compiler — reads `.aihu` files and emits standard custom-element classes
- Pre-built binaries for Linux, macOS, Windows, and ARM64 Linux (SHA256-verified), via `npm install @aihu/compiler`
- WebAssembly build for in-browser playgrounds (target: under 200 ms to compile a 50-line component)
- Scoped styles, slots, list/conditional rendering, type-checked templates, error boundaries, hot reload, islands, and full hydration

### AI-agent surface (built in)
- An `@agent` block declares a component's exposed state and actions; the compiler emits a matching MCP tool schema next to the Web Component
- A2A and ACP agent protocols included (`@aihu/agent-a2a`, `@aihu/agent-acp`)
- Auto-generates `llms.txt`, an MCP Server Card, and `robots.txt` for any app — no manual config (`@aihu-plugin/agent-readiness`)

### Full-stack capabilities
- File-based routing with nested routes and layouts (`@aihu/router`)
- Server-side rendering, streaming, loaders, cookies, and hydration (`@aihu/server`)
- Request-scoped context plus a reactive data/loader layer (`@aihu/context`, `@aihu-plugin/data`)
- Accessible UI primitives — guards, live regions, focus traps, links, and outlets
- Cloud adapters for Cloudflare and Vercel

### Developer experience
- `aihu` CLI for scaffolding and builds (`app` / `page` / `component` / `plugin` / `dev` / `build`)
- VS Code extension — syntax highlighting today, full language server in progress
- A 13-example portfolio you can run in parallel with `bun run dev:examples`
- Built on Bun, Rolldown, Biome, and Vitest

### Standards & compliance
- **llms.txt** — every app is discoverable by AI tools out of the box
- **MCP** — Model Context Protocol compatible (Server Card, tool schemas, resources)
- **Agent-ready** — every component an app ships has an agent interface
- **Accessibility** — WCAG-oriented primitives (live regions, focus traps, skip links)

---

## Project status

Aihu is under active development and ships in `v1.0.x` releases. The reactive runtime, compiler, router, server, agent surface, and CLI all work today. The `v1.0.0` milestone tag is intentionally held until three additions land:

- **A styling engine** (`@aihu/css-engine`) — build-time CSS: a Tailwind v4-style utility engine with scoped, per-component output that adds **zero** bytes to the browser bundle. The engine, compiler integration, style packs, and a `cn()` helper have landed; a copy-paste UI registry is next.
- **UI components** (`@aihu/primitives`) — accessible, headless primitives (dialog, tooltip, button, and more) built on the engine. Landed.
- **Rich-text / markdown** support, shipping as a plugin.

Packages version independently (most are in the `0.x` range during early access), so you can adopt any piece on its own. **Aihu is dependency-free at runtime** — every browser-shipped package has an empty `dependencies` list. It's a research-driven codebase: each layer is pinned by a written spec before code lands, and performance regressions block merges.

Migrating between grammar versions is mechanical — run `npx aihu migrate <file>`, and compiler errors point you at the exact fix. See [`docs/cli.md`](./docs/cli.md) for the migration reference.

---

## Performance

All results from `bench/`. Measured with [mitata](https://github.com/nicolo-ribaudo/mitata) + Bun 1.3.8. p50 latencies shown. Full tables in `bench/signals/RESULTS.md` and `bench/arbor/RESULTS.md`.

<!-- BEGIN_AUTOGEN: performance -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

### `@aihu/signals` vs SOTA reactive libraries

*Source: [`bench/signals/RESULTS.md`](./bench/signals/RESULTS.md). p50 latency shown for each competitor.*

| Workload | @aihu/signals | alien-signals | @preact/signals-core | @vue/reactivity | solid-js | s-js |
|---|---:|---:|---:|---:|---:|---:|
| `cellx` | 807.33 ns | 1.21 µs | 1.14 µs | 1.69 µs | 2.97 µs | 1.40 µs |
| `batched-writes-100` | 5.07 µs | 8.10 µs | 7.20 µs | 15.43 µs | 12.80 µs | 5.75 µs |
| `dynamic-deps` | 1.09 µs | 2.78 µs | 1.78 µs | 7.08 µs | 1.93 µs | 1.33 µs |
| `creation-1to1000` | 69.02 µs | 90.01 µs | 64.53 µs | 92.97 µs | 139.98 µs | 107.53 µs |
| `deep-propagation-100` | 3.25 µs | 3.97 µs | 3.87 µs | 7.34 µs | 11.86 µs | 4.12 µs |

### `@aihu/arbor` vs SOTA DOM-binding libraries

*Source: [`bench/arbor/RESULTS.md`](./bench/arbor/RESULTS.md). JSDOM workloads, p50 latency.*

| Workload | @aihu/arbor | lit-html | solid-js | @vue/runtime-dom | preact | vanilla |
|---|---:|---:|---:|---:|---:|---:|
| `mount-10k-leaves` | 49.04 ms | 8.21 s | — | — | 107.10 ms | 139.42 ms |
| `mount-deep-100x10` | 4.32 ms | 82.33 ms | — | — | 12.32 ms | 28.92 ms |
| `mount-wide-1000` | 12.69 ms | 92.01 ms | — | — | 14.78 ms | 17.38 ms |
| `update-1-of-10k-leaves` | 28.63 ns | 743.62 µs | — | — | 2.33 ms | 4.36 µs |
| `krausest-1k-cycle` | 31.16 ms | 114.20 ms | — | — | 30.71 ms | 25.17 ms |

<sub><i>Auto-generated — run `bun scripts/sync-readme.ts` to update.</i></sub>

<!-- END_AUTOGEN: performance -->

> The `update-1-of-10k-leaves` 122× win comes from arbor's `leaf()` binding to `textNode.nodeValue` (direct property set) vs. vanilla's `element.textContent` (child-list walk). This is not a measurement artifact — it reflects the bind-target choice in `materialize.ts`.

> solid-js and @vue/runtime-dom ERROR in all JSDOM workloads (client-only API / `SVGElement` not defined). Browser-native comparison deferred to Round N+2 Playwright runner.

### Bundle size (gz)

Per-package gates enforced by `bun run size`:

<!-- BEGIN_AUTOGEN: bundle-sizes -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Package | Size (gz) | Limit | Status |
|---|---:|---:|:---:|
| `@aihu/context` | 242 B | 300 B | pass |
| `@aihu/signals` | 1.69 kB | 1970 B | pass |
| `@aihu/arbor` | 2.60 kB | 2800 B | pass |
| `@aihu/runtime` | 3.65 kB | 3900 B | pass |
| `@aihu/agent` | 141 B | 200 B | pass |
| `@aihu-plugin/data` | 757 B | 800 B | pass |
| `@aihu-plugin/kindly-note` | 1.65 kB | 1850 B | pass |
| `@aihu/router` | 1.71 kB | 2400 B | pass |
| `@aihu/agent-service` | 1.17 kB | 1400 B | pass |
| `@aihu/agent-acp` | 586 B | 600 B | pass |
| `@aihu/agent-a2a` | 717 B | 750 B | pass |
| `@aihu/app` | 1.58 kB | 1750 B | pass |
| `@aihu/css-engine/runtime/cn` | 682 B | 1 KB | pass |
| `@aihu/css-engine/runtime/progressive` | 716 B | 3 KB | pass |
| `@aihu/primitives/context` | 430 B | 1 KB | pass |
| `@aihu/primitives/presence-gate` | 798 B | 4 KB | pass |
| `@aihu/primitives/form-control` | 1022 B | 4 KB | pass |
| `@aihu/primitives/config-provider` | 757 B | 4 KB | pass |
| `@aihu/primitives/roving-focus` | 1.41 kB | 4 KB | pass |
| `@aihu/primitives/collection` | 515 B | 4 KB | pass |
| `@aihu/primitives/dialog` | 1.97 kB | 4 KB | pass |
| `@aihu/primitives/tooltip` | 1.79 kB | 4 KB | pass |
| `@aihu/primitives/button` | 1.10 kB | 4 KB | pass |
| `@aihu/primitives/separator` | — | 4 KB | _no dist_ |
| `@aihu/primitives/label` | — | 4 KB | _no dist_ |
| `@aihu/primitives/input` | — | 4 KB | _no dist_ |
| `@aihu/primitives/textarea` | — | 4 KB | _no dist_ |
| `@aihu/primitives/checkbox` | — | 4 KB | _no dist_ |
| `@aihu/primitives/switch` | — | 4 KB | _no dist_ |
| `@aihu/primitives/radio-group` | — | 4 KB | _no dist_ |
| `@aihu/auth` | 1.16 kB | 1.5 KB | pass |
| `@aihu/magna` | 758 B | 1.8 KB | pass |
| `@aihu/magna/codegen` | 1.04 kB | 1.2 KB | pass |

<sub><i>Auto-generated — run `bun scripts/sync-readme.ts` to update.</i></sub>

<!-- END_AUTOGEN: bundle-sizes -->

> **Per-package rows are the contract; combined is reported, not budgeted.** The pre-v1 "≤ 3.46 kB combined" target was retired at v1 cutover (Plan 7.1) — packages grew to support hydration, islands, error boundaries, and reconciliation. Each row in `.size-limit.json` is the binding gate. See [`.size-limit.README.md`](./.size-limit.README.md).

---

## Layout

> **Publish status:** packages publish independently at `0.x` early-access (see [Project status](#project-status)). A few internal packages stay private until their designs settle.

See [`packages/`](./packages) for all packages on disk. By tier:

- **Browser runtime (sized, ships to client):** `@aihu/signals`, `@aihu/arbor`, `@aihu/runtime`, `@aihu/context`, `@aihu/agent`.
- **Server / edge / data (sized):** `@aihu/router`, `@aihu-plugin/data`, `@aihu/agent-service`, `@aihu/agent-acp`, `@aihu/agent-a2a`. Plus `@aihu/server` (SSR + back-compat router alias), `@aihu-plugin/agent-readiness` (`llms.txt`, MCP Server Card, robots, Vite plugin), `@aihu/app` (top-level integration).
- **Cloud adapters (in-tree):** `@aihu/adapter-cloudflare`, `@aihu/adapter-vercel`.
- **Build-time only (not shipped):** `@aihu/compiler` (Rust SFC compiler), `@aihu/cli` (`aihu app`, `aihu dev`, `aihu build`), `@aihu/plugin` (plugin contract types).
- **Editor:** `vscode-aihu` (TextMate grammar + snippets; Volar LSP in M2).

### Packages

<!-- BEGIN_AUTOGEN: packages -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| Package | Version | Description |
|---|---|---|
| [`@aihu-plugin/agent-readiness`](./packages/plugin-agent-readiness) | `2.0.3` | Discovery + readiness manifest emitter so agents can introspect aihu apps. |
| [`@aihu-plugin/data`](./packages/plugin-data) | `2.0.1` | Reactive data loaders and resource primitives for aihu. |
| [`@aihu-plugin/drizzle`](./packages/plugin-drizzle) | `0.1.0` | Drizzle ORM data adapter for aihu — typed createResource fetchers and defineLoader helpers (Postgres / SQLite / libSQL). |
| [`@aihu-plugin/kindly-note`](./packages/plugin-kindly-note) | `0.2.1` | Runtime syntax highlighting + markdown rendering for aihu — <aihu-code>/<aihu-markdown> custom elements + signal-aware highlight()/renderMarkdown() helpers, powered by published @kindly-note/* packages with lazy loading. |
| [`@aihu/adapter-cloudflare`](./packages/adapter-cloudflare) | `4.0.0` | Cloudflare Workers/Pages deployment adapter for @aihu/app. |
| [`@aihu/adapter-vercel`](./packages/adapter-vercel) | `4.0.0` | Vercel deployment adapter for @aihu/app. |
| [`@aihu/agent`](./packages/agent) | `0.1.0` | Agent primitives — the foundation of aihu agent-readiness. |
| [`@aihu/agent-a2a`](./packages/agent-a2a) | `0.1.2` | A2A (Agent-to-Agent) protocol bindings for @aihu/agent-service. |
| [`@aihu/agent-acp`](./packages/agent-acp) | `0.1.2` | ACP (Agent Control Protocol) bindings for @aihu/agent-service. |
| [`@aihu/agent-readiness`](./packages/_moved/agent-readiness) | `2.0.2` | [MOVED] This package has moved to @aihu-plugin/agent-readiness. |
| [`@aihu/agent-server`](./packages/agent-server) | `0.2.0` | Server-side glue: mount an aihu component server-side and let an MCP client drive it through the agent-service live-dispatch gate, forwarding approved invocations to a browser bridge. |
| [`@aihu/agent-service`](./packages/agent-service) | `0.2.0` | Service-side agent runtime (server-hosted agent endpoints). |
| [`@aihu/ai`](./packages/ai) | `0.1.0` | Thin adapters from AI SDK stream types to ReadableStream<string> for aihu $stream collections. |
| [`@aihu/app`](./packages/app) | `3.0.0` | Top-level app integration — wires runtime, router, and adapters into a Vite app. |
| [`@aihu/arbor`](./packages/arbor) | `1.0.0` | Reactive component tree (the rendering layer that consumes @aihu/signals). |
| [`@aihu/auth`](./packages/auth) | `1.0.0` | JWT scope checks, ScopeSignal, and server middleware for aihu auth. |
| [`@aihu/cli`](./packages/cli) | `0.6.0` | Aihu CLI (`aihu`, `create-aihu`) — scaffolding, dev, build commands. |
| [`@aihu/compiler`](./packages/compiler) | `0.9.0` | Single File Component (.aihu) compiler — Rust binary + JS glue. |
| [`@aihu/context`](./packages/context) | `0.1.0` | Async-context-friendly request/SSR context primitives for aihu. |
| [`@aihu/css-engine`](./packages/css-engine) | `0.4.3` | aihu CSS engine — Tailwind v4 hard fork with WC-native scoped output. |
| [`@aihu/data`](./packages/_moved/data) | `2.0.1` | [MOVED] This package has moved to @aihu-plugin/data. |
| [`@aihu/language-server`](./packages/language-server) | `0.2.8` | Cross-editor Language Server (aihu-language-server) for .aihu Single File Components — diagnostics, hover, completion, and quick-fix code actions. |
| [`@aihu/magna`](./packages/magna) | `0.2.1` | aihu bridge for Magna GraphQL — dep-free fetch, resource composition, JWT relay |
| [`@aihu/mcp`](./packages/mcp) | `0.1.0` | MCP server for aihu — exposes aihu_example and aihu_validate tools via stdio transport. |
| [`@aihu/plugin`](./packages/plugin) | `0.1.0` | Plugin substrate shared by @aihu/server and the meta-framework — runtime hook surface. |
| [`@aihu/plugin-demo`](./packages/plugin-demo) | `0.1.1` | Canonical proof-of-life for the @aihu/plugin API — exercises macros, middleware, and transforms. |
| [`@aihu/primitives`](./packages/primitives) | `0.1.0` | aihu headless behavior primitives — WAI-ARIA APG patterns as vanilla custom elements, zero CSS. |
| [`@aihu/router`](./packages/router) | `0.2.1` | File-based router for the aihu meta-framework. |
| [`@aihu/runtime`](./packages/runtime) | `1.1.0` | Single File Component (.aihu) runtime — registers custom elements compiled by @aihu/compiler. |
| [`@aihu/scraping`](./packages/scraping) | `0.1.0` | O(1) sliding-window rate limiter and bot-detection middleware for aihu agent services. |
| [`@aihu/seo`](./packages/seo) | `0.2.0` | aihu SEO plugin: sitemap.xml, robots.txt, llms.txt, JSON-LD injection via afterParse hook. |
| [`@aihu/server`](./packages/server) | `0.2.0` | Server runtime + native renderer (napi-rs) for aihu SSR. |
| [`@aihu/signals`](./packages/signals) | `0.2.0` | Tiny reactive signals — the reactive primitive at the core of aihu. |
| [`@aihu/templates-cf-team`](./packages/templates/cf-team) | `3.0.1` | Cloudflare Workers + monorepo (bun workspaces + moon) team template for Aihu |
| [`@aihu/ui`](./packages/ui) | `0.1.0` | aihu styled-recipe registry — copy-paste .aihu recipes distributed as source via `aihu add` (no runtime bundle). |
| [`vscode-aihu`](./packages/vscode-aihu) | `1.0.0` | Syntax highlighting, snippets, and language support for .aihu Single File Components |

<sub><i>Auto-generated — run `bun scripts/sync-readme.ts` to update.</i></sub>

<!-- END_AUTOGEN: packages -->

---

## Examples

13-example portfolio under [`examples/`](./examples). Six are M1-polished with full `@agent` surfaces, dark-mode tokens, and smoke tests:

<!-- BEGIN_AUTOGEN: examples -->
<!-- regenerate: bun scripts/sync-readme.ts (also runs in pre-commit + CI) -->

| # | Folder | What it teaches | Port |
|---|---|---|---|
| 01 | [`agent-driven-demo/`](./examples/agent-driven-demo) | An external agent reads a component's metadata and **drives the real, visible component instance** over a real WebSocket — gated server-s... | 5108 |
| 02 | [`agent-hub/`](./examples/agent-hub) | _no README_ | 5107 |
| 03 | [`auth-magna-seo/`](./examples/auth-magna-seo) | A server-only worked example that proves the **3-package integration contract** — `@aihu/auth` + `@aihu/magna` + `@aihu/seo` — using **on... | — |
| 04 | [`blog-loader/`](./examples/blog-loader) | A server-rendered post page demonstrating aihu's loader pattern, `@aihu/context` as a parallel data channel, and an `@agent` block for ag... | — |
| 05 | [`blog-router/`](./examples/blog-router) | A 3-page blog demonstrating aihu's file-based routing. | — |
| 06 | [`cf-adapter/`](./examples/cf-adapter) | _no README_ | 5110 |
| 07 | [`color-theme/`](./examples/color-theme) | `$reactive(...)` in `@style` plus `$global { }` to propagate tokens beyond component scope — and `$media` macro for responsive breakpoint... | 5105 |
| 08 | [`css-engine-demo/`](./examples/css-engine-demo) | Demonstrates all three browser-facing surfaces of the published [`@aihu/css-engine`](../../packages/css-engine) package: | 5114 |
| 09 | [`css-engine-utility/`](./examples/css-engine-utility) | When `@aihu/css-engine` is installed (as a dependency or peer), the compiler plugin that `viteAihuPlugin` composes will: | 5118 |
| 10 | [`css-pluggability/`](./examples/css-pluggability) | A worked example showing how to plug **Tailwind CSS** into a aihu app, plus documented swap paths to **UnoCSS**, **Pico CSS**, and **vani... | — |
| 11 | [`currency-converter/`](./examples/currency-converter) | the second `@agent` flagship, with enum-typed inputs. Demonstrates how a TypeScript union type (`'USD' | 'EUR' | 'GBP' | 'JPY'`) on a sta... | 5116 |
| 12 | [`hacker-news/`](./examples/hacker-news) | A aihu port of the canonical Hacker News reader. Hits the live HN API. M1 polish: dark-mode token pass, `@agent` block on the index page,... | 5108 |
| 13 | [`layouts/`](./examples/layouts) | Runtime **layout rendering** + **dynamic layout switching**. | — |
| 14 | [`live-counter/`](./examples/live-counter) | the smallest possible aihu component — state, event handlers, a reactive text node, and an agent surface, in one file. | 5101 |
| 15 | [`plugin-demo/`](./examples/plugin-demo) | _no README_ | 5111 |
| 16 | [`primitives-showcase/`](./examples/primitives-showcase) | Wires three WAI-ARIA APG patterns from the published [`@aihu/primitives`](../../packages/primitives) package — each a vanilla custom elem... | 5115 |
| 17 | [`realtime-scores/`](./examples/realtime-scores) | Live score board demonstrating WebSocket-driven signal updates, `$lifecycle.mount/dispose`, and `createResource` from `@aihu-plugin/data`... | 5112 |
| 18 | [`storefront/`](./examples/storefront) | _no README_ | 5113 |
| 19 | [`temperature-converter/`](./examples/temperature-converter) | two-way binding plus a computed-derived counterpart (7GUIs #2), and an agent surface that lets AI tools read and write the temperature on... | 5102 |
| 20 | [`timer/`](./examples/timer) | lifecycle hooks, reactive derivations, and an agent surface that lets AI monitor timer progress and trigger resets on the human's behalf ... | 5103 |
| 21 | [`todo-mvc/`](./examples/todo-mvc) | the canonical TodoMVC — list reactivity, filtering, computed derivations, keyed iteration, localStorage persistence, and an agent surface... | 5104 |
| 22 | [`weather-card/`](./examples/weather-card) | the aihu-unique `@agent` block. Every signal you `$expose` becomes an MCP resource; every action you `$action` becomes an MCP tool. The s... | 5106 |

<sub><i>Auto-generated — run `bun scripts/sync-readme.ts` to update.</i></sub>

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
import { createAgentReadinessRoutes } from '@aihu-plugin/agent-readiness'

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
| `llms.txt` format (llmstxt.org spec) | 9 tests in `packages/plugin-agent-readiness/tests/compliance/llms-txt-spec.test.ts` | passing |
| MCP Server Card schema (SEP-1649) | 14 tests in `packages/plugin-agent-readiness/tests/compliance/mcp-server-card-schema.test.ts` | passing |
| `robots.txt` RFC 9309 | 7 tests in `packages/plugin-agent-readiness/tests/compliance/robots-rfc9309.test.ts` | passing |
| isitagentready.com endpoint checklist | 7 tests in `packages/plugin-agent-readiness/tests/compliance/isitagentready.test.ts` | passing |
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
- [`docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md`](./docs/superpowers/specs/2026-05-05-spec-macro-vocabulary-v2.md) — Macro Vocabulary v2 — Object-literal Collection-Form _(RATIFIED 2026-05-05)_
- [`docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-platform-audit.md`](./docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-platform-audit.md) — Template Syntax v2 — Platform Audit (Round 3)
- [`docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-samples.md`](./docs/superpowers/specs/2026-05-06-spec-template-syntax-v2-samples.md) — Template Syntax v2 — Corpus Samples (Variant B) _(Variant B per Director r2 reconciliation)_
- [`docs/superpowers/specs/2026-05-06-spec-template-syntax-v2.md`](./docs/superpowers/specs/2026-05-06-spec-template-syntax-v2.md) — Template Syntax v2 — `@template` redesign _(PROPOSED — not RATIFIED until user approves)_
- [`docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md`](./docs/superpowers/specs/2026-05-10-aihu-css-engine-and-primitives-design.md) — aihu CSS Engine + Primitives + UI — Design _(Draft)_
- [`docs/superpowers/specs/compiler-ast-export-hook.md`](./docs/superpowers/specs/compiler-ast-export-hook.md) — Compiler AST-Export Hook — Co-Design Note _(preparatory design)_
- [`docs/superpowers/specs/live-binding-impl.md`](./docs/superpowers/specs/live-binding-impl.md) — Spec: $live binding — Implementation Design (v0.3.0) _(DRAFT — for Builder dispatch)_
- [`docs/superpowers/specs/lsp-language-server.md`](./docs/superpowers/specs/lsp-language-server.md) — Spec: vscode-aihu LSP Language Server
- [`docs/superpowers/specs/mcp-server.md`](./docs/superpowers/specs/mcp-server.md) — Spec: @aihu/mcp — aihu MCP Server
- [`docs/superpowers/specs/stream-impl.md`](./docs/superpowers/specs/stream-impl.md) — Spec: Streaming Text I/O — Implementation Design (v0.4.0) _(DRAFT — for Builder dispatch)_

<sub><i>Auto-generated — run `bun scripts/sync-readme.ts` to update.</i></sub>

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
