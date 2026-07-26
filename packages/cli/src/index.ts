/**
 * @aihu/cli — build-time CLI scaffolder for aihu applications.
 *
 * v0.8.1: `@aihu/cli` package exposing scaffold functions for `aihu app`,
 * `aihu page`, `aihu component`, and `aihu plugin` commands.
 *
 * v0.8.5: Plugin scaffold template — `npx aihu plugin <name>` produces a
 * skeleton plugin package with `definePlugin` wired.
 *
 * v0.2.x scaffold: Vite + `viteAihuPlugin()` (compiler + router +
 * agent-readiness composed). Mirrors `examples/blog-router` — the
 * documented v1 pattern. The earlier rolldown-based scaffold imported
 * `virtual:aihu-routes` (a Vite-plugin virtual module) inside
 * `createApp()` but had no rolldown equivalent for the plugin, so
 * `npx aihu app NAME && bun run dev` could not actually route.
 *
 * Per Learning #49 (v3 dep-free thesis): zero non-Node built-in dependencies.
 * All templates are embedded as pure string functions — no runtime file reads.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import {
  agentComponentAihu,
  agentIndexHtml,
  agentMainTs,
  agentMcpTs,
  agentModuleShim,
  agentPackageJson,
  agentReadinessTs,
  agentReadme,
  agentServerTs,
  agentTsConfig,
  agentViteConfig,
} from './templates-agent.js'
import { fullTemplateFiles } from './templates-full.js'
import { agentToolingFiles, viteTemplateAgentsFacts } from './templates-tooling.js'

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface ScaffoldResult {
  /** Files that were written. */
  readonly created: ReadonlyArray<string>
  /** Files skipped because they already existed. */
  readonly skipped: ReadonlyArray<string>
}

// ---------------------------------------------------------------------------
// Template generators — pure functions (no I/O; fully testable)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Template variants
// ---------------------------------------------------------------------------

export type PkgManager = 'bun' | 'pnpm' | 'npm' | 'yarn'
export type AppTemplate = 'minimal' | 'full' | 'docs' | 'agent'

/** Out-of-the-box CSS strategy for a scaffolded app. */
export type CssChoice = 'engine' | 'none'
/** Shadow-DOM mode threaded into the compiler when css-engine is opted in. */
export type ShadowChoice = 'light' | 'shadow'

// ---------------------------------------------------------------------------
// App template generators (Vite + viteAihuPlugin, v1 syntax)
// ---------------------------------------------------------------------------

/** package.json for a new aihu application.
 *
 * When `withCssEngine` is true, `@aihu/css-engine` is added to `dependencies`
 * so the OOTB utility-class scaffold resolves the optional compiler peer.
 */
