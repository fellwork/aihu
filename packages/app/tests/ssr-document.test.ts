// @vitest-environment node
//
// Node, not jsdom: this module is destined for a Worker and touches no DOM.
// Running it under jsdom would let a stray `document` reference pass here and
// fail in production.

/**
 * `output: 'ssr'` document assembly — the fix for "an SSR route renders but
 * never hydrates".
 *
 * `createServerRouter().handle()` returns a BARE FRAGMENT: no doctype, no
 * `<html>`, no `<head>`, and no client `<script type="module">`. The Worker
 * therefore painted server-rendered markup and stopped — no hydration, no
 * interactivity, no head. This module splices that fragment into the finished
 * client `index.html`, which already carries Vite's hashed entry script.
 *
 * The e2e (`workers-ssr-e2e.test.ts`) proves the whole chain over a real
 * `vite build`. This file pins the rules that e2e cannot isolate: which
 * responses are wrapped, which are passed through untouched, what happens when
 * the outlet is missing, and that the per-route head is computed once.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Plugin } from 'vite'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertOutletPresent,
  createSsrDocument,
  DEFAULT_OUTLET_ID,
  injectIntoOutletId,
} from '../src/ssr-document.ts'
import { viteAihuPlugin } from '../src/vite-plugin.ts'

const TEMPLATE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Scaffold Default</title>
    <script type="module" crossorigin src="/assets/index-BeeDeQXt.js"></script>
  </head>
  <body>
    <div id="outlet"></div>
  </body>
</html>
`

const HTML = { 'Content-Type': 'text/html; charset=utf-8' }

// ---------------------------------------------------------------------------
// injectIntoOutletId — the splice itself, shared with the SSG prerender
// ---------------------------------------------------------------------------

describe('injectIntoOutletId', () => {
  it('places content INSIDE the empty outlet element', () => {
    const out = injectIntoOutletId(TEMPLATE, '<p>HI</p>', 'outlet')
    expect(out).toMatch(/<div id="outlet"><p>HI<\/p><\/div>/)
  })

  it('honours a non-default id', () => {
    const t = TEMPLATE.replace('id="outlet"', 'id="app-root"')
    expect(injectIntoOutletId(t, '<p>HI</p>', 'app-root')).toContain('<p>HI</p>')
    expect(injectIntoOutletId(t, '<p>HI</p>', 'outlet')).toBeNull()
  })

  it('returns null — NOT the template — when no such element exists', () => {
    // The whole point of the null: a caller that took the template back would
    // ship a complete-looking document with an empty outlet, which is
    // indistinguishable from a render that produced nothing.
    expect(injectIntoOutletId('<html><body></body></html>', 'x', 'outlet')).toBeNull()
  })

  it('does not expand $-sequences in the rendered content', () => {
    // A replacement STRING expands `$&`/`` $` ``/`$'`/`$n`; the function form
    // does not. A page whose prose contains one of those would otherwise
    // re-splice the document into itself.
    const out = injectIntoOutletId(TEMPLATE, '<p>cost: $& and $` and $1</p>', 'outlet')
    expect(out).toContain('<p>cost: $& and $` and $1</p>')
  })

  it('matches a SINGLE-quoted id attribute', () => {
    // `index.html` is authored by the consumer and vite passes its quoting
    // through verbatim, so this is an ordinary document — and it used to splice
    // nothing at all, reported by one console.error inside a Worker.
    const t = "<html><body><div id='outlet'></div></body></html>"
    expect(injectIntoOutletId(t, '<p>HI</p>', 'outlet')).toBe(
      "<html><body><div id='outlet'><p>HI</p></div></body></html>",
    )
  })

  it('does NOT treat data-id / aria-id / x-id as the id attribute', () => {
    // `\bid="` put a word boundary between the hyphen and the `i`, so every
    // `*-id` attribute matched and the content was spliced into the wrong
    // element. Requiring whitespace before `id=` is the real rule.
    for (const attr of ['data-id', 'aria-id', 'x-id']) {
      const t = `<html><body><div ${attr}="outlet"></div></body></html>`
      expect(injectIntoOutletId(t, '<p>HI</p>', 'outlet'), attr).toBeNull()
    }
  })

  it('still matches the real id when a decoy prefixed attribute precedes it', () => {
    const t = '<html><body><div data-id="outlet" id="outlet"></div></body></html>'
    expect(injectIntoOutletId(t, '<p>HI</p>', 'outlet')).toContain(
      '<div data-id="outlet" id="outlet"><p>HI</p></div>',
    )
  })

  it('declines an UNQUOTED id rather than guessing', () => {
    // Legal HTML, effectively unwritten, and matching it would make any
    // `id=<outletId>` inside another attribute's value a splice target. The
    // build gate below is what stops this being silent.
    const t = '<html><body><div id=outlet></div></body></html>'
    expect(injectIntoOutletId(t, '<p>HI</p>', 'outlet')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// assertOutletPresent — the same rule, asked at build time
// ---------------------------------------------------------------------------

describe('assertOutletPresent', () => {
  it('passes a template the splice can match, in either quoting', () => {
    expect(assertOutletPresent(TEMPLATE, 'outlet')).toBeNull()
    expect(assertOutletPresent("<div id='app-root'></div>", 'app-root')).toBeNull()
  })

  it('reports a template the splice cannot match, naming the id', () => {
    const msg = assertOutletPresent('<html><body></body></html>', 'app-root')
    expect(msg).toContain('id="app-root"')
    expect(msg).toContain('app.outletId')
  })

  it('agrees with the splice exactly — it IS the splice', () => {
    // The gate must not drift from the thing it gates. Every shape the splice
    // declines must be reported, and every shape it accepts must pass.
    const cases = [
      '<div id="outlet"></div>',
      "<div id='outlet'></div>",
      '<div id=outlet></div>',
      '<div data-id="outlet"></div>',
      '<section id="outlet">existing</section>',
      '<body></body>',
    ]
    for (const t of cases) {
      const spliceable = injectIntoOutletId(t, 'X', 'outlet') !== null
      expect(assertOutletPresent(t, 'outlet') === null, t).toBe(spliceable)
    }
  })
})

// ---------------------------------------------------------------------------
// createSsrDocument — what gets wrapped, and what must not
// ---------------------------------------------------------------------------

describe('createSsrDocument', () => {
  const wrap = createSsrDocument({ template: TEMPLATE, outletId: DEFAULT_OUTLET_ID })

  it('turns a fragment into a full document that can hydrate', async () => {
    const res = await wrap(new Response('<main>PAGE</main>', { headers: HTML }))
    const body = await res.text()

    expect(body.toLowerCase()).toContain('<!doctype html>')
    expect(body).toContain('<html lang="en">')
    expect(body).toContain('<head>')
    expect(body).toContain('<title>Scaffold Default</title>')
    // THE assertion this whole step exists for.
    expect(body).toContain('<script type="module" crossorigin src="/assets/index-BeeDeQXt.js">')
    expect(body).toMatch(/<div id="outlet"><main>PAGE<\/main><\/div>/)
  })

  it('carries status, statusText and headers over verbatim', async () => {
    // A governed WITHHELD render is text/html at 402 with `Cache-Control:
    // private` and a `Vary` — decisions about the RESPONSE that wrapping its
    // body must not restate or drop.
    const res = await wrap(
      new Response('<main>WITHHELD</main>', {
        status: 402,
        statusText: 'Payment Required',
        headers: { ...HTML, 'Cache-Control': 'private', Vary: 'Authorization, Cookie' },
      }),
    )
    expect(res.status).toBe(402)
    expect(res.statusText).toBe('Payment Required')
    expect(res.headers.get('Cache-Control')).toBe('private')
    expect(res.headers.get('Vary')).toBe('Authorization, Cookie')
    expect(await res.text()).toContain('WITHHELD')
  })

  it('passes a NON-HTML response through untouched — same object', async () => {
    // Not merely "same bytes": an untouched pass-through is what keeps an
    // adapter's `status !== 404 ? response : env.ASSETS.fetch(request)`
    // fallthrough working, and what keeps the E3 governed-data endpoint JSON.
    const notFound = new Response('Not Found', { status: 404 })
    expect(await wrap(notFound)).toBe(notFound)

    const json = new Response('{"a":1}', { headers: { 'Content-Type': 'application/json' } })
    expect(await wrap(json)).toBe(json)

    const err = new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
    expect(await wrap(err)).toBe(err)

    // A redirect carries no Content-Type and no body. Wrapping it would replace
    // a 302 with a 302 whose body is a whole document — and, worse, would
    // consume a body that was never there.
    const redirect = new Response(null, { status: 302, headers: { Location: '/elsewhere' } })
    expect(await wrap(redirect)).toBe(redirect)

    // A route serving an API payload as anything but JSON is still not a page.
    const text = new Response('id,name\n1,a', { headers: { 'Content-Type': 'text/csv' } })
    expect(await wrap(text)).toBe(text)
  })

  it('passes everything through when the build supplied no template', async () => {
    const inert = createSsrDocument({ template: '', outletId: 'outlet' })
    const res = new Response('<main>PAGE</main>', { headers: HTML })
    expect(await inert(res)).toBe(res)
  })

  it('names a missing outlet loudly, exactly once', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const bad = createSsrDocument({ template: TEMPLATE, outletId: 'nope' })
      await bad(new Response('<main>PAGE</main>', { headers: HTML }))
      await bad(new Response('<main>PAGE</main>', { headers: HTML }))
      expect(spy).toHaveBeenCalledOnce()
      expect(spy.mock.calls[0]?.[0]).toMatch(/no element with id="nope"/)
    } finally {
      spy.mockRestore()
    }
  })
})

// ---------------------------------------------------------------------------
// Per-route head
// ---------------------------------------------------------------------------

describe('createSsrDocument — per-route head', () => {
  it("replaces the template's title and injects the route's meta", async () => {
    const wrap = createSsrDocument({
      template: TEMPLATE,
      outletId: 'outlet',
      siteUrl: 'https://example.com',
    })
    const res = await wrap(new Response('<main>P</main>', { headers: HTML }), {
      pattern: '/about',
      head: { title: 'About Us', description: 'About this site', canonical: '/about' },
    })
    const body = await res.text()
    expect(body).toContain('<title>About Us</title>')
    expect(body).not.toContain('Scaffold Default')
    expect(body).toContain('<meta name="description" content="About this site">')
    // siteUrl resolution, same as the SSG path.
    expect(body).toContain('<link rel="canonical" href="https://example.com/about">')
    // …and the hashed script survived the head rewrite.
    expect(body).toContain('/assets/index-BeeDeQXt.js')
  })

  it('folds app.head UNDER the route head, as SSG and client nav do', async () => {
    const wrap = createSsrDocument({
      template: TEMPLATE,
      outletId: 'outlet',
      globalHead: { title: 'Global', meta: [{ name: 'author', content: 'me' }] },
    })
    const withRoute = await (
      await wrap(new Response('<main>P</main>', { headers: HTML }), {
        pattern: '/a',
        head: { title: 'Route' },
      })
    ).text()
    expect(withRoute).toContain('<title>Route</title>')
    expect(withRoute).toContain('content="me"')

    const withoutRoute = await (
      await wrap(new Response('<main>P</main>', { headers: HTML }), { pattern: '/b' })
    ).text()
    expect(withoutRoute).toContain('<title>Global</title>')
  })

  it('leaves the template alone when neither the route nor the app declares a head', async () => {
    const wrap = createSsrDocument({ template: TEMPLATE, outletId: 'outlet' })
    const body = await (
      await wrap(new Response('<main>P</main>', { headers: HTML }), { pattern: '/' })
    ).text()
    expect(body).toContain('<title>Scaffold Default</title>')
  })

  it('is stable across repeated requests to the same route (the memo)', async () => {
    const wrap = createSsrDocument({ template: TEMPLATE, outletId: 'outlet' })
    const route = { pattern: '/about', head: { title: 'About' } }
    const a = await (await wrap(new Response('<main>1</main>', { headers: HTML }), route)).text()
    const b = await (await wrap(new Response('<main>2</main>', { headers: HTML }), route)).text()
    // The head is memoised per pattern; the CONTENT is not, so the two differ
    // only in the outlet. A memo that cached the whole document would return
    // request 1's body for request 2 — the failure worth pinning.
    expect(a).toContain('<title>About</title>')
    expect(b).toContain('<title>About</title>')
    expect(a).toContain('<main>1</main>')
    expect(b).toContain('<main>2</main>')
    expect(b).not.toContain('<main>1</main>')
  })

  it('does not leak one route’s head onto another', async () => {
    const wrap = createSsrDocument({ template: TEMPLATE, outletId: 'outlet' })
    await wrap(new Response('<main>P</main>', { headers: HTML }), {
      pattern: '/a',
      head: { title: 'A' },
    })
    const b = await (
      await wrap(new Response('<main>P</main>', { headers: HTML }), {
        pattern: '/b',
        head: { title: 'B' },
      })
    ).text()
    expect(b).toContain('<title>B</title>')
    expect(b).not.toContain('<title>A</title>')
  })
})

// ---------------------------------------------------------------------------
// virtual:aihu-ssr-document — the plugin that inlines the built template
// ---------------------------------------------------------------------------

function pluginNamed(plugins: unknown[], name: string): Plugin {
  const found = plugins.find(
    (p): p is Plugin => typeof p === 'object' && p !== null && (p as Plugin).name === name,
  )
  if (!found) throw new Error(`no plugin named ${name}`)
  return found
}

function hookCtx() {
  return {
    warn: vi.fn(),
    error: vi.fn((m: string) => {
      throw new Error(m)
    }),
  }
}

describe('virtual:aihu-ssr-document', () => {
  const roots: string[] = []
  afterEach(() => {
    for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
  })

  function fixture(opts?: { template?: string | null; outDir?: string }) {
    const root = mkdtempSync(join(tmpdir(), 'aihu-ssrdoc-'))
    roots.push(root)
    const outDir = opts?.outDir ?? 'dist'
    if (opts?.template !== null) {
      mkdirSync(join(root, outDir), { recursive: true })
      writeFileSync(join(root, outDir, 'index.html'), opts?.template ?? TEMPLATE)
    }
    return root
  }

  function serve(
    root: string,
    aihu: Parameters<typeof viteAihuPlugin>[0],
    userConfig: Record<string, unknown> = {},
  ) {
    const p = pluginNamed(viteAihuPlugin(aihu) as unknown[], 'aihu-server-entry')
    ;(p.config as (c: unknown, e: unknown) => unknown).call({} as never, userConfig, {})
    ;(p.configResolved as (c: unknown) => void).call({} as never, { root } as never)
    return (p.load as (i: string) => string).call(hookCtx() as never, '\0virtual:aihu-ssr-document')
  }

  const SSR = { output: 'ssr' as const, css: { shadowMode: 'light' as const } }

  it('inlines the built client index.html — hashed script tag and all', () => {
    const src = serve(fixture(), SSR)
    const cfg = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1))
    expect(cfg.template).toContain('/assets/index-BeeDeQXt.js')
    expect(cfg.outletId).toBe('outlet')
  })

  it('carries the CONFIGURED outlet id, so SSR splices what the client mounts', () => {
    // The template has to CARRY that id. This fixture used the default
    // `id="outlet"` document while configuring `app.outletId: 'app-root'` —
    // exactly the divergence that ships an empty outlet, and the build gate
    // now refuses it, so the test states the consistent pair it always meant.
    const root = fixture({ template: TEMPLATE.replace('id="outlet"', 'id="app-root"') })
    const src = serve(root, { ...SSR, app: { outletId: 'app-root' } })
    expect(JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1)).outletId).toBe(
      'app-root',
    )
  })

  it('FAILS THE BUILD when the template has no matching outlet', () => {
    // The other half, and the reason the fix above was not just "update a
    // fixture": a configured id the document does not contain used to build
    // green and serve every page as an empty shell. It is now a named error at
    // the moment the two can first be compared.
    expect(() => serve(fixture(), { ...SSR, app: { outletId: 'app-root' } })).toThrow(
      /no element with id="app-root"/,
    )
  })

  it('FAILS THE BUILD when the outlet is only reachable unquoted', () => {
    const root = fixture({ template: TEMPLATE.replace('id="outlet"', 'id=outlet') })
    expect(() => serve(root, SSR)).toThrow(/must be quoted/)
  })

  it('carries site.url and app.head, so per-route heads lower identically to SSG', () => {
    const src = serve(fixture(), {
      ...SSR,
      site: { url: 'https://example.com' },
      app: { head: { title: 'Global' } },
    })
    const cfg = JSON.parse(src.slice(src.indexOf('{'), src.lastIndexOf('}') + 1))
    expect(cfg.siteUrl).toBe('https://example.com')
    expect(cfg.globalHead).toEqual({ title: 'Global' })
  })

  it('follows a renamed client outDir', () => {
    const root = fixture({ outDir: 'build' })
    const src = serve(root, { ...SSR, vite: { build: { outDir: 'build' } } })
    expect(src).toContain('/assets/index-BeeDeQXt.js')
  })

  it('FAILS THE BUILD when there is no client index.html', () => {
    // Degrading here would ship a Worker that serves bare fragments: a green
    // build, a successful deploy, and a site that never hydrates. That is the
    // exact defect this module removes, and it is invisible without devtools.
    expect(() => serve(fixture({ template: null }), SSR)).toThrow(/no client index\.html/)
  })

  it('emits a module whose default export is the wrapper config', async () => {
    const src = serve(fixture(), SSR)
    const url = `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`
    const mod = (await import(/* @vite-ignore */ url)) as { default: { template: string } }
    // Round-trips through a real module evaluation: the JSON embedding has to
    // survive being source text, which is what the `</script>`-in-template case
    // would break.
    expect(mod.default.template).toContain('<div id="outlet"></div>')
  })
})

