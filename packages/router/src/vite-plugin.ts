import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { RouteHead, RouteSegment } from './router.ts'

/** @internal */
interface VitePlugin {
  name: string
  resolveId?: (id: string) => string | null | undefined
  load?: (id: string) => string | null | undefined
  configureServer?: (server: {
    watcher: { add(p: string): void; on(e: string, cb: (p: string) => void): void }
    moduleGraph: {
      getModuleById(id: string): { id: string } | undefined
      invalidateModule(m: { id: string }): void
    }
  }) => void
}

const RR = '\0virtual:aihu-routes'
const LR = '\0virtual:aihu-layouts'

export interface RouterPluginOptions {
  pagesDir?: string
  /** Directory to scan for layout files. Default: 'src/layouts' */
  layoutsDir?: string
}

/** Fields from a .route.json compiler sidecar (v0.6.3). */
export interface RouteSidecar {
  name?: string
  middleware?: string[]
  ssr?: boolean
  layout?: string
  /** Declared route param names, e.g. ["slug"]. Emitted by the Rust compiler from $prop declarations. */
  params?: string[]
  /**
   * B2: per-route `<head>` metadata (compiler `head:` block). Omitted entirely
   * when a route declares no `head:`. Threaded through to RouteDefinition.head
   * and the generated `virtual:aihu-routes` module.
   */
  head?: RouteHead
}

/** Layout name → absolute file path (v0.6.8). Build-time scan result. */
export interface LayoutMap {
  [name: string]: string
}

/**
 * Runtime layout namespace convention (v0.7.5). A layout SFC's filename stem is
 * not a valid custom-element name on its own (e.g. `app` has no hyphen), so the
 * compiler registers it under `aihu-layout-<stem>`. The generated
 * `virtual:aihu-layouts` module and `@aihu/app`'s client renderer both resolve
 * the tag through this helper, so the two sides can never drift.
 *
 * KEEP IN SYNC: the `@aihu/compiler` Vite plugin derives the same tag when it
 * compiles a file under the layouts dir (`packages/compiler/js/index.ts`).
 */
export function layoutTagFor(name: string): string {
  return `aihu-layout-${name.toLowerCase()}`
}

function segs(rel: string): RouteSegment[] {
  const parts = rel
    .replace(/\.[^/]+$/, '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .map(
      (p): RouteSegment =>
        p.startsWith('[...') && p.endsWith(']')
          ? { kind: 'catchall' }
          : p.startsWith('[') && p.endsWith(']')
            ? { kind: 'param', name: p.slice(1, -1) }
            : { kind: 'static', path: p },
    )
  // File-router convention: trailing `index` segment is the parent directory's root.
  // e.g. src/pages/index.aihu → /,  src/pages/posts/index.aihu → /posts
  if (parts.length > 0) {
    const last = parts[parts.length - 1]!
    if (last.kind === 'static' && last.path === 'index') parts.pop()
  }
  return parts
}

/**
 * Extract simple scalar fields from an `@route { … }` block in a `.aihu` file.
 *
 * The Vite compiler plugin compiles `.aihu` files via stdin and does NOT write
 * a `.route.json` sidecar to disk, and even if it did, `genR` runs before the
 * pages are (lazily) transformed — so `readRouteSidecar` finds nothing during a
 * normal build. To keep file-router metadata flowing without a sidecar, we read
 * the handful of simple string fields straight from the source `@route` block.
 *
 * `name` is the component/custom-element tag; `layout` is the route's layout
 * (consumed at runtime by `@aihu/app` to wrap the page). Nested/structured
 * fields (`head`, `middleware`, `params`) are NOT recovered here — those still
 * require the sidecar (e.g. the SSG/file-mode path).
 */
