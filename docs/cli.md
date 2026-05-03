# @scribe/cli

Build-time CLI scaffolder for scribe applications. Zero runtime size impact — it is a
dev/build-time tool only and is never included in browser bundles.

## Prerequisites

- Bun ≥ 1.3.0 (or Node.js ≥ 20.18.0)
- A terminal in your project directory

## Quick start — `scribe app`

```bash
npx scribe app my-app
cd my-app
bun install
bun run dev
```

This creates:

```
my-app/
  package.json              # all @scribe/* deps pre-wired
  scribe.config.ts          # defineScribeConfig with target: 'universal'
  vite.config.ts            # viteRouterIntegration + viteAgentReadinessIntegration
  src/
    pages/
      index.scribe          # Hello World page with @state, @template, @route
    layouts/
      default.scribe        # default layout with <slot />
```

## Scaffold commands

### `scribe app <name>`

Scaffold a new application with all scribe integrations wired.

```bash
scribe app my-store
```

Output:
```
✓ Created my-store/
  cd my-store
  bun install
  bun run dev
```

### `scribe page <route>`

Add a page to an existing project. Run from the project root.

```bash
scribe page about
```

Creates `src/pages/about.scribe`:
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

### `scribe component <name>`

Scaffold a `.scribe` component.

```bash
scribe component Button
```

Creates `src/components/Button.scribe`:
```
@state {
}

@template {
  <div>Button</div>
}
```

### `scribe plugin <name>`

Scaffold a plugin package skeleton. Creates `<name>/` with a wired `definePlugin` entry.

```bash
scribe plugin my-forms
```

Creates:
```
my-forms/
  package.json    # peerDependencies: { "@scribe/plugin": "latest" }
  src/
    index.ts      # definePlugin({ name, namespace, contributes: {} })
```

### `scribe migrate [files...]`

Convert HTML-tag SFCs (v0.1.x syntax) to `@blockname {}` syntax.

```bash
scribe migrate src/components/Counter.scribe
scribe migrate --dry-run src/**/*.scribe
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
} from '@scribe/cli'

// Scaffold a new app
scaffoldApp('my-app', '/path/to/projects')

// Migrate a file's contents (pure function — no I/O)
const converted = migrateFile(sfcFileContent)
```

## Design constraints

- Zero external npm dependencies (Node/Bun builtins only)
- Build-time only — never added to size budgets or browser bundles
- Per Learning #49 (v3 dep-free thesis): zero non-`@scribe/*` runtime deps
