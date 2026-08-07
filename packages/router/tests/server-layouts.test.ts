/**
 * Layout composition on the LIVE SSR path.
 *
 * ## The divergence these close
 *
 * `@aihu/app`'s SSG prerender composes a route's layout around its page and
 * splices the page into the layout's `data-aihu-outlet` marker. `server.ts` did
 * not — `grep -c layout` over it returned 0. So an app that looked correct
 * prerendered lost its ENTIRE shell (nav, footer, grid) the moment the same
 * route was served from a Worker, with no warning of any kind. Two render paths
 * that are supposed to produce the same document produced different ones, and
 * the difference was only visible in production.
 *
 * ## Why these assert on HTML and not on a call
 *
 * The composed document is the contract. A spy proving `injectIntoOutlet` was
 * called would pass against a composition that discards its result, and the
 * failure mode being guarded here — a shell with no page in it — is worse than
 * the one being fixed.
 *
 * ## One rule, not two
 *
 * The splice itself is `@aihu/server`'s `injectIntoOutlet`, called by this path
 * AND by the prerender; the private copy that used to live in `prerender.ts` is
 * gone. What this file tests is the SEQUENCE around it — resolve, render,
 * probe, inject, and the fallback at each step — which the two paths must
 * duplicate because they resolve layout modules differently and always will (a
 * filesystem scan with a live Vite loader vs. a bundled map, since a Worker has
 * no filesystem).
 */

import { __aihu_schild } from '@aihu/runtime/ssr'
import { attachSsrString, createGovernedRegistry } from '@aihu/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RouteDefinition } from '../src/index.ts'
import { createServerRouter, type LayoutModuleLike } from '../src/server.ts'

const PAGE = '<p>PAGE-BODY</p>'

/** A layout module shaped like a compiled `.aihu` layout's server target. */
function layoutModule(html: string, extra: Partial<LayoutModuleLike> = {}): LayoutModuleLike {
  return { default: { toHtml: () => html }, ...extra }
}

/** The passive outlet marker the compiler's layout mode emits. */
const SHELL = '<div class="shell"><nav>NAV</nav><main data-aihu-outlet></main></div>'

function pageRoute(layout?: string, extract?: RouteDefinition['extract']): RouteDefinition {
  return {
    pattern: '/p',
    segments: [{ kind: 'static', path: 'p' }],
    module: () => Promise.resolve({ default: { toHtml: () => PAGE } }),
    ...(layout !== undefined ? { layout } : {}),
    ...(extract !== undefined ? { extract } : {}),
  }
}

async function bodyFor(
  route: RouteDefinition,
  layouts?: ReadonlyMap<string, LayoutModuleLike>,
): Promise<string> {
  const router = createServerRouter([route], layouts !== undefined ? { layouts } : undefined)
  const res = await router.handle(new Request('http://localhost/p'))
  return await res.text()
}

// Warnings are latched per layout NAME for the lifetime of the module, so each
// test that expects one uses a name of its own. Names are otherwise arbitrary.
afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------

