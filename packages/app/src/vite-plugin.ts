import { existsSync } from 'node:fs'
import { cp, writeFile as fsWriteFile, mkdir } from 'node:fs/promises'
import { basename, dirname, join, resolve as resolvePath } from 'node:path'
// Build-time sub-plugin imports. These are devDependencies of @aihu/app and
// are marked external in rolldown.config.ts — they are never bundled.
import {
  _deriveChildTags,
  _isLayoutFile,
  _layoutTag,
  _parseComponentTagsMarker,
  aihuCompilerPlugin,
  compileRouteMeta,
  transform,
} from '@aihu/compiler'
import type { RouteDefinition } from '@aihu/router'
import type { RouterPluginOptions } from '@aihu/router/plugin'
import { scanPages, viteRouterIntegration } from '@aihu/router/plugin'
import type { Plugin, PluginOption, ResolvedConfig, UserConfig } from 'vite'
import type { AdapterContext, CreateHandlerSourceOptions } from './adapter.ts'
import type { AihuConfig } from './config.ts'
import { validateAihuConfig } from './config.ts'
import { ENTRY_RESOLVED_ID, ENTRY_SOURCE, ENTRY_VIRTUAL_ID, injectEntryScript } from './entry.ts'
import { applyHeadConfig } from './head.ts'
import { AIHU_CONFIG_PLUGIN, type AihuModuleApi, type AihuPluginApi } from './load-config.ts'
import { prerenderClose } from './prerender.ts'
import {
  buildServerEntrySource,
  SERVER_ENTRY_RESOLVED_ID,
  SERVER_ENTRY_VIRTUAL_ID,
} from './server-entry.ts'

/**
 * Where the `'ssr'` environment writes: a SIBLING of the client outDir, never
 * inside it.
 *
 * D-2: Cloudflare's `[assets] directory` serves the client outDir verbatim, so
 * SSR chunks written into it become publicly downloadable — server code, route
 * modules, and anything they close over, on a public URL. The two environments
 * need separate roots, and the server one must sit OUTSIDE the assets root.
 *
 * Derived from the client outDir rather than hardcoded, so a project that
 * renames `dist` does not silently get a `dist-server` unrelated to it.
 */
function ssrOutDirFor(clientOutDir: string): string {
  return `${clientOutDir.replace(/[/\\]+$/, '')}-server`
}

/** Build input name → `dist-server/_worker.js`. */
const SSR_ENTRY_NAME = '_worker'

/**
 * Derive a `.aihu` file's server-render child tags for `genSC`.
 *
 * `transform` is content-addressed-memoized, so a file the build is about to
 * compile anyway costs one spawn total, not two. `target: 'server'` is
 * required: client/universal output carries no `__aihu_schild` call sites, so
 * any other target silently yields an empty edge set and prunes the whole
 * registry away.
 *
 * ## Why this needs the layouts dir
 *
 * `genSC` roots its reachability walk at the LAYOUTS as well as the pages, so
 * this function is now handed layout files — and a layout compiles in LAYOUT
 * MODE, under the namespaced `aihu-layout-<stem>` tag. Compiling one as an
 * ordinary component derives its tag from the file stem instead, and the
 * common case (`src/layouts/app.aihu`) then fails the build outright with C450:
 * `'app'` has no hyphen, so it could never register as a custom element.
 *
 * That is not hypothetical — it is exactly what the Workers-SSR e2e gate
 * caught the moment layouts became roots, and only that test caught it, because
 * it is the only one that runs a real `vite build` over a real layout file.
 *
 * The layout-mode decision is `@aihu/compiler`'s `_isLayoutFile` + `_layoutTag`
 * — the SAME pair `aihuCompilerPlugin`'s own transform uses. Reused rather than
 * re-derived: a second definition of "is this a layout, and what does it
 * register as" would drift from the plugin's the first time the convention
 * moved, and the two disagreeing means a layout whose children are silently
 * pruned from the server bundle.
 */
