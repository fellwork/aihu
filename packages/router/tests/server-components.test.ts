/**
 * `genSC()` — the `virtual:aihu-server-components` registry for
 * `output: 'ssr'` builds.
 *
 * The contract under test is REACHABILITY: the walk starts at the PAGES and
 * follows `__aihu_child_tags__` render edges, so an orphan (a component no page
 * reaches) and a DECLINED reference (one the emitter refuses to lower, so it
 * produces no `__aihu_schild` call site and can never be looked up) both stay
 * out of the server bundle. Upload weight is the currency on a Worker.
 *
 * `deriveChildTags` is injected here rather than reaching for the real
 * compiler, deliberately: the unit under test is the WALK. That the injected
 * function's real implementation (`@aihu/compiler`'s `_deriveChildTags`) agrees
 * with what `__aihu_schild` looks up is a different claim, pinned by the
 * compiler's own `__aihu_child_tags__` parity test and end-to-end by
 * `packages/app/tests/workers-ssr-e2e.test.ts` against a real `vite build`.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { genSC, viteRouterPlugin } from '../src/vite-plugin.ts'

const dirs: string[] = []

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  vi.restoreAllMocks()
})

/** Build a temp project: `pages/` + `src/components/`. Returns absolute paths. */
function project(files: Record<string, string>): { root: string; pages: string[] } {
  const root = mkdtempSync(join(tmpdir(), 'aihu-gensc-'))
  dirs.push(root)
  const pages: string[] = []
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, rel)
    mkdirSync(join(abs, '..'), { recursive: true })
    writeFileSync(abs, body, 'utf8')
    if (rel.startsWith('pages/')) pages.push(abs.replace(/\\/g, '/'))
  }
  return { root, pages: pages.sort() }
}

/**
 * A stand-in for `@aihu/compiler`'s `_deriveChildTags`: reads an explicit
 * `// @schild a,b` line out of the fixture source. Explicit because the point
 * of the fixture is to separate the three sets by hand — a source-shaped
 * heuristic here would just re-implement `readAihuLayoutComponents`, which is
 * the derivation the walk deliberately does NOT use.
 */
function fakeDerive(source: string): string[] {
  const m = /^\/\/ @schild (.+)$/m.exec(source)
  return m === null ? [] : (m[1] as string).split(',').map((s) => s.trim())
}

/** Tag keys of a generated registry module, in emission order. */
function tagsOf(source: string): string[] {
  return Array.from(source.matchAll(/^ {2}"([^"]+)": \(\) => import\(/gm), (m) => m[1] as string)
}

// ---------------------------------------------------------------------------
// The three-way fixture: leaf, nested child, orphan, declined reference.
// ---------------------------------------------------------------------------

/**
 * `probe-attr` is the DECLINED reference. The page's template names it, so a
 * source regex would bundle it — but the emitter refuses to lower a reference
 * carrying an attribute under the v1 child boundaries, so it produces no
 * `__aihu_schild` call site and `__aihu_schild` can never look it up. Bundling
 * it is upload weight for an element that renders empty either way.
 *
 * `probe-orphan` exists in the components dir and is reached by nothing.
 */
function threeWayFixture() {
  return project({
    'pages/index.aihu':
      '// @schild probe-card\n@template { <probe-card /><probe-attr city="x" /> }',
    'src/components/probe-card.aihu': '// @schild probe-inner\n@template { <probe-inner /> }',
    'src/components/probe-inner.aihu': '@template { <p>leaf</p> }',
    'src/components/probe-attr.aihu': '@template { <p>declined</p> }',
    'src/components/probe-orphan.aihu': '@template { <p>orphan</p> }',
  })
}

