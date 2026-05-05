# @aihu/cli

Build-time CLI scaffolder for aihu applications. Zero runtime size impact — it is a
dev/build-time tool only and is never included in browser bundles.

## Prerequisites

- Bun ≥ 1.3.0 (or Node.js ≥ 20.18.0)
- A terminal in your project directory

## Quick start — `aihu app`

```bash
npx aihu app my-app
cd my-app
bun install
bun run dev
```

This creates:

```
my-app/
  package.json              # all @aihu/* deps pre-wired
  aihu.config.ts          # defineAihuConfig with target: 'universal'
  vite.config.ts            # viteRouterIntegration + viteAgentReadinessIntegration
  src/
    pages/
      index.aihu          # Hello World page with @state, @template, @route
    layouts/
      default.aihu        # default layout with <slot />
```

## Scaffold commands

### `aihu app <name>`

Scaffold a new application with all aihu integrations wired.

```bash
aihu app my-store
```

Output:
```
✓ Created my-store/
  cd my-store
  bun install
  bun run dev
```

### `aihu page <route>`

Add a page to an existing project. Run from the project root.

```bash
aihu page about
```

Creates `src/pages/about.aihu`:
```
@state {
}

@template {
  <div>about page</div>
}

@route {
  path: /about
  name: about
}
```

### `aihu component <name>`

Scaffold a `.aihu` component.

```bash
aihu component Button
```

Creates `src/components/Button.aihu`:
```
@state {
}

@template {
  <div>Button</div>
}
```

### `aihu plugin <name>`

Scaffold a plugin package skeleton. Creates `<name>/` with a wired `definePlugin` entry.

```bash
aihu plugin my-forms
```

Creates:
```
my-forms/
  package.json    # peerDependencies: { "@aihu/plugin": "latest" }
  src/
    index.ts      # definePlugin({ name, namespace, contributes: {} })
```

### `aihu migrate [files...]`

Convert HTML-tag SFCs (v0.1.x syntax) to `@blockname {}` syntax.

```bash
aihu migrate src/components/Counter.aihu
aihu migrate --dry-run src/**/*.aihu
```

Conversion table:

| HTML-tag syntax       | @blockname syntax  |
|-----------------------|--------------------|
| `<script setup>`      | `@state {`         |
| `<template>`          | `@template {`      |
| `<style>`             | `@style {`         |
| `<agent>`             | `@agent {`         |

Use `--dry-run` to preview changes without writing files.

## Dev → build → preview cycle

```bash
# Start development server
bun run dev

# Production build
bun run build

# Preview production build locally
bun run preview
```

## Programmatic API

All scaffold functions are exported for use in build scripts:

```ts
import {
  scaffoldApp,
  scaffoldPage,
  scaffoldComponent,
  scaffoldPlugin,
  migrateFile,
  migrateFiles,
} from '@aihu/cli'

// Scaffold a new app
scaffoldApp('my-app', '/path/to/projects')

// Migrate a file's contents (pure function — no I/O)
const converted = migrateFile(sfcFileContent)
```

## Design constraints

- Zero external npm dependencies (Node/Bun builtins only)
- Build-time only — never added to size budgets or browser bundles
- Per Learning #49 (v3 dep-free thesis): zero non-`@aihu/*` runtime deps
