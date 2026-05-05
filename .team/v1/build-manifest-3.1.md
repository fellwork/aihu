# Build Manifest — Plan 3.1 Streaming SSR

**STATUS: DONE**

**Branch:** `feat/v1-streaming-ssr`
**Commit:** 891829c
**Builder:** Claude Sonnet 4.6
**Date:** 2026-04-30

---

## Files Changed

| File | Change | Lines |
|---|---|---|
| `packages/server/src/stream-types.ts` | New | +34 |
| `packages/server/src/ssr.ts` | Modified | +226 / -19 |
| `packages/server/src/index.ts` | Modified | +2 / -1 |
| `packages/server/tests/ssr-stream.test.ts` | New | +167 |
| `packages/server/package.json` | Modified | +3 |

**Total delta:** +395 insertions, -19 deletions across 5 files.

---

## Export Count — `@aihu/server`

| | Exported names |
|---|---|
| Before | `RouteContext`, `RouteHandler`, `Middleware`, `Next`, `HttpMethod`, `Route`, `RouteManifest`, `RouterOptions`, `RouteOptions`, `defineRoute`, `createRouter`, `defineMiddleware`, `composeMiddleware`, `ApiHandler`, `defineApiRoute`, `json`, `notFound`, `methodNotAllowed`, `badRequest`, `serverError`, `MetaTag`, `LinkTag`, `HeadConfig`, `SsrOptions`, `ComponentDescription`, `renderToString`, `LoaderResult`, `LoaderFn`, `DefinedLoader`, `LoadedRouteContext`, `defineLoader`, `ServerConfig`, `CorsConfig`, `RouteConfig`, `AihuConfig`, `defineAihuConfig`, `AgentReadinessConfig` — **36 exports** |
| After | All above + `renderToStream`, `DataSource`, `StreamOptions` — **39 exports** |

Pre: 36 | Post: 39 | **Delta: +3**

---

## Test Count

| Scope | Before | After |
|---|---|---|
| `packages/server` | 57 | 63 |
| Full suite | 255 | 261 |

All 261 tests pass on `feat/v1-streaming-ssr`.

---

## Open Questions — Resolution Status

| ID | Title | Status |
|---|---|---|
| OQ-V5 | Streaming return type | **RESOLVED** — `ReadableStream<string>`, bare WHATWG type, no wrapper |
| OQ-V6 | SSR dehydration in streaming mode | **RESOLVED** — inherits existing `hydratable`/`data-aihu-path` behavior unchanged; streaming-boundary dehydration deferred to v2 |

---

## Implementation Notes

- `renderNodeAsync` is an internal async function (not exported) that walks the tree with DataSource boundary suspension support.
- `renderToString` is now a thin drain wrapper over `renderToStream` using `getReader()` + `reader.read()` loop for maximum runtime portability (Workers/Deno/Bun/Node).
- `walkDone` flag pattern implemented per Director clarification: `let pendingState = { count, walkDone, opts }` guards `controller.close()` against premature close when async boundaries outlive the synchronous walk.
- `ReadableStream` used as a global (`/// <reference lib="dom" />`); no `stream/web` import.
- `packages/arbor/` has zero modifications — confirmed by git diff.
- `packages/server/package.json` has `"engines": { "node": ">=18.0.0" }`.
