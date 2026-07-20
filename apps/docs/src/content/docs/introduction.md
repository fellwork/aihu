# Introduction

aihu builds **durable Web Components your AI agent can read and drive — not disposable UI it has to generate.** You author `.aihu` Single-File Components (block-structured: `@state`, `@template`, `@style`, `@agent`, `@route`); a Rust compiler emits standards-compliant Web Components **plus** the machine-readable agent manifest. An agent inspects a real component (llms.txt + MCP) and calls its actions on the live, on-screen instance over a server-mediated capability bridge — the component the user sees is the one the agent drives. Most "agent UI" today is the opposite: disposable HTML/JSON the model regenerates each turn (MCP Apps, generated iframes). Durable components are inspectable, reusable, and trusted, with the server holding auth and policy.

> **Status:** actively developed and shipping in `v1.0.x` releases. The reactive runtime, compiler, router, server, agent surface, CLI, styling engine, and UI primitives all work today; the `v1.0.1` tag is held for a rich-text/markdown plugin.

## What makes aihu different

- **Read and drive, not generate** — an agent inspects a real component and calls its actions on the live, on-screen instance over a server-mediated capability bridge. The component the user sees is the one driven, not disposable UI regenerated each turn (the generative-UI model: MCP Apps, generated iframes). Durable, inspectable, reusable.
- **Agent-native by construction** — the `@agent` block on each SFC declares its exposed state and actions; the compiler emits a matching MCP tool schema + llms.txt entry alongside the Web Component. No separate API gateway. `@aihu/agent` and `@aihu-plugin/agent-readiness` are first-class.
- **Vanilla custom elements output** — no framework lock-in at the consumer boundary, no global context, no hydration step.
- **Sub-2 kB runtime** — `@aihu/signals` (~1.71 kB gz) and `@aihu/arbor` (~2.72 kB gz) together cover signals, computeds, effects, and direct DOM diffing.
- **Dep-free** — zero non-`@aihu/*` runtime dependencies across all packages. Every bundle that ships to a browser or edge runtime is self-contained.
- **Targeted updates** — aihu uses `nodeValue` rather than `textContent` for reactive text nodes, which is 122× faster on targeted updates.

## Why "meta-framework"?

Aihu lets you build whole apps, not just components. `@aihu/signals` (reactive primitive) → `@aihu/arbor` (DOM mounting) → `@aihu/runtime` (custom-element wiring) → `@aihu/router` (file-based routing) → `@aihu/server` (SSR + edge) → `@aihu/app` (the integrated framework). Each layer is usable on its own; stacked they form a complete meta-framework. File-based routing, SSR, loaders, cookies, auth, and data are first-class — not bolt-ons. Cloud adapters are in-tree, not third-party.

## Package overview

| Package | Purpose | Bundle |
|---------|---------|--------|
| `@aihu/signals` | Push-based signals, computeds, effects | 1.71 kB gz |
| `@aihu/arbor` | DOM tree primitives: branch/leaf/mount/hydrate | 2.72 kB gz |
| `@aihu/runtime` | Custom element registration, onMount/onCleanup lifecycle | 3.27 kB gz |
| `@aihu/context` | Async-context-friendly request/SSR context primitives | 248 B gz |
| `@aihu/agent` | Agent/MCP registration primitives | 142 B gz |
| `@aihu/agent-service` | Server-side agent runtime (live signal bindings) | 1.06 kB gz |
| `@aihu/agent-a2a` | A2A (Agent2Agent) protocol bindings — spec v1.0.1, JSON-RPC | 2.62 kB gz |
| `@aihu/agent-acp` | **Deprecated — use `@aihu/agent-a2a`** (ACP merged into A2A, Aug 2025) | 675 B gz |
| `@aihu-plugin/agent-readiness` | llms.txt, MCP Server Card, robots.txt emitter | build-time |
| `@aihu-plugin/data` | Reactive resource and loader protocol | 774 B gz |
| `@aihu/router` | File-based router with Vite plugin | 2.02 kB gz |
| `@aihu/server` | Request router, SSR, streaming, loaders, cookies | server-only |
| `@aihu/app` | Top-level integration — wires runtime, router, adapters | 764 B gz |
| `@aihu/plugin` | Plugin contract types shared by server and meta-framework | build-time |
| `@aihu/auth` | JWT scope checks, ScopeSignal, server middleware | server-only |
| `@aihu/adapter-cloudflare` | Cloudflare Workers/Pages deployment adapter | build-time |
| `@aihu/adapter-vercel` | Vercel deployment adapter (Edge + Serverless) | build-time |
| `@aihu/cli` | Scaffold CLI — `aihu app`, `page`, `component`, `dev`, `build` | build-time |
| `@aihu/compiler` | Rust SFC compiler — per-platform binary + WASM | build-time |
| `@aihu/css-engine` | CSS engine — Tailwind v4 hard fork, WC-native scoped output, `cn()` + style packs | build-time + tiny runtime |
| `@aihu/primitives` | Headless WAI-ARIA APG behaviors (dialog, tooltip, button, …) as vanilla custom elements, zero CSS | runtime |
| `@aihu/mcp` | MCP server exposing `aihu_example` + `aihu_validate` tools | server-only |
| `@aihu/scraping` | Rate limiter and bot-detection middleware for agent services | server-only |
| `vscode-aihu` | VSCode syntax highlighting, snippets, language support | editor |
