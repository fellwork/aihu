/**
 * Deployment guide body. Adapted from the real
 * apps/docs/src/content/docs/guides/deployment.md — no retired-dialect code
 * samples here (build config, Cloudflare/Vercel adapters, Bun/Deno/Node
 * servers) so the content carries over verbatim. Fenced code uses the ~~~
 * delimiter and inline code uses <code> tags so the source carries no
 * backticks.
 */
export const DEPLOYMENT = `# Deployment

## Build for production

~~~bash
bun run build
bun run preview
~~~

<code>bun run build</code> compiles all <code>.aihu</code> SFCs through the Rust compiler, bundles with Vite/Rolldown, and validates against the per-package size budgets in <code>.size-limit.json</code>. <code>bun run preview</code> serves the production build locally to verify output before deploying.

## App configuration

The app configuration is inline in <code>vite.config.ts</code>, as the argument to <code>viteAihuPlugin({...})</code> from <code>@aihu/app</code>:

~~~typescript
// vite.config.ts
import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  optimizeDeps: { exclude: ['@aihu/app'] },
  plugins: [
    viteAihuPlugin({
      output: 'static',            // 'spa' (default) | 'static' (prerendered)
      dir: { pages: 'src/pages' },
      build: { bundler: 'vite' },  // 'vite' | 'rolldown'
    }),
  ],
})
~~~

The config object is <code>@aihu/app</code>'s <code>AihuConfig</code>. Key fields: <code>dir</code> (pages / layouts / public / components), <code>output</code> (<code>'spa'</code> | <code>'static'</code>), <code>site</code>, <code>app.head</code>, <code>css</code> (<code>{ shadowMode: 'light' | 'shadow' }</code>), <code>agentReadiness</code>, <code>adapter</code>, and <code>build.bundler</code> (<code>'vite'</code> | <code>'rolldown'</code>). Pass the same object to <code>defineConfig</code> from <code>@aihu/app</code> to type-check it in its own file.

> A standalone <code>aihu.config.ts</code> that default-exports <code>defineAihuConfig</code> from <code>@aihu/server</code> still works as a legacy fallback for server/SSR build config — including a <code>build.target</code> of <code>'client'</code>, <code>'server'</code>, or <code>'universal'</code> — but the scaffold no longer emits one, and the inline plugin config is the primary surface.

## Cloudflare Workers

Use <code>@aihu/adapter-cloudflare</code> to deploy to Cloudflare Workers or Pages:

~~~typescript
// vite.config.ts
import { viteAihuPlugin } from '@aihu/app'
import { cloudflare } from '@aihu/adapter-cloudflare'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      adapter: cloudflare({ name: 'my-worker' }),
    }),
  ],
})
~~~

The adapter:
- Writes <code>_worker.js</code> to the Vite output directory (SPA mode — all page requests served from Cloudflare CDN via the <code>ASSETS</code> binding).
- Optionally creates <code>wrangler.toml</code> in the project root if absent (never overwrites an existing one).

Adapter options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| <code>name</code> | <code>string</code> | from <code>package.json</code> | Cloudflare Worker name in <code>wrangler.toml</code> |
| <code>mode</code> | <code>'workers' \\| 'pages'</code> | <code>'workers'</code> | Deployment target |
| <code>generateWrangler</code> | <code>boolean</code> | <code>true</code> | Write <code>wrangler.toml</code> if absent |

Deploy after build:

~~~bash
wrangler deploy --config wrangler.toml
~~~

For a manual Worker without the adapter, use <code>@aihu/server</code>'s request router directly:

~~~typescript
import { createRequestRouter, defineRoute, json } from '@aihu/server'

const router = createRequestRouter({
  routes: [
    defineRoute('/api/hello', () => json({ hello: 'world' })),
  ],
})

// Cloudflare Worker
export default { fetch: router }
~~~

## Vercel

Use <code>@aihu/adapter-vercel</code> to deploy using the Vercel Build Output API v3:

~~~typescript
// vite.config.ts
import { viteAihuPlugin } from '@aihu/app'
import { vercel } from '@aihu/adapter-vercel'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
      adapter: vercel(),
    }),
  ],
})
~~~

The adapter:
- Copies static assets to <code>.vercel/output/static/</code>.
- Writes an Edge Function entry (default) or Serverless Function entry.
- Emits <code>config.json</code> with the Build Output API v3 routes manifest.

Adapter options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| <code>runtime</code> | <code>'edge' \\| 'serverless'</code> | <code>'edge'</code> | Vercel function runtime |
| <code>outputDir</code> | <code>string</code> | <code>'.vercel/output'</code> | Build Output API output directory |
| <code>nodeVersion</code> | <code>string</code> | <code>'nodejs18.x'</code> | Node.js version for serverless runtime |

Deploy after build:

~~~bash
vercel deploy --prebuilt
~~~

## Bun server

Run aihu server-side on Bun using <code>@aihu/server</code>'s fetch-API router:

~~~typescript
import { createRequestRouter, defineRoute, json } from '@aihu/server'
import { createAgentReadinessRoutes } from '@aihu-plugin/agent-readiness'

const ar = createAgentReadinessRoutes({
  name: 'My App',
  endpoint: 'https://myapp.example.com/mcp',
  summary: 'An aihu-powered app.',
})

const router = createRequestRouter({
  routes: [
    defineRoute('/llms.txt', ar.llmsTxt),
    defineRoute('/.well-known/mcp/server-card.json', ar.mcpServerCard),
    defineRoute('/robots.txt', ar.robotsTxt),
    defineRoute('/api/hello', () => json({ hello: 'world' })),
  ],
})

Bun.serve({ fetch: router })
~~~

## Deno

The same router works on Deno Deploy — aihu uses only Web Standard APIs (Fetch, ReadableStream, URL):

~~~typescript
import { createRequestRouter, defineRoute, json } from '@aihu/server'

const router = createRequestRouter({
  routes: [
    defineRoute('/api/hello', () => json({ hello: 'world' })),
  ],
})

Deno.serve(router)
~~~

## Node.js

aihu output is standard ESM. Any Node.js ≥20.18.0 runtime can serve an aihu application:

~~~bash
npm run build
node dist/server/entry.js
~~~

The server entry is generated by the universal build and uses <code>@aihu/server</code>'s request router.

On supported Node platforms <code>@aihu/server</code> lazily loads a native Rust addon to render SSR. Edge runtimes (Cloudflare, Vercel Edge, Deno) automatically skip it and use the TypeScript fallback. To force the fallback on Node — e.g. on an unsupported platform or to debug a parity issue — set <code>SCRIBE_NATIVE_SKIP=1</code> in the server environment.

## <code>viteRouterIntegration()</code> at build time

The Vite plugin performs these steps at build time:

1. <code>scanPages(dir)</code> — discovers all <code>.aihu</code> files under <code>src/pages/</code>.
2. For each page, reads the <code>.route.json</code> sidecar emitted by the Rust compiler.
3. Assembles the route manifest into the <code>virtual:aihu-routes</code> module.
4. Emits <code>dist/routes.json</code> for runtime consumption.

Route manifests are fully static after build — no filesystem scanning at runtime.
`