describe('live SSR composes the route layout', () => {
  it('splices the page into the layout outlet', async () => {
    const html = await bodyFor(pageRoute('app'), new Map([['app', layoutModule(SHELL)]]))
    // The chrome is present…
    expect(html).toContain('NAV')
    // …and the page is INSIDE the outlet, not merely somewhere on the document.
    expect(html).toMatch(/<main data-aihu-outlet><p>PAGE-BODY<\/p><\/main>/)
  })

  it('composes on the GOVERNED arm too', async () => {
    // Both arms or neither. A shell that appears on ungoverned routes and
    // vanishes on governed ones would make a site's chrome depend on whether a
    // page happens to declare `data:` — a difference no author would predict.
    //
    // A REGISTRY AND A `data:` DECLARATION ARE BOTH REQUIRED to reach that arm.
    // `handle` gates it on `governed && decl !== null`, so a route carrying
    // only `extract` falls through to the ungoverned path and a test written
    // that way silently asserts nothing about the governed arm. Confirmed by
    // counterfactual: with `extract` alone, deleting the governed arm's
    // composition entirely left this test green.
    const registry = createGovernedRegistry().provider('Page', {
      fetch: async () => ({ title: 'T' }),
    })
    const router = createServerRouter(
      [
        {
          pattern: '/p',
          segments: [{ kind: 'static', path: 'p' }],
          layout: 'gov-app',
          module: () => Promise.resolve({ default: { toHtml: () => PAGE } }),
          extract: { read: 'all', call: 'anonymous' },
          data: { type: 'Page' },
        },
      ],
      { governed: registry, layouts: new Map([['gov-app', layoutModule(SHELL)]]) },
    )
    const res = await router.handle(new Request('http://localhost/p'))
    // 200 + the loader embed is what proves the governed arm ran at all.
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain('__aihu_loader__')
    expect(html).toContain('NAV')
    expect(html).toMatch(/<main data-aihu-outlet><p>PAGE-BODY<\/p><\/main>/)
  })

  it('treats layout: "" as NO layout, silently — what the compiler actually emits', async () => {
    // `compileRouteMeta` emits `layout: ""` for every page that declares none;
    // confirmed by reading a built `_worker.js`, not by inference. An
    // `undefined`-only guard therefore treats EVERY layout-less route in a real
    // app as declaring a layout named `""`, fails to resolve it, and logs a
    // warning about a layout nobody wrote — on the most common route shape
    // there is.
    //
    // Empty-string-means-none is the client renderer's existing convention
    // (`layoutName ? layouts[layoutName] : undefined`), so this is the two
    // renderers agreeing rather than a new rule.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = await bodyFor(pageRoute(''), new Map([['app', layoutModule(SHELL)]]))
    expect(html).toContain('PAGE-BODY')
    expect(html).not.toContain('NAV')
    expect(warn).not.toHaveBeenCalled()
  })

  it('renders the layout WITHOUT a layouts map exactly as before', async () => {
    // THE CONTROL. Without it every assertion above could be passing because
    // the shell renders unconditionally. This is also the backward-compat
    // guarantee: `createServerRouter(routes)` is untouched public API.
    const bare = await bodyFor(pageRoute('app'))
    expect(bare).toContain('PAGE-BODY')
    expect(bare).not.toContain('NAV')
    // …and byte-identical to a route that declares no layout at all.
    expect(bare).toBe(await bodyFor(pageRoute()))
  })

  it('leaves a route with no declared layout bare even when layouts exist', async () => {
    const html = await bodyFor(pageRoute(), new Map([['app', layoutModule(SHELL)]]))
    expect(html).toContain('PAGE-BODY')
    expect(html).not.toContain('NAV')
  })

  it('resolves the layout by NAME, which is what the compiled route carries', async () => {
    // Keyed on `@route { layout }`, not on the layout's custom-element tag and
    // not on its file path. `virtual:aihu-layouts` is already name-keyed; a
    // second keying convention here is how the two sides drift.
    const html = await bodyFor(
      pageRoute('marketing'),
      new Map([
        ['docs', layoutModule('<div>WRONG<span data-aihu-outlet></span></div>')],
        ['marketing', layoutModule(SHELL)],
      ]),
    )
    expect(html).toContain('NAV')
    expect(html).not.toContain('WRONG')
  })
})

describe('the live path inherits the shared rule, not a copy of it', () => {
  it('does not expand $-sequences in page prose into the layout shell', async () => {
    // `String.replace` expands `$&`, `` $` ``, `$'` and `$n` in a replacement
    // STRING, so a page whose prose contains one re-splices the shell into
    // itself. A shipped docs page does exactly that. The prerender was fixed
    // for it; a second implementation here would have reintroduced it, and
    // this asserts the live path got the fix by SHARING rather than by luck.
    const evil = "price is $` and $& and $' and $1"
    const router = createServerRouter(
      [
        {
          pattern: '/p',
          segments: [{ kind: 'static', path: 'p' }],
          layout: 'dollar',
          module: () => Promise.resolve({ default: { toHtml: () => `<p>${evil}</p>` } }),
        },
      ],
      { layouts: new Map([['dollar', layoutModule(SHELL)]]) },
    )
    const html = await (await router.handle(new Request('http://localhost/p'))).text()
    expect(html).toContain(evil)
    // One shell, not a shell that swallowed a copy of itself.
    expect(html.match(/class="shell"/g)).toHaveLength(1)
  })
})

