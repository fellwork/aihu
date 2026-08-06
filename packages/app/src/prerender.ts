/**
 * SSG prerender (B4, SEO arc) — build-time only.
 *
 * When `output: 'static'`, this module runs in `viteAihuPlugin`'s `closeBundle`
 * after Vite has written the SPA build. For every STATIC route it:
 *
 *   1. Loads the route's REAL module by file path (via a short-lived Vite SSR
 *      module loader — this compiles `.aihu`/`.ts` exactly like the dev/prod
 *      pipeline). The `AdapterContext.routes` stub is NOT used here.
 *   2. Renders the route's component to content HTML with @aihu/server's
 *      `renderToString`.
 *   3. Folds the route's `<head>` (from the `.route.json` sidecar) into a
 *      renderable `HeadConfig` via `routeHeadToSsrHead`, resolving relative
 *      canonical/OG/Twitter URLs against `site.url`.
 *   4. Uses the built `index.html` as a template — injecting the per-page head
 *      into `<head>` and the rendered content into the SPA outlet — so the page
 *      ships content-ful HTML for crawlers/agents AND keeps the client bundle
 *      `<script>` tags that hydrate it into the live SPA (progressive
 *      enhancement).
 *   5. Writes `<pattern>/index.html` (and `index.html` for `/`).
 *
 * Dynamic routes (`:param` / `[param]`) are prerendered only when their module
 * exports `getStaticPaths()`; otherwise they are SKIPPED with a build warning.
 *
 * This module is build-time only (no DOM, never shipped to the client) — it
 * does NOT get a `.size-limit.json` row.
 */

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { compileRouteMeta } from '@aihu/compiler'
import { clearSsrContextMap, setSsrContextMap } from '@aihu/context/ssr'
import type { RouteDefinition, RouteSegment } from '@aihu/router'
import { createRouter, provideRouteContext } from '@aihu/router'
import { readRouteSidecar, scanLayouts, scanPages } from '@aihu/router/plugin'
import type { HeadConfig, SsrOptions } from '@aihu/server'
import {
  _setContextFns,
  _setStoreSerializer,
  buildChildRegistry,
  type ChildModuleLike,
  type DiscoveredComponent,
  renderToString,
  routeHeadToSsrHead,
} from '@aihu/server'
import { _resetStoreRegistry, serializeStores } from '@aihu/store'
import type { ResolvedConfig } from 'vite'
import type { AihuConfig } from './config.ts'
import { applyHeadToHtml } from './head-apply.ts'

/**
 * One param set for a dynamic route, as returned by `getStaticPaths()`.
 * Either a flat record of params, or `{ params: {...} }` (the latter mirrors
 * the common framework shape and is accepted for ergonomics).
 */
type StaticPathEntry = Record<string, string> | { params: Record<string, string> }

/** The subset of a route module shape that the prerender consumes. */
interface PrerenderRouteModule {
  /** The renderable component — `() => arbor-tree` or `{ toHtml() }`. */
  default?: unknown
  /** Dynamic-route param sets to prerender. Absent → route is skipped + warned. */
  getStaticPaths?: () => StaticPathEntry[] | Promise<StaticPathEntry[]>
  /**
   * The compiler-assigned light-DOM scope id (LDF §10 step 3), exported by
   * `@aihu/compiler`'s server-target transform for `shadowMode: 'light'`
   * components. Passed to `renderToString` as `SsrOptions.lightScopeId` so
   * the prerendered root carries `data-a="<id>"` and the component's
   * `@scope([data-a="…"])` CSS applies at first paint — before the client
   * bundle loads and the runtime re-stamps the host. Absent for shadow-mode
   * components and hand-authored modules: nothing is stamped, which is the
   * pre-existing behavior.
   */
  __aihu_light_scope__?: string
  /**
   * The component's registered custom-element tag, exported by the same
   * server-target transform. Passed as `SsrOptions.wrapTag` so the prerendered
   * output is wrapped in the REAL host element the client builds, instead of
   * the bare template root.
   *
   * Without it the shapes cannot match: SSR emits `<div class="dn-docs">`
   * while the client builds `<aihu-layout-docs>`, so the client replaces the
   * whole subtree rather than adopting it (measured: 0 of 391 prerendered
   * nodes survived hydration). Absent on hand-authored modules — nothing is
   * wrapped, which is the pre-existing behavior.
   */
  __aihu_tag__?: string
  /**
   * `__aihu_child_tags__` — every component tag this module's template
   * references. Drives the cycle check when the child registry is built.
   */
  __aihu_child_tags__?: ReadonlyArray<string>
}

