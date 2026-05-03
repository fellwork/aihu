# `examples/blog-router`

A 3-page blog demonstrating scribe's file-based routing.

## What this teaches

- File-based routing: each `.scribe` file under `src/pages/` becomes a route.
- The `@route { path, name }` block declares a route override.
- Dynamic params: `src/pages/posts/[slug].scribe` matches `/posts/<anything>`.
- `viteRouterIntegration({ pagesDir: 'src/pages' })` aggregates `@route` blocks
  into the `virtual:scribe-routes` manifest at build time.

No backend, no loaders — see [`examples/blog-loader/`](../blog-loader/) for the
server loader pattern.

## Run

```bash
bun install
bun run dev
```

Then navigate to:

- `/` — post list (`src/pages/index.scribe`)
- `/posts/hello`, `/posts/meta`, `/posts/agents` — `src/pages/posts/[slug].scribe`
- `/about` — `src/pages/about.scribe`

## Files

| File | Role |
|---|---|
| `src/pages/index.scribe` | Static `/` route — post list |
| `src/pages/posts/[slug].scribe` | Dynamic `/posts/:slug` route |
| `src/pages/about.scribe` | Static `/about` route |
| `vite.config.ts` | Wires `viteRouterIntegration()` |

## Compare with

- [Nuxt blog template](https://nuxt.com/templates/blog)
- [Next.js blog-starter example](https://github.com/vercel/next.js/tree/canary/examples/blog-starter)
- [SvelteKit blog tutorial](https://kit.svelte.dev/docs)
- [Remix blog tutorial](https://remix.run/docs/en/main/tutorials/blog)