describe('genSC() walks render edges from the pages', () => {
  it('bundles exactly the reachable subgraph — orphan and declined reference excluded', () => {
    const { root, pages } = threeWayFixture()
    const out = genSC(pages, join(root, 'src/components'), fakeDerive)
    // Pinned as an exact list, not a set of `toContain`s: the failure this
    // guards is over-inclusion, and `toContain` cannot see it.
    expect(tagsOf(out)).toEqual(['probe-card', 'probe-inner'])
  })

  it('reaches through one component to the next — nesting is transitive', () => {
    const { root, pages } = threeWayFixture()
    // `probe-inner` is named by NO page. It is in only because `probe-card` is
    // reachable and names it.
    expect(tagsOf(genSC(pages, join(root, 'src/components'), fakeDerive))).toContain('probe-inner')
  })

  it("emits a FLAT tag -> loader map, not genC's transitive Promise.all bundle", () => {
    // `buildChildRegistry` indexes tag -> MODULE. A `Promise.all` of
    // side-effect imports has no tag to index by and no module to hand back.
    const { root, pages } = threeWayFixture()
    const out = genSC(pages, join(root, 'src/components'), fakeDerive)
    expect(out).not.toContain('Promise.all')
    expect(out).toMatch(/"probe-card": \(\) => import\("[^"]*probe-card\.aihu"\)/)
  })

  it('terminates on a tag the components dir does not claim', () => {
    // A third-party globally-registered element. `__aihu_schild` already fails
    // closed on it; the walk must not error or emit a dangling import.
    const { root, pages } = project({
      'pages/index.aihu': '// @schild third-party-widget,probe-card\n@template { <x /> }',
      'src/components/probe-card.aihu': '@template { <p>x</p> }',
    })
    const out = genSC(pages, join(root, 'src/components'), fakeDerive)
    expect(tagsOf(out)).toEqual(['probe-card'])
    expect(out).not.toContain('third-party-widget')
  })

  it('survives a reference cycle rather than hanging', () => {
    // `ChildCycle` documents why a cycle is legal and bounded at render time.
    // The walk must not spin on one.
    const { root, pages } = project({
      'pages/index.aihu': '// @schild tree-node\n@template { <tree-node /> }',
      'src/components/tree-node.aihu': '// @schild tree-node,tree-leaf\n@template { <x /> }',
      'src/components/tree-leaf.aihu': '@template { <p>leaf</p> }',
    })
    expect(tagsOf(genSC(pages, join(root, 'src/components'), fakeDerive))).toEqual([
      'tree-leaf',
      'tree-node',
    ])
  })

  it('ignores non-SFC page files instead of trying to compile them', () => {
    const { root, pages } = project({
      'pages/api.ts': 'export const loader = () => ({})',
      'pages/index.aihu': '// @schild probe-card\n@template { <probe-card /> }',
      'src/components/probe-card.aihu': '@template { <p>x</p> }',
    })
    const derive = vi.fn(fakeDerive)
    const out = genSC(pages, join(root, 'src/components'), derive)
    expect(tagsOf(out)).toEqual(['probe-card'])
    for (const call of derive.mock.calls) expect(call[1]).toMatch(/\.aihu$/)
  })

  it('emits an empty registry when no page references anything', () => {
    const { root, pages } = project({
      'pages/index.aihu': '@template { <p>plain</p> }',
      'src/components/probe-orphan.aihu': '@template { <p>orphan</p> }',
    })
    expect(tagsOf(genSC(pages, join(root, 'src/components'), fakeDerive))).toEqual([])
  })

  it('emits an empty registry when the components dir does not exist', () => {
    const { root, pages } = project({
      'pages/index.aihu': '// @schild probe-card\n@template { <probe-card /> }',
    })
    expect(tagsOf(genSC(pages, join(root, 'src/components'), fakeDerive))).toEqual([])
  })
})

describe('genSC() roots the walk at the LAYOUTS as well as the pages', () => {
  /** A project with a layout that references a component no page names. */
  function layoutFixture() {
    const p = project({
      'pages/index.aihu': '// @schild probe-card\n@template { <probe-card /> }',
      'src/layouts/app.aihu': '// @schild site-nav\n@template { <site-nav /><outlet /> }',
      'src/components/probe-card.aihu': '@template { <p>x</p> }',
      'src/components/site-nav.aihu': '// @schild nav-link\n@template { <nav-link /> }',
      'src/components/nav-link.aihu': '@template { <a>link</a> }',
      'src/components/probe-orphan.aihu': '@template { <p>orphan</p> }',
    })
    return { ...p, layouts: [join(p.root, 'src/layouts/app.aihu').replace(/\\/g, '/')] }
  }

  it('bundles the components a LAYOUT references, transitively', () => {
    // `@aihu/router/server` composes layouts into every live SSR response, and
    // a layout is where a site's nav, header and footer live. Rooting the walk
    // at pages alone left every one of those components out of the server
    // bundle, so the shell rendered with all of them as empty elements — on
    // EVERY route, which is worse than the page-level failure this walk exists
    // to fix.
    const { root, pages, layouts } = layoutFixture()
    const out = genSC(pages, join(root, 'src/components'), fakeDerive, layouts)
    expect(tagsOf(out)).toEqual(['nav-link', 'probe-card', 'site-nav'])
  })

  it('still drops the orphan — layouts are roots, not an escape hatch', () => {
    // The whole point of reachability is upload weight. Adding a second root
    // set must not quietly become "bundle everything".
    const { root, pages, layouts } = layoutFixture()
    expect(tagsOf(genSC(pages, join(root, 'src/components'), fakeDerive, layouts))).not.toContain(
      'probe-orphan',
    )
  })

  it('is byte-identical to the old call shape when no layouts are passed', () => {
    // The parameter is defaulted, so every pre-layout caller keeps its exact
    // behaviour. This is also the control for the assertion above: without it,
    // "bundles the layout's components" could pass because the walk bundles
    // everything.
    const { root, pages, layouts } = layoutFixture()
    const withoutLayouts = genSC(pages, join(root, 'src/components'), fakeDerive)
    expect(tagsOf(withoutLayouts)).toEqual(['probe-card'])
    expect(withoutLayouts).toBe(genSC(pages, join(root, 'src/components'), fakeDerive, []))
    expect(withoutLayouts).not.toBe(genSC(pages, join(root, 'src/components'), fakeDerive, layouts))
  })
})

describe('genSC() codegen-boundary validation', () => {
  it('drops a hyphen-less tag that could never register, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { root, pages } = project({
      'pages/index.aihu': '// @schild plain,probe-card\n@template { <x /> }',
      // A hyphen-less stem: the compiler's own C450 refuses to build one, and
      // `customElements.define` throws on it. Dropping costs no behaviour.
      'src/components/plain.aihu': '@template { <p>x</p> }',
      'src/components/probe-card.aihu': '@template { <p>x</p> }',
    })
    expect(tagsOf(genSC(pages, join(root, 'src/components'), fakeDerive))).toEqual(['probe-card'])
    expect(warn.mock.calls.flat().join('\n')).toContain('not a valid custom-element tag')
  })
})

