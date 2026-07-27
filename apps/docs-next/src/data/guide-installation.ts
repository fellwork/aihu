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
  vite.config.ts
  tsconfig.json
  index.html
  src/
    main.ts
    pages/
      index.aihu
  .vscode/
    extensions.json
    settings.json
  AGENTS.md
  CLAUDE.md
  .mcp.json
~~~

- <b><code>package.json</code></b> — workspace manifest with <code>@aihu/app</code>, <code>@aihu/runtime</code>, <code>@aihu/signals</code>, <code>@aihu/arbor</code>, and <code>@aihu/router</code> as dependencies, plus <code>@aihu-plugin/agent-readiness</code>, <code>@aihu/cli</code>, <code>@aihu/compiler</code>, <code>@aihu/tsc</code>, TypeScript, and Vite as devDependencies.
- <b><code>vite.config.ts</code></b> — the whole aihu configuration surface: a single <code>viteAihuPlugin({...})</code> from <code>@aihu/app</code> that composes the Rust compiler and the router, and takes the agent-readiness surface inline via its <code>agentReadiness</code> option. Config lives here rather than in a separate <code>aihu.config.ts</code> so the <code>aihu</code> CLI and the language server read one file and cannot drift. <i>(A standalone <code>aihu.config.ts</code> still works as a legacy fallback, but the scaffold no longer emits one.)</i>
- <b><code>tsconfig.json</code></b> — TypeScript configuration; <code>bun run typecheck</code> runs <code>aihu-tsc</code> against it.
- <b><code>index.html</code></b> — the HTML entry document; loads <code>src/main.ts</code> as a module.
- <b><code>src/main.ts</code></b> — the client bootstrap: <code>createApp()</code> from <code>@aihu/app/client</code>.
- <b><code>src/pages/index.aihu</code></b> — the Hello World SFC with <code>@route</code>, <code>@state</code>, <code>@template</code>, and <code>@style</code> blocks.
- <b><code>.vscode/</code></b> — recommended extensions and editor settings for working with <code>.aihu</code> files.
- <b><code>AGENTS.md</code></b>, <b><code>CLAUDE.md</code></b>, <b><code>.mcp.json</code></b> — coding-agent tooling files; pass <code>--no-agent-tooling</code> to the scaffolder to omit them.

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
