# Retro — v0.6 @route + Build-Target + File-Based Layouts

**Date:** 2026-05-03
**Session type:** Mode 2 (Build/refactor) — two parallel streams
**PRs:** #40 (v0.6a Rust) + #41 (v0.6b TypeScript)

---

## What shipped

v0.6 landed page-aware compilation: `@route` block, `BuildTarget` enum, server-artifact emission gates, router sidecar consumption, `createServerCall`, and file-based layouts.

### Stream A — Rust compiler (PR #40)

| Sub-item | Description |
|----------|-------------|
| v0.6.1 | `@route` block parser + `RouteBlock` struct; `@layout` shorthand (DEPRECATED warning); C500 error outside `pages/` |
| v0.6.2 | `EmitResult.route_json: Option<String>` — `.route.json` sidecar emission |
| v0.6.4 | `BuildTarget` enum (Universal/Client/Server); `CompileUnit.target`; `--target` CLI flag |
| v0.6.6 | Client-build gates: `@agent` manifest + `$server` refs elided when `--target client` |
| v0.6.9 | Conformance fixtures: `bench/compiler-conformance/route/` (2 pairs) + `bench/compiler-conformance/build-target/` (1 pair) |

**Rust tests:** 186 → 209 (+23)

### Stream B — TypeScript packages (PR #41)

| Sub-item | Description |
|----------|-------------|
| v0.6.3 | `@aihu/router` vite-plugin reads `.route.json` sidecars; `RouteDefinition` extended; `readRouteSidecar()` exported from `@aihu/router/plugin` |
| v0.6.5 | `BuildTarget` + `BuildConfig` + `AihuConfig.build?` field in `@aihu/server` |
| v0.6.7 | `createServerCall<Args, Return>(endpoint)` in `packages/server/src/client.ts`; exported from `@aihu/server` |
| v0.6.8 | `virtual:aihu-layouts` vite plugin hook; `scanLayouts()` in `@aihu/router/plugin` subpath |

**TS tests:** 483 → 516 (+33)

---

## Notable finding: router browser/plugin bundle split

The v0.6b Builder moved all vite-plugin code (file scanning, sidecar reading, layout scanning) to a separate `@aihu/router/plugin` subpath. The main browser bundle (`@aihu/router`) now contains only the runtime (`createRouter`, `RouteDefinition` types). Result: router browser bundle dropped from **1451 B to 740 B** (+796 B headroom vs +85 B before). This is a durable architectural separation: build-time tooling never ships to the browser.

This aligns with `.size-limit.README.md` policy: build/dev-only code must NOT appear in browser-eligible bundles.

---

## Final gate walk (verified by Team Lead)

**Rust tests:** 186 → 209 (+23, 1 ignored)
**TS tests:** 483 → 516 (+33, 61 test files)
**Main HEAD at close:** `8186488`

**Package sizes (`bun run size`):**

| Package | Size | Budget | Headroom |
|---------|------|--------|----------|
| `@aihu/context` | 249 B | 300 B | +51 B |
| `@aihu/signals` | 1.67 kB | 1970 B | +261 B |
| `@aihu/arbor` | 2.06 kB | 2200 B | +89 B |
| `@aihu/runtime` | 1.14 kB | 1170 B | +7 B |
| `@aihu/agent` | 117 B | 200 B | +83 B |
| `@aihu/data` | 778 B | 800 B | +22 B |
| `@aihu/router` | 740 B | 1536 B | **+796 B** |
| `@aihu/agent-service` | 580 B | 600 B | +20 B |

**Dep envelope:** no new runtime deps.

### v0.7 is next

v0.7 = router middleware — `defineRouterMiddleware`, `composeMiddleware` isomorphic API; +150-220 B in router budget (+256 B limit raise pre-authorized for v0.7.1). With the v0.6 refactor, router now has +796 B headroom — the +256 B raise may not even be needed.
