# Installation

## Prerequisites

aihu requires **one** of the following runtimes:

- **Bun** ≥1.3.0 (recommended — faster installs, native TypeScript, built-in test runner)
- **Node.js** ≥20.18.0 with a package manager of your choice (npm, pnpm, or yarn)

## Scaffold a new application

Use the `@aihu/cli` to generate a new project:

```bash
# Bun (recommended)
bunx @aihu/cli app my-app

# Node.js
npx @aihu/cli app my-app
```

The scaffolder generates the following files:

```
my-app/
  package.json
  aihu.config.ts
  vite.config.ts
  src/
    pages/
      index.aihu
    layouts/
      default.aihu
```

- **`package.json`** — workspace manifest with `@aihu/runtime`, `@aihu/signals`, `@aihu/arbor`, `@aihu/router`, `@aihu/server`, and `@aihu/agent` as dependencies, plus Vite and `@aihu/cli` as devDependencies.
- **`aihu.config.ts`** — framework config via `defineAihuConfig` (build target, plugins, adapters).
- **`vite.config.ts`** — Vite config with `viteRouterIntegration()` and `viteAgentReadinessIntegration()` wired in.
- **`src/pages/index.aihu`** — the Hello World SFC with `@state`, `@template`, and `@route` blocks.
- **`src/layouts/default.aihu`** — the default layout shell (`<slot />`).

## Install and run

```bash
cd my-app
bun install
bun run dev
```

The dev server starts at `http://localhost:5173` with HMR enabled. Edit `src/pages/index.aihu` and the browser updates automatically — no full reload needed.

## Build for production

```bash
bun run build
bun run preview
```

`bun run build` compiles all `.aihu` files through the Rust SFC compiler, bundles with Vite/Rolldown, and validates against the size budgets defined in `.size-limit.json`.

`bun run preview` serves the production build locally so you can verify the output before deploying.
