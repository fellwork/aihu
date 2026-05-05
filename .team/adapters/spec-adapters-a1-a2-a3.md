# Adapter Spec — A1 (Contract) + A2 (Cloudflare) + A3 (Vercel)

**Track:** adapters  
**Date:** 2026-05-04  
**Status:** SHIPPED (implementation complete, tests written)

---

## A1 — Adapter Contract (`packages/app/src/adapter.ts`)

### `AdapterContext`

```typescript
export interface AdapterContext {
  readonly outDir: string               // Vite build output directory (absolute)
  readonly root: string                 // project root (absolute)
  readonly routes: ReadonlyArray<RouteDefinition>  // from @aihu/router scanPages
  readonly config: AihuConfig         // resolved AihuConfig
  emitFile(path: string, content: string): Promise<void>  // write relative to outDir
  copy(src: string, dest: string): Promise<void>           // cp -r
  writeFile(absolutePath: string, content: string): Promise<void>  // arbitrary absolute path
  createHandlerSource(options?: CreateHandlerSourceOptions): string  // future SSR hook
}
```

### `AihuAdapter`

```typescript
export interface AihuAdapter {
  readonly name: string
  adapt(context: AdapterContext): Promise<void>
}
```

### `viteAihuPlugin` closeBundle hook (in `packages/app/src/vite-plugin.ts`)

- `apply: 'build'` — adapter sentinel only runs during builds, never dev server
- `closeBundle()` fires after Vite writes all output files
- Derives routes via `scanPages(root, pagesDir)` (does NOT rely on router plugin's internal state)
- Calls `adapter.adapt(context)` — errors reported via `this.error()`

---

## A2 — Cloudflare Workers / Pages adapter (`packages/adapter-cloudflare`)

### Options

```typescript
export interface CloudflareAdapterOptions {
  name?: string              // Worker name; falls back to package.json "name", then 'aihu-app'
  mode?: 'workers' | 'pages' // deployment mode; default: 'workers'
  generateWrangler?: boolean  // write wrangler.toml if absent; default: true
}
```

### `adapt()` steps

1. Write `_worker.js` to `context.outDir` via `context.emitFile('_worker.js', ...)`
2. If `generateWrangler !== false` AND `wrangler.toml` does not exist at `context.root`:
   - Write `wrangler.toml` to project root (never overwrites)

### `_worker.js` content (SPA mode)

```js
export default {
  async fetch(request, env, _ctx) {
    try {
      return await env.ASSETS.fetch(request)
    } catch {
      // Fallback to index.html for client-side routing
      const url = new URL(request.url)
      const indexUrl = new URL('/index.html', url.origin)
      return env.ASSETS.fetch(new Request(indexUrl, request))
    }
  },
}
```

### `wrangler.toml` template

```toml
name = "<workerName>"
main = "_worker.js"
compatibility_date = "2024-01-01"

[assets]
directory = "."
binding = "ASSETS"
```

### Classification

- `BUILD_DEV_ONLY` in `scripts/check-size-rows.ts` — no `.size-limit.json` row

### Tests (7 cases)

- writes `_worker.js` to outDir
- generates `wrangler.toml` when absent
- does NOT overwrite existing `wrangler.toml`
- skips `wrangler.toml` when `generateWrangler: false`
- adapter name is `'cloudflare'`
- `_worker.js` contains `index.html` SPA fallback
- uses `package.json` name as fallback worker name

---

## A3 — Vercel Build Output API v3 adapter (`packages/adapter-vercel`)

### Options

```typescript
export interface VercelAdapterOptions {
  runtime?: 'edge' | 'serverless'  // default: 'edge'
  outputDir?: string               // default: '.vercel/output' (relative to root)
  nodeVersion?: string             // serverless only; default: 'nodejs18.x'
}
```

### `adapt()` steps

1. Clean `outputDir` (rm -rf + mkdir) — prevents stale files from prior builds
2. Copy `context.outDir` → `outputDir/static/`
3. Write `outputDir/functions/index.func/index.js` (edge or serverless entry)
4. Write `outputDir/functions/index.func/.vc-config.json`
5. Write `outputDir/config.json` (Build Output API v3 routes manifest)

### `config.json` routes

```json
{
  "version": 3,
  "routes": [
    { "src": "^/assets/(.*)$", "headers": { "cache-control": "public, max-age=31536000, immutable" }, "continue": true },
    { "src": "^/api/(.*)$", "dest": "/index.func" },
    { "src": "^/(.*)$", "dest": "/static/index.html" }
  ]
}
```

### Edge function entry

```js
export default async function handler(request) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) {
    return new Response('Not Found', { status: 404 })
  }
  return new Response('API route not implemented', { status: 501 })
}

export const config = { runtime: 'edge' }
```

### `.vc-config.json` (edge)

```json
{ "runtime": "edge", "entrypoint": "index.js" }
```

### `.vc-config.json` (serverless)

```json
{ "runtime": "nodejs18.x", "handler": "index.js", "maxDuration": 10 }
```

### Classification

- `BUILD_DEV_ONLY` in `scripts/check-size-rows.ts` — no `.size-limit.json` row

### Tests (9 cases)

- adapter name is `'vercel'`
- copies static assets to `.vercel/output/static/`
- writes `config.json` with Build Output API v3
- config.json routes: assets cache-control, /api/ → /index.func, SPA fallback
- writes edge function entry by default
- writes `.vc-config.json` for edge runtime
- writes serverless function entry when `runtime: 'serverless'`
- writes `.vc-config.json` with nodeVersion for serverless
- cleans output directory before writing
- respects custom `outputDir` option
