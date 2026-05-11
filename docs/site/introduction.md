# Introduction

aihu is a complete meta-framework for the agentic web. You write `.aihu` Single-File Components (SFCs) — block-structured (`@state`, `@template`, `@style`, `@agent`, `@route`) — and a Rust compiler emits standards-compliant Web Components AND machine-readable agent manifests. The runtime is sub-2 kB. Every component shipped by every aihu app is discoverable by AI agents and callable as a tool.

> **Status:** v1 shipped 2026-05-03. npm publish at `0.1.x` rolling out.

## What makes aihu different

- **Agentic-first** — every component is agent-callable by construction. The `@agent` block on each SFC declares its exposed state and actions; the compiler emits a matching MCP tool schema alongside the Web Component. No separate API gateway required.
- **Sub-2 kB runtime** — `@aihu/signals` (~1.71 kB gz) and `@aihu/arbor` (~2.72 kB gz) together cover signals, computeds, effects, and direct DOM diffing.
- **Vanilla custom elements output** — no framework lock-in at the consumer boundary, no global context, no hydration step.
- **Dep-free thesis** — zero non-`@aihu/*` runtime dependencies across all packages. Every bundle that ships to a browser or edge runtime is self-contained.
- **Targeted updates** — aihu uses `nodeValue` rather than `textContent` for reactive text nodes, which is 122× faster on targeted updates.
- **MCP + agent-first** — `@aihu/agent` and `@aihu-plugin/agent-readiness` are first-class; every aihu application can expose MCP tool/resource endpoints out of the box.

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
| `@aihu/agent-a2a` | A2A (Agent-to-Agent) protocol bindings | 721 B gz |
| `@aihu/agent-acp` | ACP (Agent Control Protocol) bindings | 591 B gz |
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
| `@aihu/mcp` | MCP server exposing `aihu_example` + `aihu_validate` tools | server-only |
| `@aihu/scraping` | Rate limiter and bot-detection middleware for agent services | server-only |
| `vscode-aihu` | VSCode syntax highlighting, snippets, language support | editor |
