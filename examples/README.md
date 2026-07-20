# aihu examples

> Aihu — agentic discovery and interaction, for human purpose.

17-example portfolio across 4 tiers, all on the v2 macro vocabulary (#425 migrated the last stragglers; every `.aihu` below compiles — verified by `bun run check:emit-parses`). Most examples demonstrate both a human UX and an agent surface via per-name `expose:` / `describe:` on `@state` collection entries — agentic discovery and interaction is core to aihu's identity, not an add-on. Examples whose state is raw `signal()` bindings (noted below) currently have no per-name agent surface: v2 attaches `expose:` only to collection entries.

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
| 10 | [`agent-hub/`](./agent-hub) | flagship | ready (v2) | 5107 | `agentCount` + `sendA2aRequest`/`sendAcpMessage` actions (exposed `$action` entries) | server.ts (Bun.serve), A2A single-shot SSE, ACP live adapter, `@aihu/context` token sharing across SFCs, `$lifecycle` collection |
| 11 | [`hacker-news/`](./hacker-news) | meta | M1 ready | 5108 | top stories route data | Multi-page SSR, recursive components |
| 12 | [`blog-loader/`](./blog-loader) | meta | M2 ready (v2) | 5109 | none (v1 declarative `expose:` block retired; no `@state` entries back it) | `defineLoader`, `<$suspense>`, `@aihu/context` (parallel data channel via `ReadingContext`) |
| 13 | [`cf-adapter/`](./cf-adapter) | meta | M2 ready (v2) | 5110 | none (raw `signal()` state; v1 `$expose` retired) | `@aihu/adapter-cloudflare`: wires `cloudflare()` in `aihu.config.ts`, hand-authored `wrangler.toml`, responsive `@media` |
| 14 | [`plugin-demo/`](./plugin-demo) | meta | M2 ready (v2) | 5111 | none (raw `signal()` state; v1 `$expose` retired) | `definePlugin`: macros + middleware + transforms, `createDemoRoutes`, `createDemoRuntime` signal, `install-manifest.json` |
| 15 | [`realtime-scores/`](./realtime-scores) | meta | M2 ready (v2) | 5112 | none (raw `signal()` state; v1 `$expose` retired) | WebSocket + signals + createResource, live score overlay, `$lifecycle` collection |
| 16 | [`storefront/`](./storefront) | meta | M2 ready (v2) | 5113 | cartItems/cartCount + addToCart/checkout (exposed `$computed`/`$action` entries) | `createResource` + `createResourceSerializer` (SSR-safe), `@aihu/context` CartContext provide/inject, `@aihu/auth` `requireAuth` on checkout, dummy Stripe |
| 17 | [`auth-magna-seo/`](./auth-magna-seo) | meta | M2 ready | 5117 | auth-gated data + SEO metadata | `getAuthState` + `createMagnaFetch`/`createMagnaResource` + `createSeoRoutes` 3-package integration (imperative) |

## Run all examples in parallel

```bash
bun run dev:examples
```

Spawns all ready examples simultaneously on their assigned ports.

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

All `.aihu` files are written against the spec quartet at `../docs/superpowers/specs/`, including the v2 macro vocabulary (`2026-05-05-spec-macro-vocabulary-v2.md`). If something drifts from the specs, the specs win. To bring an older `.aihu` up to v2, run `npx aihu migrate --v2 <file>` (see `../docs/site/migration.md`).

## Coverage matrix (M1 basics + hacker-news)

| Feature | EX-01 | EX-02 | EX-03 | EX-04 | EX-05 | hacker-news |
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