export function appPackageJson(
  name: string,
  pm: PkgManager = 'bun',
  withCssEngine = false,
): string {
  // bun version detection: Bun.version when running under bun, process.versions.bun
  // when bunx routes through node (the published cli's shebang is `#!/usr/bin/env node`,
  // so process.versions.bun is undefined there). When neither is set, drop the field
  // entirely rather than emit a malformed `bun@1` string.
  const bunVersion =
    (globalThis as { Bun?: { version: string } }).Bun?.version ?? process.versions.bun
  const packageManager = pm === 'bun' && bunVersion ? `bun@${bunVersion}` : undefined

  return JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
        // `aihu-tsc`, not `tsc`: plain tsc cannot see inside a `.aihu` file, so it
        // would report a clean pass over every SFC in the project without having
        // type-checked a line of one.
        typecheck: 'aihu-tsc',
      },
      dependencies: {
        // `@aihu/app` re-exports `viteAihuPlugin` (the composed compiler +
        // router + agent-readiness plugin) and ships `createApp()`. Runtime
        // primitives are listed explicitly because `@state` blocks bare-import
        // them (e.g. `import { signal } from '@aihu/signals'`); pinning them
        // here keeps version drift visible at `bun outdated`.
        '@aihu/app': 'latest',
        '@aihu/arbor': 'latest',
        // `@aihu/css-engine` is the optional utility-class compiler peer; only
        // emitted for the OOTB css-engine scaffold (`--css engine`). Its scoped
        // utilities fold into each component's shadow style at build time.
        ...(withCssEngine ? { '@aihu/css-engine': 'latest' } : {}),
        '@aihu/router': 'latest',
        '@aihu/runtime': 'latest',
        '@aihu/signals': 'latest',
      },
      devDependencies: {
        // `@aihu-plugin/agent-readiness` powers the `agentReadiness` pass in
        // vite.config.ts (llms.txt + MCP server-card emission). It is a
        // devDependency of `@aihu/app`, NOT a transitive runtime dep, so a
        // consumer must list it explicitly — otherwise `viteAihuPlugin`'s
        // `require('@aihu-plugin/agent-readiness')` throws at config load.
        '@aihu-plugin/agent-readiness': 'latest',
        '@aihu/cli': 'latest',
        '@aihu/compiler': 'latest',
        // Provides `aihu-tsc` — the `typecheck` script above.
        '@aihu/tsc': 'latest',
        typescript: '^5.0.0',
        vite: '^6.0.0',
      },
      // `@aihu/compiler`'s postinstall downloads the correct-arch native binary
      // and arch-validates it. Under bun, postinstall scripts are BLOCKED unless
      // the package is trusted — without this, the wrong-arch binary baked into
      // the published tarball stays in place and `bun run build` dies with
      // ENOEXEC ("Unknown system error -8"). See FIX 1 (cli release readiness).
      trustedDependencies: ['@aihu/compiler'],
      ...(packageManager ? { packageManager } : {}),
    },
    null,
    2,
  )
}

/** vite.config.ts for a new aihu application.
 *
 * `viteAihuPlugin()` composes the compiler plugin, the router plugin (which
 * provides `virtual:aihu-routes` consumed by `createApp()`), the head/SSG
 * plugins, and an opt-in agent-readiness pass — see `@aihu/app/vite-plugin`.
 * `dir.pages` tells the router where to scan for `.aihu` page files; this
 * mirrors `examples/blog-router/vite.config.ts`.
 */
