# `examples/blog-loader`

A server-rendered post page demonstrating scribe's loader pattern.

## What this teaches

- **`defineLoader`** — declare a per-route async data fetcher in a sibling
  `.loader.ts` file (`src/pages/posts/[slug].loader.ts`).
- **Server → SFC handoff** — the loader's return value is delivered to the
  SFC via the `route.data` prop. See
  [`docs/site/data-fetching.md` → "Server loaders → SFC handoff"](../../docs/site/data-fetching.md#server-loaders--sfc-handoff).
- **`<$suspense>`** — the suspense boundary holds the fallback while the
  payload is in-flight (relevant during streaming SSR / client-side
  re-validation).
- **3-state resource pattern** — `route.data` follows the same
  `pending` / `value` / `error` shape as a `$resource` declaration.

## Run

```bash
bun install
bun run dev
```

Then navigate to `/posts/hello`, `/posts/meta`, or `/posts/agents`.

## Files

| File | Role |
|---|---|
| `src/pages/posts/[slug].scribe` | SFC reading `route.data` |
| `src/pages/posts/[slug].loader.ts` | Server-side `defineLoader` |
| `vite.config.ts` | Wires `viteRouterIntegration()` + SSR target |

## How the handoff works

```
        ┌──────────────────────────────────┐
Request │  GET /posts/hello                │
        └────────────────┬─────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │ [slug].loader.ts → defineLoader  │   server-side
        │   ctx.params.slug = 'hello'      │
        │   returns { title, body, ... }   │
        └────────────────┬─────────────────┘
                         │
                         ▼
        ┌──────────────────────────────────┐
        │ [slug].scribe → @template        │   server + client
        │   $prop route: { data: T }       │
        │   <h1>{route.data.title}</h1>    │
        └──────────────────────────────────┘
```

## Compare with

- [Remix loader docs](https://remix.run/docs/en/main/route/loader)
- [SvelteKit `+page.server.ts` load function](https://kit.svelte.dev/docs/load)
