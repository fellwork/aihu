# Build Manifest 6.1 — File-based routing (@scribe/router)

**Plan:** 6.1  
**Branch:** feat/v1-router  
**Date:** 2026-05-02  
**Status:** DONE

## Summary

New package `@scribe/router` implementing file-based routing for the scribe meta-framework via a Vite plugin that scans a `pages/` directory and generates a route manifest, plus a `createRouter` function that wires the manifest to a fetch-API compatible router.

## Files Created

### Package scaffold
- `packages/router/package.json` — workspace package, depends on `@scribe/server`
- `packages/router/tsconfig.json` — extends `tsconfig.base.json`
- `packages/router/rolldown.config.ts` — ESM build with dts, externals: `@scribe/server`, `vite`, `node:fs`, `node:path`, `node:url`
- `packages/router/moon.yml` — moon task config

### Source
- `packages/router/src/index.ts` — barrel: exports `createRouter`, `viteRouterPlugin`, all types
- `packages/router/src/router.ts` — core types (`RouteSegment`, `RouteModule`, `RouteDefinition`, `MatchResult`, `Router`) and `createRouter()` implementation
- `packages/router/src/vite-plugin.ts` — `viteRouterPlugin()` Vite plugin with `resolveId`, `load`, `configureServer` hooks

### Tests
- `packages/router/tests/router.test.ts` — 18 unit tests covering all acceptance criteria

### Config changes
- `vitest.config.ts` — added `@scribe/router` alias
- `.size-limit.json` — added `@scribe/router` entry at 1536 B cap

## Test Results

| Metric | Before | After |
|--------|--------|-------|
| Test files | 42 | 43 |
| Tests | 338 | 356 |
| Router tests | 0 | 18 |
| Failures | 0 | 0 |

## Bundle Size

| Package | Size (gz) | Limit | Headroom |
|---------|-----------|-------|----------|
| @scribe/router | 1.45 kB | 1536 B | +50 B |

## Acceptance Criteria

1. `createRouter([...routes])` returns a `Router` with `match()` and `handle()` — PASS
2. `match('/users/42')` on `/:id` route returns `{ params: { id: '42' } }` — PASS
3. `match('/unknown')` returns `null` — PASS
4. `handle(req)` renders matching component and returns `Response` with HTML — PASS
5. `viteRouterPlugin()` has `name`, `resolveId`, `load` hooks — PASS
6. Package builds within `.size-limit.json` cap — PASS (50 B headroom)
7. 18 unit tests: static match, param extraction, catch-all, null-for-unmatched — PASS
8. All existing tests pass — PASS (338 → 356 total)
9. Package added to workspace and `.size-limit.json` — PASS

## Architecture Notes

- `createRouter` ordering: static → param → catchall (prevents catch-all swallowing specific routes)
- Catch-all segments (`[...all]`) map to `/*` and capture remainder as `params['*']`
- Vite plugin uses static `node:fs`/`node:path` imports (external), avoiding CJS interop shim — kept bundle at 1.45 kB
- `handle()` injects loader data as an inline `<script type="application/json" id="__scribe_loader__">` after the HTML
- Virtual module ID `virtual:scribe-routes` resolved to `\0virtual:scribe-routes` per Vite convention
- Private files (`_*.ts`) are excluded from page scanning
