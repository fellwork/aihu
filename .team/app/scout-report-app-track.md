# Scout Report — @aihu/app Track
**Date:** 2026-05-04
**Scout scope:** S1 (main.ts audit), S2 (CLI scaffold audit), S3 (defineAihuConfig audit)

---

## S1 — examples/blog-router/src/main.ts audit

**Finding:** All 44 lines are framework bootstrap. Zero user logic.

```
Line 1-4:   imports — createRouter, MatchResult, routes virtual module
Line 6:     createRouter(routes) — router instantiation
Line 7:     outlet getElementById — DOM binding
Line 9-26:  render() function — module import, createElement, setAttribute, replaceChildren
Line 29:    initial render(router.match(...))
Line 32-40: click interceptor — closest('a'), pushState, render()
Line 42-44: popstate listener
```

**Callsites that must move to @aihu/app/client:**
- `createRouter` instantiation
- `document.getElementById('outlet')` — outlet lookup
- `render()` loop — module import, element creation, attribute setting, replaceChildren
- click interceptor (with `<a>` detection, external URL guard)
- `popstate` listener
- 404 rendering

**Currently missing from scaffold:**
- The CLI `appMainTs()` at `packages/cli/src/index.ts:123-138` still generates the old
  `_setMount`/`_setSignal` internal-API bootstrap (no router)
- The CLI does NOT add `@aihu/router` to generated project deps
- `appAihuConfig()` template exists in CLI but generates a dead `defineAihuConfig` call

---

## S2 — CLI scaffold audit

File: `packages/cli/src/index.ts` lines ~123-138

```typescript
export function appMainTs(name: string): string {
  return `// Mount aihu runtime
import { mount } from '@aihu/arbor'
import { signal, effect } from '@aihu/signals'
import { _setMount, _setSignal } from '@aihu/runtime'

// Wire runtime to signals
_setMount(mount)
_setSignal(signal as Parameters<typeof _setSignal>[0])

// Import your components (aihu SFCs are auto-compiled)
import './pages/index.aihu'

console.log('[aihu] ${name} mounted')
`
}
```

**Issues:**
1. Exposes `_setMount`/`_setSignal` internal APIs in userland
2. No router — a fresh scaffold has no SPA routing
3. No `@aihu/router` in generated `package.json` deps
4. `appAihuConfig()` generates `defineAihuConfig({})` — identity call, no real config

**After @aihu/app V0:** `appMainTs()` should become:
```typescript
import { createApp } from '@aihu/app'
createApp()
```
Two lines total.

---

## S3 — defineAihuConfig audit

File: `packages/server/src/config.ts` line 84

```typescript
export function defineAihuConfig(config: AihuConfig): AihuConfig {
  return config
}
```

**Finding:** Pure identity function. No runtime consumers, no validation, no schema enforcement.
The existing `AihuConfig` interface in `@aihu/server` is server-focused:
- `server?: ServerConfig` (Hono/CORS/etc.)
- `agent?: AgentReadinessConfig`
- `routes?: RouteConfig`
- `plugins?: ReadonlyArray<Plugin>`
- `build?: BuildConfig`

**Impact of introducing @aihu/app defineConfig:**
- New `defineConfig` lives in `@aihu/app` — SPA/client-focused
- Old `defineAihuConfig` in `@aihu/server` — SSR/server-focused
- Name collision risk: both are `defineConfig`-pattern but serve different layers
- Safe to leave `@aihu/server` version as-is for V0; future v1.x unification can combine

---

## Do-not-break list

- `packages/server/src/config.ts` — do not delete or break existing `AihuConfig`/`defineAihuConfig`
- `packages/router/src/vite-plugin.ts` — `viteRouterIntegration` is currently referenced by users directly
- `packages/compiler/js/index.ts` — `_injectAutoWiring` shim must remain compatible
- `examples/blog-router/` — reference example must continue to compile and run
- All 620 TS + 232 Rust tests must pass post-implementation
