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
const CR = '\0virtual:aihu-components'

export interface RouterPluginOptions {
  pagesDir?: string
  /** Directory to scan for layout files. Default: 'src/layouts' */
  layoutsDir?: string
  /** Directory to scan for component files. Default: 'src/components' */
  componentsDir?: string
  /**
   * Build-time route-metadata extractor — `@aihu/compiler`'s `compileRouteMeta`.
   * When provided, `genR` uses it to recover FULL `@route` metadata
   * (`head`/`middleware`/`params`/`ssr`/`layout`) for `.aihu` pages, since the
   * stdin compile path writes no `.route.json` sidecar to disk. Wired by
   * `@aihu/app` (which pairs the compiler + router plugins). When absent (e.g.
   * standalone `viteRouterIntegration` without the compiler), `genR` falls back
   * to reading `name`+`layout` from the `@route` block via regex.
   */
  compileRouteMeta?: (source: string, id: string) => RouteSidecar | null
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
  /**
   * O1a: normalized custom-element tags this route's template references
   * (e.g. `["hn-comment", "user-card"]`). Emitted by the compiler's
   * `route.json`; threaded through to RouteDefinition.components so O1c can
   * register a route's components on navigation instead of eager imports.
   */
  components?: string[]
  /**
   * GX Phase 3 (#437-GX): the compiled `extract` policy (Phase 1 fan-out —
   * always present in a v0.1.12+ `.route.json`, the default recorded, never
   * implied by absence). Values stay `unknown` here: the compiler validated
   * them (C483), but sidecars can be hand-edited, so consumers normalize
   * fail-closed via `@aihu/server`'s `deriveReadPolicy`.
   */
  extract?: { read?: unknown; call?: unknown }
  /**
   * GX Phase 4 (#466): the compiled `data:` declaration — the governed
   * resource type binding (`type` keys the provider registry) and the
   * declared locked-state `preview:` fields. INTEGRATION SEAM (Builder A):
   * the Rust compiler parses the `@route` `data:` block and fans it into
   * `.route.json` beside `extract`; this field threads it (sidecar or
   * `compileRouteMeta`) into `RouteDefinition.data`, where
   * `createServerRouter` normalizes it fail-closed (`normalizeGovernedData`).
   */
  data?: { type?: string; preview?: string[] }
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

/**
 * Normalize a component name to its custom-element tag (O1b). Multi-word
 * PascalCase becomes kebab (`UserCard` → `user-card`, `APIClient` →
 * `api-client`); already-hyphenated names pass through lowercased. A `-` is
 * inserted before an uppercase letter when the previous char is a lowercase
 * letter or digit, OR when the previous char is uppercase and the next is
 * lowercase (acronym boundary); the result is lowercased.
 *
 * KEEP IN SYNC with `@aihu/compiler` `kebabComponentTag`
 * (`packages/compiler/js/index.ts`) and the Rust normalizer (`tags.rs`).
 * The router deliberately does not depend on `@aihu/compiler` (same precedent
 * as `layoutTagFor` above), so this is a local copy of the algorithm.
 */
export function componentTagFor(name: string): string {
  let out = ''
  for (let i = 0; i < name.length; i++) {
    // charAt (not name[i]) returns string, never string|undefined — satisfies
    // noUncheckedIndexedAccess; charAt(i+1) yields '' past the end, matching
    // the "no next char" case.
    const c = name.charAt(i)
    if (i > 0 && c >= 'A' && c <= 'Z') {
      const prev = name.charAt(i - 1)
      const next = name.charAt(i + 1)
      const prevLower = prev >= 'a' && prev <= 'z'
      const prevDigit = prev >= '0' && prev <= '9'
      const prevUpper = prev >= 'A' && prev <= 'Z'
      const nextLower = next >= 'a' && next <= 'z'
      if (prevLower || prevDigit || (prevUpper && nextLower)) out += '-'
    }
    out += c.toLowerCase()
  }
  return out
}

/** Strip the file extension off the LAST path segment, e.g. `a/b.aihu` →
 * `a/b`. Plain string ops, not a `\.[^/]+$/`-style regex — that shape is
 * vulnerable to catastrophic backtracking on pathological input with no
 * matching extension (CodeQL js/polynomial-redos): the engine retries the
 * greedy `[^/]+` match at every position where `\.` could start. */
function stripExtension(rel: string): string {
  const lastSlash = Math.max(rel.lastIndexOf('/'), rel.lastIndexOf('\\'))
  const lastDot = rel.lastIndexOf('.')
  return lastDot > lastSlash ? rel.slice(0, lastDot) : rel
}

function segs(rel: string): RouteSegment[] {
  const parts = stripExtension(rel)
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

/**
 * A syntactically valid custom-element tag: lowercase, starts with a letter,
 * contains at least one hyphen, and holds nothing but `[a-z0-9-]`.
 *
 * This is deliberately STRICTER than the HTML spec's `PotentialCustomElementName`
 * (which permits a large swathe of Unicode) and exactly matches the subset the
 * compiler will accept — C450 refuses to compile a component whose tag has no
 * hyphen, because `customElements.define` throws `SyntaxError` on one.
 *
 * `genC` uses it as a codegen boundary. The registry it emits is JavaScript
 * SOURCE built by string concatenation from names read out of `.aihu` files
 * (`@meta { name }` / `@route { name }` / the file stem), so an unvalidated tag
 * is an unvalidated value reaching a code-construction sink. `JSON.stringify`
 * does escape correctly, but "the sanitizer happens to be adequate" is a
 * weaker guarantee than "the value cannot contain anything needing escaping",
 * and only the latter is checkable at a glance. Anything failing this test
 * could never have registered as an element anyway, so dropping it costs no
 * working behaviour.
 */
const CUSTOM_ELEMENT_TAG = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/

/**
 * A module path safe to inline into a generated `import("…")` specifier.
 * Paths come from our own `readdirSync` walk, so this is a belt-and-braces
 * check on the same principle as `CUSTOM_ELEMENT_TAG`: reject anything holding
 * a quote, a backslash, or a line terminator (`\n`, `\r`, and the U+2028/U+2029
 * pair that `JSON.stringify` notably does NOT escape) rather than trust the
 * escaping. A path like that cannot survive a bundler's resolver regardless.
 */
const SAFE_MODULE_PATH = /^[^"'\\\n\r\u2028\u2029]+$/

/**
 * O1b: Resolve the custom-element tag a component file registers under.
 * Name precedence mirrors the compiler: explicit `@meta { name }` →
 * `@route { name }` → the file stem; the winner is normalized via
 * `componentTagFor`. Build-time only.
 */
export function readAihuComponentTag(f: string): string {
  const stem = basename(f).replace(/\.[^.]+$/, '')
  try {
    const content = readFileSync(f, 'utf8')
    const grab = (block: RegExpMatchArray | null): string | undefined => {
      if (!block) return undefined
      const m = block[1]!.match(/\bname\s*:\s*["']([^"']+)["']/)
      return m ? m[1] : undefined
    }
    const name =
      grab(content.match(/@meta\s*\{([^}]*)\}/)) ??
      grab(content.match(/@route\s*\{([^}]*)\}/)) ??
      stem
    return componentTagFor(name)
  } catch {
    return componentTagFor(stem)
  }
}

/**
 * O1b: Recursively scan a components dir for `.aihu` files, mapping each
 * file's normalized custom-element tag → absolute POSIX path. Unlike the flat
 * `scanLayouts`, components commonly nest in subdirectories. On a tag
 * collision the last file wins, but the collision is warned so it's not
 * silent. Build-time only.
 */
export function scanComponents(d: string): Record<string, string> {
  const m: Record<string, string> = {}
  if (!existsSync(d)) return m
  const w = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const fp = join(dir, e.name)
      if (e.isDirectory()) {
        w(fp)
      } else if (e.isFile() && e.name.endsWith('.aihu')) {
        const tag = readAihuComponentTag(fp)
        const posix = fp.replace(/\\/g, '/')
        const prev = m[tag]
        if (prev !== undefined && prev !== posix)
          console.warn(
            `[aihu-router] component tag collision: "${tag}" maps to both ${prev} and ${posix} (last wins)`,
          )
        m[tag] = posix
      }
    }
  }
  w(d)
  return m
}

