# SSR and Hydration

aihu supports server-side rendering via `@aihu/server`. The build system supports three targets: `client`, `server`, and `universal`.

## Build targets

Set the build target in `aihu.config.ts`:

```typescript
import { defineAihuConfig } from '@aihu/server'

export default defineAihuConfig({
  build: {
    target: 'universal',
  },
})
```

| Target | Description |
|--------|-------------|
| `client` | Browser bundle only. `@agent` manifest and `$server` refs are elided. |
| `server` | Server bundle only. Full agent manifest and server-only code included. |
| `universal` | Both client and server outputs. Default. |

## The `@route` block and route sidecars

The Rust compiler emits a `.route.json` sidecar alongside each compiled `.aihu` file. This sidecar encodes the route path, name, SSR mode, and loader reference. At build time, `viteRouterIntegration()` reads every `.route.json` in `src/pages/` and assembles the route manifest into the `virtual:aihu-routes` virtual module. The result is a fully static manifest — no filesystem scanning at runtime.

```
@route {
  path: /users
  name: users
  ssr: true
}
```

Setting `ssr: true` enables server-side rendering for that route.

## `createRequestRouter`, `defineRoute`, and `json()`

`@aihu/server` provides a fetch-API-native router. These three exports are the core building blocks:

- **`createRequestRouter(options)`** — builds a fetch-API request handler from an explicit route manifest. The returned `router` function is a standard `(request: Request) => Response | Promise<Response>` and can be passed directly to `Bun.serve`, `Deno.serve`, or exported as a Cloudflare Worker's `fetch` handler.
- **`defineRoute(path, handler)`** — declares a single route. The handler receives a `RouteContext` and must return a `Response`.
- **`json(data, init?)`** — constructs a `Response` with `Content-Type: application/json` and the given data serialized. A thin convenience wrapper over `new Response(JSON.stringify(data), ...)`.

```typescript
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
```

Additional server utilities from `@aihu/server`: `badRequest()`, `notFound()`, `serverError()`, `methodNotAllowed()`, `defineApiRoute()`, `composeMiddleware()`, `defineMiddleware()`.

## `renderToStream` and `renderToString`

Stream-render a component to an HTML response:

```typescript
import { renderToStream } from '@aihu/server'

const response = renderToStream(MyComponent, {
  props: { userId: 42 },
  loader: myLoader,
})
```

Returns a `ReadableStream<string>` that emits HTML chunks as the component tree resolves. Suitable for edge runtimes and Node.js streaming responses.

For a complete HTML string (e.g. for pre-rendering):

```typescript
import { renderToString } from '@aihu/server'

const html = await renderToString(async () => {
  const data = await myLoader(ctx)
  return renderMyComponent(data)
})
```

## SSR with loaders

Enable SSR per route with `ssr: true` in the `@route` block. The server runs the associated `defineLoader` and injects the result as props before streaming the component:

```
@route {
  name: users
  ssr: true
}
```

```typescript
// users.loader.ts
import { defineLoader } from '@aihu/server'

export const loader = defineLoader(async (ctx) => {
  return { users: await db.users.findMany() }
})
```

The loader result is serialized into the SSR payload and dehydrated on the client — no second fetch needed.

## Islands

In aihu, "islands" means interactive components embedded in an otherwise static or server-rendered page. The SSR output is inert HTML; each island component re-attaches its reactive signal graph on the client using `hydrate()` rather than `mount()`.

The island pattern gives you SSR performance for the outer shell while preserving full reactivity for interactive regions — without downloading or executing JavaScript for the static parts.

## `hydrate()` vs `mount()` — the distinction

Both functions come from `@aihu/arbor` and return a `MountScope` (with `.dispose()` and `.serialize()` methods). They differ in what happens to the DOM:

- **`mount(component, host)`** — creates DOM elements from scratch and appends them to `host`. Used for pure client-side rendering (no prior SSR output).
- **`hydrate(component, host, snapshot)`** — attaches reactive effects to *existing* DOM nodes under `host` without re-creating elements. It walks the arbor node tree and uses `data-aihu-path` attributes on pre-rendered elements as anchors to wire signal bindings. If a path anchor is missing (DOM mismatch), that subtree falls back to full `_materialize()`.

`hydrate()` is the right choice when the server has already emitted HTML for a component. The `snapshot` parameter is the pre-parsed JSON state previously emitted by `MountScope.serialize()` (typically injected as `window.__aihu_state__[tag]` by the SSR renderer).

```typescript
import { hydrate } from '@aihu/arbor'

// In the browser, for an SSR-rendered island:
const scope = hydrate(
  () => buildCounterTree(),
  document.querySelector('live-counter'),
  window.__aihu_state__['live-counter'] ?? {},
)
```

## Client-build elision

When target is `client`:

- `@agent` blocks are removed from the output. The JS contains: `// [client build] @agent block elided`.
- `$server` macro references are removed. The JS contains: `// [client build] $server macro reference elided`.
- `manifest_json` in `EmitResult` is empty.

This ensures zero server-only code reaches the browser bundle.
