# weather-card

**What this teaches:** the scribe-unique `@agent` block. Every signal you `$expose` becomes an MCP resource; every action you `$action` becomes an MCP tool. The same component is rendered for humans and readable for agents — no separate API layer.

This is one of two flagship `@agent` demos (the other is `currency-converter`). It uses a static mock forecast table so the example runs offline; the agent surface is the load-bearing teaching point, not the data fetch.

## Run

```bash
bun install
bun run dev
```

Or open `index.html` through the dev server.

## Concepts shown

- `@agent` block declaring a component's MCP surface (Macro Vocabulary §5)
- `$expose location, forecast, status` — three reactive signals registered as MCP resources
- `$action fetchForecast` — a single action exposed as a callable MCP tool
- `$describe name "..."` — human-readable descriptions consumed by `tools/list` and `resources/list`
- `$prop location: string = '...'` — a typed input that's also part of the agent surface

## Async actions (Flag #1, deferred)

The action here is intentionally synchronous against an inline lookup table. Real forecast APIs would use `$action async fetchForecast() { ... }` plus a sanitizer for caller-supplied locations. T4-D Flag #1 covers the pending docs work for idiomatic async error-handling at the example level.

## Compare with

No peer parity — Lit, Stencil, Svelte, Vue, Solid, Nuxt, Next, SvelteKit, and Remix do not ship MCP-readable components. This example is the answer to "what does scribe do that nothing else does."
