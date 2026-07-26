import { cp, writeFile as fsWriteFile, mkdir } from 'node:fs/promises'
import { dirname, resolve as resolvePath } from 'node:path'
// Build-time sub-plugin imports. These are devDependencies of @aihu/app and
// are marked external in rolldown.config.ts — they are never bundled.
import { aihuCompilerPlugin, compileRouteMeta } from '@aihu/compiler'
import type { RouteDefinition } from '@aihu/router'
import type { RouterPluginOptions } from '@aihu/router/plugin'
import { scanPages, viteRouterIntegration } from '@aihu/router/plugin'
import type { Plugin, PluginOption, ResolvedConfig } from 'vite'
import type { AdapterContext, CreateHandlerSourceOptions } from './adapter.ts'
import type { AihuConfig } from './config.ts'
import { validateAihuConfig } from './config.ts'
import { applyHeadConfig } from './head.ts'
import { AIHU_CONFIG_PLUGIN, type AihuModuleApi, type AihuPluginApi } from './load-config.ts'
import { prerenderClose } from './prerender.ts'

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
 *   [3] aihu-head (injects config.app.head into index.html <head>)
 *   [4..n] user plugins from config.plugins
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
export function viteAihuPlugin(config?: AihuConfig): PluginOption[] {
  // Validate the inline config the same way `defineConfig` does. Previously
  // only configs written through `defineConfig` were checked, so passing the
  // object straight to this function — which every example does — skipped
  // validation entirely. Now that the Vite config is becoming the canonical
  // home for aihu config, this is the path that matters most.
  const resolved: AihuConfig = config ?? {}
  validateAihuConfig(resolved)

  // Marker plugin: carries the evaluated config on a public `api` handle so
  // non-Vite consumers (aihu add / dev / build, the language server, the VS
  // Code extension) can read it via `loadAihuConfig()` without running a
  // build. Modelled on Qwik's `QwikVitePluginApi`.
  //
  // This is what lets the Vite config be the single source of truth: tooling
  // reads the EVALUATED config — spreads, conditionals, computed values and
  // imported fragments all work, because the config genuinely ran.
  const configMarkerPlugin: Plugin = {
    name: AIHU_CONFIG_PLUGIN,
    api: {
      getAihuConfig: () => resolved,
      // @aihu/app declares itself under the same module contract every other
      // package uses, so nothing has to special-case the framework's own entry.
      aihuModule: '@aihu/app',
      getOptions: () => resolved,
    } satisfies AihuPluginApi & AihuModuleApi<AihuConfig>,
  }

  const routerOpts = {
    pagesDir: config?.dir?.pages ?? 'pages',
    layoutsDir: config?.dir?.layouts ?? 'src/layouts',
    // `componentsDir` has existed on RouterPluginOptions all along but was
    // unreachable from aihu.config.ts — changing it meant calling
    // viteRouterIntegration() yourself, i.e. abandoning viteAihuPlugin.
    ...(config?.dir?.components != null ? { componentsDir: config.dir.components } : {}),
    // Give the router's route generator the compiler's route-metadata extractor
    // so per-route head/middleware/params/ssr flow into virtual:aihu-routes in
    // SPA builds (no .route.json sidecar is written on the stdin compile path).
    // Cast bridges compiler's `RouteMeta` (head: unknown) to the router's
    // `RouteSidecar` (head: RouteHead) — the shapes are otherwise identical.
    compileRouteMeta: compileRouteMeta as unknown as NonNullable<
      RouterPluginOptions['compileRouteMeta']
    >,
  } satisfies RouterPluginOptions

  // Agent readiness: opt-in only. No safe default for `name`.
  let agentPlugin: PluginOption
  const ar = config?.agentReadiness
  if (ar) {
    // Lazy-load @aihu-plugin/agent-readiness so it isn't pulled in when unused.
    // It is an ESM-only package (its `exports` expose no CJS/`require` entry), and
    // vite loads vite.config.ts as bundled ESM where the bare `require` global
    // doesn't exist — so neither `require(...)` nor createRequire works here
    // (createRequire uses CJS resolution → ERR_PACKAGE_PATH_NOT_EXPORTED). A
    // dynamic `import()` uses the ESM `import` condition and resolves correctly;
    // Vite accepts the resulting `Promise<Plugin>` as a plugin entry and awaits it.
    agentPlugin = import('@aihu-plugin/agent-readiness').then(
      ({ viteAgentReadinessIntegration }) => viteAgentReadinessIntegration(ar) as unknown as Plugin,
    )
  } else {
    // Stable no-op so plugin-inspector shows a meaningful entry
    agentPlugin = { name: 'aihu-agent-readiness-disabled' }
  }

  // Head injection — applies config.app.head into the built index.html <head>.
  // Without this hook the configured global head (title/charset/viewport/meta)
  // is silently dropped from SPA/static output, hurting SEO and non-JS agents.
  const headPlugin: Plugin = {
    name: 'aihu-head',
    transformIndexHtml: {
      // Run after Vite's core HTML processing so our config wins over the
      // scaffold defaults present in the source index.html.
      order: 'post',
      handler(html: string): string {
        return applyHeadConfig(html, config?.app?.head)
      },
    },
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

  // SSG prerender — active only when `output: 'static'`. Runs after Vite writes
  // the SPA build and before the adapter (so an adapter, if present, sees the
  // per-route HTML). Prerenders every static route to a content-ful
  // `<pattern>/index.html` that hydrates into the SPA. `output: 'spa'` is a
  // no-op here, preserving the existing empty-shell behavior.
  let ssgResolvedConfig: ResolvedConfig | null = null
  const ssgPlugin: Plugin = {
    name: 'aihu-ssg',
    apply: 'build',
    configResolved(rc) {
      ssgResolvedConfig = rc
    },
    // Run before the adapter's closeBundle (plugin order in the array is honored
    // for sequential closeBundle hooks).
    async closeBundle() {
      if (config?.output !== 'static' || !ssgResolvedConfig) return
      try {
        await prerenderClose(ssgResolvedConfig, config, (msg) => this.warn(msg))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.error(`[@aihu/app] static (SSG) prerender failed: ${msg}`)
      }
    },
  }

  return [
    // First: the marker plugin carrying the evaluated config on its `api`
    // handle. Position is not load-bearing for the build, but keeping it first
    // means anything scanning the array finds it immediately.
    configMarkerPlugin,
    // SPA mode: route components are top-level mounts that frequently use
    // lifecycle hooks (onMount/onCleanup) and rely on the runtime/signals
    // owner context regardless of whether they call signal() directly. The
    // static-island optimization is unsafe to apply silently here — it strips
    // defineComponent and breaks `no owner` for any module touching lifecycle.
    // It also saves ~0 B in practice because the runtime already ships in the
    // main bundle. Default islands off; opt back in via the compiler plugin
    // directly if you genuinely have an MPA-style mixed-island layout.
    // `css.shadowMode` (when set) forwards to the compiler's per-plugin
    // shadowMode injection — required for consumers using `@aihu/css-engine`
    // utility classes (or any cascade-dependent CSS framework) which need
    // `'light'` so styles aren't trapped in shadow roots.
    aihuCompilerPlugin({
      // `islands` was hardcoded false here, with the comment above telling the
      // reader to "opt back in via the compiler plugin directly" — a framework
      // documenting a workaround instead of exposing an option. It is now
      // `compiler.islands`, still defaulting to false.
      islands: config?.compiler?.islands ?? false,
      ...(config?.compiler?.target != null ? { target: config.compiler.target } : {}),
      // Compile layouts (under the same dir the router scans) in layout mode:
      // namespaced tag + passive <outlet> marker the client renderer fills.
      layoutsDir: routerOpts.layoutsDir,
      ...(config?.css?.shadowMode != null ? { shadowMode: config.css.shadowMode } : {}),
    }) as unknown as Plugin,
    viteRouterIntegration(routerOpts) as unknown as Plugin,
    agentPlugin,
    headPlugin,
    ...((config?.plugins ?? []) as Plugin[]),
    passthroughPlugin,
    ssgPlugin,
    adapterPlugin,
  ]
}
