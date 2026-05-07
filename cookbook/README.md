# aihu Cookbook

Canonical `.aihu` SFC recipes — minimal, idiomatic examples that serve two purposes:

1. **Usage examples** — the `aihu_example(intent)` MCP tool queries these to surface the right pattern for a given task.
2. **CI compile tests** — every recipe compiles cleanly via `bun test cookbook/cookbook.test.ts`. Any syntax regression fails CI.

All recipes use **v2 template syntax** (Variant B): `{#if}`, `{#each}`, `{@html}`, `$on.click`, `$bind.value` — no v1 colon-form directives.

---

## Recipes

| File | Description |
|---|---|
| `counter.aihu` | `signal(0)` + increment/decrement via `$on.click`; `{#if}` for disable state |
| `form-input.aihu` | `$bind.value` two-way binding, `$on.submit`, form validation signal |
| `fetch-data.aihu` | `$resource` for async fetch; `{#if}` loading / error / success states |
| `emit-event.aihu` | `$event` collection + `$emit.selected({ id })` child→parent event pattern |
| `lifecycle.aihu` | `$lifecycle: { mount, dispose }` — start an interval on mount, clear it on dispose |
| `aria-button.aihu` | Accessible toggle button: `role`, `aria-pressed`, keyboard handler via `$on.keydown` |
| `computed-values.aihu` | `$computed` derived from multiple signals; bound directly in the template |
| `effect-side.aihu` | `$effect` for localStorage sync side-effect that runs whenever deps change |
| `class-binding.aihu` | `class={['base', cond && 'active', size]}` array form — drops falsy entries |
| `each-list.aihu` | `{#each items as item (item.id)}` with key + `{:empty}` fallback |
| `if-else.aihu` | Full `{#if}` / `{:else if}` / `{:else}` chain with reactive condition |
| `html-unsafe.aihu` | `{@html content}` raw HTML injection — documents XSS risk |
| `route-guard.aihu` | Auth gate: redirects to `/login` when `authenticated` prop is false |
| `router-link.aihu` | Programmatic nav via `history.pushState`; active-link styling |
| `ref-dom.aihu` | `$ref={el}` — access the DOM element after mount via `$lifecycle.mount` |
| `show-hide.aihu` | `$show={cond}` vs `{#if cond}` — explains when to use each |
| `action-collection.aihu` | `$action` collection: increment / decrement / reset / undo |
| `prop-types.aihu` | `$prop` full options form: `type`, `default`, `reflect`, `attribute`, `converter` |
| `agent-surface.aihu` | `$action` + `$computed` with `describe` / `expose` for agent visibility |
| `nested-child.aihu` | Child SFC that emits `$event.selected` with typed payload |
| `nested-parent.aihu` | Parent that listens to child via `$on.selected` — composition pattern |

---

## Running the tests

```bash
bun test cookbook/cookbook.test.ts
```

Set `SCRIBE_COMPILE_BIN` to a pre-built `aihu-compile` binary if the repo does not have one in `packages/compiler/bin/`:

```bash
SCRIBE_COMPILE_BIN=/path/to/aihu-compile bun test cookbook/cookbook.test.ts
```

## CI protection

The cookbook test is included in the root `vitest.config.ts` via the `cookbook/**/*.test.ts` glob. Every PR that touches the compiler must keep all 21 recipes compiling.

## MCP integration (coming soon)

The `aihu_example(intent)` tool in the aihu MCP server will use these files as its retrieval corpus. Query with natural-language intent (e.g. "two-way bind an input", "emit events from child") to get a relevant recipe.
