# Data Fetching

aihu provides several primitives for fetching data, ranging from reactive resource signals to server-side loaders and typed client stubs.

## `$resource` macro

In a `@state` block, `$resource` binds an async fetcher to a reactive signal:

```
@state {
  $prop userId: number = 1
  $resource user = fetchUser(userId)
}
```

The `user` variable is a 3-state loader object:

- `user.pending` — `true` while the fetch is in-flight.
- `user.value` — the resolved value (or `undefined` if pending/error).
- `user.error` — the error (or `undefined` if pending/success).

When `userId` changes, the resource re-fetches automatically.

## `createResource` from `@aihu/runtime`

Use `createResource` directly in TypeScript outside of SFCs:

```typescript
import { createResource } from '@aihu/runtime'
import { signal } from '@aihu/signals'

const userId = signal(1)
const user = createResource(() => fetch(`/api/users/${userId()}`).then(r => r.json()))
```

The resource is automatically re-fetched when any signals read inside the fetcher change.

## Server loaders

Server loaders run on the server and provide data to SSR-rendered pages. Define a loader with `defineLoader` from `@aihu/server`:

```typescript
import { defineLoader } from '@aihu/server'

export const loader = defineLoader(async (ctx) => {
  const users = await db.users.findMany()
  return { users }
})
```

The loader receives a `LoaderContext` with the request, params, and URL. Return value is serialized and sent to the client as part of the SSR payload.

## Server loaders → SFC handoff

A loader runs server-side per matched route, but the SFC author still has to consume its result. There are two documented handoff patterns; pick whichever matches your component's data flow.

### Pattern A — `route.data` prop (default)

The loader payload is delivered as the `data` field on the SFC's `route` prop. This is the most common pattern and what every page route gets for free.

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
  $prop route: {
    params: { slug: string }
    data: { title: string; body: string }
  }
}

@template {
  <article>
    <h1>{route.data.title}</h1>
    <p>{route.data.body}</p>
  </article>
}
```

The runtime injects the resolved loader payload as `route.data` before mount. During streaming SSR or client-side re-validation, wrap the consumer in `<$suspense>` to declaratively handle the pending state — see [the 3-state loader pattern](#the-3-state-loader-pattern) below.

A worked end-to-end example lives at [`examples/blog-loader/`](https://github.com/fellwork/aihu/tree/main/examples/blog-loader).

### Pattern B — `$resource` + `createServerCall`

If the data needs to be fetched _on demand_ (e.g. on a button click or when a search box changes), skip the loader and use a typed client stub instead. `createServerCall` returns a function that posts to a server-registered action.

```typescript
// shared/api.ts
import { createServerCall } from '@aihu/server'
import type { Post } from './types'

export const getPost = createServerCall<[slug: string], Post>('posts/getPost')
```

```
@state {
  searchTerm: string = ''

  // refetches when searchTerm changes
  $resource matches = getPost(searchTerm)
}

@template {
  <input $bind:value="searchTerm" />

  <$suspense source="matches">
    <$slot name="fallback"><span>Searching...</span></$slot>
    <ul>
      <li $each="matches.value as p" $key="p.slug">{p.title}</li>
    </ul>
  </$suspense>
}
```

Use Pattern A when the data is route-bound and known at request time. Use Pattern B when the data depends on UI state that the user changes after the page loads.

## `$server` macro

In `@state` blocks, `$server` gates code to server-only execution:

```
@state {
  const data = $server.fetchSecretData()
}
```

When compiling with `BuildTarget.Client`, any `$server` references are elided from the output and replaced with a `// [client build] $server macro reference elided` comment.

## `createServerCall`

`createServerCall` creates a typed fetch stub that calls a server action from client-side code:

```typescript
import { createServerCall } from '@aihu/server'

const getUser = createServerCall<[id: number], User>('users/getUser')

// In an effect or event handler:
const user = await getUser(42)
```

The stub sends a `POST` request to `/_aihu/call/<endpoint>` with the args serialized as JSON. The server routes it to the registered action and returns the typed response.

## The 3-state loader pattern

All async data in aihu follows the 3-state pattern:

| State | `pending` | `value` | `error` |
|-------|-----------|---------|---------|
| Loading | `true` | `undefined` | `undefined` |
| Success | `false` | data | `undefined` |
| Error | `false` | `undefined` | Error |

Use `<$suspense>` in templates to handle the pending state declaratively:

```html
<$suspense source={user} fallback={<span>Loading user...</span>}>
  <div>{{ user.value.name }}</div>
</$suspense>
```
