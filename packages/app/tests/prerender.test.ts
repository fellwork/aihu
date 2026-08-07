/**
 * SSG prerender tests (B4, SEO arc).
 *
 * Three layers of proof:
 *   1. defineConfig accepts `output: 'static'` and the `site` field.
 *   2. runPrerender against a tmp pages dir + a real built `index.html`
 *      template — asserts per-route `<pattern>/index.html` files are written
 *      with the correct per-page <head> (title/description/canonical/og/twitter/
 *      JSON-LD, absolute URLs) and rendered <body> content (not an empty shell).
 *   3. Dynamic-route handling: getStaticPaths() → one HTML per path; absent →
 *      skipped + a clear build warning.
 *
 * The route modules are supplied via a custom `loadModule` so the test
 * exercises the full prerender pipeline (route derivation, head folding from
 * `.route.json` sidecars, content rendering via @aihu/server's renderToString,
 * template head-injection + outlet content-injection, dynamic-path expansion)
 * without requiring the Rust SFC compiler.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { useRoute } from '@aihu/router'
import type { ResolvedConfig } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import { AihuConfigError, defineConfig } from '../src/config.ts'
import { prerenderClose, runPrerender, type SsrModuleLoader } from '../src/prerender.ts'

// ─── defineConfig: static mode + site ────────────────────────────────────────

describe('defineConfig — static output + site', () => {
  it("accepts output: 'static'", () => {
    expect(() => defineConfig({ output: 'static' })).not.toThrow()
  })

  it("still accepts output: 'spa'", () => {
    expect(() => defineConfig({ output: 'spa' })).not.toThrow()
  })

  it('rejects an unknown output mode', () => {
    // @ts-expect-error — intentionally invalid for the runtime guard test.
    expect(() => defineConfig({ output: 'ssr' })).toThrow(AihuConfigError)
  })

  it('accepts site.url', () => {
    const cfg = defineConfig({ output: 'static', site: { url: 'https://example.com' } })
    expect(cfg.site?.url).toBe('https://example.com')
  })
})

// ─── runPrerender — fixture build harness ─────────────────────────────────────

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Scaffold Default</title>
  </head>
  <body>
    <div id="outlet"></div>
    <script type="module" src="/assets/main-abc123.js"></script>
  </body>
</html>
`

interface Fixture {
  root: string
  outDir: string
  resolvedViteConfig: ResolvedConfig
  warnings: string[]
  warn: (m: string) => void
}

async function makeFixture(): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'aihu-ssg-'))
  const outDir = join(root, 'dist')
  await mkdir(join(root, 'pages'), { recursive: true })
  await mkdir(outDir, { recursive: true })
  // The "built" SPA index.html — our prerender template (carries the client
  // bundle <script> tag, so prerendered pages still hydrate into the SPA).
  await writeFile(join(outDir, 'index.html'), TEMPLATE)
  const warnings: string[] = []
  const resolvedViteConfig = {
    root,
    build: { outDir: 'dist' },
  } as unknown as ResolvedConfig
  return { root, outDir, resolvedViteConfig, warnings, warn: (m) => warnings.push(m) }
}

/** Write a route file + its `.route.json` sidecar into the pages dir. */
async function writeRoute(
  root: string,
  relPath: string,
  sidecar: Record<string, unknown> | null,
): Promise<void> {
  const abs = join(root, 'pages', relPath)
  await mkdir(join(abs, '..'), { recursive: true })
  await writeFile(abs, '// route stub\n')
  if (sidecar) {
    const sidecarPath = abs.replace(/\.[^.]+$/, '.route.json')
    await writeFile(sidecarPath, JSON.stringify(sidecar))
  }
}