/**
 * F2: extract the normalized component tags a layout SFC's `@template`
 * references, so `genL` can carry them on each `virtual:aihu-layouts` entry and
 * `@aihu/app` can register a layout's own children before the layout mounts —
 * mirroring the page path (route.json `components` → O1c).
 *
 * The `@template` block is located by a brace-balanced walk (templates nest
 * `{…}` freely — `@if { }`, interpolations — so the `readAihuRouteMeta`-style
 * `[^}]*` regex would truncate). Inside it, element OPENINGS are matched with
 * `/<([A-Za-z][A-Za-z0-9-]*)(?=[\s/>])/g` — closing tags (`</x>`) and special
 * forms (`<outlet>`) never match because the char after `<` must be a letter.
 * A matched tag counts as a component when it contains a hyphen OR starts with
 * an ASCII uppercase letter; winners are normalized via `componentTagFor`,
 * deduped, and sorted (deterministic output). Build-time only.
 *
 * KEEP IN SYNC with the Rust compiler's classification + collection:
 * `is_component_tag` (`packages/compiler/src/tags.rs`) and
 * `collect_component_tags` (`packages/compiler/src/codegen/emit.rs`). Like
 * `componentTagFor` above, this is a deliberate router-side mirror so the
 * router keeps zero compiler dependency.
 */
