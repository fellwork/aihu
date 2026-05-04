import { cp, mkdir, writeFile as fsWriteFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, resolve as resolvePath } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'
import type { ScribeConfig } from './config.ts'
import type { AdapterContext, CreateHandlerSourceOptions } from './adapter.ts'
import type { RouteDefinition } from '@scribe/router'

// Build-time sub-plugin imports. These are devDependencies of @scribe/app and
// are marked external in rolldown.config.ts — they are never bundled.
import { scribeCompilerPlugin } from '@scribe/compiler'
import { viteRouterIntegration, scanPages } from '@scribe/router/plugin'

/** Map a pages-dir file path to a minimal RouteDefinition for adapter context. */
function fileToRouteDefinition(
  filePath: string,
  root: string,
  pagesDir: string,
): RouteDefinition {
  // Derive a URL pattern from the file path relative to the pages directory.
  const rel = filePath
    .replace(/\\/g, '/')
    .replace(new RegExp(`^.*?${pagesDir}/`), '')
    .replace(/\.[^.]+$/, '') // strip extension
  const parts = rel.split('/').filter(Boolean)
  // Strip trailing 'index' segment (file-router convention)
  if (parts.length > 0 && parts[parts.length - 1] === 'index') parts.pop()

  const segments = parts.map((p) =>
    p.startsWith('[...') && p.endsWith(']')
      ? { kind: 'catchall' as const }
      : p.startsWith('[') && p.endsWith(']')
        ? { kind: 'param' as const, name: p.slice(1, -1) }
        : { kind: 'static' as const, path: p },
  )

  const pattern = segments.length === 0
    ? '/'
    : '/' + segments
        .map((s) => (s.kind === 'static' ? s.path : s.kind === 'param' ? `:${s.name}` : '*'))
        .join('/')

  return {
    pattern,
    segments,
    module: () => Promise.resolve({ default: null }),
  }
}

/** Build the AdapterContext object passed to adapter.adapt(). */
function buildAdapterContext(
  resolvedViteConfig: ResolvedConfig,
  routeFiles: string[],
  config: ScribeConfig | undefined,
): AdapterContext {
  const outDir = resolvePath(
    resolvedViteConfig.root,
    resolvedViteConfig.build.outDir,
  )
  const root = resolvedViteConfig.root
  const pagesDir = config?.dir?.pages ?? 'pages'

  const routes: RouteDefinition[] = routeFiles.map((f) =>
    fileToRouteDefinition(f, root, pagesDir),
  )

  return {
    outDir,
    root,
    routes,
    config: config ?? {},

    async emitFile(path: string, content: string): Promise<void> {
      const abs = resolvePath(outDir, path)
      await mkdir(dirname(abs), { recursive: true })
      await fsWriteFile(abs, content, 'utf8')
    },

    async copy(src: string, dest: string): Promise<void> {
      await mkdir(dirname(dest), { recursive: true })
      await cp(src, dest, { recursive: true, force: true })
    },

    async writeFile(absolutePath: string, content: string): Promise<void> {
      await mkdir(dirname(absolutePath), { recursive: true })
      await fsWriteFile(absolutePath, content, 'utf8')
    },

    createHandlerSource(opts?: CreateHandlerSourceOptions): string {
      const routesSpec = opts?.routesSpecifier ?? './routes-manifest.js'
      const serverSpec = opts?.serverSpecifier ?? '@scribe/server'
      return [
        `// AUTO-GENERATED — do not edit`,
        `import { createRequestRouter } from '${serverSpec}'`,
        `import routes from '${routesSpec}'`,
        `const _manifest = { routes }`,
        `const _handler = createRequestRouter(_manifest)`,
        `export { _handler as handler }`,
      ].join('\n')
    },
  }
}

/**
 * viteScribePlugin() — composed Vite plugin for scribe SPA projects.
 *
 * Returns Plugin[] composing:
 *   [0] scribeCompilerPlugin (enforce:'pre') — transforms .scribe SFCs
 *   [1] viteRouterIntegration — serves virtual:scribe-routes + virtual:scribe-layouts
 *   [2] scribe-agent-readiness (opt-in) or no-op
 *   [3..n] user plugins from config.plugins
 *   [n+1] scribe-vite-passthrough (merges config.vite into Vite's resolved config)
 *   [n+2] scribe-adapter (adapter.adapt() on closeBundle, build mode only)
 *
 * @example
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import { viteScribePlugin } from '@scribe/app'
 * export default defineConfig({ plugins: [viteScribePlugin()] })
 *
 * @example
 * // With adapter
 * import { cloudflare } from '@scribe/adapter-cloudflare'
 * export default defineConfig({
 *   plugins: [viteScribePlugin({
 *     dir: { pages: 'src/pages' },
 *     adapter: cloudflare({ name: 'my-worker' }),
 *   })]
 * })
 */
export function viteScribePlugin(config?: ScribeConfig): Plugin[] {
  const routerOpts = {
    pagesDir: config?.dir?.pages ?? 'pages',
    layoutsDir: config?.dir?.layouts ?? 'src/layouts',
  }

  // Agent readiness: opt-in only. No safe default for `name`.
  let agentPlugin: Plugin
  const ar = config?.agentReadiness
  if (ar) {
    // Dynamic import to avoid pulling @scribe/agent-readiness into the bundle
    // when it is not configured. The `require` below is evaluated at runtime
    // in Node.js (vite.config.ts execution context), not in the browser.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { viteAgentReadinessIntegration } = require(
      '@scribe/agent-readiness',
    ) as typeof import('@scribe/agent-readiness')
    agentPlugin = viteAgentReadinessIntegration(ar) as unknown as Plugin
  } else {
    // Stable no-op so plugin-inspector shows a meaningful entry
    agentPlugin = { name: 'scribe-agent-readiness-disabled' }
  }

  // Vite config passthrough — deep-merged by Vite via the config() hook return value.
  const passthroughPlugin: Plugin = {
    name: 'scribe-vite-passthrough',
    config() {
      return (config?.vite ?? {}) as import('vite').UserConfig
    },
  }

  // Adapter sentinel — calls adapter.adapt() after build completes.
  // Registered unconditionally; short-circuits immediately if no adapter is set.
  let resolvedViteConfig: ResolvedConfig | null = null

  const adapterPlugin: Plugin = {
    name: 'scribe-adapter',
    apply: 'build',
    configResolved(rc) {
      resolvedViteConfig = rc
    },
    async closeBundle() {
      const adapter = config?.adapter
      if (!adapter || !resolvedViteConfig) return

      const pagesDir = config?.dir?.pages ?? 'pages'
      const { routes: routeFiles } = scanPages(resolvedViteConfig.root, pagesDir)
      const context = buildAdapterContext(resolvedViteConfig, routeFiles, config)

      try {
        await adapter.adapt(context)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.error(`[@scribe/app] Adapter '${adapter.name}' failed: ${msg}`)
      }
    },
  }

  return [
    scribeCompilerPlugin() as unknown as Plugin,
    viteRouterIntegration(routerOpts) as unknown as Plugin,
    agentPlugin,
    ...((config?.plugins ?? []) as Plugin[]),
    passthroughPlugin,
    adapterPlugin,
  ]
}
