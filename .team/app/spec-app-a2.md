# A2 — scribe() Vite Plugin Composition Contract
**Date:** 2026-05-04
**Scope:** V0 — SPA output mode only
**Input specs:** A1 (ScribeConfig/defineConfig), A4 (route param protocol), Scout S1-S3

---

## 1. Plugin Order with Rationale

The composed plugin array must be emitted in this exact order:

```
[scribeCompilerPlugin(), viteRouterIntegration(opts), viteAgentReadinessIntegration(cfg)]
```

**Dependency chain:**

The compiler plugin (`scribe-compiler`) carries `enforce: 'pre'`. This is not negotiable — it is declared directly in `packages/compiler/js/index.ts` and must fire before Vite's esbuild step attempts to parse `.scribe` source as JavaScript. There is no ordering dependency between the compiler and the router plugins at the Vite hook level; `enforce: 'pre'` is resolved by Vite's internal plugin sorter, not by array position. However, placing the compiler plugin first in the array makes the intent explicit and matches how Vite documents `enforce: 'pre'` plugins.

The router plugin (`scribe-router`) uses `resolveId`/`load` hooks to serve `virtual:scribe-routes` and `virtual:scribe-layouts`. These virtual modules may reference compiled `.scribe` files via dynamic `import()` calls that Vite resolves independently — the router plugin does not transform `.scribe` source and therefore does not depend on the compiler running first at the hook level. However, `configureServer` in the router plugin installs a watcher that invalidates the virtual module when `.scribe` files change on disk. This is complementary to the compiler's `transform` hook. No ordering conflict exists.

The agent-readiness plugin (`scribe-agent-readiness`) uses `configureServer` to install Connect middleware and `generateBundle` to emit static assets. Neither hook interacts with the compiler or router plugin outputs. It must be last only to maintain predictable middleware ordering — specifically so that agent-readiness's Connect middleware (which matches `/llms.txt`, `/robots.txt`, etc.) is installed after any router middleware that handles application routes.

**Summary table:**

| Position | Plugin name | Enforce | Hooks used | Ordering constraint |
|---|---|---|---|---|
| 1 | `scribe-compiler` | `pre` | `transform` | Must run before Vite esbuild parses `.scribe` |
| 2 | `scribe-router` | (none) | `resolveId`, `load`, `configureServer` | After compiler in array; no hook-level dep |
| 3 | `scribe-agent-readiness` | (none) | `configureServer`, `generateBundle` | Last; Connect middleware must not shadow app routes |

---

## 2. `scribe()` TypeScript Signature

```typescript
// packages/app/src/vite-plugin.ts

import type { Plugin } from 'vite'
import type { ScribeConfig } from './config.ts'

/**
 * The scribe() Vite plugin composer.
 *
 * Accepts an optional ScribeConfig inline. If omitted entirely, defaults
 * are used for all sub-plugin options (pages: 'pages', layouts: 'src/layouts').
 *
 * Returns Plugin[] — Vite flattens these when the array is spread into `plugins`.
 */
export function scribe(config?: ScribeConfig): Plugin[]
```

No overloads needed for V0. `config` is optional so the zero-config case (`scribe()`) works without any argument.

---

## 3. Sub-Plugin Option Derivation from ScribeConfig

All derivations are pure synchronous reads — no async, no file I/O.

### 3a. Compiler plugin (`scribeCompilerPlugin`)

```typescript
const compilerOpts: ScribeCompilerPluginOptions = {}
// V0: no ScribeConfig → compiler mapping yet
```

### 3b. Router plugin (`viteRouterIntegration`)

```typescript
const routerOpts: RouterPluginOptions = {
  pagesDir: config?.dir?.pages ?? 'pages',
  layoutsDir: config?.dir?.layouts ?? 'src/layouts',
}
```

Default values match `viteRouterPlugin`'s existing internal defaults — transparent when wrapping vs. calling directly.

### 3c. Agent-readiness plugin

Opt-in via `config.agentReadiness` (see Section 5). If absent, a no-op plugin is substituted.

### 3d. `ScribeConfig.vite` passthrough

NOT forwarded to sub-plugins. Consumed by a dedicated sentinel plugin at the end of the returned array via Vite's `config` hook:

```typescript
{
  name: 'scribe-vite-passthrough',
  config() {
    return config?.vite ?? {}
  }
}
```

Vite's `config` hook return values are deep-merged into resolved config automatically.

### 3e. `ScribeConfig.plugins` user plugins

Appended after the three framework plugins:

