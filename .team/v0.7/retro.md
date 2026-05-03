# Retro — v0.7 Router Middleware + Naming Cleanup

**Date:** 2026-05-03
**Session type:** Mode 2 — single TypeScript Builder
**PR:** #42 (`feat/v0.7-router-middleware` → `main` at `570a2c7`)

---

## What shipped

| Sub-item | Description |
|----------|-------------|
| v0.7.1 | `defineRouterMiddleware` + `composeRouterMiddleware` + types in `packages/router/src/middleware.ts`; exported from `@scribe/router` |
| v0.7.2 | `viteRouterPlugin` (`vite-plugin.ts`) extended: `scanPages()` detects `_middleware.ts/js` and emits `middlewareFile` field |
| v0.7.3 | `Plugin.serverOnly?: boolean` added to `packages/plugin/src/index.ts` |
| v0.7.4 | Renames: `createRouter → createRequestRouter` (@scribe/server); `viteRouterPlugin → viteRouterIntegration` (@scribe/router); `agentReadiness → viteAgentReadinessIntegration` (@scribe/agent-readiness). All old names kept as deprecated aliases. |
| v0.7.5 | Stage-order comment at top of `composeRouterMiddleware` |

**TS tests:** 516 → 534 (+18)
**Router size:** 740 B → 818 B (budget 1536 B; +718 B headroom — no limit raise needed)

---

## Final gate walk

**Rust tests:** 209 (unchanged — TS-only milestone)
**TS tests:** 516 → 534 (+18, 64 test files)
**Main HEAD at close:** `570a2c7`
**Size:** all 8 rows pass; router +718 B headroom confirms the +256 B raise pre-authorized for v0.7.1 was unnecessary.

---

## v0.8 is next

v0.8 = CLI scaffolder + Hello World template + first-run UX (`@scribe/cli`). Smaller scope than v0.6/v0.7.