export function appViteConfig(
  appName = 'app',
  withCssEngine = false,
  shadowMode?: ShadowChoice,
): string {
  // DA4 (#437, the flip): pages and layouts default to light DOM; leaves keep
  // shadow. A css-engine scaffold emits the plugin-global
  // `css: { shadowMode: … }` block ONLY when the user explicitly chose a mode
  // (`--shadow light|shadow` or the wizard) — the config tier outranks the
  // page/layout default, so an explicit choice must be carried here or the
  // page default 'light' would silently override `--shadow shadow`. With no
  // choice, nothing is emitted and the framework defaults apply — a scaffold
  // that pins the default freezes it (FEL-425: the old unconditional
  // `'shadow'` fallback silently reversed the DA4 flip for exactly the
  // scaffold that most needs global CSS to reach component internals). The
  // plain (css-off) scaffold pins `$shadow: 'light'` per-file instead and
  // emits no css block.
  const emitCssBlock = withCssEngine && shadowMode !== undefined
  const cssEngineComment = withCssEngine
    ? emitCssBlock
      ? `      // @aihu/css-engine utility classes fold into each component's shadow
      // <style> automatically (or into the global cascade under 'light').
      // Explicit --shadow choice, carried project-wide as the plugin-global
      // config — it outranks the DA4 page/layout default (only a per-file
      // $shadow pin outranks the config).
`
      : `      // @aihu/css-engine utility classes fold into the global cascade for
      // light-DOM components and into each shadow component's <style>.
      // DA4 defaults apply: pages and layouts are light DOM, leaf components
      // are shadow. To force one mode project-wide, pass
      // \`shadowMode: 'light' | 'shadow'\` via the plugin's \`css\` option
      // below (a per-file $shadow pin outranks it).
`
    : ''
  const cssBlock = emitCssBlock ? `      css: { shadowMode: '${shadowMode}' },\n` : ''
  return `import { viteAihuPlugin } from '@aihu/app'
import { viteAgentReadinessIntegration } from '@aihu-plugin/agent-readiness'
import { defineConfig } from 'vite'

export default defineConfig({
  // Vite/esbuild pre-bundles dependencies for dev. \`@aihu/app\`'s client entry
  // imports the \`virtual:aihu-routes\` / \`virtual:aihu-layouts\` modules that the
  // router plugin resolves at request time — esbuild's pre-bundle pass can't see
  // them, so it MUST be excluded or \`vite dev\` fails to start.
  optimizeDeps: { exclude: ['@aihu/app'] },
  plugins: [
    viteAihuPlugin({
${cssEngineComment}      dir: { pages: 'src/pages' },
${cssBlock}    }),
    // Agent-readiness: emit llms.txt, llms-full.txt and robots.txt (written to
    // dist/ at build, served in \`vite dev\`). Wired directly (rather than via
    // viteAihuPlugin's agentReadiness option) so it loads as an ESM import.
    //
    // Honesty rule: this is a STATIC CLIENT build, whose @aihu/agent registry
    // is empty at build time — so no MCP server card and no A2A card are
    // configured here. A card at the right path advertising zero tools is
    // indistinguishable from a real one to anything that reads it. The \`full\`
    // template ships the server that serves those cards from the LIVE registry;
    // its documents list exactly the callable tools.
    viteAgentReadinessIntegration({
      name: '${appName}',
      summary:
        'A reactive Web Components app built with aihu. Static build — component ' +
        'actions are declared in source; no live tool endpoint is served here.',
      version: '0.1.0',
      // Canonical origin for JSON-LD. Replace with your deployed URL.
      siteUrl: 'https://example.com',
    }),
  ],
})
`
}

/** tsconfig.json for a new aihu application. */
export function appTsConfig(): string {
  return `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        lib: ['ES2022', 'DOM', 'DOM.Iterable'],
        noEmit: true,
      },
      include: ['src'],
    },
    null,
    2,
  )}\n`
}

/** src/main.ts entry point for a new aihu app. */
export function appMainTs(_name: string): string {
  return `import { createApp } from '@aihu/app/client'\n\ncreateApp()\n`
}

/** index.html for a new aihu application.
 *
 * Vite serves `./src/main.ts` directly in dev and rewrites the script src
 * to the hashed build asset on `vite build`. `<div id="outlet"></div>` is
 * the mount target `createApp()` looks up by default (see
 * `@aihu/app/client#outletId`); without it `createApp()` throws on boot.
 */
