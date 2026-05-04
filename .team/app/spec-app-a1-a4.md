# Architect Spec — @scribe/app V0
**Date:** 2026-05-04
**Specs:** A1 (defineConfig schema), A4 (route param protocol)
**Pending:** A2 (Vite plugin composition), A3 (@scribe/app/client bootstrap module)

---

## A1 — ScribeConfig / defineConfig schema

### TypeScript types

```typescript
// packages/app/src/config.ts

/** Scribe application configuration (SPA-focused, V0). */
export interface ScribeConfig {
  /** Directory layout overrides. */
  readonly dir?: DirConfig
  /** Output mode. V0 supports 'spa' only. */
  readonly output?: OutputMode
  /** Scribe plugins. Order is preserved. */
  readonly plugins?: ReadonlyArray<ScribePlugin>
  /** Runtime configuration split — public values are inlined in client bundle. */
  readonly runtimeConfig?: RuntimeConfig
  /** HTML <head> metadata. */
  readonly app?: AppConfig
  /** Passthrough to Vite's UserConfig. Merged last. */
  readonly vite?: VitePassthrough
}

export type OutputMode = 'spa' // V0 only; 'ssr' | 'static' | 'hybrid' deferred

export interface DirConfig {
  readonly pages?: string    // default: 'pages'
  readonly layouts?: string  // default: 'src/layouts'
  readonly public?: string   // default: 'public'
}

/** Public values are inlined; private values are server-only (V0: ignored). */
export interface RuntimeConfig {
  readonly public?: Record<string, unknown>
  readonly private?: Record<string, unknown>
}

export interface AppConfig {
  readonly head?: HeadConfig
}

export interface HeadConfig {
  readonly title?: string
  readonly charset?: string   // default: 'UTF-8'
  readonly viewport?: string  // default: 'width=device-width, initial-scale=1'
  readonly meta?: ReadonlyArray<Record<string, string>>
}

/** Vite config fields that can be safely merged (excludes plugins — those go in ScribeConfig.plugins). */
export type VitePassthrough = Omit<import('vite').UserConfig, 'plugins'>

/** A Scribe plugin is structurally identical to a Vite plugin (V0). */
export type ScribePlugin = import('vite').Plugin

/** Thrown when defineConfig validation fails. */
export class ScribeConfigError extends Error {
  constructor(
    message: string,
    readonly code: ScribeConfigErrorCode,
    readonly field?: string,
  ) {
    super(message)
    this.name = 'ScribeConfigError'
  }
}

export type ScribeConfigErrorCode =
  | 'INVALID_OUTPUT_MODE'
  | 'INVALID_DIR'
  | 'UNKNOWN_FIELD'
```

### defineConfig validation rules (V0)

```typescript
export function defineConfig(config: ScribeConfig): ScribeConfig {
  // V0 validation — no Zod dependency
  if (config.output && config.output !== 'spa') {
    throw new ScribeConfigError(
      `output mode '${config.output}' is not supported in V0 (only 'spa')`,
      'INVALID_OUTPUT_MODE',
      'output',
    )
  }
  if (config.dir?.pages !== undefined && typeof config.dir.pages !== 'string') {
    throw new ScribeConfigError('dir.pages must be a string', 'INVALID_DIR', 'dir.pages')
  }
  if (config.dir?.layouts !== undefined && typeof config.dir.layouts !== 'string') {
    throw new ScribeConfigError('dir.layouts must be a string', 'INVALID_DIR', 'dir.layouts')
  }
  return config
}
```

### scribe.config.ts example (user-facing)

```typescript
// scribe.config.ts
import { defineConfig } from '@scribe/app'

export default defineConfig({
  app: {
    head: { title: 'My App' },
  },
  runtimeConfig: {
    public: { apiBase: '/api' },
  },
})
```

### File locations

- `packages/app/src/config.ts` — types + `defineConfig`
- `packages/app/src/index.ts` — re-exports `defineConfig`, `createApp`
- `packages/app/package.json` — `"exports": { ".": "./src/index.ts", "./client": "./src/client.ts" }`

---

## A4 — Route param protocol

### Problem with current protocol

`main.ts` does:
```typescript
el.setAttribute('route', JSON.stringify({ params: match.params }))
```

This requires each component to parse JSON from an attribute — not idiomatic Web Component behavior.

### V0 protocol: flat per-attribute

**Router side (`mountRoute`):**
```typescript
export function mountRoute(match: MatchResult, outlet: HTMLElement): void {
  const tag = match.route.name
  if (!tag || !tag.includes('-')) return
  const el = document.createElement(tag)
  // Flat per-param attributes instead of JSON blob
  for (const [key, val] of Object.entries(match.params ?? {})) {
    el.setAttribute(key, String(val))
  }
  outlet.replaceChildren(el)
}
```

**Component side (Scribe DSL):**
```
@route { name: "blog-post", params: ["slug"] }
@template {
  <h1>Post: {post.title}</h1>
}
@state {
  $prop slug: string
  const post = computed(() => getPosts().find(p => p.slug === slug()))
}
```

The compiler sees `$prop slug: string` and emits:
```typescript
static get observedAttributes() { return ['slug'] }
attributeChangedCallback(name: string, _old: string, val: string) {
  if (name === 'slug') slug_write(val)
}
const [slug, slug_write] = signal('')
```

### MatchResult change

```typescript
// packages/router/src/router.ts — add pathname
export interface MatchResult {
  route: Route
  params: Record<string, string>
  pathname: string  // NEW: the matched pathname, e.g. '/posts/hello'
}
```

### RouteSidecar change

```typescript
// packages/router/src/vite-plugin.ts
export interface RouteSidecar {
  name?: string
  middleware?: string[]
  ssr?: boolean
  layout?: string
  params?: string[]  // NEW: declared param names, e.g. ["slug"]
}
```

### Rust compiler change

The `.route.json` sidecar emitted by the Rust compiler gains a `"params"` array:
```json
{ "name": "blog-post", "params": ["slug"] }
```

The compiler reads `$prop` declarations that have a matching `@route { params: [...] }` declaration and emits them into the sidecar.

### Migration path

- `blog-router/src/main.ts` drops the `route` JSON attribute line
- New `mountRoute(match, outlet)` from `@scribe/app/client` handles the loop
- `$prop slug: string` in `posts/[slug].scribe` replaces manual attribute parsing

---

## Open questions (surface to user before Builder)

1. **`@scribe/app` vs `@scribe/client`** — package name: `@scribe/app` (Nuxt-model, broader) or `@scribe/client` (narrower, client-runtime only)? Director preference: `@scribe/app`.

2. **`createApp()` signature** — Does it accept the config inline or always read `scribe.config.ts`?
   - Option A: `createApp()` — reads config file at build time, no runtime arg
   - Option B: `createApp(config)` — accepts inline config (simpler, no file-read at runtime)
   - Option C: both — `createApp()` for scaffold, `createApp(config)` for testing
   Director preference: Option B for V0 (simplest, no FS access at runtime).

3. **`scribe()` Vite plugin naming** — Is `scribe()` the right name for the composed Vite plugin that absorbs `viteRouterIntegration` + `viteAgentReadinessIntegration`? Or should it be `viteScribePlugin()`?

4. **Adapter field timing** — Should the `ScribeConfig` type reserve an `adapter` field now (accepting `null` with a TODO comment) even if V0 ignores it? This prevents a breaking change when adapters ship.