export function readAihuLayoutComponents(f: string): string[] {
  try {
    const content = readFileSync(f, 'utf8')
    const at = content.search(/@template\s*\{/)
    if (at === -1) return []
    const start = content.indexOf('{', at)
    let depth = 0
    let end = content.length
    for (let i = start; i < content.length; i++) {
      const c = content.charAt(i)
      if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        end = i
        break
      }
    }
    const body = content.slice(start + 1, end)
    const tags = new Set<string>()
    for (const m of body.matchAll(/<([A-Za-z][A-Za-z0-9-]*)(?=[\s/>])/g)) {
      const raw = m[1]!
      const c0 = raw.charAt(0)
      if (raw.includes('-') || (c0 >= 'A' && c0 <= 'Z')) tags.add(componentTagFor(raw))
    }
    return [...tags].sort()
  } catch {
    return []
  }
}

const SK = [
  'name',
  'middleware',
  'ssr',
  'layout',
  'params',
  'head',
  'components',
  'extract',
  'data',
] as const

/**
 * GX Phase 4 (#466): locate a page file's sibling loader
 * (`<stem>.loader.ts|js|tsx|jsx`), the file `@aihu/router` picks up as the
 * route's loader registration. Build-time only.
 */
function findLoaderSibling(f: string): string | null {
  const stem = join(dirname(f), basename(f).replace(/\.[^.]+$/, ''))
  for (const ext of ['.loader.ts', '.loader.js', '.loader.tsx', '.loader.jsx']) {
    if (existsSync(stem + ext)) return stem + ext
  }
  return null
}

/** GX P4: is a compiled `read` value hard-tier? Mirrors `deriveReadPolicy`'s
 * tier break (kept dependency-free here, like `componentTagFor`): absent →
 * compliance default; the four anonymous values → compliance; everything
 * else — `'verified'`/`'human'`/`{ scope }`/malformed — hard (fail-closed). */
function isHardRead(read: unknown): boolean {
  if (read === undefined || read === null) return false
  return !(read === 'all' || read === 'agents' || read === 'search' || read === 'none')
}

/**
 * GX Phase 4 (#466, spec §4.7): the build-layer governed-loader conflict
 * checks — this is the layer that can SEE sibling files (the Rust compiler
 * cannot), so C486/W48x live here.
 *
 * - C486 (build ERROR): `data:` + a sibling loader that is not the
 *   `defineGovernedFetch` escape hatch — one data source per route; a
 *   declared contradiction fails the build (R2), never resolves by silent
 *   precedence.
 * - W487 (build WARNING): a plain loader on a hard-tier `read:` route with
 *   no `data:` — the generated ergonomics are declined; output falls back to
 *   route-level T4 withholding at runtime.
 *
 * Detection of the escape hatch is textual (`defineGovernedFetch` in the
 * sibling source): build-time, no module evaluation. Exported for tests.
 */
