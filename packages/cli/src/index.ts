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
export type AppTemplate = 'minimal' | 'full' | 'docs'

/** Out-of-the-box CSS strategy for a scaffolded app. */
export type CssChoice = 'engine' | 'none'
/** Shadow-DOM mode threaded into the compiler when css-engine is opted in. */
export type ShadowChoice = 'open' | 'closed' | 'none'

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
        typecheck: 'tsc --noEmit',
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
        '@aihu/cli': 'latest',
        '@aihu/compiler': 'latest',
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
export function appViteConfig(withCssEngine = false, shadowMode: ShadowChoice = 'open'): string {
  // Default path (css off) and css-engine in the default `open` mode both emit
  // the SAME plugin options — `open` is the compiler default, so a redundant
  // `css: { shadowMode: 'open' }` is never written. css-engine in open mode
  // adds only a clarifying comment. Only `closed`/`none` emit an explicit
  // `css: { shadowMode }` block.
  const emitCssBlock = withCssEngine && shadowMode !== 'open'
  const cssEngineComment = withCssEngine
    ? `      // @aihu/css-engine utility classes fold into each component's shadow
      // <style> automatically. Set \`css: { shadowMode: 'none' }\` only to style
      // light-DOM / external child elements (css-engine is scoped, not global).
`
    : ''
  const cssBlock = emitCssBlock ? `      css: { shadowMode: '${shadowMode}' },\n` : ''
  return `import { viteAihuPlugin } from '@aihu/app'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    viteAihuPlugin({
${cssEngineComment}      dir: { pages: 'src/pages' },
${cssBlock}    }),
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
  const _tag = `${toSafe(appName)}-root`
  if (withCssEngine) {
    return `@state {
import { signal } from '@aihu/signals'

const [count, setCount] = signal(0)
const increment = () => setCount(c => c + 1)
}

@template {
  <div class="flex flex-col gap-4 max-w-7xl mx-auto p-8">
    <h1 class="text-3xl font-bold">Hello from aihu</h1>
    <p class="text-lg">Count: {count}</p>
    <button class="px-4 py-2 rounded-lg bg-primary text-white" $on.click={increment}>+1</button>
  </div>
}
`
  }
  return `@state {
import { signal } from '@aihu/signals'

const [count, setCount] = signal(0)
const increment = () => setCount(c => c + 1)
}

@template {
  <div class="home">
    <h1>Hello from aihu</h1>
    <p>Count: {count}</p>
    <button $on.click={increment}>+1</button>
  </div>
}

@style {
.home {
  padding: 2rem;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  max-width: 600px;
  margin: 0 auto;
}
button {
  padding: 8px 16px;
  cursor: pointer;
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
export function appAboutAihu(): string {
  return `@route {
  name: 'about'
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
  return `@state {
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
    <button class="toggle" $on.click={toggle}>{open ? 'Hide' : 'Show'} details</button>
    <section $if={open} class="details">
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
export function appDocsGuideAihu(): string {
  return `@route {
  name: 'guide'
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
  return `@route {\n  name: '${name}'\n}\n\n@template {\n  <div class="${name}">\n    <h1>${name}</h1>\n  </div>\n}\n`
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
    /** Shadow mode when css-engine is opted in. Default `'open'` (scoped shadow fold). */
    shadowMode?: ShadowChoice
  },
): ScaffoldResult {
  const pm = opts?.pm ?? 'bun'
  const template: AppTemplate = opts?.template ?? 'minimal'
  const withCssEngine = opts?.css === 'engine'
  const shadowMode = opts?.shadowMode ?? 'open'
  const root = resolve(outDir ?? '.', name)

  // Shared base across every template. `minimal` is exactly this set (8 files),
  // byte-identical to the historical scaffold (modulo the trustedDependencies
  // line) so the legacy-snapshot golden + default-e2e stay green.
  const indexPage = template === 'docs' ? appDocsIndexAihu(name) : appIndexAihu(name, withCssEngine)
  const files: Array<readonly [string, string]> = [
    ['package.json', appPackageJson(name, pm, withCssEngine)],
    ['vite.config.ts', appViteConfig(withCssEngine, shadowMode)],
    ['tsconfig.json', appTsConfig()],
    ['index.html', appIndexHtml(name)],
    ['src/main.ts', appMainTs(name)],
    ['src/pages/index.aihu', indexPage],
    ['.vscode/extensions.json', appVscodeExtensions()],
    ['.vscode/settings.json', appVscodeSettings()],
  ]

  if (template === 'full') {
    // `full` demonstrates router multi-page + a shared layout. Client-buildable
    // files only — no @aihu/server dependency.
    files.push(['src/layouts/default.aihu', appDefaultLayout()])
    files.push(['src/pages/about.aihu', appAboutAihu()])
  } else if (template === 'docs') {
    // `docs` is a docs-flavored variant: a distinct landing page (above) plus a
    // second guide route.
    files.push(['src/pages/guide.aihu', appDocsGuideAihu()])
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
