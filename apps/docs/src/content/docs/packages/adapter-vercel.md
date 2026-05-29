# @aihu/adapter-vercel

Vercel deployment adapter for `@aihu/app`. Implements the `AihuAdapter` interface and emits a [Vercel Build Output API v3](https://vercel.com/docs/build-output-api/v3) directory (`.vercel/output/`) from a finished Vite build, ready for `vercel deploy --prebuilt`.

## Install

```bash
npm install @aihu/adapter-vercel
# or
bun add @aihu/adapter-vercel
```

Peer dependencies: `@aihu/app` and `vite` (`>=5.0.0`).

## API overview

| Name | Kind | Description |
|------|------|-------------|
| `vercel` | function | Create a Vercel `AihuAdapter` for `defineConfig` |
| `VercelAdapterOptions` | interface | Options for `vercel()` |

## Functions

### vercel

```typescript
function vercel(options?: VercelAdapterOptions): AihuAdapter
```

Returns an `AihuAdapter` (named `'vercel'`) that the `@aihu/app` Vite plugin invokes after the bundle is written. Its `adapt()` step:

1. Cleans and recreates the output directory (removing stale files from prior builds).
2. Copies the Vite output (`context.outDir`) into `.vercel/output/static/`.
3. Writes an Edge or Serverless function entry at `.vercel/output/functions/index.func/index.js`.
4. Writes the function's `.vc-config.json`.
5. Writes `.vercel/output/config.json` with the Build Output API v3 routes manifest.

The generated routes serve `/assets/*` with a long-lived immutable `cache-control` header, send `/api/*` to the function (`/index.func`), and fall back all other requests to `static/index.html` (SPA mode).

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `options` | `VercelAdapterOptions` | No | Adapter configuration. See below. |

**Returns** `AihuAdapter` — pass to the `adapter` field of `defineConfig`.

## Types

### VercelAdapterOptions

```typescript
interface VercelAdapterOptions {
  runtime?: 'edge' | 'serverless'
  outputDir?: string
  nodeVersion?: string
}
```

**Fields**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `runtime` | `'edge' \| 'serverless'` | No | `'edge'` | `'edge'` targets the Vercel Edge Runtime (V8 isolates, global). `'serverless'` targets a regional Node.js function. |
| `outputDir` | `string` | No | `'.vercel/output'` | Build Output API directory, resolved relative to the project root. |
| `nodeVersion` | `string` | No | `'nodejs18.x'` | Node.js version for the serverless runtime. Ignored when `runtime` is `'edge'`. |

## Usage

### Default (Edge Runtime)

```typescript
// aihu.config.ts
import { defineConfig } from '@aihu/app'
import { vercel } from '@aihu/adapter-vercel'

export default defineConfig({
  adapter: vercel(),
})
```

### Serverless runtime with a pinned Node version

```typescript
// aihu.config.ts
import { defineConfig } from '@aihu/app'
import { vercel } from '@aihu/adapter-vercel'

export default defineConfig({
  adapter: vercel({
    runtime: 'serverless',
    nodeVersion: 'nodejs20.x',
  }),
})
```

After building, deploy the prebuilt output:

```bash
vercel deploy --prebuilt
```

## Notes

- **SPA mode (V0).** The generated function entry handles `/api/**` routes only and currently returns `501 Not Implemented`; all page requests are served as static files from `static/index.html`. Full SSR is planned for V1+.
- The adapter wipes its `outputDir` on every run, so do not point `outputDir` at a directory containing files you want to keep.

## See also

- [@aihu/adapter-cloudflare](#packages/adapter-cloudflare) — deploy the same app to Cloudflare Pages
- [@aihu/cli](#packages/cli) — scaffold a new aihu app
- [Deployment guide](#guides/deployment) — runtime targets and the native-addon fallback