export function appIndexHtml(name: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${name}</title>
  </head>
  <body>
    <div id="outlet"></div>
    <script type="module" src="./src/main.ts"></script>
  </body>
</html>
`
}

/** .vscode/extensions.json — recommends the aihu language extension. */
export function appVscodeExtensions(): string {
  return `${JSON.stringify(
    {
      recommendations: ['fellwork.vscode-aihu'],
    },
    null,
    2,
  )}\n`
}

/** .vscode/settings.json — file associations and editor wiring for .aihu. */
export function appVscodeSettings(): string {
  return `${JSON.stringify(
    {
      'files.associations': {
        '*.aihu': 'aihu',
      },
      'editor.formatOnSave': false,
    },
    null,
    2,
  )}\n`
}

/** aihu.config.ts — kept for server/SSR config; optional for client-only apps. */
export function appAihuConfig(): string {
  return "import { defineAihuConfig } from '@aihu/server'\nimport { definePlugin as data } from '@aihu-plugin/data'\nimport { definePlugin as agent } from '@aihu/agent'\n\nexport default defineAihuConfig({\n  build: { target: 'universal' },\n  plugins: [data(), agent()],\n})\n"
}

/** src/pages/index.aihu for Hello World (v1 syntax).
 *
 * When `withCssEngine` is true, emits a utility-class starter (no authored
 * `@style` block) so the scaffold demonstrates `@aihu/css-engine` end to end —
 * the classes are scanned at build time and the scoped rules fold into the
 * component's shadow `<style>`. When false, byte-identical to the original
 * hand-written `@style` starter.
 */
export function appIndexAihu(appName: string = 'app', withCssEngine = false): string {
  const tag = `${toSafe(appName)}-root`
  // The counter's actions are declared as `$action` entries so they are exposed
  // as agent-callable tools. Template buttons reference them by name (string
  // handler form), so the `$action` block is the single source of truth for the
  // agent surface.
  //
  // The `@route { name }` block registers the page under a HYPHENATED
  // custom-element tag. The router only mounts routes whose name is a valid
  // custom-element tag (must contain a hyphen); without this block the page is
  // registered under its filename stem (`index`, no hyphen) and never mounts —
  // the app renders a blank `#outlet`.
  //
  // The MCP server card's tools are DERIVED from this `$action` block at
  // runtime (the compiler emits `registerAgentMetadata` from it; the
  // agent-readiness plugin reads the registry), never hand-mirrored in
  // vite.config — so the card cannot drift from the component.
  //
  // DA4 (#437, flipped): pages default to light DOM now. The plain scaffold
  // keeps a `$shadow: 'light'` pin — it is simply explicit about the default
  // (the legacy-snapshot golden regenerates with the binary token). The
  // css-engine scaffold does NOT pin per-file: an explicit `--shadow` wizard
  // choice is carried as the PLUGIN-GLOBAL `css: { shadowMode }` in
  // vite.config.ts (the config tier outranks the page default; a per-file
  // `$shadow` marker would outrank the config and freeze the choice), and
  // with no choice nothing is emitted at all, so the DA4 framework defaults
  // apply (FEL-425 — a scaffold that pins the default freezes it).
  const shadowPin = withCssEngine ? '' : "$shadow: 'light'\n\n"
  const stateBlock = `@state {
${shadowPin}import { signal } from '@aihu/signals'

const [count, setCount] = signal(0)

$action: {
  increment: {
    describe: 'Add 1 to the value',
    expose: { read: true, write: true },
    handler: () => setCount(count() + 1),
  },
  decrement: {
    describe: 'Subtract 1 from the value',
    expose: { read: true, write: true },
    handler: () => setCount(count() - 1),
  },
  reset: {
    describe: 'Set the value to 0',
    expose: { read: true, write: true },
    handler: () => setCount(0),
  },
}
}`
  if (withCssEngine) {
    return `@route {
  name: '${tag}'
}

${stateBlock}

@template {
  <main class="flex flex-col gap-8 max-w-7xl mx-auto p-8">
    <header class="flex flex-col gap-1">
      <h1 class="text-3xl font-bold">${appName}</h1>
      <p class="text-lg">A durable Web Component your AI agent can read and drive.</p>
    </header>

    <section class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold">Control</h2>
      <p class="text-lg">Value: {count}</p>
      <div class="flex gap-2">
        <button class="px-4 py-2 rounded-lg border" on:click={decrement}>−1</button>
        <button class="px-4 py-2 rounded-lg border" on:click={reset}>Reset</button>
        <button class="px-4 py-2 rounded-lg bg-primary text-white" on:click={increment}>+1</button>
      </div>
    </section>

    <section class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold">Agent surface</h2>
      <p>These actions are declared agent-callable. This static build publishes the declaration (llms.txt); serving them as live, callable tools is what the full template's server does.</p>
      <ul class="flex flex-col gap-1">
        <li>increment — Add 1 to the value</li>
        <li>decrement — Subtract 1 from the value</li>
        <li>reset — Set the value to 0</li>
      </ul>
      <p>
        <a href="/llms.txt">llms.txt</a> — what this build honestly says about itself to agents.
      </p>
    </section>

    <p>To get started, edit <code>src/pages/index.aihu</code> — save, and this page hot-reloads. Want these actions live for real agents? <code>npm create aihu -- --template full</code> ships the server.</p>
  </main>
}
`
  }
  return `@route {
  name: '${tag}'
}

${stateBlock}

@template {
  <main class="root">
    <header>
      <h1>${appName}</h1>
      <p class="subtitle">A durable Web Component your AI agent can read and drive.</p>
    </header>

    <section class="card">
      <h2>Control</h2>
      <p class="value">Value: {count}</p>
      <div class="controls">
        <button on:click={decrement}>−1</button>
        <button on:click={reset}>Reset</button>
        <button on:click={increment}>+1</button>
      </div>
    </section>

    <section class="card">
      <h2>Agent surface</h2>
      <p>These actions are declared agent-callable. This static build publishes the declaration (llms.txt); serving them as live, callable tools is what the full template's server does.</p>
      <ul>
        <li>increment — Add 1 to the value</li>
        <li>decrement — Subtract 1 from the value</li>
        <li>reset — Set the value to 0</li>
      </ul>
      <p>
        <a href="/llms.txt">llms.txt</a> — what this build honestly says about itself to agents.
      </p>
    </section>

    <p class="note">To get started, edit <code>src/pages/index.aihu</code> — save, and this page hot-reloads. Want these actions live for real agents? <code>npm create aihu -- --template full</code> ships the server.</p>
  </main>
}

@style {
.root {
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  max-width: 640px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2rem;
  line-height: 1.5;
}
header {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.subtitle {
  color: #555;
  margin: 0;
}
.card {
  border: 1px solid #e2e2e2;
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
}
.card h2 {
  margin-top: 0;
}
.value {
  font-size: 1.25rem;
  font-weight: 600;
}
.controls {
  display: flex;
  gap: 0.5rem;
}
button {
  padding: 8px 16px;
  cursor: pointer;
}
ul {
  padding-left: 1.25rem;
}
.note {
  color: #555;
}
}
`
}

