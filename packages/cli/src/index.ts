/**
 * @scribe/cli — build-time CLI scaffolder for scribe applications.
 *
 * v0.8.1: `@scribe/cli` package exposing scaffold functions for `scribe app`,
 * `scribe page`, `scribe component`, and `scribe plugin` commands.
 *
 * v0.8.2: Hello World template — `npx scribe app <name>` produces a runnable
 * scribe application with Vite, router, runtime, and agent integrations wired.
 *
 * v0.8.5: Plugin scaffold template — `npx scribe plugin <name>` produces a
 * skeleton plugin package with `definePlugin` wired.
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

// ---------------------------------------------------------------------------
// App template generators (rolldown-first, v1 syntax)
// ---------------------------------------------------------------------------

/** package.json for a new scribe application. */
export function appPackageJson(name: string, pm: PkgManager = 'bun'): string {
  const _installCmd: Record<PkgManager, string> = {
    bun: 'bun install',
    pnpm: 'pnpm install',
    npm: 'npm install',
    yarn: 'yarn',
  }
  const devCmd = pm === 'bun' ? 'bun run dev' : `${pm} run dev`
  void devCmd // used in README generation
  return JSON.stringify(
    {
      name,
      version: '0.1.0',
      private: true,
      type: 'module',
      scripts: {
        dev: 'rolldown -c --watch',
        build: 'rolldown -c',
        typecheck: 'tsc --noEmit',
      },
      dependencies: {
        '@scribe/arbor': '^1.0.0',
        '@scribe/runtime': '^1.0.0',
        '@scribe/signals': '^1.0.0',
      },
      devDependencies: {
        '@scribe/cli': '^1.0.0',
        rolldown: '^1.0.0',
        typescript: '^5.0.0',
      },
      packageManager: pm === 'bun' ? `bun@${process.versions.bun ?? '1'}` : undefined,
    },
    null,
    2,
  )
}

/** rolldown.config.ts for a new application (replaces vite.config.ts). */
export function appRolldownConfig(name: string): string {
  return `import { defineConfig } from 'rolldown'
import { scribeCompilerPlugin } from '@scribe/compiler/plugin'

export default defineConfig({
  input: { ${toSafe(name)}: 'src/main.ts' },
  plugins: [scribeCompilerPlugin()],
  moduleTypes: {
    '.scribe': 'ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
  },
})
`
}

/** tsconfig.json for a new scribe application. */
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

/** src/main.ts entry point for a new scribe app. */
export function appMainTs(_name: string): string {
  return `import { createApp } from '@scribe/app/client'\n\ncreateApp()\n`
}

