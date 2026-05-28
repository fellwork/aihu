# css-engine-demo

> The first-party styling story: a component styled by **`@aihu/css-engine`**.

Demonstrates all three browser-facing surfaces of the published
[`@aihu/css-engine`](../../packages/css-engine) package:

| Surface | Import | What it does here |
|---|---|---|
| Utility output | `@aihu/css-engine` (`compile()`) | `gen-css.ts` compiles a hand-rolled class list into `utilities.generated.css`. For the auto-fold path (scanner integrated with `viteAihuPlugin`), see [`examples/css-engine-utility/`](../css-engine-utility). |
| `cn()` runtime | `@aihu/css-engine/runtime/cn` | Merges a static base with reactive variant classes and resolves Tailwind-style conflicts last-wins (`p-4` + `p-6` → `p-6`). |
| progressive shim | `@aihu/css-engine/runtime/progressive` | `anchorFallback()` positions the floating "Popular" badge against its anchor — a ~2 kB dependency-free `anchor:` polyfill. |

The component renders with **`shadowMode: 'none'`** (set in `vite.config.ts`) so the
engine's global utility cascade applies — the documented mode for utility-class
frameworks. The `aihu-default` style pack supplies the `--color-*` brand tokens the
utilities reference, and is `.dark`-aware so dark mode works through the shared toggle.

## Run

```bash
cd examples/css-engine-demo
bun install
bun run dev    # http://localhost:5114 (runs gen:css first)
```

## Agent surface

`cardClass` (computed) is exposed read-only; `toggleAccent` / `toggleRoomy`
expose read+write — an agent can flip the style packs and read back the merged
`className` the engine produced.
