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
    expect(homeHtml).toContain('<h1>Home Content</h1>')
    // Client bundle script preserved → page hydrates into SPA
    expect(homeHtml).toContain('src="/assets/main-abc123.js"')

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

  it('warns and ships the page unwrapped when the layout has no <$outlet> marker', async () => {
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
    expect(result.warnings.join('\n')).toMatch(/renders no <\$outlet>/)
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
