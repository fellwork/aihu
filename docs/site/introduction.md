# Introduction

scribe is a JavaScript/TypeScript meta-framework for building Web Components with runtime-first reactivity. Applications are authored as `.scribe` Single File Components (SFCs), compiled to vanilla custom elements, and mounted with sub-2 kB reactive primitives.

## Why scribe

- **No framework lock-in** — output is vanilla custom elements; any consumer can use them without knowing about scribe.
- **v3 dep-free thesis** — zero non-`@scribe/*` runtime dependencies across all packages. Every bundle that ships to a browser or edge runtime is self-contained.
- **Sub-2 kB reactive core** — `@scribe/signals` (≤1.97 kB) + `@scribe/arbor` (≤2.2 kB) together cover signals, computeds, effects, and DOM diffing in a tight envelope.
- **Targeted updates** — scribe uses `nodeValue` rather than `textContent` for reactive text nodes, which is 122× faster on targeted updates.
- **MCP + agent-first** — `@scribe/agent` and `@scribe/agent-readiness` are first-class; every scribe application can expose MCP tool/resource endpoints out of the box.

## Package overview

| Package | Purpose | Bundle |
|---------|---------|--------|
| `@scribe/signals` | Push-based signals, computeds, effects | ≤1.97 kB |
| `@scribe/arbor` | DOM tree primitives: branch/leaf/mount | ≤2.2 kB |
| `@scribe/runtime` | onMount/onCleanup lifecycle | ≤1.17 kB |
| `@scribe/router` | File-based router, middleware | ≤1.54 kB |
| `@scribe/server` | Request router, SSR, loaders | server-only |
| `@scribe/agent` | Agent/MCP registration | ≤200 B |
| `@scribe/agent-service` | Agent service adapter | ≤600 B |
| `@scribe/agent-readiness` | Vite integration for MCP | build-time |
| `@scribe/data` | Data plugin adapter | ≤800 B |
| `@scribe/plugin` | Plugin contract types | build-time |
| `@scribe/cli` | Scaffold CLI | build-time |
| `@scribe/context` | Shared context primitives | ≤300 B |