function readAihuRouteMeta(f: string): { name?: string; layout?: string } | null {
  if (!f.endsWith('.aihu')) return null
  try {
    const content = readFileSync(f, 'utf8')
    const block = content.match(/@route\s*\{([^}]*)\}/)
    if (!block) return null
    const body = block[1]!
    const grab = (k: string): string | undefined => {
      const m = body.match(new RegExp(`\\b${k}\\s*:\\s*["']([^"']+)["']`))
      return m ? m[1] : undefined
    }
    const meta: { name?: string; layout?: string } = {}
    const name = grab('name')
    if (name !== undefined) meta.name = name
    const layout = grab('layout')
    if (layout !== undefined) meta.layout = layout
    return meta
  } catch {
    return null
  }
}

function pat(ss: RouteSegment[]): string {
  if (!ss.length) return '/'
  return ss
    .map((s) => (s.kind === 'static' ? s.path : s.kind === 'param' ? `:${s.name}` : '*'))
    .join('/')
    .replace(/^(?!\/)/, '/')
}

/** v0.6.3: Read sibling .route.json sidecar. Build-time only. */
export function readRouteSidecar(f: string): RouteSidecar | null {
  const p = join(dirname(f), `${basename(f).replace(/\.[^.]+$/, '')}.route.json`)
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as RouteSidecar
  } catch {
    return null
  }
}

/** v0.6.8: Scan layouts dir for .aihu files. Build-time only. */
export function scanLayouts(d: string): LayoutMap {
  if (!existsSync(d)) return {}
  const m: LayoutMap = {}
  for (const e of readdirSync(d, { withFileTypes: true }))
    if (e.isFile() && e.name.endsWith('.aihu'))
      m[e.name.slice(0, -5)] = join(d, e.name).replace(/\\/g, '/')
  return m
}

const SK = ['name', 'middleware', 'ssr', 'layout', 'params', 'head'] as const

function genR(files: string[], pd: string, middlewareByDir: Record<string, string> = {}): string {
  return `// AUTO-GENERATED\nexport default [\n${files
    .map((f) => {
      const s = segs(f.replace(/\\/g, '/').replace(new RegExp(`^.*?${pd}/`), ''))
      const sc = readRouteSidecar(f)
      // No sidecar on disk (the normal Vite build): recover `name` + `layout`
      // straight from the @route block so file-router layouts work without it.
      const aihuMeta = !sc?.name && f.endsWith('.aihu') ? readAihuRouteMeta(f) : null
      const x = sc
        ? SK.filter((k) => sc[k] !== undefined)
            .map((k) => `    ${k}: ${JSON.stringify(sc[k])},`)
            .join('\n')
        : aihuMeta
          ? [
              aihuMeta.name !== undefined ? `    name: ${JSON.stringify(aihuMeta.name)},` : '',
              aihuMeta.layout !== undefined
                ? `    layout: ${JSON.stringify(aihuMeta.layout)},`
                : '',
            ]
              .filter(Boolean)
              .join('\n')
          : ''
      // v0.7.2: embed _middleware file path for file-convention auto-wire
      const fileDir = dirname(f).replace(/\\/g, '/')
      const mwFile = middlewareByDir[fileDir]
      const mwLine = mwFile ? `\n    middlewareFile: ${JSON.stringify(mwFile)},` : ''
      return `  {\n    pattern: ${JSON.stringify(pat(s))},\n    segments: ${JSON.stringify(s)},\n    module: () => import(${JSON.stringify(f.replace(/\\/g, '/'))}),${x ? `\n${x}` : ''}${mwLine}\n  }`
    })
    .join(',\n')}\n];\n`
}

function genL(d: string): string {
  // v0.7.5: emit runtime-consumable entries — `{ tag, load }` — not bare path
  // strings. `load()` is a dynamic import so the layout SFC compiles + registers
  // its `aihu-layout-<name>` custom element on first use; `tag` lets the client
  // renderer `createElement` it without re-deriving the name.
  return `// AUTO-GENERATED\nexport default {\n${Object.entries(scanLayouts(d))
    .map(
      ([k, v]) =>
        `  ${JSON.stringify(k)}: { tag: ${JSON.stringify(layoutTagFor(k))}, load: () => import(${JSON.stringify(v)}) },`,
    )
    .join('\n')}\n};\n`
}

