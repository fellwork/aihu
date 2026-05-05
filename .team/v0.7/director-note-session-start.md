# Director Note — v0.7 Session Start

**Date:** 2026-05-03
**Version target:** v0.7 — Router middleware + plugin server-side contributions
**State going in:** main at `aec2763`; Rust 209 tests, TS 516 tests; router 740 B / 1536 B (+796 B)

## Substance direction

v0.7 is TypeScript-only. Single stream: `feat/v0.7-router-middleware`

Key context: v0.6b separated the router browser bundle from build-time code, dropping it from 1451 B to 740 B. The +256 B limit raise pre-authorized for v0.7.1 is therefore almost certainly unnecessary — the middleware additions (~150-220 B) fit within the existing +796 B headroom. The Builder should NOT pre-emptively raise the limit; it should check `bun run size` after implementation and raise only if needed.

## Sub-items

- v0.7.1: `defineRouterMiddleware` + `composeRouterMiddleware` in `@aihu/router` (~150-220 B new code)
- v0.7.2: `pages/**/_middleware.ts` auto-wire in vite-plugin (build-time, goes in `@aihu/router/plugin` subpath)
- v0.7.3: Plugin Contract §6.5 wiring in `@aihu/plugin` (`serverRuntime`, `serverOnly`, `middleware` provisional fields)
- v0.7.4: Rename: `@aihu/server.createRouter` → `createRequestRouter`; `viteRouterPlugin` → `viteRouterIntegration`; `agentReadiness` → `viteAgentReadinessIntegration`
- v0.7.5: Compose composition spec (code comment in composeRouterMiddleware documenting the stage order)

## Surface conditions

1. Router browser bundle exceeds 1536 B after adding middleware → pre-authorized +256 B raise (1536→1792 B), surface as FYI
2. Any new non-@aihu/* dep → surface + reject