```typescript
return [
  scribeCompilerPlugin(compilerOpts),
  viteRouterIntegration(routerOpts),
  agentReadinessPluginOrNoop,
  ...(config?.plugins ?? []),
  vitePassthroughPlugin,
]
```

User plugins are placed after framework plugins so they cannot interfere with `.scribe` transform or virtual module resolution.

---

## 4. Return Type: `Plugin[]`

**Decision: return `Plugin[]`.** Vite's `plugins` array accepts `Plugin | Plugin[]` at every position and flattens the result.

Returning `Plugin[]` is correct because `scribe()` composes three structurally distinct plugins, each with their own `name`, independent hook implementations, and independent lifecycle. Forcing them into a single plugin object would require multiplexing every hook with internal dispatch — indirection with no benefit.

**Trade-off acknowledged:** Vite's plugin inspector shows three named entries rather than one `scribe` entry. This is a debugging advantage — matches how Nuxt and Analog compose their sub-plugins.

---

## 5. Agent Readiness: Opt-In

**Decision: opt-in via `ScribeConfig`, with a no-op default.**

`viteAgentReadinessIntegration` requires `{ name: string }`. There is no safe default for `name`. The integration is therefore opt-in through a dedicated `agentReadiness` sub-object on `ScribeConfig`.

**ScribeConfig addition required (feeds back to A1):**

```typescript
readonly agentReadiness?: AgentReadinessConfig | false
```

- `undefined` (field absent): no-op plugin named `'scribe-agent-readiness-disabled'`
- `AgentReadinessConfig` object: plugin active with provided config
- `false`: explicit opt-out (same as `undefined`)

**Size/perf:** `@scribe/agent-readiness` is build-time only. When disabled, it must be marked external in rolldown config so it does not land in any bundle.

---

## 6. Config File Reading Approach for V0

**Decision: inline config only — `scribe(config?)`.**

Reading `scribe.config.ts` automatically is impossible at `plugins:[]` evaluation time (synchronous). The `configResolved`-hook approach (re-invoke sub-plugins post-initialization) is also impossible. For V0, config lives in `vite.config.ts` inline:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { scribe } from '@scribe/app'

export default defineConfig({
  plugins: [scribe({
    dir: { pages: 'src/pages', layouts: 'src/layouts' },
    agentReadiness: { name: 'My App' },
  })]
})
```

Zero-config case:
```typescript
export default defineConfig({ plugins: [scribe()] })
```

The "inline wins, file is fallback" pattern is deferred to V1 via Vite's `loadConfigFromFile` utility.

---

## 7. Implementation Map

### Files to create

- **`packages/app/src/vite-plugin.ts`** — `scribe()` function; imports:
  - `scribeCompilerPlugin` from `@scribe/compiler` (default entry, NOT `@scribe/compiler/plugin`)
  - `viteRouterIntegration` from `@scribe/router/plugin` (build-time subpath)
  - `viteAgentReadinessIntegration` from `@scribe/agent-readiness`
  - `ScribeConfig` from `./config.ts`
  - `Plugin` type-only from `vite`

- **`packages/app/src/index.ts`** — re-exports `defineConfig`, `scribe`, `createApp`

- **`packages/app/package.json`** — exports map: `"."` and `"./client"` subpaths; `BUILD_DEV_ONLY = false` (client is browser-eligible)

- **`packages/app/rolldown.config.ts`** — all workspace deps marked `external`

### Files to modify

- **`packages/app/src/config.ts`** — add `agentReadiness?: AgentReadinessConfig | false` to `ScribeConfig`; type-only import from `@scribe/agent-readiness`
- **`packages/cli/src/commands/app.ts`** — update scaffold `vite.config.ts` template to use composed `scribe()` plugin

---

## 8. Builder Risks

1. **Import path for `scribeCompilerPlugin`** — Use default entry (`@scribe/compiler`), NOT `@scribe/compiler/plugin`
2. **`viteRouterIntegration` import** — Use `@scribe/router/plugin` subpath, NOT `@scribe/router`
3. **`AgentReadinessConfig` type-only import** — Add `@scribe/agent-readiness` to `@scribe/app/package.json` dependencies
4. **`check-size-rows` classification** — `@scribe/app` is browser-eligible (client subpath); add `.size-limit.json` row for `packages/app/dist/client.js`
5. **No-op plugin naming** — Use stable `'scribe-agent-readiness-disabled'` name
6. **Never pass `{}` as `AgentReadinessConfig`** — `name: string` is required; TypeScript enforces at the config boundary

---

## Open Question for Director

**`agentReadiness` field naming:** `agentReadiness?: ...` vs `agent?: ...`. Recommend `agentReadiness` to avoid confusion with `@scribe/agent` (the registry package).