describe('the layout participates in the child registry', () => {
  it('renders components the LAYOUT references', async () => {
    // Layouts are where a site's nav, header and footer live, so they are where
    // most component references are. Without the registry reaching them the
    // shell server-renders with every one of them empty — the exact failure the
    // child work exists to remove, relocated into the part of the page that
    // appears on EVERY route.
    // A layout on the COMPILED FAST PATH — the same `__aihu_schild` call site
    // the emitter lowers a child reference to. That path is where `children`
    // has to survive; a walker-only test would not exercise it.
    const layoutFn = (): unknown => ({ toHtml: () => '' })
    attachSsrString(
      layoutFn,
      (_p: unknown, opts?: Parameters<typeof __aihu_schild>[2]) =>
        `<div>${__aihu_schild('site-nav', '', opts)}<main data-aihu-outlet></main></div>`,
      {},
    )
    const router = createServerRouter([pageRoute('with-kids')], {
      layouts: new Map([['with-kids', { default: layoutFn }]]),
      children: new Map([
        ['site-nav', { __ssrString: () => '<a>NAV-LINK</a>', __aihu_shadow__: 'light' as const }],
      ]),
    })
    const html = await (await router.handle(new Request('http://localhost/p'))).text()
    expect(html).toContain('NAV-LINK')
    expect(html).toContain('PAGE-BODY')
  })
})

describe('every composition failure degrades to the bare page, loudly', () => {
  it('warns and serves the page when the layout is missing from the map', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = await bodyFor(pageRoute('absent-layout'), new Map())
    expect(html).toContain('PAGE-BODY')
    expect(String(warn.mock.calls[0]?.[0])).toContain('absent-layout')
  })

  it('warns and serves the page when the layout has no renderable default', async () => {
    // A compiled module that only registers a custom element as an import side
    // effect. The prerender warns in the same situation for the same reason.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = await bodyFor(pageRoute('no-default'), new Map([['no-default', {}]]))
    expect(html).toContain('PAGE-BODY')
    expect(String(warn.mock.calls[0]?.[0])).toContain('no SSR-renderable default')
  })

  it('warns and serves the page when the layout renders no outlet marker', async () => {
    // The dangerous case: composing anyway would produce a shell with the page
    // MISSING from it. A page without chrome is degraded; a shell without its
    // page is blank, so the fallback always goes the first way.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = await bodyFor(
      pageRoute('no-outlet'),
      new Map([['no-outlet', layoutModule('<div class="shell">chrome only</div>')]]),
    )
    expect(html).toContain('PAGE-BODY')
    expect(String(warn.mock.calls[0]?.[0])).toContain('data-aihu-outlet')
  })

  it('warns and serves the page when the layout render throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const boom: LayoutModuleLike = {
      default: () => {
        throw new Error('LAYOUT-BOOM')
      },
    }
    const html = await bodyFor(pageRoute('throwing'), new Map([['throwing', boom]]))
    expect(html).toContain('PAGE-BODY')
    expect(String(warn.mock.calls[0]?.[0])).toContain('LAYOUT-BOOM')
  })

  it('warns ONCE per layout, not once per request', async () => {
    // A Worker serves the same route indefinitely; a per-request warning would
    // bury its logs under one repeated line for a fact that is per-layout.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const layouts = new Map<string, LayoutModuleLike>()
    const router = createServerRouter([pageRoute('latched')], { layouts })
    await router.handle(new Request('http://localhost/p'))
    await router.handle(new Request('http://localhost/p'))
    await router.handle(new Request('http://localhost/p'))
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('the loader embed rides outside the composed layout', () => {
  it('places __aihu_loader__ after the shell, not inside the outlet', async () => {
    // It is read by id off the document, so nesting is irrelevant to the
    // client — but splicing it into the outlet would drop a JSON payload inside
    // whatever region the layout's scoped CSS applies to, and the prerender
    // does not put it there either.
    const router = createServerRouter(
      [
        {
          pattern: '/p',
          segments: [{ kind: 'static', path: 'p' }],
          layout: 'embed',
          module: () =>
            Promise.resolve({
              default: { toHtml: () => PAGE },
              loader: async () => ({ hello: 'world' }),
            }),
        },
      ],
      { layouts: new Map([['embed', layoutModule(SHELL)]]) },
    )
    const html = await (await router.handle(new Request('http://localhost/p'))).text()
    expect(html).toMatch(/<\/div><script type="application\/json" id="__aihu_loader__">/)
    expect(html).toContain('PAGE-BODY')
  })
})
