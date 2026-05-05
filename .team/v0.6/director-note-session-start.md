# Director Note — v0.6 Session Start

**Date:** 2026-05-03
**Version target:** v0.6 — @route + build-target framework + file-based layouts
**State going in:** main at `1275070`; Rust 186 tests, TS 483 tests, all size rows green

## Substance direction

v0.6 is the page-aware compilation milestone. Per Polish Note 1 it may slip into v0.6.1+
sub-releases but the coupled unit (v0.6.1+v0.6.2+v0.6.4+v0.6.8) must ship together.

Two parallel file-disjoint streams:

**Stream A (Rust) — `feat/v0.6a-route-compiler`**
- v0.6.1: @route block parser + RouteBlock struct + AihuSource.route field
- v0.6.2: @route codegen sidecar (.route.json output)
- v0.6.4: BuildTarget enum (Client|Server|Universal) in compiler types + --target CLI flag
- v0.6.6: server-artifact emission gates (target-gated $server/$agent elision)
- v0.6.9: conformance fixtures (route/ + build-target/)

**Stream B (TypeScript) — `feat/v0.6b-route-ts`**
- v0.6.3: @aihu/router vite-plugin scanPages() reads .route.json sidecars
- v0.6.5: build.target field in defineAihuConfig (AihuConfig extension)
- v0.6.7: $server macro lowering + createServerCall helper in @aihu/server client subpath
- v0.6.8: file-based layouts (layouts/default.aihu scan + virtual:aihu-layouts)

## Contracts between streams

Stream B consumes the .route.json sidecar shape from Stream A. Agree on the shape:
```json
{ "pattern": "/admin/users", "name": "admin-users", "middleware": ["auth"],
  "ssr": true, "layout": "admin" }
```
Stream B's RouteDefinition in @aihu/router should add nullable fields for these.

## Key constraints

- **Path convention Option B** (user-locked): `/server/_actions/`, `/server/_form-actions/`, `/server/_mcp/`
- **@route only valid in src/pages/** — compile error otherwise
- **@layout shorthand** (`@layout 'admin'`) recognized but not dropped (deferred v1.1)
- **createServerCall** goes in @aihu/server client subpath (NOT @aihu/runtime)
- **Router size**: @aihu/router stays ≤1536 B (route metadata consumption is build-time only, tree-shaked from browser bundle)
- **No new runtime dep** — v3 dep-free thesis must hold
- **Acceptance gate**: `src/pages/admin/users.aihu` with `@route { name: 'admin-users', layout: 'admin', middleware: ['auth'] }` compiles → sidecar emitted → router scanPages() reads it; `--target client` elides server artifacts

## Surface conditions

1. Any new non-@aihu/* runtime dep → surface
2. @aihu/router browser bundle grows beyond 1536 B → surface (router metadata is build-time only)
3. Either stream hits a fundamental coupling that requires serial execution → surface
4. `<$warp>` stub from v0.5 blocking any v0.6 feature → surface