/** A loader that resolves a route file path to its evaluated module. */
export type SsrModuleLoader = (filePath: string) => Promise<PrerenderRouteModule>

/** Derived route info for a single scanned page file. */
interface ScannedRoute {
  /** Absolute file path to the route module. */
  file: string
  /** URL pattern, e.g. `/`, `/about`, `/posts/:slug`. */
  pattern: string
  segments: RouteSegment[]
  /** Whether the pattern contains a `:param` / catchall segment. */
  dynamic: boolean
}

/** Result of a prerender run — surfaced for tests + logging. */
export interface PrerenderResult {
  /** outDir-relative HTML paths that were written. */
  written: string[]
  /** Human-readable warnings (e.g. skipped dynamic routes). */
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Route derivation (mirrors @aihu/router's file-router conventions)
// ---------------------------------------------------------------------------

function fileToSegments(rel: string): RouteSegment[] {
  const parts = rel
    .replace(/\\/g, '/')
    .replace(/\.[^/.]+$/, '')
    .split('/')
    .filter(Boolean)
    .map(
      (p): RouteSegment =>
        p.startsWith('[...') && p.endsWith(']')
          ? { kind: 'catchall' }
          : p.startsWith('[') && p.endsWith(']')
            ? { kind: 'param', name: p.slice(1, -1) }
            : p.startsWith(':')
              ? { kind: 'param', name: p.slice(1) }
              : { kind: 'static', path: p },
    )
  // File-router convention: a trailing `index` segment maps to its parent dir.
  if (parts.length > 0) {
    const last = parts[parts.length - 1]!
    if (last.kind === 'static' && last.path === 'index') parts.pop()
  }
  return parts
}

function segmentsToPattern(segs: RouteSegment[]): string {
  if (segs.length === 0) return '/'
  return `/${segs
    .map((s) => (s.kind === 'static' ? s.path : s.kind === 'param' ? `:${s.name}` : '*'))
    .join('/')}`
}

/**
 * Discover every component under `componentsDir` and index it by the tag it
 * actually registers under.
 *
 * Indexed by the module's OWN `__aihu_tag__` export, never derived from the
 * filename. `layoutTagFor`/`componentTagFor` are the CLIENT's derivations and
 * can drift from what `defineElement` registered; a registry keyed on a guess
 * would silently miss exactly the components whose tag does not match their
 * file stem.
 *
 * Every component is loaded, rather than walking `__aihu_child_tags__`
 * transitively from each page. The walk's only advantage is loading fewer
 * modules, and the tags cannot be read without loading them anyway. The
 * child-tag sets still do the work that matters — they are the edges of
 * `buildChildRegistry`'s cycle check.
 *
 * A module that fails to load is warned about and skipped, not fatal: one
 * broken component should cost that component's markup, not the whole
 * prerender. `__aihu_schild` then fails closed on its tag, which is exactly
 * today's behaviour.
 */
async function discoverComponents(
  root: string,
  componentsDir: string,
  loadModule: SsrModuleLoader,
  pushWarn: (msg: string) => void,
): Promise<DiscoveredComponent[]> {
  const abs = resolvePath(root, componentsDir)
  let files: string[]
  try {
    files = (await readdir(abs, { recursive: true, withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith('.aihu'))
      .map((e) => join(e.parentPath ?? abs, e.name))
  } catch {
    // No components directory is normal — a site can be pages-only.
    return []
  }
  const found: DiscoveredComponent[] = []
  for (const file of files.sort()) {
    try {
      const mod = (await loadModule(file)) as PrerenderRouteModule
      const tag = mod.__aihu_tag__
      if (tag === undefined) continue
      found.push({ tag, module: mod as unknown as ChildModuleLike })
    } catch (err) {
      pushWarn(
        `[@aihu/app] static output: component "${file}" failed to load (${
          err instanceof Error ? err.message : String(err)
        }); it will render as an empty element.`,
      )
    }
  }
  return found
}

function deriveRoutes(root: string, pagesDir: string): ScannedRoute[] {
  const { routes } = scanPages(root, pagesDir)
  const pagesAbs = resolvePath(root, pagesDir).replace(/\\/g, '/')
  return routes.map((file) => {
    const norm = file.replace(/\\/g, '/')
    const rel = norm.startsWith(`${pagesAbs}/`) ? norm.slice(pagesAbs.length + 1) : norm
    const segments = fileToSegments(rel)
    const pattern = segmentsToPattern(segments)
    const dynamic = segments.some((s) => s.kind === 'param' || s.kind === 'catchall')
    return { file, pattern, segments, dynamic }
  })
}

/** Substitute `:param` segments with concrete values to form a concrete path. */
function fillPattern(segments: RouteSegment[], params: Record<string, string>): string {
  if (segments.length === 0) return '/'
  const parts = segments.map((s) => {
    if (s.kind === 'static') return s.path
    if (s.kind === 'param') return params[s.name] ?? ''
    // catchall: accept either '*' or a named param for the rest
    return params['*'] ?? ''
  })
  return `/${parts.filter((p) => p !== '').join('/')}`
}

function normalizeStaticPathEntry(entry: StaticPathEntry): Record<string, string> {
  if (
    entry &&
    typeof entry === 'object' &&
    'params' in entry &&
    (entry as { params?: unknown }).params
  ) {
    return (entry as { params: Record<string, string> }).params
  }
  return entry as Record<string, string>
}

// ---------------------------------------------------------------------------
// HTML templating
//
// The HeadConfig→template head transform (`applyHeadToHtml`) lives in the
// shared `./head-apply.ts` module so the SSG path (here) and the client-nav
// path (client.ts, B5) key/merge/escape tags identically and can never diverge.
// ---------------------------------------------------------------------------

/** Inject rendered route content into the outlet element of the template. */
function injectContent(html: string, content: string, outletId: string): string {
  const escaped = outletId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // Match an empty outlet `<div id="outlet"></div>` (the SPA scaffold shape).
  const emptyRe = new RegExp(
    `(<[a-zA-Z]+\\b[^>]*\\bid="${escaped}"[^>]*>)(\\s*)(</[a-zA-Z]+>)`,
    'i',
  )
  if (emptyRe.test(html)) {
    return html.replace(emptyRe, `$1${content}$3`)
  }
  // Fallback: open-tag only — insert content right after it.
  const openRe = new RegExp(`(<[a-zA-Z]+\\b[^>]*\\bid="${escaped}"[^>]*>)`, 'i')
  if (openRe.test(html)) {
    return html.replace(openRe, `$1${content}`)
  }
  return html
}

/**
 * Inject rendered page content into a layout's `data-aihu-outlet` marker (the
 * server-side mirror of `@aihu/app`'s client renderer). Matches the element
 * carrying the `data-aihu-outlet` attribute (with or without a value). Returns
 * the composed HTML, or `null` when the layout renders no such marker (so the
 * caller can fall back to rendering the page without the layout).
 */
function injectIntoOutletMarker(layoutHtml: string, content: string): string | null {
  const attr = 'data-aihu-outlet(?:="[^"]*")?'
  // Empty marker `<div data-aihu-outlet></div>` (the passive-marker shape).
  const emptyRe = new RegExp(`(<[a-zA-Z]+\\b[^>]*\\b${attr}[^>]*>)(\\s*)(</[a-zA-Z]+>)`, 'i')
  if (emptyRe.test(layoutHtml)) {
    return layoutHtml.replace(emptyRe, `$1${content}$3`)
  }
  // Open-tag only — insert content right after it.
  const openRe = new RegExp(`(<[a-zA-Z]+\\b[^>]*\\b${attr}[^>]*>)`, 'i')
  if (openRe.test(layoutHtml)) {
    return layoutHtml.replace(openRe, `$1${content}`)
  }
  return null
}

// ---------------------------------------------------------------------------
// Prerender driver
// ---------------------------------------------------------------------------

/**
 * Resolve the renderable component from a loaded route module.
 *
 * The compiled-`.aihu` happy path registers a custom element as an import
 * side-effect and may not expose a `default`. Hand-authored route modules and
 * SSG-targeted pages export a `default` renderable (`() => arbor-tree` or
 * `{ toHtml() }`) — the same contract @aihu/server's router `handle()` uses.
 * Returns `null` when no renderable is present.
 */
function resolveComponent(
  mod: PrerenderRouteModule,
): (() => unknown) | { toHtml(): string } | null {
  const d = mod.default
  if (typeof d === 'function') return d as () => unknown
  if (d && typeof d === 'object' && typeof (d as { toHtml?: unknown }).toHtml === 'function') {
    return d as { toHtml(): string }
  }
  return null
}

/** Convert a route pattern to its `index.html` output path under outDir. */
function patternToHtmlPath(pattern: string): string {
  if (pattern === '/') return 'index.html'
  const clean = pattern.replace(/^\//, '').replace(/\/$/, '')
  return join(clean, 'index.html')
}

export interface RunPrerenderOptions {
  resolvedViteConfig: ResolvedConfig
  config: AihuConfig | undefined
  /**
   * Loads a route module by absolute file path. The default driver
   * (`prerenderClose`) wires this to a short-lived Vite SSR loader.
   */
  loadModule: SsrModuleLoader
  /** Emits a warning (skipped dynamic routes, missing renderables). */
  warn: (msg: string) => void
}

/**
 * Run the SSG prerender. Enumerates routes, renders each static route (and any
 * dynamic route that exports `getStaticPaths`), and writes per-route HTML into
 * the Vite build's outDir using the built `index.html` as the template.
 */
export async function runPrerender(opts: RunPrerenderOptions): Promise<PrerenderResult> {
  const { resolvedViteConfig, config, loadModule, warn } = opts
  const root = resolvedViteConfig.root
  const outDir = resolvePath(root, resolvedViteConfig.build.outDir)
  const pagesDir = config?.dir?.pages ?? 'pages'
  const layoutsDir = config?.dir?.layouts ?? 'src/layouts'
  const siteUrl = config?.site?.url
  const globalHead = config?.app?.head as HeadConfig | undefined
  const outletId = 'outlet'

  const result: PrerenderResult = { written: [], warnings: [] }
  const pushWarn = (msg: string): void => {
    result.warnings.push(msg)
    warn(msg)
  }

  // SSR child components (plan step 5). Built ONCE, before any render: the
  // renderers take a pre-resolved map and load nothing themselves, because
  // module loading is async while the compiled string fast path — the path
  // every prerendered page actually takes — is synchronous.
  //
  // This is also where a cyclic component graph is rejected. Loudly, and here,
  // because render-time recursion is already bounded by `__aihu_schild`'s depth
  // cap: a cycle would not hang the build, it would quietly emit 32 nested
  // copies of the same subtree and write them to disk.
  const componentsDir = config?.dir?.components ?? 'src/components'
  const childRegistry = buildChildRegistry(
    await discoverComponents(root, componentsDir, loadModule, pushWarn),
    pushWarn,
  )
  // Omitted entirely when nothing was discovered, so a site with no components
  // renders byte-identically to before.
  const childOpts: Pick<SsrOptions, 'children'> =
    childRegistry.size > 0 ? { children: childRegistry } : {}

  // Wave-3 state channel: this is @aihu/app's SSG SSR entry, so it owns the
  // store-serializer wiring (@aihu/server never imports @aihu/store — the
  // injection-slot posture of _setContextFns). Each hydratable page render
  // below then emits its stores under `__aihu_state__`. Prerender runs
  // sequentially in one Node process with no per-request context map, so
  // stores live in the module-singleton registry; `_resetStoreRegistry()`
  // before every render keeps one page's store state out of the next page's
  // snapshot.
  _setStoreSerializer(serializeStores)

  // Route context during SSG. `@aihu/server` never imports `@aihu/context` —
  // the seam is `_setContextFns` + `SsrOptions.contextSetup` — so this, the
  // SSG SSR entry, owns the wiring exactly as it owns the store serializer
  // above.
  //
  // Without it `inject(RouteContext)` returned the token default (`null`) for
  // the whole prerender, so anything route-aware — `useRoute`, `useRouter`,
  // `$route`, an `<a>` deciding whether it is the active link — server-rendered
  // as if no route were active, then changed on the client. That is a
  // correctness bug that presents as a flash.
  //
  // No component in a prerendered tree provides this: on the client `<router>`
  // does, and there is no `<router>` here. Pre-populating IS the mechanism.
  _setContextFns(setSsrContextMap, clearSsrContextMap)

  const routes = deriveRoutes(root, pagesDir)

  // A router over the same scanned routes the loop below walks, so `current()`
  // returns a real `MatchResult` — matched params included — rather than a
  // hand-built stub that would drift from what the client computes.
  const router = createRouter(
    routes.map(
      (r): RouteDefinition => ({
        pattern: r.pattern,
        segments: r.segments,
        module: () => loadModule(r.file) as Promise<never>,
      }),
    ),
  )

  /**
   * `contextSetup` for one concrete path.
   *
   * `provideRouteContext` writes into the map `ssr.ts` activates immediately
   * before calling this hook, so the public provide/inject API is all that is
   * needed — no reaching for token internals.
   *
   * `current` is a plain closure, not a signal: a prerender is one static
   * snapshot, and `createRouteSignal` would attach a `popstate` listener that
   * has nothing to listen to in Node.
   */
  const routeContextFor = (concretePath: string): NonNullable<SsrOptions['contextSetup']> => {
    const match = router.match(concretePath)
    return () => provideRouteContext({ router, current: () => match })
  }

  // SSR layout parity (#7): render a route's layout shell and cache it. Scoped
  // to the composition case — only layouts whose module exposes an
  // SSR-renderable `default` are prerendered. Compiled-SFC layouts (side-effect
  // custom element, no default) resolve to null, so the page ships the SPA
  // shell unchanged and the layout is applied client-side on hydration. Map
  // value `null` = resolved but not server-renderable.
  //
  // The cache key is layout name + CONCRETE PATH, not the name alone. Keying on
  // the name was safe only while layouts rendered route-blind; now that they
  // see `RouteContext`, a layout with an active-nav highlight (the common case,
  // and the reason this wiring exists) renders differently per page. A
  // name-only key would have served every page the first page's chrome.
  const layoutShellCache = new Map<string, string | null>()
  const renderLayoutShell = async (
    name: string,
    routePattern: string,
    concretePath: string,
  ): Promise<string | null> => {
    const cacheKey = `${name} ${concretePath}`
    const cached = layoutShellCache.get(cacheKey)
    if (cached !== undefined) return cached
    let shell: string | null = null
    const layoutFile = scanLayouts(resolvePath(root, layoutsDir))[name]
    if (!layoutFile) {
      pushWarn(
        `[@aihu/app] static output: layout "${name}" (route ${routePattern}) not found under ` +
          `${layoutsDir} — rendering without a layout.`,
      )
    } else {
      try {
        const layoutMod = await loadModule(layoutFile)
        const layoutComponent = resolveComponent(layoutMod)
        if (layoutComponent) {
          // See the `hydratable` note on the page render below — the layout
          // shell is part of the same prerendered document and must carry
          // markers too, or the client adopts the page and rebuilds its wrapper.
          _resetStoreRegistry()
          shell = await renderToString(layoutComponent, {
            hydratable: true,
            contextSetup: routeContextFor(concretePath),
            // Referenced components (e.g. <site-header>) render their real
            // content instead of an empty shell. Layouts are where most of them
            // live, which is why the site nav was missing from every page.
            ...childOpts,
            // Stamp the layout's `data-a` scope id on its prerendered root so
            // the layout's scoped CSS (grid columns, the mobile media query
            // that hides the sidebar, …) applies at FIRST PAINT. Without it
            // the prerendered chrome renders unstyled until the layout chunk
            // loads — measured on apps/docs-next: the unstyled sidebar filled
            // the mobile viewport, pushed the article (the LCP element) below
            // the fold, and cost ~1.9s of throttled LCP.
            ...(layoutMod.__aihu_light_scope__ !== undefined
              ? { lightScopeId: layoutMod.__aihu_light_scope__ }
              : {}),
            // …and wrap it in the layout's own element, so the prerendered
            // shape is the one the client builds. `data-a` rides the wrapper
            // rather than the template root — that is where the client stamps
            // it (define-element.ts, in the host constructor).
            ...(layoutMod.__aihu_tag__ !== undefined ? { wrapTag: layoutMod.__aihu_tag__ } : {}),
          })
        } else {
          pushWarn(
            `[@aihu/app] static output: layout "${name}" has no SSR-renderable default export — ` +
              `route ${routePattern} ships the SPA shell (the layout is applied client-side). ` +
              `Export a default renderable to prerender the layout.`,
          )
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        pushWarn(
          `[@aihu/app] static output: failed to render layout "${name}" for ${routePattern}: ${msg}`,
        )
      }
    }
    layoutShellCache.set(cacheKey, shell)
    return shell
  }

  // The built index.html is our template — it already carries the hashed client
  // bundle <script> tags + base <head>, so reusing it gives free hydration.
  const templatePath = resolvePath(outDir, 'index.html')
  let template: string
  try {
    template = await readFile(templatePath, 'utf8')
  } catch {
    pushWarn(
      `[@aihu/app] static output: no index.html in ${outDir} — cannot prerender. ` +
        `Ensure the SPA build produced an index.html.`,
    )
    return result
  }

  for (const route of routes) {
    let mod: PrerenderRouteModule
    try {
      mod = await loadModule(route.file)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      pushWarn(`[@aihu/app] static output: failed to load route ${route.pattern}: ${msg}`)
      continue
    }

    const sidecar = readRouteSidecar(route.file)
    let head = sidecar?.head
    let declaredLayout = sidecar?.layout
    if (head === undefined || declaredLayout === undefined) {
      // The stdin compile path writes no `.route.json` sidecar to disk, so a
      // real SSG build has none to read (only the test harness lays them down).
      // Recover the route's `@route` metadata straight from source via the
      // compiler — the SAME metadata the SPA build threads into
      // `virtual:aihu-routes` (compileRouteMeta). Without this fallback every
      // prerendered page ships ONLY the global head and loses its per-route
      // title / description / canonical / og / twitter / json-ld — the SEO
      // payload that is the entire reason to prerender for crawlers.
      //
      // `layout` needs the SAME recovery, and its absence was worse than an SEO
      // loss: `sidecar?.layout` was ALWAYS undefined in a real build, so the
      // layout shell was silently never prerendered — not even a warning, since
      // the "layout not found" / "no outlet marker" warnings below all sit
      // downstream of a layout NAME that never arrived. Every static page
      // therefore shipped its bare content with no chrome, and the client had to
      // build the entire layout before the page reached its final geometry.
      //
      // Failure is non-fatal: the page still ships content + the global head.
      try {
        const src = await readFile(route.file, 'utf8')
        const meta = compileRouteMeta(src, route.file)
        if (head === undefined) head = meta?.head as typeof head
        if (declaredLayout === undefined) declaredLayout = meta?.layout
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        pushWarn(
          `[@aihu/app] static output: could not recover @route metadata for ${route.pattern}: ` +
            `${msg} — the page ships with the global head and no layout.`,
        )
      }
    }

    const component = resolveComponent(mod)
    if (!component) {
      pushWarn(
        `[@aihu/app] static output: route ${route.pattern} has no renderable default export — ` +
          `skipping content prerender (the SPA shell still ships).`,
      )
      continue
    }

    const layoutName = declaredLayout

    // Build the param-path list to render: static routes render once with no
    // params; dynamic routes require getStaticPaths().
    let paramSets: Array<Record<string, string>>
    if (route.dynamic) {
      if (typeof mod.getStaticPaths !== 'function') {
        pushWarn(
          `[@aihu/app] static output: dynamic route ${route.pattern} has no getStaticPaths() — ` +
            `skipped. Export getStaticPaths() to prerender its paths.`,
        )
        continue
      }
      const raw = await mod.getStaticPaths()
      paramSets = (raw ?? []).map(normalizeStaticPathEntry)
      if (paramSets.length === 0) {
        pushWarn(
          `[@aihu/app] static output: dynamic route ${route.pattern} getStaticPaths() returned ` +
            `no paths — nothing prerendered for this route.`,
        )
      }
    } else {
      paramSets = [{}]
    }

    for (const params of paramSets) {
      const concretePath = route.dynamic ? fillPattern(route.segments, params) : route.pattern

      let content: string
      try {
        // `hydratable: true` is REQUIRED, not an optimization. Every
        // `data-aihu-path` marker in `ssr.ts` is gated on
        // `opts?.hydratable ?? false`, so no options means markerless HTML.
        //
        // "Static" here names WHEN the page is rendered, not whether it
        // hydrates: an SSG page is still the document a live SPA boots into.
        // Without markers the client walker has nothing to adopt and rebuilds
        // the tree beside the prerendered DOM, silently duplicating every
        // statically generated page's content on first load. `hydratable` is a
        // property of the DESTINATION, not of the renderer.
        _resetStoreRegistry()
        content = await renderToString(component, {
          hydratable: true,
          contextSetup: routeContextFor(concretePath),
          // See the layout shell above — a page's own template can reference
          // components too.
          ...childOpts,
          // Same first-paint stamp as the layout shell above: the page's own
          // `@scope([data-a="…"])` CSS must match the prerendered content
          // before any client JS runs. Also the scope BOUNDARY (`to
          // ([data-a])`): the page root's `data-a` is what stops the layout's
          // scope from leaking into page content.
          ...(mod.__aihu_light_scope__ !== undefined
            ? { lightScopeId: mod.__aihu_light_scope__ }
            : {}),
          // …and the page's own element, matching what the client builds
          // (`document.createElement(tag)` in client.ts's route render).
          ...(mod.__aihu_tag__ !== undefined ? { wrapTag: mod.__aihu_tag__ } : {}),
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        pushWarn(`[@aihu/app] static output: render failed for ${concretePath}: ${msg}`)
        continue
      }

      // SSR layout parity (#7): render the route's layout shell, then inject the
      // page into its `data-aihu-outlet` marker. If the layout isn't
      // server-renderable (compiled SFC) or has no marker, fall back to the page
      // alone (the client still wraps it on hydrate).
      //
      // Rendered per CONCRETE PATH, not once per route pattern: the layout now
      // sees `RouteContext`, so a dynamic route's pages get their own chrome
      // rather than every `/posts/:slug` page reusing the first slug's.
      let layoutShell = layoutName
        ? await renderLayoutShell(layoutName, route.pattern, concretePath)
        : null
      if (layoutShell !== null && injectIntoOutletMarker(layoutShell, '') === null) {
        pushWarn(
          `[@aihu/app] static output: layout "${layoutName}" renders no <outlet> ` +
            `(data-aihu-outlet) marker — route ${route.pattern} prerendered without the layout.`,
        )
        layoutShell = null
      }
      if (layoutShell !== null) {
        content = injectIntoOutletMarker(layoutShell, content) ?? content
      }

      const lowered = routeHeadToSsrHead(head, {
        ...(siteUrl !== undefined ? { siteUrl } : {}),
        ...(globalHead !== undefined ? { globalHead } : {}),
      })
      let html = applyHeadToHtml(template, lowered)
      html = injectContent(html, content, outletId)

      const relPath = patternToHtmlPath(concretePath)
      const absPath = resolvePath(outDir, relPath)
      await mkdir(dirname(absPath), { recursive: true })
      await writeFile(absPath, html, 'utf8')
      result.written.push(relPath.replace(/\\/g, '/'))
    }
  }

  return result
}

/**
 * `closeBundle` driver for the SSG prerender. Spins up a short-lived Vite SSR
 * module loader (middleware mode) so route files compile exactly like the dev
 * pipeline (`.aihu`, TS, virtual modules), runs `runPrerender`, then tears the
 * loader down.
 */
export async function prerenderClose(
  resolvedViteConfig: ResolvedConfig,
  config: AihuConfig | undefined,
  warn: (msg: string) => void,
): Promise<PrerenderResult> {
  // Lazy import of Vite so this stays out of any non-build path.
  const { createServer } = await import('vite')
  // Reuse the resolved plugin chain so route files compile exactly like the
  // build (compiler for `.aihu`, router for virtual modules), but drop our own
  // build-only sentinels — they have no role in a module-loading dev server and
  // would only add noise. (closeBundle does not fire in middleware mode, so the
  // SSG plugin cannot re-enter even if left in.)
  const plugins = (
    (resolvedViteConfig.plugins as ReadonlyArray<{ name?: string }> | undefined) ?? []
  ).filter((p) => p?.name !== 'aihu-ssg' && p?.name !== 'aihu-adapter')
  const server = await createServer({
    root: resolvedViteConfig.root,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
    plugins: plugins as never,
  })
  try {
    const loadModule: SsrModuleLoader = async (filePath) =>
      (await server.ssrLoadModule(filePath)) as PrerenderRouteModule
    return await runPrerender({ resolvedViteConfig, config, loadModule, warn })
  } finally {
    await server.close()
  }
}
