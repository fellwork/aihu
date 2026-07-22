# Data Fetching

aihu provides several primitives for fetching data, ranging from reactive resource signals to server-side loaders and typed client stubs.

## `$resource` macro

In a `@state` block, `$resource` binds an async fetcher to a reactive signal. It uses the v2 collection-form: bare (no metadata) or wrapped (with metadata).

```
@state {
  $prop: {
    userId: { default: 1, type: "number" }
  }

  $resource: {
    // bare — just the fetcher thunk
    user: () => fetchUser(userId),

    // wrapped — add describe/expose to surface to agents
    recentPosts: {
      describe: 'Posts by the current user',
      expose: { read: true },
      value: () => fetchPosts(userId)
    }
  }
}

@template {
  <$suspense fallback="Spinner">
    <div>{user.value.name}</div>
  </$suspense>
}
```

The resource variable is a 3-state loader object:

- `resource.pending` — `true` while the fetch is in-flight.
- `resource.value` — the resolved value (or `undefined` if pending/error).
- `resource.error` — the error (or `undefined` if pending/success).

When any signal read inside the fetcher changes (e.g. `userId`), the resource re-fetches automatically.

### The 3-state loader pattern

All async data in aihu follows the 3-state pattern:

| State | `pending` | `value` | `error` |
|-------|-----------|---------|---------|
| Loading | `true` | `undefined` | `undefined` |
| Success | `false` | data | `undefined` |
| Error | `false` | `undefined` | Error |

Use `<$suspense>` in templates to handle the pending state declaratively:

```html
<$suspense fallback="Spinner">
  <div>{user.value.name}</div>
</$suspense>
```

## `createResource` from `@aihu-plugin/data`

Use `createResource` directly in TypeScript outside of SFCs:

```typescript
import { createResource } from '@aihu-plugin/data'
import { signal } from '@aihu/signals'

const userId = signal(1)
const user = createResource(
  () => userId(),                              // key — reactive; changes trigger refetch
  (id) => fetch(`/api/users/${id}`).then(r => r.json())  // fetcher
)
```

The resource is automatically re-fetched when any signals read inside the key function change.

### Resource store and SSR dehydration

For SSR, use a resource store to cache and dehydrate resources:

```typescript
import { createResource, createResourceStore, createResourceSerializer, data } from '@aihu-plugin/data'

// Register the data plugin in aihu.config.ts:
import { defineAihuConfig } from '@aihu/server'
export default defineAihuConfig({
  plugins: [data()],
})
```

## Server loaders

Server loaders run on the server and provide data to SSR-rendered pages. Define a loader with `defineLoader` from `@aihu/server`:

```typescript
import { defineLoader } from '@aihu/server'

export const loader = defineLoader(async (ctx) => {
  const users = await db.users.findMany()
  return { users }
})
```

The loader receives a `LoaderContext` with the request, params, and URL. The return value is serialized and sent to the client as part of the SSR payload.

## Server loaders → SFC handoff

A loader runs server-side per matched route, but the SFC author still has to consume its result. There are two documented handoff patterns.

### Pattern A — `route.data` prop (default)

The loader payload is delivered as the `data` field on the SFC's `route` prop:

`src/pages/posts/[slug].loader.ts`:

```typescript
import { defineLoader } from '@aihu/server'

export const loader = defineLoader(async (ctx) => {
  return await db.posts.findOne({ slug: ctx.params.slug })
})
```

`src/pages/posts/[slug].aihu`:

```
@route { path: "/posts/[slug]", ssr: true }

@state {
  $prop: {
    route: { type: "{ params: { slug: string }; data: { title: string; body: string } }" }
  }
}

@template {
  <article>
    <h1>{route.data.title}</h1>
    <p>{route.data.body}</p>
  </article>
}
```

The runtime injects the resolved loader payload as `route.data` before mount. During streaming SSR or client-side re-validation, wrap the consumer in `<$suspense>` to declaratively handle the pending state.

Use Pattern A (route-bound loaders) when the data is known at request time.

> **On-demand client→server calls.** aihu previously shipped a `$server`
> macro and a `createServerCall` client stub for calling server functions from
> the client over RPC. Both were **retired** — the feature never fully wired
> up (see the Macro Vocabulary spec §2.12) — with no drop-in replacement. For
> data that depends on post-load UI state, fetch from a server route
> (`defineApiRoute` / `defineStreamRoute` in `@aihu/server`) with a plain
> `fetch`, or drive it through a governed loader.

## Server response helpers

From `@aihu/server`:

| Helper | Description |
|--------|-------------|
| `json(data, status?)` | Return a JSON response |
| `notFound(msg?)` | Return a 404 response |
| `badRequest(msg?)` | Return a 400 response |
| `serverError(msg?)` | Return a 500 response |
| `methodNotAllowed(msg?)` | Return a 405 response |

## Streaming routes

For streaming HTTP responses (e.g. server-sent events), use `defineStreamRoute` from `@aihu/server`:

```typescript
import { defineStreamRoute } from '@aihu/server'

export const events = defineStreamRoute(async (ctx, stream) => {
  stream.write({ event: 'connected' })
  // ...
})
```