describe('runPrerender — static routes', () => {
  let fx: Fixture
  afterEach(async () => {
    if (fx) await rm(fx.root, { recursive: true, force: true })
  })

  it('writes per-route index.html with per-page <head> and rendered <body>', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', {
      name: 'home-page',
      head: { title: 'Home', description: 'Welcome home' },
    })
    await writeRoute(fx.root, 'about.ts', {
      name: 'about-page',
      head: {
        title: 'About Us',
        description: 'About this site',
        canonical: '/about',
        og: { title: 'About OG', image: '/og/about.png', type: 'website' },
        twitter: { card: 'summary', title: 'About TW' },
        jsonld: '{"@context":"https://schema.org","@type":"AboutPage","name":"About"}',
      },
    })

    const loadModule: SsrModuleLoader = async (file) => {
      const f = file.replace(/\\/g, '/')
      if (f.endsWith('/index.ts')) {
        return {
          default: () => ({
            kind: 'branch',
            tag: 'h1',
            children: [{ kind: 'leaf', leafKind: 'text', value: 'Home Content' }],
          }),
        }
      }
      return { default: { toHtml: () => '<article><h1>About Content</h1></article>' } }
    }

    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', site: { url: 'https://example.com' }, dir: { pages: 'pages' } },
      loadModule,
      warn: fx.warn,
    })

    expect(result.written.sort()).toEqual(['about/index.html', 'index.html'])

    // Root route content + head
    const homeHtml = await readFile(join(fx.outDir, 'index.html'), 'utf8')
    expect(homeHtml).toContain('<title>Home</title>')
    expect(homeHtml).not.toContain('<title>Scaffold Default</title>')
    expect(homeHtml).toContain('<meta name="description" content="Welcome home">')
    // Assert the CONTENT is reachable, not an exact markup blob: since DA3b the
    // prerenderer renders with `hydratable: true`, so elements legitimately
    // carry `data-aihu-path` markers and `<h1>Home Content</h1>` no longer
    // appears verbatim. Pinning the blob would have made this test fail on the
    // fix rather than on a regression.
    expect(homeHtml).toMatch(/<h1[^>]*>Home Content<\/h1>/)
    // Client bundle script preserved → page hydrates into SPA. That is exactly
    // why the markers must be present: without them the client walker has
    // nothing to adopt and rebuilds the tree beside the prerendered DOM.
    expect(homeHtml).toContain('src="/assets/main-abc123.js"')
    expect(homeHtml).toContain('data-aihu-path')

    // About route — full head surface + absolute URL resolution
    const aboutHtml = await readFile(join(fx.outDir, 'about', 'index.html'), 'utf8')
    expect(aboutHtml).toContain('<title>About Us</title>')
    expect(aboutHtml).toContain('<meta name="description" content="About this site">')
    expect(aboutHtml).toContain('<link rel="canonical" href="https://example.com/about">')
    expect(aboutHtml).toContain('<meta property="og:title" content="About OG">')
    expect(aboutHtml).toContain(
      '<meta property="og:image" content="https://example.com/og/about.png">',
    )
    expect(aboutHtml).toContain('<meta property="og:type" content="website">')
    expect(aboutHtml).toContain('<meta name="twitter:card" content="summary">')
    expect(aboutHtml).toContain('<meta name="twitter:title" content="About TW">')
    expect(aboutHtml).toContain('<script type="application/ld+json">')
    expect(aboutHtml).toContain('"@type":"AboutPage"')
    expect(aboutHtml).toContain('<article><h1>About Content</h1></article>')
    expect(aboutHtml).toContain('src="/assets/main-abc123.js"')
  })

  it('folds globalHead (app.head) under per-route overrides', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home', head: { title: 'Page Title' } })
    const loadModule: SsrModuleLoader = async () => ({ default: { toHtml: () => '<p>x</p>' } })

    await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: {
        output: 'static',
        dir: { pages: 'pages' },
        app: { head: { meta: [{ name: 'author', content: 'Aihu' }] } as never },
      },
      loadModule,
      warn: fx.warn,
    })

    const html = await readFile(join(fx.outDir, 'index.html'), 'utf8')
    expect(html).toContain('<title>Page Title</title>')
    expect(html).toContain('<meta name="author" content="Aihu">')
  })
})

