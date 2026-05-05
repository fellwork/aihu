# `examples/blog-router`

A 3-page blog demonstrating aihu's file-based routing.

## What this teaches

- File-based routing: each `.aihu` file under `src/pages/` becomes a route.
- The `@route { path, name }` block declares a route override.
- Dynamic params: `src/pages/posts/[slug].aihu` matches `/posts/<anything>`.
- `viteRouterIntegration({ pagesDir: 'src/pages' })` aggregates `@route` blocks
  into the `virtual:aihu-routes` manifest at build time.

No backend, no loaders — see [`examples/blog-loader/`](../blog-loader/) for the
server loader pattern.

## Run

```bash
bun install
bun run dev
```

Then navigate to:

- `/` — post list (`src/pages/index.aihu`)
- `/posts/hello`, `/posts/meta`, `/posts/agents` — `src/pages/posts/[slug].aihu`
- `/about` — `src/pages/about.aihu`

## Files

| File | Role |
|---|---|
| `src/pages/index.aihu` | Static `/` route — post list |
| `src/pages/posts/[slug].aihu` | Dynamic `/posts/:slug` route |
| `src/pages/about.aihu` | Static `/about` route |
| `vite.config.ts` | Wires `viteRouterIntegration()` |

## Compare with

- [Nuxt blog template](https://nuxt.com/templates/blog)
- [Next.js blog-starter example](https://github.com/vercel/next.js/tree/canary/examples/blog-starter)
- [SvelteKit blog tutorial](https://kit.svelte.dev/docs)
- [Remix blog tutorial](https://remix.run/docs/en/main/tutorials/blog)