/** index.html for a new scribe application. */
export function appIndexHtml(name: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${name}</title>
  <script type="module" src="./dist/${toSafe(name)}.js"></script>
</head>
<body>
  <${toSafe(name)}-root></${toSafe(name)}-root>
</body>
</html>
`
}

/** scribe.config.ts — kept for server/SSR config; optional for client-only apps. */
export function appScribeConfig(): string {
  return "import { defineScribeConfig } from '@scribe/server'\nimport { definePlugin as data } from '@scribe/data'\nimport { definePlugin as agent } from '@scribe/agent'\n\nexport default defineScribeConfig({\n  build: { target: 'universal' },\n  plugins: [data(), agent()],\n})\n"
}

/** @deprecated Use appRolldownConfig instead. Kept for backward compat. */
export function appViteConfig(): string {
  return appRolldownConfig('app')
}

/** src/pages/index.scribe for Hello World (v1 syntax). */
export function appIndexScribe(appName: string = 'app'): string {
  const _tag = `${toSafe(appName)}-root`
  return `@state {
import { signal } from '@scribe/signals'

const [count, setCount] = signal(0)
const increment = () => setCount(c => c + 1)
}

@template {
  <div class="home">
    <h1>Hello from scribe</h1>
    <p>Count: {{ count }}</p>
    <button $on:click={increment}>+1</button>
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

/** src/layouts/default.scribe for Hello World (v1 syntax). */
export function appDefaultLayout(): string {
  return '@template {\n  <div class="layout">\n    <slot />\n  </div>\n}\n\n@style {\n.layout {\n  max-width: 1200px;\n  margin: 0 auto;\n}\n}\n'
}

/** A page file for a given route path. */
export function pageScribe(routePath: string): string {
  const name = routePath.replace(/^\//, '').replace(/\//g, '-') || 'page'
  return `@route {\n  name: '${name}'\n}\n\n@template {\n  <div class="${name}">\n    <h1>${name}</h1>\n  </div>\n}\n`
}

/** A component file for a given component name. */
export function componentScribe(name: string): string {
  const kebab = toKebab(name)
  return `@template {\n  <div class="${kebab}">\n    <!-- ${name} component -->\n  </div>\n}\n`
}

/** package.json for a new scribe plugin. */
export function pluginPackageJson(name: string): string {
  const kebab = toKebab(name)
  return JSON.stringify(
    {
      name: `scribe-plugin-${kebab}`,
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
        '@scribe/plugin': '^0.8.0',
      },
    },
    null,
    2,
  )
}

/** src/index.ts for a new scribe plugin. */
export function pluginIndex(name: string): string {
  const kebab = toKebab(name)
  return `import { definePlugin, type Plugin } from '@scribe/plugin'\n\nconst plugin: Plugin = definePlugin({\n  name: '${name}',\n  version: '0.1.0',\n  namespace: '${kebab}',\n  contributes: {\n    blocks: [],\n    macros: [],\n  },\n})\n\nexport default plugin\n`
}

// ---------------------------------------------------------------------------
// Scaffold functions — write template files to disk
// ---------------------------------------------------------------------------

/**
 * Scaffold a new scribe application at `<outDir>/<name>/`.
 *
 * v1.0: Uses rolldown (not Vite), v1 @state/{@template}/{@style} syntax.
 * Produces: package.json, rolldown.config.ts, tsconfig.json,
 *   index.html, src/main.ts, src/pages/index.scribe
 */
export function scaffoldApp(
  name: string,
  outDir?: string,
  opts?: { pm?: PkgManager; template?: AppTemplate },
): ScaffoldResult {
  const pm = opts?.pm ?? 'bun'
  const root = resolve(outDir ?? '.', name)
  return writeFiles(root, [
    ['package.json', appPackageJson(name, pm)],
    ['rolldown.config.ts', appRolldownConfig(name)],
    ['tsconfig.json', appTsConfig()],
    ['index.html', appIndexHtml(name)],
    ['src/main.ts', appMainTs(name)],
    ['src/pages/index.scribe', appIndexScribe(name)],
  ])
}

/**
 * Scaffold a page file under `src/pages/`.
 *
 * Usage: `scribe page /about` -> `src/pages/about.scribe`
 */
export function scaffoldPage(routePath: string, outDir?: string): ScaffoldResult {
  const root = resolve(outDir ?? '.')
  const segments = routePath.replace(/^\//, '').split('/').filter(Boolean)
  const rel =
    segments.length > 0 ? `src/pages/${segments.join('/')}.scribe` : 'src/pages/index.scribe'
  return writeFiles(root, [[rel, pageScribe(routePath)]])
}

/**
 * Scaffold a component file under `src/components/`.
 *
 * Usage: `scribe component Card` -> `src/components/card.scribe`
 */
export function scaffoldComponent(name: string, outDir?: string): ScaffoldResult {
  const root = resolve(outDir ?? '.')
  const kebab = toKebab(name)
  return writeFiles(root, [[`src/components/${kebab}.scribe`, componentScribe(name)]])
}

/**
 * Scaffold a plugin package directory.
 *
 * Usage: `scribe plugin my-forms` -> `scribe-plugin-my-forms/`
 */
export function scaffoldPlugin(name: string, outDir?: string): ScaffoldResult {
  const kebab = toKebab(name)
  const root = resolve(outDir ?? '.', `scribe-plugin-${kebab}`)
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