// ---------------------------------------------------------------------------
// The virtual CLIENT entry agrees with the config
// ---------------------------------------------------------------------------

describe('virtual:aihu-entry outletId', () => {
  function entrySrc(aihu: Parameters<typeof viteAihuPlugin>[0]): string {
    const p = pluginNamed(viteAihuPlugin(aihu) as unknown[], 'aihu-entry')
    return (p.load as (i: string) => string).call({} as never, '\0virtual:aihu-entry')
  }

  it('is byte-identical to the historical source when nothing is configured', () => {
    expect(entrySrc({})).toBe("import { createApp } from '@aihu/app/client'\n\ncreateApp()\n")
  })

  it('passes a configured outletId to createApp', () => {
    // Otherwise `app.outletId` would move the prerender/Worker splice and leave
    // the client mounting `#outlet` — the same divergence the key exists to
    // remove, one layer over.
    expect(entrySrc({ app: { outletId: 'app-root' } })).toContain(
      `createApp({ outletId: "app-root" })`,
    )
  })
})

// A cheap guard that the stub artifact story did not change under us: the
// document module must exist as its own file, since the Worker bundle imports
// it through `@aihu/app/ssr-document`.
it('ships as its own source module', () => {
  expect(existsSync(new URL('../src/ssr-document.ts', import.meta.url))).toBe(true)
})
