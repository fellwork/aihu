# Data Fetching

scribe provides several primitives for fetching data, ranging from reactive resource signals to server-side loaders and typed client stubs.

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

## `createResource` from `@scribe/runtime`

Use `createResource` directly in TypeScript outside of SFCs:

```typescript
import { createResource } from '@scribe/runtime'
import { signal } from '@scribe/signals'

const userId = signal(1)
const user = createResource(() => fetch(`/api/users/${userId()}`).then(r => r.json()))
```

The resource is automatically re-fetched when any signals read inside the fetcher change.

## Server loaders

Server loaders run on the server and provide data to SSR-rendered pages. Define a loader with `defineLoader` from `@scribe/server`:

```typescript
import { defineLoader } from '@scribe/server'

export const loader = defineLoader(async (ctx) => {
  const users = await db.users.findMany()
  return { users }
})
```

The loader receives a `LoaderContext` with the request, params, and URL. Return value is serialized and sent to the client as part of the SSR payload.

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
import { createServerCall } from '@scribe/server'

const getUser = createServerCall<[id: number], User>('users/getUser')

// In an effect or event handler:
const user = await getUser(42)
```

The stub sends a `POST` request to `/_scribe/call/<endpoint>` with the args serialized as JSON. The server routes it to the registered action and returns the typed response.

## The 3-state loader pattern

All async data in scribe follows the 3-state pattern:

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