describe('genSC() without deriveChildTags falls back loudly', () => {
  it('bundles every component and warns, rather than emitting an empty registry', () => {
    // Emitting nothing would be the silently-empty-children failure one layer
    // up: a registry that renders every reference as a bare element with no
    // message distinguishing it from a broken build.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { root, pages } = threeWayFixture()
    const out = genSC(pages, join(root, 'src/components'))
    expect(tagsOf(out)).toEqual(['probe-attr', 'probe-card', 'probe-inner', 'probe-orphan'])
    expect(warn.mock.calls.flat().join('\n')).toContain('deriveChildTags')
  })
})

describe('viteRouterPlugin serves virtual:aihu-server-components', () => {
  it('resolves the id to a NUL-prefixed internal id and loads the generated source', () => {
    const { root } = threeWayFixture()
    const plugin = viteRouterPlugin({
      pagesDir: 'pages',
      componentsDir: 'src/components',
      deriveChildTags: fakeDerive,
    })
    // The plugin defaults `root` to cwd and only picks up the real root from
    // configureServer; drive it directly the way the o1b tests do.
    plugin.configureServer?.({
      config: { root },
      watcher: { add: () => {}, on: () => {} },
      moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} },
    } as never)

    const resolved = plugin.resolveId?.('virtual:aihu-server-components')
    expect(resolved).toBe('\0virtual:aihu-server-components')
    const loaded = plugin.load?.(resolved as string)
    expect(tagsOf(loaded as string)).toEqual(['probe-card', 'probe-inner'])
  })

  it('scans the LAYOUTS dir and feeds it to the walk', () => {
    // `genSC` accepting layout roots is worth nothing if the plugin never
    // passes any. This asserts the WIRING — the one place a defaulted
    // parameter can silently stay defaulted forever.
    const p = project({
      'pages/index.aihu': '// @schild probe-card\n@template { <probe-card /> }',
      'src/layouts/app.aihu': '// @schild site-nav\n@template { <site-nav /><outlet /> }',
      'src/components/probe-card.aihu': '@template { <p>x</p> }',
      'src/components/site-nav.aihu': '@template { <nav>n</nav> }',
    })
    const plugin = viteRouterPlugin({
      pagesDir: 'pages',
      layoutsDir: 'src/layouts',
      componentsDir: 'src/components',
      deriveChildTags: fakeDerive,
    })
    plugin.configureServer?.({
      config: { root: p.root },
      watcher: { add: () => {}, on: () => {} },
      moduleGraph: { getModuleById: () => undefined, invalidateModule: () => {} },
    } as never)
    const loaded = plugin.load?.(plugin.resolveId?.('virtual:aihu-server-components') as string)
    expect(tagsOf(loaded as string)).toEqual(['probe-card', 'site-nav'])
  })

  it('leaves unrelated ids alone', () => {
    const plugin = viteRouterPlugin()
    expect(plugin.resolveId?.('virtual:aihu-server-entry')).toBeNull()
    expect(plugin.load?.('\0virtual:aihu-server-entry')).toBeNull()
  })
})