// ─── runPrerender — SSR layout parity (#7) ────────────────────────────────────

describe('runPrerender — layout composition', () => {
  let fx: Fixture
  afterEach(async () => {
    if (fx) await rm(fx.root, { recursive: true, force: true })
  })

  /** Write a layout `.aihu` file under the layouts dir (content irrelevant —
   * loadModule is mocked; scanLayouts only needs the file to exist). */
  async function writeLayout(root: string, name: string): Promise<void> {
    const dir = join(root, 'src', 'layouts')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${name}.aihu`), '<layout/>\n')
  }

  it('renders the page INSIDE the layout outlet marker', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', {
      name: 'home-page',
      layout: 'app',
      head: { title: 'Home' },
    })
    await writeLayout(fx.root, 'app')

    const loadModule: SsrModuleLoader = async (file) => {
      const f = file.replace(/\\/g, '/')
      if (f.endsWith('/src/layouts/app.aihu')) {
        return {
          default: {
            toHtml: () =>
              '<div class="shell"><header>App Header</header><main data-aihu-outlet></main></div>',
          },
        }
      }
      return { default: { toHtml: () => '<h1>Home Content</h1>' } }
    }

    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', layouts: 'src/layouts' } },
      loadModule,
      warn: fx.warn,
    })

    expect(result.written).toContain('index.html')
    const html = await readFile(join(fx.outDir, 'index.html'), 'utf8')
    // Layout shell present…
    expect(html).toContain('<header>App Header</header>')
    // …and the page content is INSIDE the layout's data-aihu-outlet marker.
    expect(html).toMatch(/data-aihu-outlet[^>]*><h1>Home Content<\/h1><\/main>/)
    // Per-route head still applied to the document.
    expect(html).toContain('<title>Home</title>')
    expect(html).toContain('src="/assets/main-abc123.js"')
  })

  it('stamps each module’s __aihu_light_scope__ as data-a on its prerendered root (LDF §10 step 3)', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home-page', layout: 'app' })
    await writeLayout(fx.root, 'app')

    // Both modules carry the compiler's server-target scope export. The layout
    // is an arbor factory (the walker path); its root must carry the LAYOUT's
    // id and the page root the PAGE's id — the ids must not cross, because the
    // page root's `data-a` is also the layout scope's `to ([data-a])` boundary.
    const loadModule: SsrModuleLoader = async (file) => {
      const f = file.replace(/\\/g, '/')
      if (f.endsWith('/src/layouts/app.aihu')) {
        return {
          __aihu_light_scope__: 'aabbccdd',
          default: () => ({
            kind: 'branch',
            tag: 'div',
            attrs: { class: 'shell' },
            children: [
              {
                kind: 'branch',
                tag: 'main',
                attrs: { 'data-aihu-outlet': '' },
                children: [],
              },
            ],
          }),
        }
      }
      return {
        __aihu_light_scope__: '11223344',
        default: () => ({
          kind: 'branch',
          tag: 'article',
          children: [{ kind: 'leaf', leafKind: 'text', value: 'Page Content' }],
        }),
      }
    }

    await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', layouts: 'src/layouts' } },
      loadModule,
      warn: fx.warn,
    })

    const html = await readFile(join(fx.outDir, 'index.html'), 'utf8')
    // Layout root: its own scope id, on the ROOT element only.
    expect(html).toMatch(/<div class="shell" data-a="aabbccdd" data-aihu-path="0">/)
    // Page root: its own scope id — inside the layout's outlet marker.
    expect(html).toMatch(/<article data-a="11223344" data-aihu-path="0">Page Content<\/article>/)
    // Root-only: no other element gained a data-a stamp.
    expect(html.match(/ data-a="/g)).toHaveLength(2)
  })

  it('falls back to the SPA shell when the layout has no SSR-renderable default', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home-page', layout: 'app' })
    await writeLayout(fx.root, 'app')

    const loadModule: SsrModuleLoader = async (file) => {
      // Compiled-SFC layout: side-effect custom element, no default renderable.
      if (file.replace(/\\/g, '/').endsWith('/src/layouts/app.aihu')) return { default: undefined }
      return { default: { toHtml: () => '<h1>Home Content</h1>' } }
    }

    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', layouts: 'src/layouts' } },
      loadModule,
      warn: fx.warn,
    })

    const html = await readFile(join(fx.outDir, 'index.html'), 'utf8')
    expect(html).toContain('<h1>Home Content</h1>') // page still ships
    expect(html).not.toContain('App Header') // layout not server-rendered
    expect(result.warnings.join('\n')).toMatch(/no SSR-renderable default/)
  })

  it('warns and ships the page unwrapped when the layout has no <outlet> marker', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home-page', layout: 'broken' })
    await writeLayout(fx.root, 'broken')

    const loadModule: SsrModuleLoader = async (file) => {
      if (file.replace(/\\/g, '/').endsWith('/src/layouts/broken.aihu')) {
        return { default: { toHtml: () => '<div class="shell">no outlet here</div>' } }
      }
      return { default: { toHtml: () => '<h1>Home Content</h1>' } }
    }

    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', layouts: 'src/layouts' } },
      loadModule,
      warn: fx.warn,
    })

    const html = await readFile(join(fx.outDir, 'index.html'), 'utf8')
    expect(html).toContain('<h1>Home Content</h1>') // page still ships
    expect(result.warnings.join('\n')).toMatch(/renders no <outlet>/)
  })

  // ─── the no-sidecar path — i.e. every real build ──────────────────────────
  //
  // The three tests above all hand `writeRoute` a sidecar object, so they only
  // ever exercised `readRouteSidecar()` returning a populated record. A real
  // SSG build never produces one: routes compile through the stdin path, which
  // writes no `.route.json` to disk. `sidecar?.layout` was therefore ALWAYS
  // undefined in production, layouts were never prerendered, and nothing warned
  // — the layout warnings above are all downstream of a name that never
  // arrived. The suite could not catch it because the fixture supplied by hand
  // exactly the artifact the build does not emit.
  //
  // So this test writes a real `.aihu` source with NO sidecar and asserts the
  // layout still wraps the page, recovered from source via `compileRouteMeta`.
  it('recovers the layout from source when no .route.json sidecar exists', async () => {
    fx = await makeFixture()
    const routePath = join(fx.root, 'pages', 'index.aihu')
    await writeFile(
      routePath,
      '@route {\n  layout: "app"\n}\n\n@template {\n  <h1>Home Content</h1>\n}\n',
    )
    await writeLayout(fx.root, 'app')

    const loadModule: SsrModuleLoader = async (file) => {
      if (file.replace(/\\/g, '/').endsWith('/src/layouts/app.aihu')) {
        return {
          default: {
            toHtml: () =>
              '<div class="shell"><header>App Header</header><main data-aihu-outlet></main></div>',
          },
        }
      }
      return { default: { toHtml: () => '<h1>Home Content</h1>' } }
    }

    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', layouts: 'src/layouts' } },
      loadModule,
      warn: fx.warn,
    })

    expect(result.written).toContain('index.html')
    const html = await readFile(join(fx.outDir, 'index.html'), 'utf8')
    expect(html).toContain('<header>App Header</header>')
    expect(html).toMatch(/data-aihu-outlet[^>]*><h1>Home Content<\/h1><\/main>/)
  })
})

describe('runPrerender — dynamic routes', () => {
  let fx: Fixture
  afterEach(async () => {
    if (fx) await rm(fx.root, { recursive: true, force: true })
  })

  it('prerenders one HTML per getStaticPaths() entry', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, join('posts', '[slug].ts'), {
      name: 'post-page',
      head: { title: 'A Post', canonical: '/posts/x' },
    })

    const loadModule: SsrModuleLoader = async () => ({
      default: { toHtml: () => '<article>Post</article>' },
      getStaticPaths: () => [{ slug: 'hello' }, { params: { slug: 'world' } }],
    })

    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', site: { url: 'https://example.com' }, dir: { pages: 'pages' } },
      loadModule,
      warn: fx.warn,
    })

    expect(result.written.sort()).toEqual(['posts/hello/index.html', 'posts/world/index.html'])
    const hello = await readFile(join(fx.outDir, 'posts', 'hello', 'index.html'), 'utf8')
    expect(hello).toContain('<article>Post</article>')
    expect(hello).toContain('<title>A Post</title>')
    const world = await readFile(join(fx.outDir, 'posts', 'world', 'index.html'), 'utf8')
    expect(world).toContain('<article>Post</article>')
  })

  it('skips a dynamic route with no getStaticPaths() and warns clearly', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, join('posts', '[slug].ts'), { name: 'post-page' })

    const loadModule: SsrModuleLoader = async () => ({
      default: { toHtml: () => '<article>Post</article>' },
      // no getStaticPaths
    })

    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages' } },
      loadModule,
      warn: fx.warn,
    })

    expect(result.written).toEqual([])
    expect(result.warnings.join('\n')).toMatch(/dynamic route .* has no getStaticPaths/)
  })
})

describe('runPrerender — edge cases', () => {
  let fx: Fixture
  afterEach(async () => {
    if (fx) await rm(fx.root, { recursive: true, force: true })
  })

  it('warns and writes nothing when a route lacks a renderable default', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home' })
    const loadModule: SsrModuleLoader = async () => ({ default: undefined })

    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages' } },
      loadModule,
      warn: fx.warn,
    })

    expect(result.written).toEqual([])
    expect(result.warnings.join('\n')).toMatch(/no renderable default export/)
  })

  it('relative canonical stays relative when no site.url is configured', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'about.ts', {
      name: 'about',
      head: { title: 'About', canonical: '/about' },
    })
    const loadModule: SsrModuleLoader = async () => ({ default: { toHtml: () => '<p>a</p>' } })

    await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages' } },
      loadModule,
      warn: fx.warn,
    })

    const html = await readFile(join(fx.outDir, 'about', 'index.html'), 'utf8')
    expect(html).toContain('<link rel="canonical" href="/about">')
  })
})

// ─── runPrerender — component discovery (SSR follow-ups §17/§18) ─────────────
//
// `docs/plans/2026-08-06-ssr-child-followups.md` §17/§18: `discoverComponents`
// used to load every `.aihu` file under the components dir one at a time
// (`for (const file of files.sort()) { await loadModule(file) }`), and warned
// on EVERY build about every component that failed to load under SSR —
// including demo/example components nothing on the site references.

describe('runPrerender — component discovery', () => {
  let fx: Fixture
  afterEach(async () => {
    if (fx) await rm(fx.root, { recursive: true, force: true })
  })

  it('§17: loads discovered components concurrently, not one at a time', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home' })
    const componentsDir = join(fx.root, 'src', 'components')
    await mkdir(componentsDir, { recursive: true })
    const COUNT = 5
    const DELAY_MS = 60
    for (let i = 0; i < COUNT; i++) {
      await writeFile(join(componentsDir, `widget-${i}.aihu`), '<div/>\n')
    }

    // OBSERVE CONCURRENCY, don't time it. A wall-clock threshold
    // (`elapsed < COUNT * DELAY_MS * 0.6`) is the obvious assertion and the
    // wrong one: it is a flake waiting for a loaded CI box, and it only
    // measures the property indirectly. Counting how many loads are in flight
    // at once tests the actual claim — the loop fans out — and is immune to how
    // fast the machine happens to be.
    let inFlight = 0
    let maxInFlight = 0
    const loadModule: SsrModuleLoader = async (file) => {
      const f = file.replace(/\\/g, '/')
      if (f.endsWith('/index.ts')) return { default: { toHtml: () => '<p>home</p>' } }
      inFlight++
      maxInFlight = Math.max(maxInFlight, inFlight)
      try {
        // Stands in for real per-module cost (Vite transform + I/O). The delay
        // only has to be long enough that a serial loop cannot overlap.
        await new Promise((r) => setTimeout(r, DELAY_MS))
        const stem = f.slice(f.lastIndexOf('/') + 1).replace(/\.aihu$/, '')
        return { __aihu_tag__: stem }
      } finally {
        inFlight--
      }
    }

    await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', components: 'src/components' } },
      loadModule,
      warn: fx.warn,
    })

    // A serial loop can never exceed 1. Asserting the exact fan-out (rather
    // than `> 1`) also pins that nothing silently throttles it later.
    expect(maxInFlight).toBe(COUNT)
  })

  it('§18: warns about a component that fails to load ONLY when something references it', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home' })
    const componentsDir = join(fx.root, 'src', 'components')
    await mkdir(componentsDir, { recursive: true })
    // Loads fine, and declares a reference to `weather-demo` — the tag
    // `weather-demo.aihu` registers under (its file stem; no @meta/@route
    // name override, so `readAihuComponentTag` derives the same tag).
    await writeFile(join(componentsDir, 'nav-bar.aihu'), '<nav/>\n')
    // Fails to load (mirrors `weather-demo.aihu`'s real SSR failure:
    // `CSSStyleSheet is not defined`) and IS referenced above.
    await writeFile(join(componentsDir, 'weather-demo.aihu'), '<weather/>\n')
    // Fails to load too, but nothing references it.
    await writeFile(join(componentsDir, 'orphan-demo.aihu'), '<orphan/>\n')

    const loadModule: SsrModuleLoader = async (file) => {
      const f = file.replace(/\\/g, '/')
      if (f.endsWith('/index.ts')) return { default: { toHtml: () => '<p>home</p>' } }
      if (f.endsWith('/nav-bar.aihu')) {
        return { __aihu_tag__: 'nav-bar', __aihu_child_tags__: ['weather-demo'] }
      }
      if (f.endsWith('/weather-demo.aihu')) throw new Error('CSSStyleSheet is not defined')
      if (f.endsWith('/orphan-demo.aihu')) throw new Error('CSSStyleSheet is not defined')
      throw new Error(`unexpected file: ${file}`)
    }

    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', components: 'src/components' } },
      loadModule,
      warn: fx.warn,
    })

    const warnings = result.warnings.join('\n')
    expect(warnings).toMatch(/component "[^"]*weather-demo\.aihu" failed to load/)
    expect(warnings).not.toMatch(/component "[^"]*orphan-demo\.aihu" failed to load/)
  })
})

// ─── prerenderClose — real Vite SSR module loading by file path ───────────────

describe('prerenderClose — loads real route modules via Vite SSR', () => {
  let fx: Fixture
  afterEach(async () => {
    if (fx) await rm(fx.root, { recursive: true, force: true })
  })

  it('loads a real .ts route module by file path and prerenders its content', async () => {
    fx = await makeFixture()
    // A real route module on disk — exports a `default` renderable. prerenderClose
    // must import THIS module (not a stub) via Vite's SSR loader.
    await writeFile(
      join(fx.root, 'pages', 'index.ts'),
      `export default { toHtml: () => '<main>Real Module Content</main>' }\n`,
    )
    await writeFile(
      join(fx.root, 'pages', 'index.route.json'),
      JSON.stringify({ name: 'home-page', head: { title: 'Real Home', description: 'desc' } }),
    )

    const result = await prerenderClose(
      fx.resolvedViteConfig,
      { output: 'static', site: { url: 'https://example.com' }, dir: { pages: 'pages' } },
      fx.warn,
    )

    expect(result.written).toContain('index.html')
    const html = await readFile(join(fx.outDir, 'index.html'), 'utf8')
    expect(html).toContain('<main>Real Module Content</main>')
    expect(html).toContain('<title>Real Home</title>')
    expect(html).toContain('<meta name="description" content="desc">')
    expect(html).toContain('src="/assets/main-abc123.js"')
  }, 30000)
})

// ─── runPrerender — route context during SSG ─────────────────────────────────
//
// `@aihu/server` never imports `@aihu/context`; the seam is `_setContextFns` +
// `SsrOptions.contextSetup`, and `runPrerender` is the SSG SSR entry that owns
// wiring it. Before that wiring, `inject(RouteContext)` returned the token
// default (`null`) for the whole prerender, so every route-aware component
// server-rendered as if no route were active and then changed on the client.
//
// No component in a prerendered tree provides `RouteContext` — on the client
// `<router>` does, and there is no `<router>` here — so pre-population is the
// only mechanism, and these tests are what prove it survives to the walk.

describe('runPrerender — route context', () => {
  let fx: Fixture
  afterEach(async () => {
    if (fx) await rm(fx.root, { recursive: true, force: true })
  })

  it('exposes the matched route to the page render', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, 'about.ts', { name: 'about-page' })

    const loadModule: SsrModuleLoader = async () => ({
      default: () => ({
        kind: 'leaf',
        leafKind: 'text',
        value: `path=${useRoute()?.pathname ?? 'NO-ROUTE'}`,
      }),
    })

    await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages' } },
      loadModule,
      warn: fx.warn,
    })

    const html = await readFile(join(fx.outDir, 'about', 'index.html'), 'utf8')
    expect(html).toContain('path=/about')
    expect(html).not.toContain('NO-ROUTE')
  })

  it('gives each concrete path of a dynamic route its OWN params', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, join('posts', '[slug].ts'), { name: 'post-page' })

    const loadModule: SsrModuleLoader = async () => ({
      default: () => ({
        kind: 'leaf',
        leafKind: 'text',
        value: `slug=${useRoute()?.params.slug ?? 'NONE'}`,
      }),
      getStaticPaths: () => [{ slug: 'hello' }, { slug: 'world' }],
    })

    await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages' } },
      loadModule,
      warn: fx.warn,
    })

    expect(await readFile(join(fx.outDir, 'posts', 'hello', 'index.html'), 'utf8')).toContain(
      'slug=hello',
    )
    expect(await readFile(join(fx.outDir, 'posts', 'world', 'index.html'), 'utf8')).toContain(
      'slug=world',
    )
  })

  // The layout shell cache used to key on layout NAME alone, which was safe
  // only while layouts rendered route-blind. Now that a layout sees the route,
  // a name-only key would serve every page the FIRST page's chrome — the exact
  // bug an active-nav highlight would exhibit, and the reason to wire context
  // at all. This is the regression lock on the cache key.
  it('re-renders the layout per concrete path, not once per route pattern', async () => {
    fx = await makeFixture()
    await writeRoute(fx.root, join('posts', '[slug].ts'), { name: 'post-page', layout: 'app' })
    await mkdir(join(fx.root, 'src', 'layouts'), { recursive: true })
    await writeFile(join(fx.root, 'src', 'layouts', 'app.aihu'), '<layout/>\n')

    const loadModule: SsrModuleLoader = async (file) => {
      if (file.replace(/\\/g, '/').endsWith('/src/layouts/app.aihu')) {
        return {
          default: {
            toHtml: () =>
              `<div class="shell"><header>nav:${useRoute()?.params.slug ?? 'NONE'}</header>` +
              `<main data-aihu-outlet></main></div>`,
          },
        }
      }
      return {
        default: { toHtml: () => '<article>Post</article>' },
        getStaticPaths: () => [{ slug: 'hello' }, { slug: 'world' }],
      }
    }

    await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', layouts: 'src/layouts' } },
      loadModule,
      warn: fx.warn,
    })

    expect(await readFile(join(fx.outDir, 'posts', 'hello', 'index.html'), 'utf8')).toContain(
      'nav:hello',
    )
    // The load-bearing assertion: 'world' must NOT have been served 'hello'.
    expect(await readFile(join(fx.outDir, 'posts', 'world', 'index.html'), 'utf8')).toContain(
      'nav:world',
    )
  })
})

// ─── Fixes that shipped with no test at all ─────────────────────────────────
//
// A review reverted each of these and found the whole suite still green. They
// are the feature's own headline behaviours — the diagnostics that exist to end
// silent empty renders, a security boundary, and a live content-corruption fix
// — so "nothing would notice" is the worst possible coverage for them.

describe('runPrerender — previously unguarded fixes', () => {
  let fx: Fixture

  afterEach(async () => {
    await fx?.cleanup?.()
  })

  it('splices page content WITHOUT $-expansion', async () => {
    // Rendered content used to go into a `String.replace` REPLACEMENT string,
    // where `$&`, `` $` ``, `$'` and `$n` expand as backreferences — so prose
    // containing one re-spliced the layout shell into itself. `/api/store`
    // trips this in the real docs build.
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home' })
    const evil = "price is $` and $& and $' and $1"
    const loadModule: SsrModuleLoader = async () => ({
      default: { toHtml: () => `<p>${evil}</p>` },
    })
    await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages' } },
      loadModule,
      warn: fx.warn,
    })
    const html = await readFile(join(fx.root, 'dist', 'index.html'), 'utf8')
    // The literal text survives, and the layout was not re-injected into itself.
    expect(html).toContain(evil)
    expect(html.match(/<p>price is/g)?.length).toBe(1)
  })

  it('warns when a referenced tag is not in the registry', async () => {
    // The §3 diagnostic. Without it an unresolvable reference is
    // indistinguishable from a component nobody registered, which is
    // indistinguishable from correct output for a third-party element.
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home' })
    const componentsDir = join(fx.root, 'src', 'components')
    await mkdir(componentsDir, { recursive: true })
    await writeFile(join(componentsDir, 'nav-bar.aihu'), '<nav/>\n')

    const loadModule: SsrModuleLoader = async (file) => {
      const f = file.replace(/\\/g, '/')
      if (f.endsWith('/index.ts')) return { default: { toHtml: () => '<p>home</p>' } }
      // References a tag no discovered component provides.
      return { __aihu_tag__: 'nav-bar', __aihu_child_tags__: ['ghost-widget'] }
    }
    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', components: 'src/components' } },
      loadModule,
      warn: fx.warn,
    })
    expect(result.warnings.some((w) => w.includes('ghost-widget'))).toBe(true)
  })

  it('warns when a component module exports no __aihu_tag__', async () => {
    // Such a module cannot be resolved by tag and renders as an empty element.
    // Skipping it silently was the same failure class the feature removes.
    fx = await makeFixture()
    await writeRoute(fx.root, 'index.ts', { name: 'home' })
    const componentsDir = join(fx.root, 'src', 'components')
    await mkdir(componentsDir, { recursive: true })
    await writeFile(join(componentsDir, 'no-tag.aihu'), '<div/>\n')

    const loadModule: SsrModuleLoader = async (file) => {
      const f = file.replace(/\\/g, '/')
      if (f.endsWith('/index.ts')) return { default: { toHtml: () => '<p>home</p>' } }
      return {} // loads fine, exports no tag
    }
    const result = await runPrerender({
      resolvedViteConfig: fx.resolvedViteConfig,
      config: { output: 'static', dir: { pages: 'pages', components: 'src/components' } },
      loadModule,
      warn: fx.warn,
    })
    expect(result.warnings.some((w) => w.includes('no-tag.aihu'))).toBe(true)
  })

  // NO SYMLINK-CONTAINMENT TEST HERE, deliberately.
  //
  // I wrote one and it passed against the PRE-FIX code too: in this fixture
  // environment the symlinked module is never discovered at all, so the test
  // could not distinguish "containment excluded it" from "discovery never saw
  // it". A standalone probe DOES traverse the symlink under bun, so the hazard
  // is real and the fixture is what differs — but a green test asserting a
  // security property it does not exercise is worse than no test, because it
  // reads as coverage.
  //
  // Tracked in `docs/plans/2026-08-06-ssr-child-followups.md` §14 with what a
  // real one needs: a fixture where discovery provably traverses the link.
})
