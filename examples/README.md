# aihu examples

A 10-example curriculum, ordered top-to-bottom. Read the first three in order; pick the rest by which question you have.

Each folder ships a single `.aihu` SFC (or a small directory tree for the meta-framework demos), a 1-screen `README.md`, and — for the basics tier — a standalone `index.html` you can open through `bun run dev`.

| #  | Folder                                                     | Tier      | Type       | Teaches                                                                             | Peer parity                       |
|----|------------------------------------------------------------|-----------|------------|-------------------------------------------------------------------------------------|------------------------------------|
| 1  | [`live-counter/`](./live-counter)                          | basics    | pure-SFC   | State + event handler + reactive text. The smallest aihu component possible.       | 7GUIs #1; every framework         |
| 2  | [`temperature-converter/`](./temperature-converter)        | basics    | pure-SFC   | `$bind:value` two-way binding plus `$computed` derivation.                          | 7GUIs #2 (Svelte / Solid / Vue)   |
| 3  | [`timer/`](./timer)                                        | basics    | pure-SFC   | `$lifecycle.mount` / `$lifecycle.dispose`; slider input; effect cleanup.            | 7GUIs #4 (Svelte / Solid)         |
| 4  | [`markdown-preview/`](./markdown-preview)                  | basics    | pure-SFC   | `$bind:value` -> `$computed` -> `$html`; scoped `<style>`; security note.           | Svelte / Vue                      |
| 5  | [`todo-mvc/`](./todo-mvc)                                  | basics    | pure-SFC   | `$each` + `$key`; multiple computeds; mixed handler forms. The universal anchor.    | TodoMVC.com                       |
| 6  | [`color-theme/`](./color-theme)                            | basics    | pure-SFC   | `$reactive(...)` inside `@style` plus the `$global { ... }` macro.                  | Lit (loosely)                     |
| 7  | [`weather-card/`](./weather-card)                          | flagship  | `@agent`   | First aihu-unique demo: `$expose` + `$action` + `$describe` for MCP.              | None — aihu-unique              |
| 8  | [`currency-converter/`](./currency-converter)              | flagship  | `@agent`   | Enum `$prop` into a constrained MCP tool schema; pure-computed conversion.          | None — aihu-unique              |
| 9  | `blog-router/` (TBD)                                       | meta      | meta-fwk   | File-based routing with three pages; `@route` + `viteRouterIntegration()`.          | Nuxt / Next / SvelteKit / Remix   |
| 10 | `blog-loader/` (TBD)                                       | meta      | meta-fwk   | Server loader + `<$suspense>` + 3-state resource.                                   | Remix / SvelteKit                 |

Examples 9 and 10 land in the same PR via parallel Builder tracks T4-E2 / T4-E3.

## Marketing skip-list

If you only have time for four, read these:

- **`live-counter`** (~25 LOC) — what the framework looks like.
- **`todo-mvc`** (~110 LOC) — the universal anchor.
- **`weather-card`** (~70 LOC) — the agent flagship.
- **`blog-router`** (when published) — the file-based-routing meta-framework story.

Together they cover the entire framework value-prop in under 250 LOC.

## Authoring contract

All `.aihu` files in this directory are written against the v1 spec quartet at `../docs/superpowers/specs/`:

- [`2026-05-02-spec-block-structure.md`](../docs/superpowers/specs/2026-05-02-spec-block-structure.md)
- [`2026-05-02-spec-template-attribute-syntax.md`](../docs/superpowers/specs/2026-05-02-spec-template-attribute-syntax.md)
- [`2026-05-02-spec-macro-vocabulary.md`](../docs/superpowers/specs/2026-05-02-spec-macro-vocabulary.md)
- [`2026-05-02-spec-plugin-contract.md`](../docs/superpowers/specs/2026-05-02-spec-plugin-contract.md)

If something here drifts from the specs, the specs win.