/** src/layouts/default.aihu for Hello World (v1 syntax). */
export function appDefaultLayout(): string {
  return '@template {\n  <div class="layout">\n    <slot />\n  </div>\n}\n\n@style {\n.layout {\n  max-width: 1200px;\n  margin: 0 auto;\n}\n}\n'
}

/** src/pages/about.aihu — a second route, emitted by the `full` template to
 * demonstrate the router resolving more than one page. Client-buildable only
 * (no @aihu/server wiring). */
export function appAboutAihu(appName: string = 'app'): string {
  return `@route {
  name: '${toSafe(appName)}-about'
}

@template {
  <div class="about">
    <h1>About</h1>
    <p>This is the about page — a second route wired through the aihu router.</p>
    <a href="/">Home</a>
  </div>
}

@style {
.about {
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  max-width: 600px;
  margin: 0 auto;
}
}
`
}

/** src/pages/index.aihu for the `docs` template — a docs-flavored landing page.
 * Pure string generator, client-buildable only. */
export function appDocsIndexAihu(appName: string = 'app'): string {
  const title = appName
  const tag = `${toSafe(appName)}-root`
  return `@route {
  name: '${tag}'
}

@state {
import { signal } from '@aihu/signals'

const [open, setOpen] = signal(false)
const toggle = () => setOpen(v => !v)
}

@template {
  <div class="docs">
    <header class="docs-header">
      <h1>${title} docs</h1>
      <p class="tagline">Web Components, reactive — documentation starter.</p>
    </header>
    <nav class="docs-nav">
      <a href="/">Home</a>
      <a href="/guide">Guide</a>
    </nav>
    <button class="toggle" on:click={toggle}>{open ? 'Hide' : 'Show'} details</button>
    <section if={open} class="details">
      <p>Edit <code>src/pages/index.aihu</code> to author your docs content.</p>
    </section>
  </div>
}

@style {
.docs {
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  max-width: 760px;
  margin: 0 auto;
}
.tagline {
  color: #666;
}
.docs-nav a {
  margin-right: 1rem;
}
button.toggle {
  padding: 8px 16px;
  cursor: pointer;
}
}
`
}

