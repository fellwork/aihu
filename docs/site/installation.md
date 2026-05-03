# Installation

## Prerequisites

scribe requires one of the following runtimes:

- **Bun** ≥1.3.0 (recommended — faster installs, native TypeScript, built-in test runner)
- **Node.js** ≥20.18.0 with a package manager of your choice (npm, pnpm, or yarn)

## Scaffold a new application

Use the `npx scribe` CLI to generate a new project from the Hello World template:

```bash
npx scribe app my-app
```

The scaffolder generates six files:

```
my-app/
  package.json
  tsconfig.json
  vite.config.ts
  src/
    main.ts
    pages/
      index.scribe
```

- **`package.json`** — workspace manifest with `@scribe/runtime`, `@scribe/signals`, `@scribe/arbor`, and `@scribe/router` as dependencies, plus Vite and the scribe Vite plugin as devDependencies.
- **`tsconfig.json`** — extends the scribe base TypeScript config with `moduleResolution: bundler`.
- **`vite.config.ts`** — Vite config with `viteRouterIntegration()` wired in.
- **`src/main.ts`** — entry point that calls `mount()` on `document.body`.
- **`src/pages/index.scribe`** — the Hello World SFC with `@state`, `@template`, and `@route` blocks.

## Install and run

```bash
cd my-app
bun install
bun run dev
```

The dev server starts at `http://localhost:5173` with HMR enabled. Edit `src/pages/index.scribe` and the browser updates automatically.

## Build for production

```bash
bun run build
bun run preview
```

`bun run build` compiles all `.scribe` files through the Rust SFC compiler, bundles with Vite/Rolldown, and validates against the size budgets defined in `.size-limit.ts`.
