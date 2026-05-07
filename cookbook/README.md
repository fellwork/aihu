# aihu Cookbook v0.5.0

Twenty CI-protected `.aihu` SFC recipes covering the core v0.4 feature surface.
Each compiles cleanly through the aihu Rust compiler; the harness exits 1 on any error.

## Patterns

| File | Description |
|---|---|
| `aihu-counter.aihu` | `$prop count` + `$action increment/decrement/reset` — minimal reactive counter |
| `fetch-resource.aihu` | `$resource` for async fetch — loading / error / data states with `{#if}` |
| `aria-form.aihu` | `$aria` collection mapping `role`, `aria-label`, `aria-describedby`; `$form` value + validity |
| `context-provider.aihu` | `$context provide:` — exposes a theme string to descendants |
| `context-consumer.aihu` | `$context consume:` — reads the theme from an ancestor provider |
| `aihu-controller.aihu` | `$controller` with a `ResizeObserver` — `mount`/`disconnect` lifecycle hooks |
| `agent-weather.aihu` | `$prop city` + `$action fetchForecast` with `expose`/`describe` for agent introspection |
| `guard-ui.aihu` | `<$guard scope="admin">` — content only renders when the scope is verified |
| `form-validation.aihu` | `$form` value + validity for a form-associated custom element with live validation |
| `ssr-hydration.aihu` | `$lifecycle.mount` hydrates from `dataset` — SSR-safe prop bootstrapping pattern |
| `tailwind-style.aihu` | Tailwind 4 utility classes in template + scoped `@style` block coexistence |
| `aihu-clock.aihu` | `$lifecycle.mount` starts `setInterval`; `dispose` clears it — real-time clock |
| `aihu-accordion.aihu` | `$prop items` + `$action toggle`; `{#each}` + `$show` per panel |
| `aihu-tabs.aihu` | `$prop tabs` + `$action selectTab`; `$computed selected` drives active panel |
| `aihu-modal.aihu` | `$prop open`, `$action show/hide`, `$on.keydown` for Escape, `$aria` role=dialog |
| `aihu-toast.aihu` | `$prop message`, `$action dismiss`, auto-dismiss via `$lifecycle.mount` setTimeout |
| `theme-toggle.aihu` | `$context provide:` theme + `$effect` toggling `document.documentElement` class |
| `data-table.aihu` | `$prop rows`, `$action sort(col)`, `$computed sortedRows`, `$each` with `$key` |
| `search-debounce.aihu` | `$bind.value` + `$effect` 300ms debounce + `$computed results` |
| `infinite-scroll.aihu` | `$prop page`, `$action loadMore`, `IntersectionObserver` in `$controller` |

## Running the harness

```bash
bun run test           # from cookbook/
# or from repo root:
bun run test:cookbook
```

The harness reads every `.aihu` file, compiles it via `@aihu/compiler`, and asserts:
1. Zero compiler errors (any thrown exception fails the run).
2. Output contains `defineElement` (compiler emitted a component registration).

Set `SCRIBE_COMPILE_BIN` to override the binary path:

```bash
SCRIBE_COMPILE_BIN=/path/to/aihu-compile bun run test:cookbook
```
