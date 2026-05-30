# @aihu/ui

The aihu styled-recipe registry. `@aihu/ui` ships **copy-paste `.aihu` recipes distributed as source** via the `aihu add` CLI — there is no runtime bundle and no `.size-limit.json` row. Recipes are styled custom elements built on the headless [`@aihu/primitives`](/docs/api-reference) behaviors and the [`@aihu/css-engine`](/docs/api-reference) `cn()` helper + `@apply`-in-`@style` utilities. You own the source the moment it lands in your project.

## Install

```bash
bun add -D @aihu/ui
```

`@aihu/ui` is a dev dependency: the CLI reads its recipe catalog at add-time and copies source into your project. Nothing from `@aihu/ui` is bundled into your app.

## Quick start — `aihu add`

```bash
aihu add button                 # copy the button recipe into your project
aihu add button card badge      # several at once
aihu add button --prefix acme   # register as <acme-button> instead of <aihu-button>
aihu add button --dry-run       # show what would be written, write nothing
aihu add button --diff          # diff against an existing copy
aihu add button --force         # overwrite an existing copy
aihu list                       # list every available recipe
aihu list --installed           # list recipes already copied into this project
```

`aihu add` resolves the recipe (and any recipe dependencies) from the installed
`@aihu/ui` registry, rewrites the `aihu-` tag prefix to your configured prefix,
and writes the `.aihu` source into `ui.target`. The recipe's `@style` utilities
compile to scoped shadow-DOM CSS on your next build.

## Configuration

Set the registry, copy target, and tag prefix in `aihu.config.ts`:

```typescript
export default defineAihuConfig({
  ui: {
    registry: '@aihu/ui',          // source registry (default)
    target:   './src/components/ui', // where aihu add copies recipes
    style:    'aihu-default',        // active style pack
    prefix:   'aihu',                // custom-element tag prefix
  },
})
```

## Phase 1 recipes

| Recipe | Built on | Notes |
|---|---|---|
| `button` | extends `@aihu/primitives` `AihuButton` | `variant` + `size` matrices, shared Constructable StyleSheet adopted into shadow DOM |
| `card` | presentational | slotted header / body / footer |
| `badge` | presentational | `variant` matrix |
| `separator` | presentational | `orientation` attribute, `role="separator"` |

Recipe metadata (variants, slots, dependencies) lives in each recipe's `@meta`
block; the registry catalog (`registry.json`) is generated from it.

## How it relates

- [`@aihu/primitives`](/docs/api-reference) — the headless behavior layer recipes extend (ARIA, keyboard, focus). A normal versioned dependency.
- [`@aihu/css-engine`](/docs/api-reference) — supplies `cn()`, the style packs, and the `@apply`/scoped-output engine the recipe `@style` blocks compile through.
- [`@aihu/cli`](/docs/packages/cli) — hosts the `aihu add` / `aihu list` commands.