/** src/pages/guide.aihu — second docs route for the `docs` template. */
export function appDocsGuideAihu(appName: string = 'app'): string {
  return `@route {
  name: '${toSafe(appName)}-guide'
}

@template {
  <div class="guide">
    <h1>Guide</h1>
    <p>Author your guide pages as <code>.aihu</code> SFCs under <code>src/pages</code>.</p>
    <a href="/">Back to docs</a>
  </div>
}

@style {
.guide {
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  max-width: 760px;
  margin: 0 auto;
}
}
`
}

/** A page file for a given route path. */
export function pageAihu(routePath: string): string {
  const name = routePath.replace(/^\//, '').replace(/\//g, '-') || 'page'
  // The router only mounts routes whose name is a valid custom-element tag
  // (must contain a hyphen). A single-segment path like `/contact` yields a
  // non-hyphenated name, so suffix `-page` to keep it mountable.
  const tag = name.includes('-') ? name : `${name}-page`
  return `@route {\n  name: '${tag}'\n}\n\n@template {\n  <div class="${tag}">\n    <h1>${tag}</h1>\n  </div>\n}\n`
}

/** A component file for a given component name. */
export function componentAihu(name: string): string {
  const kebab = toKebab(name)
  // Emit a real element (not a bare HTML comment): the v1 template parser
  // rejects comment-only element bodies ("expected tag name"). A heading
  // keeps the starter compiler-clean while still naming the component.
  return `@template {\n  <div class="${kebab}">\n    <h2>${name}</h2>\n  </div>\n}\n`
}

/** package.json for a new aihu plugin. */
export function pluginPackageJson(name: string): string {
  const kebab = toKebab(name)
  return JSON.stringify(
    {
      name: `aihu-plugin-${kebab}`,
      version: '0.1.0',
      type: 'module',
      main: './dist/index.js',
      module: './dist/index.js',
      types: './dist/index.d.ts',
      exports: {
        '.': {
          types: './dist/index.d.ts',
          import: './dist/index.js',
        },
      },
      peerDependencies: {
        '@aihu/plugin': '^0.8.0',
      },
    },
    null,
    2,
  )
}

/** src/index.ts for a new aihu plugin. */
export function pluginIndex(name: string): string {
  const kebab = toKebab(name)
  return `import { definePlugin, type Plugin } from '@aihu/plugin'\n\nconst plugin: Plugin = definePlugin({\n  name: '${name}',\n  version: '0.1.0',\n  namespace: '${kebab}',\n  contributes: {\n    blocks: [],\n    macros: [],\n  },\n})\n\nexport default plugin\n`
}

// ---------------------------------------------------------------------------
// Scaffold functions — write template files to disk
// ---------------------------------------------------------------------------

/**
 * Scaffold a new aihu application at `<outDir>/<name>/`.
 *
 * v0.2.x: Vite + `viteAihuPlugin()`, v1 `@state` / `@template` / `@style`
 * syntax. Produces: package.json, vite.config.ts, tsconfig.json, index.html,
 *   src/main.ts, src/pages/index.aihu, .vscode/extensions.json,
 *   .vscode/settings.json
 */
export function scaffoldApp(
  name: string,
  outDir?: string,
  opts?: {
    pm?: PkgManager
    template?: AppTemplate
    /** `'engine'` includes `@aihu/css-engine` OOTB; `'none'` (default) is the plain scaffold. */
    css?: CssChoice
    /**
     * Explicit shadow-mode choice when css-engine is opted in. `undefined`
     * (default) emits NO plugin-global `css: { shadowMode }` block, so the
     * DA4 framework defaults apply (pages/layouts light, leaves shadow) —
     * only a genuine user choice is written out (FEL-425).
     */
    shadowMode?: ShadowChoice | undefined
    /**
     * Coding-assistant files (AGENTS.md, CLAUDE.md, .mcp.json) — on by
     * default, `--no-agent-tooling` opts out. This governs ONLY the
     * developer-environment files; the app's own runtime agent surface
     * (`$action`, llms.txt, the cards) is the product thesis and is never
     * affected by this flag.
     */
    agentTooling?: boolean
  },
): ScaffoldResult {
  const pm = opts?.pm ?? 'bun'
  const template: AppTemplate = opts?.template ?? 'minimal'
  const withCssEngine = opts?.css === 'engine'
  const shadowMode = opts?.shadowMode
  const agentTooling = opts?.agentTooling !== false
  const root = resolve(outDir ?? '.', name)

  // `full` is the kitchen-sink template: the dual-experience word-game demo on
  // the capability-bridge architecture (the former `agent` template folds into
  // it — see docs/plans/2026-07-26-scaffold-experience-design.md §3.3-3.4).
  if (template === 'full') {
    return writeFiles(root, fullTemplateFiles(name, pm, { agentTooling }))
  }

  // `agent` is the showcase template: a durable component driven by both a human
  // and an external AI agent over @aihu/agent-server's capability bridge. It is a
  // two-process app (Bun bridge server + Vite) and uses the raw client-target
  // compiler — NOT the viteAihuPlugin pages-router base — so it emits its own
  // file set and returns early.
  if (template === 'agent') {
    const files: Array<readonly [string, string]> = [
      ['package.json', agentPackageJson(name, pm)],
      ['vite.config.ts', agentViteConfig()],
      ['tsconfig.json', agentTsConfig()],
      ['index.html', agentIndexHtml(name)],
      ['server.ts', agentServerTs()],
      ['mcp.ts', agentMcpTs()],
      // The live discovery surface (llms.txt + the .well-known cards), served by
      // server.ts/mcp.ts rather than emitted statically by vite — see the
      // rationale on agentReadinessTs().
      ['readiness.ts', agentReadinessTs(name)],
      ['src/main.ts', agentMainTs()],
      ['src/task-list.aihu', agentComponentAihu()],
      ['src/aihu-modules.d.ts', agentModuleShim()],
      ['README.md', agentReadme(name)],
      ['.vscode/extensions.json', appVscodeExtensions()],
      ['.vscode/settings.json', appVscodeSettings()],
    ]
    if (agentTooling) {
      files.push(
        ...agentToolingFiles({
          name,
          commands: [
            ['bun run dev', 'Bridge server (:5208) + Vite (:5108) together'],
            ['bun run server', 'Just the Bun gate/bridge server'],
            ['bun run build', 'Static production build to dist/ (page only)'],
            ['bun run typecheck', 'tsc --noEmit over server.ts, mcp.ts, readiness.ts, src/'],
          ],
          map: [
            ['src/task-list.aihu', 'The demo component a human and an agent both drive'],
            ['src/main.ts', 'Browser entry: capability-bridge client'],
            ['server.ts', 'Governed gate (auth scope + rate limit)'],
            ['readiness.ts', 'llms.txt + MCP/A2A cards, derived live from the registry'],
            ['mcp.ts', 'MCP stdio entry for standard MCP clients'],
          ],
        }),
      )
    }
    return writeFiles(root, files)
  }

  // Shared base for the vite-only templates (minimal | docs): the historical
  // 8-file set plus the agent-tooling trio (AGENTS.md / CLAUDE.md / .mcp.json,
  // opt out with agentTooling: false). The legacy-snapshot golden gates this
  // output; intentional changes here require a deliberate golden refresh.
  const indexPage = template === 'docs' ? appDocsIndexAihu(name) : appIndexAihu(name, withCssEngine)
  const files: Array<readonly [string, string]> = [
    ['package.json', appPackageJson(name, pm, withCssEngine)],
    ['vite.config.ts', appViteConfig(name, withCssEngine, shadowMode)],
    ['tsconfig.json', appTsConfig()],
    ['index.html', appIndexHtml(name)],
    ['src/main.ts', appMainTs(name)],
    ['src/pages/index.aihu', indexPage],
    ['.vscode/extensions.json', appVscodeExtensions()],
    ['.vscode/settings.json', appVscodeSettings()],
  ]

  if (template === 'docs') {
    // `docs` is a docs-flavored variant: a distinct landing page (above) plus a
    // second guide route.
    files.push(['src/pages/guide.aihu', appDocsGuideAihu(name)])
  }

  // Coding-assistant files, uniform across templates (the developer's editor
  // does not care which tier was scaffolded). `--no-agent-tooling` opts out.
  if (agentTooling) {
    files.push(...agentToolingFiles(viteTemplateAgentsFacts(name)))
  }

  return writeFiles(root, files)
}

/**
 * Scaffold a page file under `src/pages/`.
 *
 * Usage: `aihu page /about` -> `src/pages/about.aihu`
 */
export function scaffoldPage(routePath: string, outDir?: string): ScaffoldResult {
  const root = resolve(outDir ?? '.')
  const segments = routePath.replace(/^\//, '').split('/').filter(Boolean)
  const rel = segments.length > 0 ? `src/pages/${segments.join('/')}.aihu` : 'src/pages/index.aihu'
  return writeFiles(root, [[rel, pageAihu(routePath)]])
}

/**
 * Scaffold a component file under `src/components/`.
 *
 * Usage: `aihu component Card` -> `src/components/card.aihu`
 */
export function scaffoldComponent(name: string, outDir?: string): ScaffoldResult {
  const root = resolve(outDir ?? '.')
  const kebab = toKebab(name)
  return writeFiles(root, [[`src/components/${kebab}.aihu`, componentAihu(name)]])
}

/**
 * Scaffold a plugin package directory.
 *
 * Usage: `aihu plugin my-forms` -> `aihu-plugin-my-forms/`
 */
export function scaffoldPlugin(name: string, outDir?: string): ScaffoldResult {
  const kebab = toKebab(name)
  const root = resolve(outDir ?? '.', `aihu-plugin-${kebab}`)
  return writeFiles(root, [
    ['package.json', pluginPackageJson(name)],
    ['src/index.ts', pluginIndex(name)],
  ])
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function writeFiles(
  root: string,
  entries: ReadonlyArray<readonly [string, string]>,
): ScaffoldResult {
  const created: string[] = []
  const skipped: string[] = []

  for (const [rel, content] of entries) {
    const abs = join(root, rel)
    mkdirSync(dirname(abs), { recursive: true })
    if (!existsSync(abs)) {
      writeFileSync(abs, content, 'utf8')
      created.push(rel)
    } else {
      skipped.push(rel)
    }
  }

  return { created, skipped }
}

export function toKebab(name: string): string {
  return name
    .replace(/([A-Z])/g, (m) => `-${m.toLowerCase()}`)
    .replace(/^-/, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
}

/**
 * Convert a project name to a safe JS identifier (for use as rolldown input key
 * or custom-element tag name component). Strips leading digits, replaces
 * non-alphanumeric with hyphens.
 */
export function toSafe(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/^[^a-z]+/, '')
      .replace(/-+/g, '-')
      .replace(/-$/, '') || 'app'
  )
}
