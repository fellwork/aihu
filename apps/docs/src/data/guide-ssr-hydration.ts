/**
 * SSR & Hydration guide body. Adapted from the real
 * apps/docs/src/content/docs/guides/ssr-hydration.md — no retired-dialect
 * code samples here (build targets, @route ssr flag, server router,
 * renderToStream/renderToString, hydrate/mount) so the content carries over
 * verbatim. Fenced code uses the ~~~ delimiter and inline code uses <code>
 * tags so the source carries no backticks.
 */
export const SSR_HYDRATION = `# SSR and Hydration

aihu supports server-side rendering via <code>@aihu/server</code>. An app's build mode is set with <code>output</code> in the inline <code>viteAihuPlugin({...})</code> config — <code>'spa'</code> (client-rendered) or <code>'static'</code> (pages prerendered to HTML). Server-side rendering itself is provided by <code>@aihu/server</code>, whose legacy build config additionally exposes a <code>build.target</code> of <code>'client'</code>, <code>'server'</code>, or <code>'universal'</code>.

## Build mode and targets

The app build mode is set inline in <code>vite.config.ts</code> via <code>output</code>:

~~~typescript
// vite.config.ts
import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({ output: 'static' }), // 'spa' | 'static'
  ],
})
~~~

| Mode | Description |
|--------|-------------|
| <code>spa</code> | Client-rendered single-page app. Default. |
| <code>static</code> | Pages prerendered to static HTML at build time. |

For server-side rendering, <code>@aihu/server</code>'s legacy config additionally exposes a <code>build.target</code>, set via a standalone <code>aihu.config.ts</code> that default-exports <code>defineAihuConfig</code>. This file still works as a fallback:

~~~typescript
// aihu.config.ts (legacy fallback)
import { defineAihuConfig } from '@aihu/server'

export default defineAihuConfig({
  build: {
    target: 'universal',
  },
})
~~~

| Target | Description |
|--------|-------------|
| <code>client</code> | Browser bundle only. <code>@agent</code> manifest and <code>$server</code> refs are elided. |
| <code>server</code> | Server bundle only. Full agent manifest and server-only code included. |
| <code>universal</code> | Both client and server outputs. Default. |

## The <code>@route</code> block and route sidecars

The Rust compiler emits a <code>.route.json</code> sidecar alongside each compiled <code>.aihu</code> file. This sidecar encodes the route path, name, SSR mode, and loader reference. At build time, <code>viteRouterIntegration()</code> reads every <code>.route.json</code> in <code>src/pages/</code> and assembles the route manifest into the <code>virtual:aihu-routes</code> virtual module. The result is a fully static manifest — no filesystem scanning at runtime.

~~~
@route {
  path: /users
  name: users
  ssr: true
}
~~~

Setting <code>ssr: true</code> enables server-side rendering for that route.

## <code>createRequestRouter</code>, <code>defineRoute</code>, and <code>json()</code>

<code>@aihu/server</code> provides a fetch-API-native router. These three exports are the core building blocks:

- <b><code>createRequestRouter(options)</code></b> — builds a fetch-API request handler from an explicit route manifest. The returned <code>router</code> function is a standard <code>(request: Request) =&gt; Response | Promise&lt;Response&gt;</code> and can be passed directly to <code>Bun.serve</code>, <code>Deno.serve</code>, or exported as a Cloudflare Worker's <code>fetch</code> handler.
- <b><code>defineRoute(path, handler)</code></b> — declares a single route. The handler receives a <code>RouteContext</code> and must return a <code>Response</code>.
- <b><code>json(data, init?)</code></b> — constructs a <code>Response</code> with <code>Content-Type: application/json</code> and the given data serialized. A thin convenience wrapper over <code>new Response(JSON.stringify(data), ...)</code>.

~~~typescript
import { createRequestRouter, defineRoute, json } from '@aihu/server'
import { createAgentReadinessRoutes } from '@aihu-plugin/agent-readiness'

const ar = createAgentReadinessRoutes({
  name: 'My App',
  endpoint: 'https://myapp.workers.dev/mcp',
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

// Cloudflare Worker
export default { fetch: router }
// Bun
// Bun.serve({ fetch: router })
// Deno
// Deno.serve(router)
~~~

Additional server utilities from <code>@aihu/server</code>: <code>badRequest()</code>, <code>notFound()</code>, <code>serverError()</code>, <code>methodNotAllowed()</code>, <code>defineApiRoute()</code>, <code>composeMiddleware()</code>, <code>defineMiddleware()</code>.

## <code>renderToStream</code> and <code>renderToString</code>

Stream-render a component to an HTML response:

~~~typescript
import { renderToStream } from '@aihu/server'

const response = renderToStream(MyComponent, {
  props: { userId: 42 },
  loader: myLoader,
})
~~~

Returns a <code>ReadableStream&lt;string&gt;</code> that emits HTML chunks as the component tree resolves. Suitable for edge runtimes and Node.js streaming responses.

For a complete HTML string (e.g. for pre-rendering):

~~~typescript
import { renderToString } from '@aihu/server'

const html = await renderToString(async () => {
  const data = await myLoader(ctx)
  return renderMyComponent(data)
})
~~~

## SSR with loaders

Enable SSR per route with <code>ssr: true</code> in the <code>@route</code> block. The server runs the associated <code>defineLoader</code> and injects the result as props before streaming the component:

~~~
@route {
  name: users
  ssr: true
}
~~~

~~~typescript
// users.loader.ts
import { defineLoader } from '@aihu/server'

export const loader = defineLoader(async (ctx) => {
  return { users: await db.users.findMany() }
})
~~~

The loader result is serialized into the SSR payload and dehydrated on the client — no second fetch needed.

## Islands

In aihu, "islands" means interactive components embedded in an otherwise static or server-rendered page. The SSR output is inert HTML; each island component re-attaches its reactive signal graph on the client using <code>hydrate()</code> rather than <code>mount()</code>.

The island pattern gives you SSR performance for the outer shell while preserving full reactivity for interactive regions — without downloading or executing JavaScript for the static parts.

## <code>hydrate()</code> vs <code>mount()</code> — the distinction

Both functions come from <code>@aihu/arbor</code> and return a <code>MountScope</code> (with <code>.dispose()</code> and <code>.serialize()</code> methods). They differ in what happens to the DOM:

- <b><code>mount(component, host)</code></b> — creates DOM elements from scratch and appends them to <code>host</code>. Used for pure client-side rendering (no prior SSR output).
- <b><code>hydrate(component, host, snapshot)</code></b> — attaches reactive effects to <i>existing</i> DOM nodes under <code>host</code> without re-creating elements. It walks the arbor node tree and uses <code>data-aihu-path</code> attributes on pre-rendered elements as anchors to wire signal bindings. If a path anchor is missing (DOM mismatch), that subtree falls back to full <code>_materialize()</code>.

<code>hydrate()</code> is the right choice when the server has already emitted HTML for a component. The <code>snapshot</code> parameter is the pre-parsed JSON state previously emitted by <code>MountScope.serialize()</code> (typically injected as <code>window.__aihu_state__[tag]</code> by the SSR renderer).

~~~typescript
import { hydrate } from '@aihu/arbor'

// In the browser, for an SSR-rendered island:
const scope = hydrate(
  () => buildCounterTree(),
  document.querySelector('live-counter'),
  window.__aihu_state__['live-counter'] ?? {},
)
~~~

## Client-build elision

When target is <code>client</code>:

- <code>@agent</code> blocks are removed from the output. The JS contains: <code>// [client build] @agent block elided</code>.
- <code>$server</code> macro references are removed. The JS contains: <code>// [client build] $server macro reference elided</code>.
- <code>manifest_json</code> in <code>EmitResult</code> is empty.

This ensures zero server-only code reaches the browser bundle.
`
