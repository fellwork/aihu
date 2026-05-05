# Introduction

aihu is a JavaScript/TypeScript meta-framework for building Web Components with runtime-first reactivity. Applications are authored as `.aihu` Single File Components (SFCs), compiled to vanilla custom elements, and mounted with sub-2 kB reactive primitives.

## Why aihu

- **No framework lock-in** — output is vanilla custom elements; any consumer can use them without knowing about aihu.
- **v3 dep-free thesis** — zero non-`@aihu/*` runtime dependencies across all packages. Every bundle that ships to a browser or edge runtime is self-contained.
- **Sub-2 kB reactive core** — `@aihu/signals` (≤1.97 kB) + `@aihu/arbor` (≤2.2 kB) together cover signals, computeds, effects, and DOM diffing in a tight envelope.
- **Targeted updates** — aihu uses `nodeValue` rather than `textContent` for reactive text nodes, which is 122× faster on targeted updates.
- **MCP + agent-first** — `@aihu/agent` and `@aihu/agent-readiness` are first-class; every aihu application can expose MCP tool/resource endpoints out of the box.

## Package overview

| Package | Purpose | Bundle |
|---------|---------|--------|
| `@aihu/signals` | Push-based signals, computeds, effects | ≤1.97 kB |
| `@aihu/arbor` | DOM tree primitives: branch/leaf/mount | ≤2.2 kB |
| `@aihu/runtime` | onMount/onCleanup lifecycle | ≤1.17 kB |
| `@aihu/router` | File-based router, middleware | ≤1.54 kB |
| `@aihu/server` | Request router, SSR, loaders | server-only |
| `@aihu/agent` | Agent/MCP registration | ≤200 B |
| `@aihu/agent-service` | Agent service adapter | ≤600 B |
| `@aihu/agent-readiness` | Vite integration for MCP | build-time |
| `@aihu/data` | Data plugin adapter | ≤800 B |
| `@aihu/plugin` | Plugin contract types | build-time |
| `@aihu/cli` | Scaffold CLI | build-time |
| `@aihu/context` | Shared context primitives | ≤300 B |
