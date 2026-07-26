/**
 * Installation guide body. Adapted from the real
 * `apps/docs/src/content/docs/installation.md` — no retired-dialect code
 * samples here (this guide is pure CLI/config, not SFC state syntax), so the
 * content carries over near-verbatim. Fenced code uses the `~~~` delimiter
 * and inline code uses `<code>` tags (both valid markdown) so the source
 * carries no backticks — that keeps it a plain template literal and avoids
 * escaped-backtick corruption.
 */
export const INSTALLATION = `# Installation

## Prerequisites

aihu requires <b>one</b> of the following runtimes:

- <b>Bun</b> ≥1.3.0 (recommended — faster installs, native TypeScript, built-in test runner)
- <b>Node.js</b> ≥20.18.0 with a package manager of your choice (npm, pnpm, or yarn)

## Scaffold a new application

Use the <code>@aihu/cli</code> to generate a new project:

~~~bash
# Bun (recommended)
bunx @aihu/cli app my-app

# npm
npm create aihu@latest my-app
~~~

> <b>Note.</b> The ≤5 minute quick start is conditional until pre-built
> <code>aihu-compile</code> binaries ship. Today the scaffolder builds the Rust SFC compiler
> from source on first run, which adds a one-time toolchain step. Once the
> GitHub Actions release workflow publishes platform binaries, the install becomes a
> single download and this note will be removed.

The scaffolder generates the following files:

~~~
my-app/
  package.json
  aihu.config.ts
  vite.config.ts
  src/
    pages/
      index.aihu
    layouts/
      default.aihu
~~~

- <b><code>package.json</code></b> — workspace manifest with <code>@aihu/runtime</code>, <code>@aihu/signals</code>, <code>@aihu/arbor</code>, <code>@aihu/router</code>, <code>@aihu/server</code>, and <code>@aihu/agent</code> as dependencies, plus Vite and <code>@aihu/cli</code> as devDependencies.
- <b><code>aihu.config.ts</code></b> — framework config via <code>defineAihuConfig</code> (build target, plugins, adapters).
- <b><code>vite.config.ts</code></b> — Vite config with <code>viteRouterIntegration()</code> and <code>viteAgentReadinessIntegration()</code> wired in.
- <b><code>src/pages/index.aihu</code></b> — the Hello World SFC with <code>@state</code>, <code>@template</code>, and <code>@route</code> blocks.
- <b><code>src/layouts/default.aihu</code></b> — the default layout shell (<code>&lt;slot /&gt;</code>).

## Install and run

~~~bash
cd my-app
bun install
bun run dev
~~~

The dev server starts at <code>http://localhost:5173</code> with HMR enabled. Edit <code>src/pages/index.aihu</code> and the browser updates automatically — no full reload needed.

## Build for production

~~~bash
bun run build
bun run preview
~~~

<code>bun run build</code> compiles all <code>.aihu</code> files through the Rust SFC compiler, bundles with Vite/Rolldown, and validates against the size budgets defined in <code>.size-limit.json</code>.

<code>bun run preview</code> serves the production build locally so you can verify the output before deploying.
`
