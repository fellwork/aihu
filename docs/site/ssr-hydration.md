# SSR and Hydration

scribe supports server-side rendering via `@scribe/server`. The build system supports three targets: `client`, `server`, and `universal`.

## Build targets

Set the build target in `defineScribeConfig`:

```typescript
import { defineScribeConfig } from '@scribe/server'

export default defineScribeConfig({
  build: {
    target: 'universal',
  },
})
```

Or via the compiler CLI flag: `--target client|server|universal`.

### `BuildTarget` values

| Target | Description |
|--------|-------------|
| `client` | Browser bundle only. `@agent` manifest and `$server` refs are elided. |
| `server` | Server bundle only. Full agent manifest and server-only code included. |
| `universal` | Both client and server outputs. Default. |

## `renderToStream`

Stream-render a component to an HTML response:

```typescript
import { renderToStream } from '@scribe/server'

const response = renderToStream(MyComponent, {
  props: { userId: 42 },
  loader: myLoader,
})
```

Returns a `ReadableStream<string>` that emits HTML chunks as the component tree resolves. Suitable for edge runtimes and Node.js streaming responses.

## `renderToString`

Render a server component to a complete HTML string:

```typescript
import { renderToString } from '@scribe/server'

const html = await renderToString(async () => {
  const data = await myLoader(ctx)
  return renderMyComponent(data)
})
```

## Client-build elision

When target is `client`:

- `@agent` blocks are removed from the output. The JS contains: `// [client build] @agent block elided`.
- `$server` macro references are removed. The JS contains: `// [client build] $server macro reference elided`.
- `manifest_json` in `EmitResult` is empty.

This ensures zero server-only code reaches the browser bundle.

## `defineScribeConfig` build options

```typescript
defineScribeConfig({
  build: {
    target: 'universal',    // 'client' | 'server' | 'universal'
    outDir: 'dist',         // output directory
    sourcemap: true,        // emit sourcemaps
  },
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
export const loader = defineLoader(async (ctx) => {
  return { users: await db.users.findMany() }
})
```

The loader result is serialized into the SSR payload and dehydrated on the client — no second fetch needed.
