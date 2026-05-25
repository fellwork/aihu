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

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve as resolvePath } from 'node:path'
import type { RouteSegment } from '@aihu/router'
import { readRouteSidecar, scanPages } from '@aihu/router/plugin'
import type { HeadConfig } from '@aihu/server'
import { renderToString, routeHeadToSsrHead } from '@aihu/server'
import type { ResolvedConfig } from 'vite'
import type { AihuConfig } from './config.ts'

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
// ---------------------------------------------------------------------------

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Render a lowered HeadConfig to a list of head-tag HTML strings. */
function headConfigToTags(head: HeadConfig): {
  title: string | undefined
  metas: string[]
  links: string[]
  scripts: string[]
} {
  const metas: string[] = []
  for (const meta of head.meta ?? []) {
    const attrs = Object.entries(meta)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
      .join(' ')
    metas.push(`<meta ${attrs}>`)
  }
  const links: string[] = []
  for (const link of head.links ?? []) {
    const attrs = Object.entries(link)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}="${escapeAttr(String(v))}"`)
      .join(' ')
    links.push(`<link ${attrs}>`)
  }
  const scripts: string[] = []
  for (const script of head.scripts ?? []) {
    // Element text — neutralize a literal `</` so injected `</script>` can't
    // break out (matches @aihu/server's buildHead guard).
    const body = script.content.replace(/<\//g, '<\\/')
    scripts.push(`<script type="${escapeAttr(script.type)}">${body}</script>`)
  }
  return { title: head.title, metas, links, scripts }
}

/** Stable key for a meta tag — used to replace a matching tag in the template. */
function metaKeyAttr(metaHtml: string): { key: string; value: string } | null {
  const name = metaHtml.match(/\bname="([^"]*)"/i)
  if (name) return { key: 'name', value: name[1]! }
  const prop = metaHtml.match(/\bproperty="([^"]*)"/i)
  if (prop) return { key: 'property', value: prop[1]! }
  return null
}

/**
 * Apply a lowered HeadConfig onto a built `index.html` template.
 *
 * - `<title>` is replaced (or injected when absent).
 * - Each meta is replaced in place when a tag with the same name/property
 *   already exists; otherwise injected before `</head>`.
 * - canonical link replaces an existing `rel="canonical"`; other links + all
 *   scripts (JSON-LD) are injected before `</head>`.
 */
function applyHead(html: string, head: HeadConfig): string {
  let out = html
  const inject: string[] = []
  const { title, metas, links, scripts } = headConfigToTags(head)

  if (title !== undefined) {
    const tag = `<title>${escapeText(title)}</title>`
    if (/<title[^>]*>[\s\S]*?<\/title>/i.test(out)) {
      out = out.replace(/<title[^>]*>[\s\S]*?<\/title>/i, tag)
    } else {
      inject.push(tag)
    }
  }

  for (const metaTag of metas) {
    const key = metaKeyAttr(metaTag)
    if (key) {
      const escaped = key.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(`<meta\\s+[^>]*${key.key}="${escaped}"[^>]*>`, 'i')
      if (re.test(out)) {
        out = out.replace(re, metaTag)
        continue
      }
    }
    inject.push(metaTag)
  }

  for (const linkTag of links) {
    const rel = linkTag.match(/\brel="([^"]*)"/i)
    if (rel && rel[1]!.toLowerCase() === 'canonical') {
      const re = /<link\s+[^>]*rel="canonical"[^>]*>/i
      if (re.test(out)) {
        out = out.replace(re, linkTag)
        continue
      }
    }
    inject.push(linkTag)
  }

  inject.push(...scripts)

  if (inject.length === 0) return out
  const block = inject.join('\n    ')
  if (/<\/head>/i.test(out)) {
    return out.replace(/<\/head>/i, `    ${block}\n  </head>`)
  }
  return `${out}\n${block}`
}

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
  const siteUrl = config?.site?.url
  const globalHead = config?.app?.head as HeadConfig | undefined
  const outletId = 'outlet'

  const result: PrerenderResult = { written: [], warnings: [] }
  const pushWarn = (msg: string): void => {
    result.warnings.push(msg)
    warn(msg)
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

  const routes = deriveRoutes(root, pagesDir)

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
    const head = sidecar?.head

    const component = resolveComponent(mod)
    if (!component) {
      pushWarn(
        `[@aihu/app] static output: route ${route.pattern} has no renderable default export — ` +
          `skipping content prerender (the SPA shell still ships).`,
      )
      continue
    }

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
        content = await renderToString(component)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        pushWarn(`[@aihu/app] static output: render failed for ${concretePath}: ${msg}`)
        continue
      }

      const lowered = routeHeadToSsrHead(head, {
        ...(siteUrl !== undefined ? { siteUrl } : {}),
        ...(globalHead !== undefined ? { globalHead } : {}),
      })
      let html = applyHead(template, lowered)
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
