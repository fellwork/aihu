# aihu Cookbook

Twenty CI-protected `.aihu` SFC recipes — the **fluency corpus** that teaches humans and
AI agents idiomatic aihu. Each recipe compiles cleanly through the aihu Rust compiler
(the harness exits 1 on any error) and carries machine-readable frontmatter.

**This directory is the single source of truth.** Every consumption surface is
*generated* from it and CI-diffed against a fresh build (`bun run check:cookbook`):

| Generated artifact | Serves |
|---|---|
| `packages/mcp/src/cookbook-index.json` | the `aihu_example` MCP tool (`@aihu/mcp`) |
| `llms-cookbook.txt` (repo root) | any agent, zero infrastructure — linked from `llms.txt` |
| `apps/docs/playground/presets.generated.ts` | docs-site playground presets |

Regenerate all three after editing a recipe:

```bash
bun packages/mcp/scripts/build-cookbook-index.ts
```

## Frontmatter contract

Every recipe MUST open with a `<!-- @cookbook -->` block (schema and construct
registry: `packages/mcp/scripts/cookbook-lib.ts`). The build fails loudly — listing
every offender — on a missing/invalid block, an unknown construct/type/concern ID,
a duplicate id, or an id that doesn't match the filename stem.

```
<!-- @cookbook
id: aihu-counter            # = filename stem
type: display               # display|form|list|container|async|streaming|store|agent|ssr-ssg|routing|interop
granularity: block          # block (single concept) | recipe (composed pattern)
description: One line, written for both audiences.
constructs: [prop, action, on:click, interpolation]
packages: []                # workspace packages used
concerns: [state, events]   # state|events|styling|a11y|governance|persistence|serialization
since: 0.5.0
playground: Counter         # optional — presence ⇒ playground preset (value = label)
anti-patterns:
  - "The don'ts — as load-bearing as the source for LLM consumers."
related: [aihu-tabs]
-->
```

## Recipes

| File | Description |
|---|---|
| `agent-weather.aihu` | prop `city` + action `fetchForecast` with `expose`/`describe` for agent introspection |
| `aihu-accordion.aihu` | prop `items` + action `toggle`; `each`/`key` + `show` per panel |
| `aihu-clock.aihu` | `onMount` starts `setInterval`; `onDispose` clears it — real-time clock |
| `aihu-controller.aihu` | `controller()` intrinsic with a `ResizeObserver` — hostConnected/hostDisconnected lifecycle |
| `aihu-counter.aihu` | prop `count` + actions `increment/decrement/reset` — minimal reactive counter |
| `aihu-modal.aihu` | prop `open`, actions `show/hide`, `on:keydown` for Escape, `aria()` role=dialog |
| `aihu-tabs.aihu` | prop `tabs` + action `selectTab`; `derived` selected drives the active panel |
| `aihu-toast.aihu` | prop `message` + action `dismiss`, auto-dismiss via `onMount` setTimeout |
| `aria-form.aihu` | `aria()` mapping role/label/describedby; `form()` value + validity |
| `context-consumer.aihu` | `consume()` — reads the theme from an ancestor provider |
| `context-provider.aihu` | `provide()` — exposes a theme token to descendants |
| `data-table.aihu` | prop `rows`, action `sort(col)`, `derived` sortedRows, `each` with `key` |
| `fetch-resource.aihu` | `resource()` for async fetch — loading / error / data states |
| `form-validation.aihu` | `form()` value + validity for a form-associated custom element with live validation |
| `guard-ui.aihu` | `<guard scope="admin">` — content only renders when the scope is verified |
| `infinite-scroll.aihu` | prop `page`, action `loadMore`, `IntersectionObserver` via `controller()` |
| `search-debounce.aihu` | `bind:value` + `effect()` 300ms debounce + `derived` results |
| `ssr-hydration.aihu` | `onMount` hydrates from `dataset` — SSR-safe prop bootstrapping pattern |
| `tailwind-style.aihu` | Tailwind 4 utility classes in template + scoped `@style` block coexistence |
| `theme-toggle.aihu` | `provide()` theme + `effect()` toggling `document.documentElement` class |

## Running the harness

```bash
bun run test           # from cookbook/
# or from repo root:
bun run test:cookbook
```

The harness reads every `.aihu` file, compiles it via `@aihu/compiler`, and asserts:
1. Zero compiler errors (any thrown exception fails the run).
2. Output contains `defineElement` (compiler emitted a component registration).

Set `AIHU_COMPILE_BIN` to override the binary path:

```bash
AIHU_COMPILE_BIN=/path/to/aihu-compile bun run test:cookbook
```
