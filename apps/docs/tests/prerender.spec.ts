// apps/docs/tests/prerender.spec.ts
//
// WS1 prerender acceptance. Three guards:
//   1. Each doc page emits a CONTENT-FUL dist/<id>/index.html (real body text in
//      the static HTML, not just the SPA shell) — incl. a NESTED slug whose
//      asset refs must be absolute (/docs.js) or the bundle/CSS 404.
//   2. The Worker SERVES the prerendered page (the load-bearing fallback check):
//      drive the built dist/_worker.js default.fetch() with a stub ASSETS that
//      serves dist/, request the doc route, assert the response BODY carries the
//      doc text — NOT the bare shell. This is the user-visible must-pass.
//   3. No content duplication after hydration: #prerendered-content is REMOVED
//      from the live DOM once docs-shell hydrates (verified in a real browser
//      via the wrangler dev server the playwright config boots).

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const distDir = fileURLToPath(new URL('../dist/', import.meta.url))

// A known body sentence from each fixture's markdown source.
const INTRO_SENTENCE = 'complete meta-framework for the agentic web'
const REACTIVITY_SENTENCE = 'provides the reactive foundation for the entire'

test.describe('WS1 prerender — static HTML is content-ful', () => {
  test('dist/introduction/index.html contains the intro body text', async () => {
    const html = await readFile(`${distDir}introduction/index.html`, 'utf8')
    expect(html).toContain(INTRO_SENTENCE)
    expect(html).toContain('id="prerendered-content"')
    // per-page head
    expect(html).toMatch(/<title>Introduction — aihu<\/title>/)
    expect(html).toContain('<link rel="canonical" href="https://aihu.dev/introduction">')
    // pre-paint theme script lands in every page
    expect(html).toContain('prefers-color-scheme')
  })

  test('nested dist/guides/reactivity/index.html is content-ful with ABSOLUTE assets', async () => {
    const html = await readFile(`${distDir}guides/reactivity/index.html`, 'utf8')
    expect(html).toContain(REACTIVITY_SENTENCE)
    // nested 2-deep page MUST root assets at `/` (relative ./docs.js would 404)
    expect(html).toContain('src="/docs.js"')
    expect(html).toContain('href="/style.css"')
    expect(html).not.toContain('src="./docs.js"')
    expect(html).toContain('<link rel="canonical" href="https://aihu.dev/guides/reactivity">')
  })
})

test.describe('WS1 prerender — Worker SERVES the prerendered page', () => {
  // Import the built, self-contained Worker bundle and drive its fetch() with a
  // stub ASSETS binding backed by the real dist/ output.
  async function loadWorker(): Promise<{
    fetch(request: Request, env: unknown): Promise<Response>
  }> {
    const mod = await import(`${distDir}_worker.js`)
    return mod.default
  }

  function makeAssetsStub() {
    return {
      async fetch(request: Request): Promise<Response> {
        const path = new URL(request.url).pathname.replace(/^\/+/, '')
        const filePath = path === '' ? 'index.html' : path
        try {
          const body = await readFile(`${distDir}${filePath}`, 'utf8')
          return new Response(body, {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          })
        } catch {
          return new Response('Not found', { status: 404 })
        }
      },
    }
  }

  test('GET /guides/reactivity returns the prerendered body, not the bare shell', async () => {
    const worker = await loadWorker()
    const env = { ASSETS: makeAssetsStub() }
    const res = await worker.fetch(
      new Request('https://aihu.dev/guides/reactivity', {
        headers: { Accept: 'text/html' },
      }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(REACTIVITY_SENTENCE)
    expect(body).toContain('<link rel="canonical" href="https://aihu.dev/guides/reactivity">')
  })

  test('GET /introduction/ (trailing slash) serves the introduction prerender', async () => {
    const worker = await loadWorker()
    const env = { ASSETS: makeAssetsStub() }
    const res = await worker.fetch(
      new Request('https://aihu.dev/introduction/', {
        headers: { Accept: 'text/html' },
      }),
      env,
    )
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain(INTRO_SENTENCE)
  })
})

test.describe('WS1 prerender — no duplication after hydration', () => {
  test('#prerendered-content is removed once docs-shell hydrates', async ({ page }) => {
    await page.goto('/guides/reactivity')
    // shadow article paints
    await page.waitForFunction(() => document.querySelector('docs-shell')?.shadowRoot != null, {
      timeout: 10_000,
    })
    // main.ts removes the light-DOM copy on the next frame after hydration.
    await page.waitForFunction(() => document.getElementById('prerendered-content') == null, {
      timeout: 10_000,
    })
    // The doc body still renders — now from the shadow article (single copy).
    const shadowText = await page.evaluate(
      () => document.querySelector('docs-shell')?.shadowRoot?.textContent ?? '',
    )
    expect(shadowText).toContain('reactive foundation')
  })
})
