# Routing and Layouts

aihu uses file-based routing. Pages live under `src/pages/` and automatically become routes when compiled.

## File-based routing

Any `.aihu` file under `src/pages/` that contains an `@route` block is treated as a page route. The file path determines the default URL pattern:

| File | Default pattern |
|------|----------------|
| `src/pages/index.aihu` | `/` |
| `src/pages/about.aihu` | `/about` |
| `src/pages/users/[id].aihu` | `/users/:id` |

### File-based routing tree example

```
src/
  pages/
    index.aihu          →  /
    about.aihu           →  /about
    users/
      index.aihu         →  /users
      [id].aihu          →  /users/:id
    admin/
      index.aihu         →  /admin
      users.aihu         →  /admin/users
  layouts/
    default.aihu         →  wraps all routes without an explicit layout
    admin.aihu           →  wraps routes with layout: admin
```

## The `@route` block

```
@route {
  path: /admin/users
  name: admin-users
  middleware: [auth, admin]
  ssr: true
  layout: admin
}
```

Fields:

- **`path`** — explicit URL path override. If omitted, the path is derived from the file location.
- **`name`** — route name used in programmatic navigation and the route manifest.
- **`middleware`** — array of middleware names applied to this route.
- **`ssr`** — boolean. `true` enables server-side rendering for this route.
- **`layout`** — layout name to wrap this route's content.

## `.route.json` sidecars

The compiler emits a `.route.json` file alongside each compiled SFC that has an `@route` block. Example:

```json
{
  "pattern": "/admin/users",
  "name": "admin-users",
  "middleware": ["auth", "admin"],
  "ssr": true,
  "layout": "admin"
}
```

Read a sidecar programmatically with `readRouteSidecar(path)` from `@aihu/router/plugin`.

## `viteRouterIntegration()`

`viteRouterIntegration()` is a Vite plugin (from `@aihu/router/plugin`) that scans `src/pages/` at build time, reads all `.route.json` sidecars, and assembles a virtual route manifest module:

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import { viteRouterIntegration } from '@aihu/router/plugin'

export default defineConfig({
  plugins: [viteRouterIntegration()],
})
```

The virtual module `virtual:aihu-routes` exports the assembled `RouteDefinition[]` array. The runtime `createRouter` consumes it to handle navigation.

`viteRouterPlugin` is a deprecated alias removed at v1.0.

## `createRouter(routes)`

Creates a router instance from an array of route definitions. Typically you pass the virtual module directly:

```typescript
import { createRouter } from '@aihu/router'
import routes from 'virtual:aihu-routes'

const router = createRouter(routes)
```

## Layouts

Layouts live under `src/layouts/`. The default layout is `src/layouts/default.aihu`. A layout wraps the page's rendered output via `<$slot>`:

```
@template {
  <header>My App</header>
  <main>
    <$slot />
  </main>
  <footer>Footer</footer>
}
```

`scanLayouts(dir)` from `@aihu/router/plugin` returns all discovered layout names.

## Router middleware

Middleware is defined with `defineRouterMiddleware` and composed with `composeRouterMiddleware`:

```typescript
import { defineRouterMiddleware, composeRouterMiddleware } from '@aihu/router'

const authMiddleware = defineRouterMiddleware(async (ctx, next) => {
  if (!ctx.params.token) {
    return { kind: 'redirect', location: '/login', status: 302 }
  }
  return next()
})

const loggingMiddleware = defineRouterMiddleware(async (ctx, next) => {
  console.log('navigating to', ctx.url.pathname)
  return next()
})

export const composed = composeRouterMiddleware(loggingMiddleware, authMiddleware)
```

### Stage ordering

Middleware passed to `composeRouterMiddleware` are called in array order. Any middleware that returns a non-void result (e.g. `{ kind: 'redirect' }` or `{ kind: 'cancel' }`) short-circuits the chain — subsequent middleware and the route handler are not called.

Standard stage ordering convention:

1. Logging / tracing
2. Auth / session
3. Redirect rules
4. Render

## Reactive routing primitives

The router exposes reactive primitives for use in SFCs and TypeScript:

| Export | Description |
|--------|-------------|
| `useRoute()` | Reactive accessor returning the current route match |
| `useRouter()` | Access the router instance |
| `navigate(path, opts?)` | Programmatic navigation |
| `createRouteSignal(router)` | Signal bound to the current route |
| `createPrefetcher(router)` | Create a route prefetcher |
| `provideRouteContext(router)` | Provide route context to the component tree |
| `RouteContext` | Context token for the current route |