function makeDeriveChildTags(layoutsDir: string): (source: string, id: string) => string[] {
  return (source, id) => {
    const isLayout = _isLayoutFile(id, layoutsDir)
    const compiled = transform(source, id, {
      target: 'server',
      ...(isLayout ? { tag: _layoutTag(basename(id, '.aihu')) } : {}),
    }).code
    // ── Layouts use a DIFFERENT edge set, and the reason is a compiler fact,
    // not a preference.
    //
    // Measured on the server target: a compiled PAGE exports `__ssr` AND
    // `__ssrString`; a compiled LAYOUT exports `__ssr` only. `_deriveChildTags`
    // reads `__aihu_schild('<tag>'` call sites, which live exclusively in
    // `__ssrString` — so for every layout it returns `[]`. Rooting the walk at
    // layouts while deriving their edges that way would have added a root set
    // that can never contribute anything, which is worse than not adding it:
    // it looks done.
    //
    // A layout therefore renders through the WALKER, and the walker resolves a
    // child from the registry by tag on its own (`ssr.ts`'s child-component
    // arm), so the tags that matter for a layout are the ones its TEMPLATE
    // references — the `// @aihu:component-tags` marker, which the layout's
    // server output does carry.
    //
    // ACCEPTED TRADE, stated because it is real: the marker is the strictly
    // LARGER set. It counts references the walker will decline at render time
    // (one carrying attributes, one with children, one at a non-literal path),
    // so a layout can pull a module into the server bundle for an element that
    // renders empty. That is upload weight, and upload weight is the currency
    // on a Worker — but the alternative for layouts is the EMPTY set, i.e. a
    // site's entire nav and footer rendering blank on every route. Over-
    // inclusion by a reference or two beats that, and it stops being a trade
    // the moment the compiler emits `__ssrString` for layouts too.
    return isLayout ? _parseComponentTagsMarker(compiled) : _deriveChildTags(compiled)
  }
}

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
 *   [3] aihu-entry — serves virtual:aihu-entry (createApp() with no options) and
 *       injects its <script> tag into index.html when no src/main.ts exists
 *   [4] aihu-head (injects config.app.head into index.html <head>)
 *   [5..n] user plugins from config.plugins
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
    // Injected the same way, for the same reason: the router keeps zero
    // compiler dependency and `genSC` needs the compiler's ONE child-tag
    // derivation rather than a fourth copy of the rule.
    deriveChildTags: makeDeriveChildTags(config?.dir?.layouts ?? 'src/layouts'),
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

  // Virtual client entry — see packages/app/src/entry.ts for the full
  // rationale and the escape-hatch contract.
  let entryRoot = process.cwd()
  const entryPlugin: Plugin = {
    name: 'aihu-entry',
    configResolved(rc) {
      entryRoot = rc.root
    },
    resolveId(id) {
      return id === ENTRY_VIRTUAL_ID ? ENTRY_RESOLVED_ID : null
    },
    load(id) {
      return id === ENTRY_RESOLVED_ID ? ENTRY_SOURCE : null
    },
    transformIndexHtml: {
      // Run before Vite's core HTML processing (which resolves <script> src
      // attributes into the module graph) so an injected tag is picked up as
      // a build entry the same way an authored one would be.
      order: 'pre',
      handler(html: string): string {
        const hasUserEntry = existsSync(join(entryRoot, 'src/main.ts'))
        return injectEntryScript(html, hasUserEntry)
      },
    },
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

  /**
   * `closeBundle` fires ONCE PER ENVIRONMENT.
   *
   * Under `output: 'ssr'` there are two (`client` and `ssr`), and neither the
   * adapter hook nor the SSG prerender was guarded — both would run twice per
   * build. For the adapter that means `adapt()` twice (a second `_worker.js`
   * write, a second `wrangler.toml` check); for the prerender it means a whole
   * second prerender pass over an outDir that is not even its own, since the
   * `ssr` environment's `build.outDir` is `dist-server`.
   *
   * This is the one place a shipped `output: 'static'` build can regress, so it
   * is a named helper with its own test rather than an inline condition
   * duplicated at two call sites.
   *
   * `'spa'`/`'static'` builds have exactly one environment, which Vite names
   * `client` — so the guard is a no-op there and those modes take zero new
   * paths. `environment` is absent on pre-Environment-API Vite; treated as
   * client (the single-environment case) rather than skipped, or the guard
   * would silently disable the adapter on an older Vite.
   */
  function isClientEnvironment(ctx: { environment?: { name?: string } }): boolean {
    const name = ctx.environment?.name
    return name === undefined || name === 'client'
  }

  const adapterPlugin: Plugin = {
    name: 'aihu-adapter',
    apply: 'build',
    configResolved(rc) {
      resolvedViteConfig = rc
    },
    async closeBundle() {
      if (!isClientEnvironment(this)) return
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
      if (!isClientEnvironment(this)) return
      if (config?.output !== 'static' || !ssgResolvedConfig) return
      try {
        await prerenderClose(ssgResolvedConfig, config, (msg) => this.warn(msg))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        this.error(`[@aihu/app] static (SSG) prerender failed: ${msg}`)
      }
    },
  }

  // ── output: 'ssr' ─────────────────────────────────────────────────────────
  // Everything below is gated on `output === 'ssr'`, so 'spa' and 'static'
  // builds take zero new paths.
  const ssrEnabled = config?.output === 'ssr'

  /**
   * Serves `virtual:aihu-server-entry` and declares the `ssr` environment.
   *
   * The environment declaration and the module have to live in one plugin
   * because they are one fact: the virtual id is only reachable as a build
   * entry through `rollupOptions.input`. `build.ssr: 'virtual:…'` fails with
   * `[UNRESOLVED_ENTRY]` — Vite's ssr-entry path resolves against the
   * filesystem before any plugin's `resolveId` sees it.
   */
  const serverEntryPlugin: Plugin = {
    name: 'aihu-server-entry',
    apply: 'build',
    config(userConfig) {
      if (!ssrEnabled) return
      // The client outDir as this build will actually resolve it: aihu's own
      // `vite` passthrough first (it is the value the user wrote in the aihu
      // config), then whatever the Vite config already carries, then Vite's
      // default.
      const clientOutDir =
        config?.vite?.build?.outDir ??
        (userConfig as UserConfig | undefined)?.build?.outDir ??
        'dist'
      return {
        environments: {
          ssr: {
            // Bundle everything. The default for an SSR environment is to
            // EXTERNALIZE node_modules, which produces a `_worker.js` full of
            // bare specifiers that no Worker runtime can resolve — a bundle
            // that looks built and cannot deploy.
            resolve: { noExternal: true },
            build: {
              // D-2: OUTSIDE the client outDir, always a sibling.
              outDir: ssrOutDirFor(clientOutDir),
              emptyOutDir: true,
              // Workers runtimes are evergreen; the SSR default target is a
              // Node baseline that would down-level for no reason.
              target: 'esnext',
              rollupOptions: {
                input: { [SSR_ENTRY_NAME]: SERVER_ENTRY_VIRTUAL_ID },
                output: { entryFileNames: '[name].js', format: 'es' as const },
              },
            },
          },
        },
        builder: {
          async buildApp(builder: {
            environments: Record<string, unknown>
            build(env: unknown): Promise<unknown>
          }): Promise<void> {
            // Client FIRST. The SSR entry does not import client chunks, but
            // the adapter's `closeBundle` (client-only, see
            // `isClientEnvironment`) reads the finished client outDir, and an
            // adapter that inspects `dist-server` wants it to exist.
            const client = builder.environments.client
            if (client) await builder.build(client)
            const ssr = builder.environments.ssr
            if (ssr) await builder.build(ssr)
          },
        },
      } as unknown as import('vite').UserConfig
    },
    resolveId(id) {
      return id === SERVER_ENTRY_VIRTUAL_ID ? SERVER_ENTRY_RESOLVED_ID : null
    },
    load(id) {
      if (id !== SERVER_ENTRY_RESOLVED_ID) return null
      const adapter = config?.adapter
      const wrapper = adapter?.serverEntry?.({
        handler: 'handler',
        config: config ?? {},
      })
      if (adapter && adapter.serverEntry === undefined) {
        this.warn(
          `[@aihu/app] output: 'ssr' with adapter '${adapter.name}', which implements no ` +
            `serverEntry() — the server bundle exports a bare \`handler\` and carries no ` +
            `platform wrapper, so it is not deployable as-is.`,
        )
      }
      return buildServerEntrySource(wrapper)
    },
  }

  /**
   * D-1 — keep `node:module` out of the Worker bundle.
   *
   * `@aihu/server`'s `renderToString` reaches a lazy `await import('./native.js')`,
   * and the built `native.js` statically imports `node:module` for
   * `createRequire`. Rolldown chases the dynamic import and emits the chunk.
   * It is UNREACHABLE at runtime here — `loader.ts` short-circuits to the TS
   * walker whenever `children !== undefined`, which the SSR entry always passes —
   * but it is still uploaded, and workerd rejects the module specifier at deploy
   * time without `nodejs_compat`. A `wrangler deploy` failing on a client's
   * clock is not an acceptable way to discover that.
   *
   * `enforce: 'pre'` is LOAD-BEARING. Without it Vite's own resolver claims
   * `node:module` first (as an external builtin) and this hook never fires.
   *
   * The stub THROWS rather than returning a no-op `createRequire`: if the
   * unreachable path ever became reachable, a silently-broken `require` would
   * surface as a mystery render failure, whereas this names itself.
   */
  const NODE_MODULE_STUB_ID = '\0aihu:node-module-stub'
  const nodeModuleStubPlugin: Plugin = {
    name: 'aihu-node-module-stub',
    apply: 'build',
    enforce: 'pre',
    resolveId(id) {
      if (!ssrEnabled) return null
      if (this.environment?.name !== 'ssr') return null
      return id === 'node:module' || id === 'module' ? NODE_MODULE_STUB_ID : null
    },
    load(id) {
      if (id !== NODE_MODULE_STUB_ID) return null
      // NOTE: this source deliberately does NOT contain the literal string
      // this plugin intercepts, in a comment or a message. The Worker
      // deployability gate greps the emitted SSR bundle for that specifier, and
      // a stub that reintroduces it as text would make the gate fail on its own
      // fix — the "regex over emitted JS that matches a comment" failure.
      return [
        '// AUTO-GENERATED by @aihu/app — builtin stub for the Worker bundle.',
        '// Reached only if the native SSR loader is invoked, which the SSR entry',
        '// never does (it always passes `children`, and @aihu/server routes that',
        '// to the TS walker). Throws rather than no-oping so a future change that',
        '// DOES reach it says so instead of failing mysteriously.',
        'export function createRequire() {',
        "  throw new Error('[@aihu/app] the node builtin is unavailable in the SSR (Worker) bundle')",
        '}',
        'export default { createRequire }',
      ].join('\n')
    },
  }

  return [
    // First: the marker plugin carrying the evaluated config on its `api`
    // handle. Position is not load-bearing for the build, but keeping it first
    // means anything scanning the array finds it immediately.
    configMarkerPlugin,
    // `enforce: 'pre'`, so it must precede everything — including the compiler
    // plugin, which is also 'pre'. Vite sorts by enforce and then by array
    // order within a tier.
    nodeModuleStubPlugin,
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
    entryPlugin,
    headPlugin,
    ...((config?.plugins ?? []) as Plugin[]),
    passthroughPlugin,
    serverEntryPlugin,
    ssgPlugin,
    adapterPlugin,
  ]
}
