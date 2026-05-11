import { cp, writeFile as fsWriteFile, mkdir } from 'node:fs/promises'
import { dirname, resolve as resolvePath } from 'node:path'
// Build-time sub-plugin imports. These are devDependencies of @aihu/app and
// are marked external in rolldown.config.ts — they are never bundled.
import { aihuCompilerPlugin } from '@aihu/compiler'
import type { RouteDefinition } from '@aihu/router'
import { scanPages, viteRouterIntegration } from '@aihu/router/plugin'
import type { Plugin, ResolvedConfig } from 'vite'
import type { AdapterContext, CreateHandlerSourceOptions } from './adapter.ts'
import type { AihuConfig } from './config.ts'

/** Map a pages-dir file path to a minimal RouteDefinition for adapter context. */
function fileToRouteDefinition(filePath: string, _root: string, pagesDir: string): RouteDefinition {
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

  const pattern =
    segments.length === 0
      ? '/'
      : '/' +
        segments
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
  config: AihuConfig | undefined,
): AdapterContext {
  const outDir = resolvePath(resolvedViteConfig.root, resolvedViteConfig.build.outDir)
  const root = resolvedViteConfig.root
  const pagesDir = config?.dir?.pages ?? 'pages'

  const routes: RouteDefinition[] = routeFiles.map((f) => fileToRouteDefinition(f, root, pagesDir))

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
      const serverSpec = opts?.serverSpecifier ?? '@aihu/server'
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
 * viteAihuPlugin() — composed Vite plugin for aihu SPA projects.
 *
 * Returns Plugin[] composing:
 *   [0] aihuCompilerPlugin (enforce:'pre') — transforms .aihu SFCs
 *   [1] viteRouterIntegration — serves virtual:aihu-routes + virtual:aihu-layouts
 *   [2] aihu-agent-readiness (opt-in) or no-op
 *   [3..n] user plugins from config.plugins
 *   [n+1] aihu-vite-passthrough (merges config.vite into Vite's resolved config)
 *   [n+2] aihu-adapter (adapter.adapt() on closeBundle, build mode only)
 *
 * @example
 * // vite.config.ts
 * import { defineConfig } from 'vite'
 * import { viteAihuPlugin } from '@aihu/app'
 * export default defineConfig({ plugins: [viteAihuPlugin()] })
 *
 * @example
 * // With adapter
 * import { cloudflare } from '@aihu/adapter-cloudflare'
 * export default defineConfig({
 *   plugins: [viteAihuPlugin({
 *     dir: { pages: 'src/pages' },
 *     adapter: cloudflare({ name: 'my-worker' }),
 *   })]
 * })
 */
export function viteAihuPlugin(config?: AihuConfig): Plugin[] {
  const routerOpts = {
    pagesDir: config?.dir?.pages ?? 'pages',
    layoutsDir: config?.dir?.layouts ?? 'src/layouts',
  }

  // Agent readiness: opt-in only. No safe default for `name`.
  let agentPlugin: Plugin
  const ar = config?.agentReadiness
  if (ar) {
    // Dynamic import to avoid pulling @aihu-plugin/agent-readiness into the bundle
    // when it is not configured. The `require` below is evaluated at runtime
    // in Node.js (vite.config.ts execution context), not in the browser.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { viteAgentReadinessIntegration } =
      require('@aihu-plugin/agent-readiness') as typeof import('@aihu-plugin/agent-readiness')
    agentPlugin = viteAgentReadinessIntegration(ar) as unknown as Plugin
  } else {
    // Stable no-op so plugin-inspector shows a meaningful entry
    agentPlugin = { name: 'aihu-agent-readiness-disabled' }
  }

  // Vite config passthrough — deep-merged by Vite via the config() hook return value.
  const passthroughPlugin: Plugin = {
    name: 'aihu-vite-passthrough',
    config() {
      return (config?.vite ?? {}) as import('vite').UserConfig
    },
  }

  // Adapter sentinel — calls adapter.adapt() after build completes.
  // Registered unconditionally; short-circuits immediately if no adapter is set.
  let resolvedViteConfig: ResolvedConfig | null = null

  const adapterPlugin: Plugin = {
    name: 'aihu-adapter',
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
        this.error(`[@aihu/app] Adapter '${adapter.name}' failed: ${msg}`)
      }
    },
  }

  return [
    // SPA mode: route components are top-level mounts that frequently use
    // lifecycle hooks (onMount/onCleanup) and rely on the runtime/signals
    // owner context regardless of whether they call signal() directly. The
    // static-island optimization is unsafe to apply silently here — it strips
    // defineComponent and breaks `no owner` for any module touching lifecycle.
    // It also saves ~0 B in practice because the runtime already ships in the
    // main bundle. Default islands off; opt back in via the compiler plugin
    // directly if you genuinely have an MPA-style mixed-island layout.
    aihuCompilerPlugin({ islands: false }) as unknown as Plugin,
    viteRouterIntegration(routerOpts) as unknown as Plugin,
    agentPlugin,
    ...((config?.plugins ?? []) as Plugin[]),
    passthroughPlugin,
    adapterPlugin,
  ]
}