export function checkGovernedLoaderConflicts(f: string, meta: RouteSidecar | null): void {
  const sibling = findLoaderSibling(f)
  if (!sibling) return
  let source = ''
  try {
    source = readFileSync(sibling, 'utf8')
  } catch {
    return
  }
  const isEscapeHatch = source.includes('defineGovernedFetch')
  if (meta?.data !== undefined && !isEscapeHatch) {
    throw new Error(
      `[aihu-router] C486: route file '${f}' declares data: AND a sibling loader ` +
        `('${sibling}') — one data source per route. Remove the sibling loader (the ` +
        'framework generates the governed loader), or convert it to defineGovernedFetch ' +
        '(replaces the provider stage only, never the gate).',
    )
  }
  if (meta?.data === undefined && isHardRead(meta?.extract?.read) && !isEscapeHatch) {
    console.warn(
      `[aihu-router] W487: route file '${f}' has a hard-tier read: with a plain sibling ` +
        `loader ('${sibling}') — its output is route-level withheld (T4 fallback). ` +
        'Declare data: or use defineGovernedFetch for the per-field governed contract.',
    )
  }
}

function genR(
  files: string[],
  pd: string,
  middlewareByDir: Record<string, string> = {},
  compileRouteMeta?: (source: string, id: string) => RouteSidecar | null,
): string {
  return `// AUTO-GENERATED\nexport default [\n${files
    .map((f) => {
      const s = segs(f.replace(/\\/g, '/').replace(new RegExp(`^.*?${pd}/`), ''))
      // Metadata precedence: disk sidecar (SSG/file-mode build) → compiler
      // route-json (the SPA build path, full head/middleware/params/ssr) →
      // @route source regex (name+layout only, when no compiler is wired).
      let meta: RouteSidecar | null = readRouteSidecar(f)
      if (!meta && compileRouteMeta && f.endsWith('.aihu')) {
        try {
          meta = compileRouteMeta(readFileSync(f, 'utf8'), f)
        } catch {
          meta = null
        }
      }
      // GX P4 (#466): governed-loader conflict checks (C486 error / W487 warn).
      checkGovernedLoaderConflicts(f, meta)
      const aihuMeta = !meta?.name && f.endsWith('.aihu') ? readAihuRouteMeta(f) : null
      const x = meta
        ? SK.filter((k) => meta[k] !== undefined)
            .map((k) => `    ${k}: ${JSON.stringify(meta[k])},`)
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

/**
 * v0.7.5: emit runtime-consumable entries — `{ tag, load, components }` — not
 * bare path strings. `load()` is a dynamic import so the layout SFC compiles +
 * registers its `aihu-layout-<name>` custom element on first use; `tag` lets
 * the client renderer `createElement` it without re-deriving the name;
 * `components` (F2) is the layout template's own referenced component tags
 * (`readAihuLayoutComponents`), so `@aihu/app` can register a layout's children
 * the same way it registers a page's. Exported for tests.
 */
export function genL(d: string): string {
  return `// AUTO-GENERATED\nexport default {\n${Object.entries(scanLayouts(d))
    .map(
      ([k, v]) =>
        `  ${JSON.stringify(k)}: { tag: ${JSON.stringify(layoutTagFor(k))}, load: () => import(${JSON.stringify(v)}), components: ${JSON.stringify(readAihuLayoutComponents(v))} },`,
    )
    .join('\n')}\n};\n`
}

/**
 * O1b: Generate the `virtual:aihu-components` module — the compile-time
 * tag → module registry. Keys are normalized custom-element tags; values are
 * `() => Promise` loaders (the key IS the tag, so no `{ tag, load }`
 * wrapper like `genL`). Keys are sorted so output is deterministic. Consumed
 * by O1c's route-scoped component registration. Exported for tests.
 *
 * TRANSITIVE by construction. A page's `route.json` `components` and a
 * layout's `genL` `components` each list only the tags THAT file's own
 * `@template` references — one level. But the compiler emits a child
 * component as a bare tag with NO import (`branch('search-box', …)` inside
 * site-header's output), so nothing else ever loads a nested component's
 * module: `<site-header>` would upgrade while the `<search-box>` inside it
 * stayed an inert unknown element. That gap is why apps end up hand-writing
 * `import './components/x.aihu'` side-effect lines in their client entry —
 * which defeats this registry entirely, since every such import drags every
 * island into the ENTRY chunk and every page then pays for every island.
 *
 * So each tag's loader here also loads that component's own transitive
 * children. The closure is computed at BUILD time (cycles broken by the
 * `seen` set, self-references dropped), so there is no runtime graph walk
 * and no possibility of a cyclic import hanging a page. Tags that resolve to
 * no registry entry are dropped rather than emitted as a dangling reference —
 * a template may legitimately name a globally-registered element the router
 * does not own.
 */
export function genC(d: string): string {
  const mods = scanComponents(d)

  // Validate at the codegen boundary. Everything below concatenates these two
  // values into JavaScript SOURCE, and both are read out of files on disk —
  // tags from a component's `@meta`/`@route` `name` (or its stem), paths from
  // the directory walk. Checking the shape here means the emitted module is
  // well-formed by construction rather than by trusting `JSON.stringify` to
  // escape whatever arrives. Neither drop loses working behaviour: a tag
  // failing CUSTOM_ELEMENT_TAG could never register (the compiler's own C450
  // refuses to build one), and a path failing SAFE_MODULE_PATH could never
  // resolve.
  const tags = Object.keys(mods)
    .filter((t) => {
      if (!CUSTOM_ELEMENT_TAG.test(t)) {
        console.warn(
          `[aihu-router] skipping component "${t}" (${mods[t]}): not a valid custom-element ` +
            `tag — must be lowercase [a-z0-9-] and contain a hyphen.`,
        )
        return false
      }
      if (!SAFE_MODULE_PATH.test(mods[t] as string)) {
        console.warn(
          `[aihu-router] skipping component "${t}": module path contains a quote, backslash, ` +
            `or line terminator (${JSON.stringify(mods[t])}).`,
        )
        return false
      }
      return true
    })
    .sort()

  // Direct child tags per component, restricted to tags this registry can load.
  const kids: Record<string, string[]> = {}
  for (const t of tags) {
    kids[t] = readAihuLayoutComponents(mods[t] as string).filter(
      (c) => c !== t && mods[c] !== undefined,
    )
  }

  /** Transitive children of `t`, excluding `t` itself. Cycle-safe. */
  const deps = (t: string): string[] => {
    const seen = new Set<string>()
    const stack = [...(kids[t] ?? [])]
    while (stack.length > 0) {
      const c = stack.pop() as string
      if (c === t || seen.has(c)) continue
      seen.add(c)
      stack.push(...(kids[c] ?? []))
    }
    return [...seen].sort()
  }

  const loaders = tags
    .map((t) => `  ${JSON.stringify(t)}: () => import(${JSON.stringify(mods[t])}),`)
    .join('\n')

  const entries = tags
    .map((t) => {
      const d = deps(t)
      if (d.length === 0) return `  ${JSON.stringify(t)}: __m[${JSON.stringify(t)}],`
      const all = [t, ...d].map((x) => `__m[${JSON.stringify(x)}]()`).join(', ')
      return `  ${JSON.stringify(t)}: () => Promise.all([${all}]),`
    })
    .join('\n')

  return `// AUTO-GENERATED\nconst __m = {\n${loaders}\n};\nexport default {\n${entries}\n};\n`
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
    ld = opts?.layoutsDir ?? 'src/layouts',
    cd = opts?.componentsDir ?? 'src/components'
  let root = process.cwd(),
    cr: string | null = null,
    cl: string | null = null,
    cc: string | null = null
  return {
    name: 'aihu-router',
    resolveId: (id) =>
      id === 'virtual:aihu-routes'
        ? RR
        : id === 'virtual:aihu-layouts'
          ? LR
          : id === 'virtual:aihu-components'
            ? CR
            : null,
    load(id) {
      if (id === RR) {
        if (!cr) {
          // v0.7.2: use scanPages to also pick up _middleware files
          const scan = scanPages(root, pd)
          cr = genR(scan.routes, pd, scan.middlewareByDir, opts?.compileRouteMeta)
        }
        return cr
      }
      if (id === LR) return (cl ??= genL(resolve(root, ld)))
      if (id === CR) return (cc ??= genC(resolve(root, cd)))
      return null
    },
    configureServer(server) {
      const s = server as unknown as { config?: { root?: string } } & typeof server
      if (s.config?.root) root = s.config.root
      const pa = resolve(root, pd),
        la = resolve(root, ld),
        ca = resolve(root, cd)
      server.watcher.add(pa)
      server.watcher.add(la)
      server.watcher.add(ca)
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
        ),
        ic = mk(
          ca,
          () => {
            cc = null
          },
          CR,
        )
      server.watcher.on('add', (p) => {
        ir(p)
        il(p)
        ic(p)
      })
      server.watcher.on('unlink', (p) => {
        ir(p)
        il(p)
        ic(p)
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