/** v0.7.2: File-convention middleware discovered alongside routes. */
export interface MiddlewareScan {
  /** Route files (non-underscore page files). */
  routes: string[]
  /**
   * Map from directory (absolute path) to its `_middleware.(ts|js)` file.
   * When the runtime composes a route, all middleware files from the route
   * file's ancestor directories (innermost first) should be applied.
   */
  middlewareByDir: Record<string, string>
}

export function scanPages(root: string, pd: string): MiddlewareScan {
  const d = resolve(root, pd)
  if (!existsSync(d)) return { routes: [], middlewareByDir: {} }
  const routes: string[] = []
  const middlewareByDir: Record<string, string> = {}
  const w = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const fp = join(dir, e.name)
      if (e.isDirectory()) {
        w(fp)
      } else if (e.isFile()) {
        // v0.7.2: capture _middleware.ts / _middleware.js / _middleware.tsx / _middleware.jsx
        if (/^_middleware\.(ts|js|tsx|jsx)$/.test(e.name)) {
          middlewareByDir[dir.replace(/\\/g, '/')] = fp.replace(/\\/g, '/')
        } else if (/\.(ts|js|tsx|jsx|aihu)$/.test(e.name) && !e.name.startsWith('_')) {
          routes.push(fp)
        }
      }
    }
  }
  w(d)
  return { routes: routes.sort(), middlewareByDir }
}

function _pages(root: string, pd: string): string[] {
  return scanPages(root, pd).routes
}

export function viteRouterPlugin(opts?: RouterPluginOptions): VitePlugin {
  const pd = opts?.pagesDir ?? 'pages',
    ld = opts?.layoutsDir ?? 'src/layouts'
  let root = process.cwd(),
    cr: string | null = null,
    cl: string | null = null
  return {
    name: 'aihu-router',
    resolveId: (id) =>
      id === 'virtual:aihu-routes' ? RR : id === 'virtual:aihu-layouts' ? LR : null,
    load(id) {
      if (id === RR) {
        if (!cr) {
          // v0.7.2: use scanPages to also pick up _middleware files
          const scan = scanPages(root, pd)
          cr = genR(scan.routes, pd, scan.middlewareByDir)
        }
        return cr
      }
      if (id === LR) return (cl ??= genL(resolve(root, ld)))
      return null
    },
    configureServer(server) {
      const s = server as unknown as { config?: { root?: string } } & typeof server
      if (s.config?.root) root = s.config.root
      const pa = resolve(root, pd),
        la = resolve(root, ld)
      server.watcher.add(pa)
      server.watcher.add(la)
      const mk = (abs: string, rst: () => void, rid: string) => (p: string) => {
        if (!p.replace(/\\/g, '/').includes(abs.replace(/\\/g, '/'))) return
        rst()
        const m = server.moduleGraph.getModuleById(rid)
        if (m) server.moduleGraph.invalidateModule(m)
      }
      const ir = mk(
          pa,
          () => {
            cr = null
          },
          RR,
        ),
        il = mk(
          la,
          () => {
            cl = null
          },
          LR,
        )
      server.watcher.on('add', (p) => {
        ir(p)
        il(p)
      })
      server.watcher.on('unlink', (p) => {
        ir(p)
        il(p)
      })
    },
  }
}

// ---------------------------------------------------------------------------
// v0.7.4 naming: viteRouterIntegration (preferred) + deprecated alias
// ---------------------------------------------------------------------------

/**
 * @aihu/router Vite integration (v0.7.4 rename of `viteRouterPlugin`).
 * Prefer this name going forward; `viteRouterPlugin` is kept as the original
 * function name (deprecated) until v1.0.
 */
export const viteRouterIntegration = viteRouterPlugin
