# A2 — aihu() Vite Plugin Composition Contract
**Date:** 2026-05-04
**Scope:** V0 — SPA output mode only
**Input specs:** A1 (AihuConfig/defineConfig), A4 (route param protocol), Scout S1-S3

---

## 1. Plugin Order with Rationale

The composed plugin array must be emitted in this exact order:

```
[aihuCompilerPlugin(), viteRouterIntegration(opts), viteAgentReadinessIntegration(cfg)]
```

**Dependency chain:**

The compiler plugin (`aihu-compiler`) carries `enforce: 'pre'`. This is not negotiable — it is declared directly in `packages/compiler/js/index.ts` and must fire before Vite's esbuild step attempts to parse `.aihu` source as JavaScript. There is no ordering dependency between the compiler and the router plugins at the Vite hook level; `enforce: 'pre'` is resolved by Vite's internal plugin sorter, not by array position. However, placing the compiler plugin first in the array makes the intent explicit and matches how Vite documents `enforce: 'pre'` plugins.

The router plugin (`aihu-router`) uses `resolveId`/`load` hooks to serve `virtual:aihu-routes` and `virtual:aihu-layouts`. These virtual modules may reference compiled `.aihu` files via dynamic `import()` calls that Vite resolves independently — the router plugin does not transform `.aihu` source and therefore does not depend on the compiler running first at the hook level. However, `configureServer` in the router plugin installs a watcher that invalidates the virtual module when `.aihu` files change on disk. This is complementary to the compiler's `transform` hook. No ordering conflict exists.

The agent-readiness plugin (`aihu-agent-readiness`) uses `configureServer` to install Connect middleware and `generateBundle` to emit static assets. Neither hook interacts with the compiler or router plugin outputs. It must be last only to maintain predictable middleware ordering — specifically so that agent-readiness's Connect middleware (which matches `/llms.txt`, `/robots.txt`, etc.) is installed after any router middleware that handles application routes.

**Summary table:**

| Position | Plugin name | Enforce | Hooks used | Ordering constraint |
|---|---|---|---|---|
| 1 | `aihu-compiler` | `pre` | `transform` | Must run before Vite esbuild parses `.aihu` |
| 2 | `aihu-router` | (none) | `resolveId`, `load`, `configureServer` | After compiler in array; no hook-level dep |
| 3 | `aihu-agent-readiness` | (none) | `configureServer`, `generateBundle` | Last; Connect middleware must not shadow app routes |

---

## 2. `aihu()` TypeScript Signature

```typescript
// packages/app/src/vite-plugin.ts

import type { Plugin } from 'vite'
import type { AihuConfig } from './config.ts'

/**
 * The aihu() Vite plugin composer.
 *
 * Accepts an optional AihuConfig inline. If omitted entirely, defaults
 * are used for all sub-plugin options (pages: 'pages', layouts: 'src/layouts').
 *
 * Returns Plugin[] — Vite flattens these when the array is spread into `plugins`.
 */
export function aihu(config?: AihuConfig): Plugin[]
```

No overloads needed for V0. `config` is optional so the zero-config case (`aihu()`) works without any argument.

---

## 3. Sub-Plugin Option Derivation from AihuConfig

All derivations are pure synchronous reads — no async, no file I/O.

### 3a. Compiler plugin (`aihuCompilerPlugin`)

