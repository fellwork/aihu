# hacker-news

> Aihu — agentic discovery and interaction, for human purpose.

A aihu port of the canonical Hacker News reader. Hits the live HN API. M1 polish: dark-mode token pass, `@agent` block on the index page, mobile-responsive CSS.

## Run

```bash
bun install
bun run dev    # http://localhost:5108
```

Navigate to:
- `/` — top stories (paginated)
- `/item/:id` — story detail with nested comment thread
- `/user/:id` — user profile

## Concepts shown

- File-based routing with three pages via `viteRouterIntegration()`
- Server-side data fetching via `defineLoader` on every route
- List rendering with `$each` + `$key`
- **Recursive components** — `Comment.aihu` renders itself for nested replies
- Dark-mode tokens: `var(--bg)`, `var(--fg)`, `var(--muted)`, `var(--border)` throughout
- HN orange brand color locked as `var(--hn-orange, #ff6600)` (brand fallback preserved)
- Mobile-responsive CSS via `@media` queries in `@style`
- `@agent` block on index page exposing top stories data

## Agent surface (index page)

| Name | Kind | Description |
|---|---|---|
| `route` | state | Top stories: `{ stories[], page, hasMore }` |

Agents can read the current top stories page to surface news summaries to a human on their behalf.

## Files

| File | Role |
|---|---|
| `src/pages/index.aihu` + `.loader.ts` | Top-stories list |
| `src/pages/item/[id].aihu` + `.loader.ts` | Story + recursive comments |
| `src/pages/user/[id].aihu` + `.loader.ts` | User profile |
| `src/components/Comment.aihu` | Self-recursive comment renderer |
| `vite.config.ts` | `viteRouterIntegration()` + SSR + `@shared` alias |
