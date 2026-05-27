# aihu examples

> Aihu — agentic discovery and interaction, for human purpose.

13-example portfolio across 4 tiers. Every example demonstrates both a human UX and an agent surface — even a minimal `$expose` block — because agentic discovery and interaction is core to aihu's identity, not an add-on.

**M1 (this PR): 6 examples polished.** The remaining 7 are flagged M2 in the table below.

## Portfolio

| # | Folder | Tier | Status | Port | Agent surface | Teaches |
|---|---|---|---|---|---|---|
| 01 | [`live-counter/`](./live-counter) | basics | M1 ready | 5101 | count, +/- actions | Minimal SFC: state + event + reactive text |
| 02 | [`temperature-converter/`](./temperature-converter) | basics | M1 ready | 5102 | celsius/fahrenheit + write actions | `$bind:value`, `$computed` |
| 03 | [`timer/`](./timer) | basics | M1 ready | 5103 | elapsed/progress + reset | `$lifecycle.mount/dispose`, `$effect` |
| 04 | [`todo-mvc/`](./todo-mvc) | basics | M1 ready | 5104 | todos/remaining/filter + addTodo/clearCompleted | `$each/$key`, localStorage persistence (v1.1 fix) |
| 05 | [`color-theme/`](./color-theme) | basics | M1 ready | 5105 | HSL signals + setPreset | `$reactive()` in `@style`, `$global`, `$media` macro |
| 06 | [`weather-card/`](./weather-card) | flagship | ready | 5106 | location/forecast/status + fetchForecast, A2A+ACP stub indicators | Signals + `$computed`/`$action` `expose:`, async action against Open-Meteo geocoding + forecast |
| 07 | [`currency-converter/`](./currency-converter) | basics | ready | 5116 | from/to/amount + converted | Enum `$prop` inputs, pure `$computed` conversion |
| 08 | [`css-engine-demo/`](./css-engine-demo) | styling | ready | 5114 | cardClass + toggleAccent/toggleRoomy | `@aihu/css-engine`: utility `compile()`, `cn()` runtime, progressive `anchor:` shim |
| 09 | [`primitives-showcase/`](./primitives-showcase) | styling | ready | 5115 | wired + closeAll | `@aihu/primitives`: headless dialog + tooltip + button (APG ARIA/keyboard), BYO styling |
| 10 | `agent-hub/` (new) | flagship | M2 | 5107 | Multi-component aggregation | `getAllAgentMetadata()`, A2A streaming |
| 11 | [`hacker-news/`](./hacker-news) | meta | M1 ready | 5108 | top stories route data | Multi-page SSR, recursive components |
| 12 | [`blog-loader/`](./blog-loader) | meta | M2 ready | 5109 | posts + loader + getPost/listPosts agent | `defineLoader`, `<$suspense>`, `@aihu/context` (parallel data channel via `ReadingContext`), `@agent` block |
| 13 | `cf-adapter/` (new) | meta | M2 | 5110 | agent-readiness | Cloudflare Workers adapter |
| 14 | `plugin-demo/` (new) | meta | M2 | 5111 | custom block | `definePlugin`, transform hooks |
| 15 | `realtime-scores/` (new) | meta | M2 | 5112 | live data | WebSocket + `$lifecycle` + `createResource` |
| 16 | `storefront/` (new) | meta | M2 | 5113 | cart + checkout | `@aihu-plugin/data`, `$shared`, dummy Stripe |

### Archived

| Folder | Reason |
|---|---|
| [`archived/markdown-preview/`](./archived/markdown-preview) | Security footgun without sanitization plugin |

## Run all examples in parallel

```bash
bun run dev:examples
```

Spawns all 6+ polished examples simultaneously on their assigned ports.

## Run a single example

```bash
cd examples/live-counter
bun install
bun run dev    # http://localhost:5101
```

## Marketing skip-list

Four examples cover the full value proposition in under 250 LOC:

- **`live-counter`** (~40 LOC) — what the framework looks like
- **`todo-mvc`** (~120 LOC) — the universal anchor (now with localStorage)
- **`color-theme`** (~100 LOC) — the `$reactive()` differentiator
- **`hacker-news`** (multi-file) — the meta-framework story

## Authoring contract

All `.aihu` files are written against the v1 spec quartet at `../docs/superpowers/specs/`. If something drifts from the specs, the specs win.

## Coverage matrix (M1 examples)

| Feature | EX-01 | EX-02 | EX-03 | EX-04 | EX-05 | EX-08 |
|---|---|---|---|---|---|---|
| Signals | yes | yes | yes | yes | yes | yes |
| `$computed` | — | yes | yes | yes | yes | — |
| `$effect` | — | — | — | yes | — | — |
| `$bind:value` | — | yes | yes | yes | yes | — |
| `$each/$key` | — | — | — | yes | — | yes |
| `$lifecycle` | — | — | yes | yes | — | — |
| `$reactive` in `@style` | — | — | — | — | yes | — |
| `$global` | — | — | — | — | yes | — |
| `$media` macro | — | — | — | — | yes | — |
| `@agent` block | yes | yes | yes | yes | yes | yes |
| Dark-mode tokens | yes | yes | yes | yes | yes | yes |
| Mobile responsive | yes | yes | yes | yes | yes | yes |
| localStorage | — | — | — | yes | — | — |
| File-based routing | — | — | — | — | — | yes |
| SSR | — | — | — | — | — | yes |
| Recursive components | — | — | — | — | — | yes |
