import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, join, basename, dirname } from 'node:path'
import type { RouteSegment } from './router.ts'

/** @internal */
interface VitePlugin {
  name: string
  resolveId?: (id: string) => string | null | undefined
  load?: (id: string) => string | null | undefined
  configureServer?: (server: {
    watcher: { add(p: string): void; on(e: string, cb: (p: string) => void): void }
    moduleGraph: { getModuleById(id: string): { id: string } | undefined; invalidateModule(m: { id: string }): void }
  }) => void
}

const RR = '\0virtual:scribe-routes'
const LR = '\0virtual:scribe-layouts'

export interface RouterPluginOptions {
  pagesDir?: string
  /** Directory to scan for layout files. Default: 'src/layouts' */
  layoutsDir?: string
}

/** Fields from a .route.json compiler sidecar (v0.6.3). */
export interface RouteSidecar { name?: string; middleware?: string[]; ssr?: boolean; layout?: string }

/** Layout name → absolute file path (v0.6.8). */
export interface LayoutMap { [name: string]: string }

function segs(rel: string): RouteSegment[] {
  return rel.replace(/\.[^/]+$/, '').replace(/\\/g, '/').split('/').filter(Boolean).map((p): RouteSegment =>
    p.startsWith('[...') && p.endsWith(']') ? { kind: 'catchall' }
    : p.startsWith('[') && p.endsWith(']') ? { kind: 'param', name: p.slice(1, -1) }
    : { kind: 'static', path: p })
}

function pat(ss: RouteSegment[]): string {
  if (!ss.length) return '/'
  return ss.map((s) => s.kind === 'static' ? s.path : s.kind === 'param' ? `:${s.name}` : '*').join('/').replace(/^(?!\/)/, '/')
}

/** v0.6.3: Read sibling .route.json sidecar. Build-time only. */
export function readRouteSidecar(f: string): RouteSidecar | null {
  const p = join(dirname(f), `${basename(f).replace(/\.[^.]+$/, '')}.route.json`)
  if (!existsSync(p)) return null
  try { return JSON.parse(readFileSync(p, 'utf8')) as RouteSidecar } catch { return null }
}

/** v0.6.8: Scan layouts dir for .scribe files. Build-time only. */
export function scanLayouts(d: string): LayoutMap {
  if (!existsSync(d)) return {}
  const m: LayoutMap = {}
  for (const e of readdirSync(d, { withFileTypes: true }))
    if (e.isFile() && e.name.endsWith('.scribe')) m[e.name.slice(0, -7)] = join(d, e.name).replace(/\\/g, '/')
  return m
}

const SK = ['name', 'middleware', 'ssr', 'layout'] as const

function genR(files: string[], pd: string): string {
  return `// AUTO-GENERATED\nexport default [\n${files.map((f) => {
    const s = segs(f.replace(/\\/g, '/').replace(new RegExp(`^.*?${pd}/`), ''))
    const sc = readRouteSidecar(f)
    const x = sc ? SK.filter((k) => sc[k] !== undefined).map((k) => `    ${k}: ${JSON.stringify(sc[k])},`).join('\n') : ''
    return `  {\n    pattern: ${JSON.stringify(pat(s))},\n    segments: ${JSON.stringify(s)},\n    module: () => import(${JSON.stringify(f.replace(/\\/g, '/'))}),${x ? '\n' + x : ''}\n  }`
  }).join(',\n')}\n];\n`
}

function genL(d: string): string {
  return `// AUTO-GENERATED\nexport default {\n${Object.entries(scanLayouts(d)).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n')}\n};\n`
}

function pages(root: string, pd: string): string[] {
  const d = resolve(root, pd)
  if (!existsSync(d)) return []
  const o: string[] = []
  const w = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const fp = join(dir, e.name)
      if (e.isDirectory()) w(fp)
      else if (e.isFile() && /\.(ts|js|tsx|jsx|scribe)$/.test(e.name) && !e.name.startsWith('_')) o.push(fp)
    }
  }
  w(d)
  return o.sort()
}

export function viteRouterPlugin(opts?: RouterPluginOptions): VitePlugin {
  const pd = opts?.pagesDir ?? 'pages', ld = opts?.layoutsDir ?? 'src/layouts'
  let root = process.cwd(), cr: string | null = null, cl: string | null = null
  return {
    name: 'scribe-router',
    resolveId: (id) => id === 'virtual:scribe-routes' ? RR : id === 'virtual:scribe-layouts' ? LR : null,
    load(id) {
      if (id === RR) return (cr ??= genR(pages(root, pd), pd))
      if (id === LR) return (cl ??= genL(resolve(root, ld)))
      return null
    },
    configureServer(server) {
      const s = server as unknown as { config?: { root?: string } } & typeof server
      if (s.config?.root) root = s.config.root
      const pa = resolve(root, pd), la = resolve(root, ld)
      server.watcher.add(pa); server.watcher.add(la)
      const mk = (abs: string, rst: () => void, rid: string) => (p: string) => {
        if (!p.replace(/\\/g, '/').includes(abs.replace(/\\/g, '/'))) return
        rst()
        const m = server.moduleGraph.getModuleById(rid)
        if (m) server.moduleGraph.invalidateModule(m)
      }
      const ir = mk(pa, () => { cr = null }, RR), il = mk(la, () => { cl = null }, LR)
      server.watcher.on('add', (p) => { ir(p); il(p) })
      server.watcher.on('unlink', (p) => { ir(p); il(p) })
    },
  }
}
