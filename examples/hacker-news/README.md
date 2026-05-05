# `examples/hacker-news`

A aihu port of the canonical Hacker News reader, modelled after
[Vue HN](https://github.com/vuejs/vue-hackernews-2.0),
[Solid HN](https://github.com/solidjs/solid-hackernews), and
[React HN](https://github.com/insin/react-hn). Hits the live HN public API.

## What this teaches

- File-based routing with three pages (`/`, `/item/:id`, `/user/:id`).
- Server-side data fetching via `defineLoader` for every route.
- Real network I/O against `https://hacker-news.firebaseio.com/v0/`.
- List rendering with `$each` + `$key`.
- **Recursive components** — `Comment.aihu` renders itself for nested
  replies. Path-based component naming makes the recursion direct
  (no special syntax).
- The `route.data` prop for loader → SFC handoff (see
  [`docs/site/data-fetching.md` § Server loaders → SFC handoff](../../docs/site/data-fetching.md#server-loaders--sfc-handoff)).

## Run

```bash
bun install
bun run dev
```

Then navigate to:

- `/` — top stories (paginated; `?page=2`, `?page=3`, ...)
- `/item/:id` — story detail with nested comment thread
- `/user/:id` — user profile

The HN API is public and CORS-permissive, so no proxy is needed.

## Files

| File | Role |
|---|---|
| `src/pages/index.aihu` + `.loader.ts` | Top-stories list (paginated) |
| `src/pages/item/[id].aihu` + `.loader.ts` | Story + recursive comment tree |
| `src/pages/user/[id].aihu` + `.loader.ts` | User profile |
| `src/components/Comment.aihu` | Self-recursive comment renderer |
| `vite.config.ts` | Wires `viteRouterIntegration()` + SSR target |

## Loader bounds

The item loader walks the comment tree breadth-first and bounds the walk
at `MAX_DEPTH = 6` and `MAX_COMMENTS_PER_LEVEL = 50`. This keeps the
serialised payload small and the page responsive even for large threads
(e.g. "Ask HN" front-page posts can have thousands of comments).

If you need the full tree, drop those bounds and switch the strategy to
client-side lazy expansion using `$resource` + `createServerCall`
(Pattern B in the data-fetching docs).

## Compare with

- [vuejs/vue-hackernews-2.0](https://github.com/vuejs/vue-hackernews-2.0)
- [solidjs/solid-hackernews](https://github.com/solidjs/solid-hackernews)
- [reactjs/react-hn](https://github.com/insin/react-hn)
