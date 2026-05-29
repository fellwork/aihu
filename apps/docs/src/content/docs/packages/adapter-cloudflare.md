# @aihu/adapter-cloudflare

Cloudflare Workers/Pages deployment adapter for `@aihu/app`. A build-time-only tool — it runs during your production build and emits the files Cloudflare needs to serve your app. It is never included in browser bundles and has no runtime size impact.

The adapter writes a `_worker.js` entry into Vite's output directory and, optionally, a `wrangler.toml` in your project root. It supports two deployment targets (Workers and Pages) and two serving modes (SPA-only and SSR + static hybrid).

## Install

```bash
npm install @aihu/adapter-cloudflare
# or
bun add @aihu/adapter-cloudflare
```

This package declares `@aihu/app` and `vite` (>=5.0.0) as peer dependencies — install them alongside it.

## API overview

| Name | Kind | Description |
|------|------|-------------|
| `cloudflare` | function | Create a Cloudflare adapter for use in `aihu.config.ts` |
| `CloudflareAdapterOptions` | interface | Options bag accepted by `cloudflare()` |

The default export of `@aihu/app` returns an `AihuAdapter`; `cloudflare()` is the only value export of this package.

## Functions

### cloudflare

```typescript
function cloudflare(options?: CloudflareAdapterOptions): AihuAdapter
```

Returns an `AihuAdapter` (named `'cloudflare'`) that you pass to `defineConfig({ adapter })`. During the build, its `adapt()` hook runs after Vite finishes and:

1. In SSR mode only, writes `routes-manifest.js` into the output directory before the worker entry.
2. Writes `_worker.js` to the output directory — an SPA entry, or an SSR + static hybrid entry when `ssr: true`.
3. Writes `wrangler.toml` to the project root, but only if no `wrangler.toml` already exists. It never overwrites your file.

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `options` | `CloudflareAdapterOptions` | No | Adapter configuration. All fields are optional. |

**Returns** `AihuAdapter` — the adapter object consumed by `@aihu/app`.

## Types

### CloudflareAdapterOptions

```typescript
interface CloudflareAdapterOptions {
  name?: string
  mode?: 'workers' | 'pages'
  generateWrangler?: boolean
  ssr?: boolean
}
```

All fields are optional.

**Fields**

| Name | Type | Default | Description |
|------|------|---------|-------------|
| `name` | `string` | `"name"` from your `package.json`, else `'aihu-app'` | Cloudflare Worker name written into the generated `wrangler.toml`. |
| `mode` | `'workers' \| 'pages'` | `'workers'` | Deployment target. `'workers'` serves static assets via the `env.ASSETS` binding; `'pages'` follows the Cloudflare Pages `_worker.js` convention. Both produce the same output, only the deploy target differs. |
| `generateWrangler` | `boolean` | `true` | Whether to write `wrangler.toml` in the project root if it is absent. Set to `false` to manage `wrangler.toml` yourself. An existing file is never overwritten regardless of this value. |
| `ssr` | `boolean` | `false` | Enable SSR + static hybrid mode. When `false` (default), all requests are served from the `ASSETS` binding (SPA-only). |

## Serving modes

### SPA-only (default)

When `ssr` is `false`, the generated `_worker.js` serves every page request from Cloudflare's `ASSETS` binding (the CDN). On a 404 from `ASSETS`, it falls back to `/index.html` so client-side routing works.

### SSR + static hybrid

When `ssr: true`, the worker resolves each request in priority order:

1. **SSR handler** — your aihu server routes (API routes, agent-readiness endpoints, server-rendered pages).
2. **ASSETS** — pre-rendered static files served from the Cloudflare CDN.
3. **`/index.html`** — the SPA shell fallback for client-side-routed pages.

In this mode the adapter also emits a `routes-manifest.js` carrying serializable route metadata (`pattern`, `segments`, `name`, `ssr`). Because page components are not serializable, each manifest route currently uses a placeholder handler that returns 404, letting the worker fall through to the `ASSETS` binding for pre-rendered pages.

## Usage

### Basic configuration

```typescript
// aihu.config.ts
import { defineConfig } from '@aihu/app'
import { cloudflare } from '@aihu/adapter-cloudflare'

export default defineConfig({
  adapter: cloudflare({ name: 'my-worker' }),
})
```

### SSR + static hybrid

```typescript
// aihu.config.ts
import { defineConfig } from '@aihu/app'
import { cloudflare } from '@aihu/adapter-cloudflare'

export default defineConfig({
  adapter: cloudflare({ ssr: true }),
})
```

### Managing wrangler.toml yourself

```typescript
import { defineConfig } from '@aihu/app'
import { cloudflare } from '@aihu/adapter-cloudflare'

export default defineConfig({
  // Don't generate wrangler.toml — you maintain your own.
  adapter: cloudflare({ generateWrangler: false }),
})
```

## Deploy

After building, deploy the output with Wrangler:

```bash
wrangler deploy --config wrangler.toml
```

The generated `wrangler.toml` sets `main = "_worker.js"`, a `compatibility_date`, and an `[assets]` block binding the output directory to `ASSETS`. Edit it freely after generation — the adapter never overwrites an existing file.

## See also

- [@aihu/cli](#packages/cli) — scaffold a new aihu app