```typescript
const compilerOpts: AihuCompilerPluginOptions = {}
// V0: no AihuConfig → compiler mapping yet
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

### 3d. `AihuConfig.vite` passthrough

NOT forwarded to sub-plugins. Consumed by a dedicated sentinel plugin at the end of the returned array via Vite's `config` hook:

```typescript
{
  name: 'aihu-vite-passthrough',
  config() {
    return config?.vite ?? {}
  }
}
```

Vite's `config` hook return values are deep-merged into resolved config automatically.

### 3e. `AihuConfig.plugins` user plugins

Appended after the three framework plugins:

```typescript
return [
  aihuCompilerPlugin(compilerOpts),
  viteRouterIntegration(routerOpts),
  agentReadinessPluginOrNoop,
  ...(config?.plugins ?? []),
  vitePassthroughPlugin,
]
```

User plugins are placed after framework plugins so they cannot interfere with `.aihu` transform or virtual module resolution.

---

## 4. Return Type: `Plugin[]`

**Decision: return `Plugin[]`.** Vite's `plugins` array accepts `Plugin | Plugin[]` at every position and flattens the result.

Returning `Plugin[]` is correct because `aihu()` composes three structurally distinct plugins, each with their own `name`, independent hook implementations, and independent lifecycle. Forcing them into a single plugin object would require multiplexing every hook with internal dispatch — indirection with no benefit.

**Trade-off acknowledged:** Vite's plugin inspector shows three named entries rather than one `aihu` entry. This is a debugging advantage — matches how Nuxt and Analog compose their sub-plugins.

---

## 5. Agent Readiness: Opt-In

**Decision: opt-in via `AihuConfig`, with a no-op default.**

`viteAgentReadinessIntegration` requires `{ name: string }`. There is no safe default for `name`. The integration is therefore opt-in through a dedicated `agentReadiness` sub-object on `AihuConfig`.

**AihuConfig addition required (feeds back to A1):**

```typescript
readonly agentReadiness?: AgentReadinessConfig | false
```

- `undefined` (field absent): no-op plugin named `'aihu-agent-readiness-disabled'`
- `AgentReadinessConfig` object: plugin active with provided config
- `false`: explicit opt-out (same as `undefined`)

**Size/perf:** `@aihu/agent-readiness` is build-time only. When disabled, it must be marked external in rolldown config so it does not land in any bundle.

---

## 6. Config File Reading Approach for V0

**Decision: inline config only — `aihu(config?)`.**

Reading `aihu.config.ts` automatically is impossible at `plugins:[]` evaluation time (synchronous). The `configResolved`-hook approach (re-invoke sub-plugins post-initialization) is also impossible. For V0, config lives in `vite.config.ts` inline:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { aihu } from '@aihu/app'

export default defineConfig({
  plugins: [aihu({
    dir: { pages: 'src/pages', layouts: 'src/layouts' },
    agentReadiness: { name: 'My App' },
  })]
})
```

Zero-config case:
```typescript
export default defineConfig({ plugins: [aihu()] })
```

The "inline wins, file is fallback" pattern is deferred to V1 via Vite's `loadConfigFromFile` utility.

---

## 7. Implementation Map

### Files to create

- **`packages/app/src/vite-plugin.ts`** — `aihu()` function; imports:
  - `aihuCompilerPlugin` from `@aihu/compiler` (default entry, NOT `@aihu/compiler/plugin`)
  - `viteRouterIntegration` from `@aihu/router/plugin` (build-time subpath)
  - `viteAgentReadinessIntegration` from `@aihu/agent-readiness`
  - `AihuConfig` from `./config.ts`
  - `Plugin` type-only from `vite`

- **`packages/app/src/index.ts`** — re-exports `defineConfig`, `aihu`, `createApp`

- **`packages/app/package.json`** — exports map: `"."` and `"./client"` subpaths; `BUILD_DEV_ONLY = false` (client is browser-eligible)

- **`packages/app/rolldown.config.ts`** — all workspace deps marked `external`

### Files to modify

- **`packages/app/src/config.ts`** — add `agentReadiness?: AgentReadinessConfig | false` to `AihuConfig`; type-only import from `@aihu/agent-readiness`
- **`packages/cli/src/commands/app.ts`** — update scaffold `vite.config.ts` template to use composed `aihu()` plugin

---

## 8. Builder Risks

1. **Import path for `aihuCompilerPlugin`** — Use default entry (`@aihu/compiler`), NOT `@aihu/compiler/plugin`
2. **`viteRouterIntegration` import** — Use `@aihu/router/plugin` subpath, NOT `@aihu/router`
3. **`AgentReadinessConfig` type-only import** — Add `@aihu/agent-readiness` to `@aihu/app/package.json` dependencies
4. **`check-size-rows` classification** — `@aihu/app` is browser-eligible (client subpath); add `.size-limit.json` row for `packages/app/dist/client.js`
5. **No-op plugin naming** — Use stable `'aihu-agent-readiness-disabled'` name
6. **Never pass `{}` as `AgentReadinessConfig`** — `name: string` is required; TypeScript enforces at the config boundary

---

## Open Question for Director

**`agentReadiness` field naming:** `agentReadiness?: ...` vs `agent?: ...`. Recommend `agentReadiness` to avoid confusion with `@aihu/agent` (the registry package).
