# currency-converter

**What this teaches:** the second `@agent` flagship, with enum-typed inputs. Demonstrates how a TypeScript union type (`'USD' | 'EUR' | 'GBP' | 'JPY'`) on a state signal flows through to a constrained MCP resource — agents see the same enum that the type system enforces.

The conversion itself is a single `$computed` over a static rate table. No network, no actions; the read surface is the entire teaching point.

The example uses standalone signals (not `$prop`s) so it runs interactively in isolation — the inline comment in `@state` shows the parent-driven variant. Both shapes expose the same agent surface.

## Run

```bash
bun install
bun run dev
```

Or open `index.html` through the dev server.

## Concepts shown

- Enum-typed signal declarations (`from: 'USD' | 'EUR' | 'GBP' | 'JPY' = 'USD'`) — the parser feature most under-demoed today
- `<select $bind:value="from">` plus `<option>` children for typed dropdowns
- `$computed converted = amount * (rates[to] / rates[from])` — pure derived value
- `@agent` exposing four reactive values (no `$action` needed — there's nothing to mutate)
- Multi-line `$describe` block aligning agent-facing names with human-readable docs

## Compare with

No peer parity — see `weather-card`'s README for the same point. The closest peer-framework analog is "currency converter as a Vue/Svelte demo," but those examples have no agent surface.
