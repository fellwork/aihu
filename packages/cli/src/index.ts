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

/** package.json for a new scribe application. */
export function appPackageJson(name: string): string {
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
      },
      dependencies: {
        '@scribe/agent': '^0.8.0',
        '@scribe/arbor': '^0.8.0',
        '@scribe/router': '^0.8.0',
        '@scribe/runtime': '^0.8.0',
        '@scribe/server': '^0.8.0',
        '@scribe/signals': '^0.8.0',
      },
      devDependencies: {
        '@scribe/cli': '^0.8.0',
        vite: '^5.0.0',
      },
    },
    null,
    2,
  )
}

/** scribe.config.ts for a new application. */
export function appScribeConfig(): string {
  return "import { defineScribeConfig } from '@scribe/server'\nimport { definePlugin as data } from '@scribe/data'\nimport { definePlugin as agent } from '@scribe/agent'\n\nexport default defineScribeConfig({\n  build: { target: 'universal' },\n  plugins: [data(), agent()],\n})\n"
}

/** vite.config.ts for a new application. */
export function appViteConfig(): string {
  return "import { defineConfig } from 'vite'\nimport { viteRouterIntegration } from '@scribe/router/plugin'\nimport { viteAgentReadinessIntegration } from '@scribe/agent-readiness'\n\nexport default defineConfig({\n  plugins: [\n    viteRouterIntegration({ pagesDir: 'src/pages' }),\n    viteAgentReadinessIntegration(),\n  ],\n})\n"
}

/** src/pages/index.scribe for Hello World. */
export function appIndexScribe(): string {
  return "@route {\n  name: 'home',\n  layout: 'default'\n}\n\n@state {\n  $prop name: string = 'world'\n}\n\n@template {\n  <div class=\"home\">\n    <h1>Hello {{ name }}</h1>\n  </div>\n}\n\n@style {\n  .home {\n    padding: 2rem;\n    font-family: sans-serif;\n  }\n}\n"
}

/** src/layouts/default.scribe for Hello World. */
export function appDefaultLayout(): string {
  return "@template {\n  <div class=\"layout\">\n    <$slot />\n  </div>\n}\n\n@style {\n  .layout {\n    max-width: 1200px;\n    margin: 0 auto;\n  }\n}\n"
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
 * v0.8.2: Produces package.json, scribe.config.ts, vite.config.ts,
 * src/pages/index.scribe, src/layouts/default.scribe.
 */
export function scaffoldApp(name: string, outDir?: string): ScaffoldResult {
  const root = resolve(outDir ?? '.', name)
  return writeFiles(root, [
    ['package.json', appPackageJson(name)],
    ['scribe.config.ts', appScribeConfig()],
    ['vite.config.ts', appViteConfig()],
    ['src/pages/index.scribe', appIndexScribe()],
    ['src/layouts/default.scribe', appDefaultLayout()],
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
