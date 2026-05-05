# Installation

## Prerequisites

aihu requires one of the following runtimes:

- **Bun** ≥1.3.0 (recommended — faster installs, native TypeScript, built-in test runner)
- **Node.js** ≥20.18.0 with a package manager of your choice (npm, pnpm, or yarn)

## Scaffold a new application

Use the `npx aihu` CLI to generate a new project from the Hello World template:

```bash
npx aihu app my-app
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
      index.aihu
```

- **`package.json`** — workspace manifest with `@aihu/runtime`, `@aihu/signals`, `@aihu/arbor`, and `@aihu/router` as dependencies, plus Vite and the aihu Vite plugin as devDependencies.
- **`tsconfig.json`** — extends the aihu base TypeScript config with `moduleResolution: bundler`.
- **`vite.config.ts`** — Vite config with `viteRouterIntegration()` wired in.
- **`src/main.ts`** — entry point that calls `mount()` on `document.body`.
- **`src/pages/index.aihu`** — the Hello World SFC with `@state`, `@template`, and `@route` blocks.

## Install and run

```bash
cd my-app
bun install
bun run dev
```

The dev server starts at `http://localhost:5173` with HMR enabled. Edit `src/pages/index.aihu` and the browser updates automatically.

## Build for production

```bash
bun run build
bun run preview
```

`bun run build` compiles all `.aihu` files through the Rust SFC compiler, bundles with Vite/Rolldown, and validates against the size budgets defined in `.size-limit.ts`.
