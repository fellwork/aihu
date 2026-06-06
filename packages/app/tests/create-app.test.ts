import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mutable state ──────────────────────────────────────────────────
// vi.hoisted values are available inside vi.mock factories (both are hoisted).
// mockRoutes is passed by reference so mutations in tests are visible to the
// `routes` binding in client.ts (same array object).

type RouteHeadStub = {
  title?: string
  description?: string
  canonical?: string
  og?: Record<string, string>
  twitter?: Record<string, string>
  jsonld?: unknown
}
type RouteStub = {
  pattern?: string
  name?: string
  module: () => Promise<unknown>
  head?: RouteHeadStub
  layout?: string
}
type LayoutEntry = { tag: string; load: () => Promise<unknown> }
type MatchStub = { route: RouteStub; params?: Record<string, string> } | null

const { mockRoutes, mockMatch, mockLayouts } = vi.hoisted(() => ({
  mockRoutes: [] as RouteStub[],
  mockMatch: vi.fn<[], MatchStub>(() => null),
  // Mutated by reference in tests; the same object backs the `layouts` binding
  // in client.ts (default export of virtual:aihu-layouts).
  mockLayouts: {} as Record<string, LayoutEntry>,
}))

vi.mock('virtual:aihu-routes', () => ({ default: mockRoutes }))
vi.mock('virtual:aihu-layouts', () => ({ default: mockLayouts }))
vi.mock('@aihu/arbor', () => ({ hydrate: vi.fn(), mount: vi.fn() }))
vi.mock('@aihu/signals', () => ({ signal: vi.fn() }))
vi.mock('@aihu/router', () => ({
  createRouter: vi.fn(() => ({ match: mockMatch })),
}))
vi.mock('@aihu/runtime', () => ({
  _setMount: vi.fn(),
  _setSignal: vi.fn(),
  _setHydrate: vi.fn(),
}))

import { _setHydrate, _setMount, _setSignal } from '@aihu/runtime'
import { createApp } from '../src/client.ts'

const flushPromises = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

function makeOutlet(id = 'outlet'): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  document.body.appendChild(el)
  return el
}

// ─── Runtime wiring ─────────────────────────────────────────────────────────

describe('createApp — runtime wiring', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => document.body.replaceChildren())

  it('wires _setMount and _setSignal unconditionally', () => {
    makeOutlet()
    createApp()
    expect(_setMount).toHaveBeenCalledOnce()
    expect(_setSignal).toHaveBeenCalledOnce()
  })

  it('wires _setHydrate when no rendering config (SSR-capable by default)', () => {
    makeOutlet()
    createApp()
    expect(_setHydrate).toHaveBeenCalledOnce()
  })

  it('wires _setHydrate when mode is "ssr"', () => {
    makeOutlet()
    createApp({ rendering: { mode: 'ssr' } })
    expect(_setHydrate).toHaveBeenCalledOnce()
  })

  it('wires _setHydrate when mode is "hybrid"', () => {
    makeOutlet()
    createApp({ rendering: { mode: 'hybrid' } })
    expect(_setHydrate).toHaveBeenCalledOnce()
  })

  it('skips _setHydrate when mode is "spa"', () => {
    makeOutlet()
    createApp({ rendering: { mode: 'spa' } })
    expect(_setHydrate).not.toHaveBeenCalled()
  })
})

// ─── Outlet ──────────────────────────────────────────────────────────────────

describe('createApp — outlet', () => {
  afterEach(() => document.body.replaceChildren())

  it('throws when outlet element is absent', () => {
    expect(() => createApp()).toThrow(/no element with id="outlet"/)
  })

  it('accepts custom outletId', () => {
    makeOutlet('app-root')
    expect(() => createApp({ outletId: 'app-root' })).not.toThrow()
  })

  it('throws with the custom id in the error message', () => {
    expect(() => createApp({ outletId: 'missing' })).toThrow(/id="missing"/)
  })
})

// ─── Provide ─────────────────────────────────────────────────────────────────

describe('createApp — provide', () => {
  afterEach(() => {
    document.body.replaceChildren()
    // biome-ignore lint/suspicious/noExplicitAny: test cleanup needs dynamic globalThis access
    delete (globalThis as any).testProvided
  })

  it('hoists provided values into globalThis before any component runs', () => {
    makeOutlet()
    createApp({ provide: { testProvided: 42 } })
    // biome-ignore lint/suspicious/noExplicitAny: test assertion needs dynamic globalThis access
    expect((globalThis as any).testProvided).toBe(42)
  })
})

// ─── Initial rendering ───────────────────────────────────────────────────────

describe('createApp — initial rendering', () => {
  let outlet: HTMLElement

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutes.length = 0
    mockMatch.mockReturnValue(null)
    outlet = makeOutlet()
  })

  afterEach(() => document.body.replaceChildren())

  it('renders inline 404 when no match and no not-found route', async () => {
    createApp()
    await flushPromises()
    const p = outlet.querySelector('p')
    expect(p).not.toBeNull()
    expect(p!.textContent).toContain('404')
  })

  it('renders custom element for a matched route with a valid hyphenated tag', async () => {
    const route: RouteStub = { name: 'my-page', module: vi.fn().mockResolvedValue(undefined) }
    mockMatch.mockReturnValue({ route, params: undefined })
    createApp()
    await flushPromises()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('my-page')
  })

  it('calls route.module() to import and register the component', async () => {
    const moduleFn = vi.fn().mockResolvedValue(undefined)
    const route: RouteStub = { name: 'my-page', module: moduleFn }
    mockMatch.mockReturnValue({ route, params: undefined })
    createApp()
    await flushPromises()
    expect(moduleFn).toHaveBeenCalledOnce()
  })

  it('sets route params as flat element attributes — A4 protocol', async () => {
    const route: RouteStub = { name: 'user-profile', module: vi.fn().mockResolvedValue(undefined) }
    mockMatch.mockReturnValue({ route, params: { userId: '42', tab: 'settings' } })
    createApp()
    await flushPromises()
    const el = outlet.firstElementChild as HTMLElement
    expect(el.getAttribute('userId')).toBe('42')
    expect(el.getAttribute('tab')).toBe('settings')
  })

  it('does not render when route tag name has no hyphen', async () => {
    const route: RouteStub = { name: 'home', module: vi.fn().mockResolvedValue(undefined) }
    mockMatch.mockReturnValue({ route, params: undefined })
    createApp()
    await flushPromises()
    expect(outlet.firstElementChild).toBeNull()
  })

  it('does not render when route name is undefined', async () => {
    const route: RouteStub = { name: undefined, module: vi.fn().mockResolvedValue(undefined) }
    mockMatch.mockReturnValue({ route, params: undefined })
    createApp()
    await flushPromises()
    expect(outlet.firstElementChild).toBeNull()
  })

  it('renders not-found route matched by wildcard pattern (*)', async () => {
    const notFoundMod = vi.fn().mockResolvedValue(undefined)
    mockRoutes.push({ pattern: '*', name: 'not-found-page', module: notFoundMod })
    createApp()
    await flushPromises()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('not-found-page')
    expect(notFoundMod).toHaveBeenCalledOnce()
  })

  it('renders not-found route matched by name convention ("not-found")', async () => {
    const notFoundMod = vi.fn().mockResolvedValue(undefined)
    mockRoutes.push({ name: 'not-found', module: notFoundMod })
    createApp()
    await flushPromises()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('not-found')
  })

  it('falls back to inline 404 when not-found route tag has no hyphen', async () => {
    mockRoutes.push({
      pattern: '*',
      name: 'notfound',
      module: vi.fn().mockResolvedValue(undefined),
    })
    createApp()
    await flushPromises()
    const p = outlet.querySelector('p')
    expect(p?.textContent).toContain('404')
  })
})

// ─── SPA navigation ──────────────────────────────────────────────────────────

describe('createApp — SPA navigation', () => {
  let outlet: HTMLElement

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutes.length = 0
    mockMatch.mockReturnValue(null)
    outlet = makeOutlet()
  })

  afterEach(() => document.body.replaceChildren())

  it('re-renders the outlet on popstate', async () => {
    const route: RouteStub = { name: 'my-page', module: vi.fn().mockResolvedValue(undefined) }
    createApp()
    await flushPromises()
    expect(outlet.querySelector('p')?.textContent).toContain('404')

    mockMatch.mockReturnValue({ route, params: undefined })
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flushPromises()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('my-page')
  })

  it('intercepts internal <a> clicks for SPA navigation', async () => {
    const route: RouteStub = { name: 'about-page', module: vi.fn().mockResolvedValue(undefined) }
    createApp()
    await flushPromises()

    const a = document.createElement('a')
    a.setAttribute('href', '/about')
    document.body.appendChild(a)

    mockMatch.mockReturnValue({ route, params: undefined })
    a.click()
    await flushPromises()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('about-page')
  })

  it('does not intercept external http links', async () => {
    createApp()
    await flushPromises()

    const pushStateSpy = vi.spyOn(history, 'pushState')
    const a = document.createElement('a')
    a.setAttribute('href', 'https://example.com/page')
    document.body.appendChild(a)
    a.click()
    await flushPromises()

    expect(pushStateSpy).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })

  it('does not intercept mailto: links', async () => {
    createApp()
    await flushPromises()

    const pushStateSpy = vi.spyOn(history, 'pushState')
    const a = document.createElement('a')
    a.setAttribute('href', 'mailto:hello@example.com')
    document.body.appendChild(a)
    a.click()
    await flushPromises()

    expect(pushStateSpy).not.toHaveBeenCalled()
    pushStateSpy.mockRestore()
  })
})

// ─── Per-route <head> on SPA navigation (B5, SEO arc) ────────────────────────
// These exercise the REAL routeHeadToSsrHead (@aihu/server/head-lowering, not
// mocked) + the real DOM applier (head-apply.ts), so they prove end-to-end that
// document.head reflects the current route and cleans up the previous one.

const metaContent = (selector: string): string | null =>
  document.head.querySelector(selector)?.getAttribute('content') ?? null

const canonicalHref = (): string | null =>
  document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null

const jsonLd = (): string | null =>
  document.head.querySelector('script[type="application/ld+json"]')?.textContent ?? null

function resetHead(): void {
  // Drop everything the applier owns + reset the title so each test starts clean.
  for (const el of Array.from(document.head.querySelectorAll('[data-aihu-head]'))) {
    el.remove()
  }
  document.title = ''
}

describe('createApp — per-route <head> on navigation', () => {
  let outlet: HTMLElement

  const home: RouteStub = {
    name: 'home-page',
    module: vi.fn().mockResolvedValue(undefined),
    head: {
      title: 'Home — Acme',
      description: 'The Acme home page',
      canonical: '/',
      og: { title: 'Home', image: '/og-home.png' },
      twitter: { card: 'summary' },
      jsonld: '{"@type":"WebSite","name":"Acme"}',
    },
  }
  const about: RouteStub = {
    name: 'about-page',
    module: vi.fn().mockResolvedValue(undefined),
    head: {
      title: 'About — Acme',
      canonical: '/about',
      og: { title: 'About Acme' },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutes.length = 0
    mockMatch.mockReturnValue(null)
    resetHead()
    outlet = makeOutlet()
  })

  afterEach(() => {
    document.body.replaceChildren()
    resetHead()
  })

  it('sets title/canonical(absolute)/og/twitter/JSON-LD from the active route', async () => {
    mockMatch.mockReturnValue({ route: home, params: undefined })
    createApp({ site: { url: 'https://acme.test' } })
    await flushPromises()

    expect(document.title).toBe('Home — Acme')
    // canonical resolved to absolute via site.url
    expect(canonicalHref()).toBe('https://acme.test/')
    expect(metaContent('meta[name="description"]')).toBe('The Acme home page')
    expect(metaContent('meta[property="og:title"]')).toBe('Home')
    // og:image resolved absolute too
    expect(metaContent('meta[property="og:image"]')).toBe('https://acme.test/og-home.png')
    expect(metaContent('meta[name="twitter:card"]')).toBe('summary')
    expect(jsonLd()).toBe('{"@type":"WebSite","name":"Acme"}')
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('home-page')
  })

  it('updates document.head to the new route on navigation (and drops stale tags)', async () => {
    mockMatch.mockReturnValue({ route: home, params: undefined })
    createApp({ site: { url: 'https://acme.test' } })
    await flushPromises()
    // home applied a description + twitter:card + JSON-LD…
    expect(metaContent('meta[name="description"]')).toBe('The Acme home page')
    expect(jsonLd()).toBe('{"@type":"WebSite","name":"Acme"}')

    // Navigate to about (no description / twitter / jsonld in its head).
    mockMatch.mockReturnValue({ route: about, params: undefined })
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flushPromises()

    expect(document.title).toBe('About — Acme')
    expect(canonicalHref()).toBe('https://acme.test/about')
    expect(metaContent('meta[property="og:title"]')).toBe('About Acme')
    // Stale per-page tags from home must be GONE — no accumulation.
    expect(metaContent('meta[name="description"]')).toBeNull()
    expect(metaContent('meta[name="twitter:card"]')).toBeNull()
    expect(jsonLd()).toBeNull()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('about-page')
  })

  it('does not accumulate duplicate tags across repeated navigations (home→about→home)', async () => {
    mockMatch.mockReturnValue({ route: home, params: undefined })
    createApp({ site: { url: 'https://acme.test' } })
    await flushPromises()

    mockMatch.mockReturnValue({ route: about, params: undefined })
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flushPromises()

    mockMatch.mockReturnValue({ route: home, params: undefined })
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flushPromises()

    // Exactly one canonical, one og:title, one JSON-LD — no duplicates.
    expect(document.head.querySelectorAll('link[rel="canonical"]').length).toBe(1)
    expect(document.head.querySelectorAll('meta[property="og:title"]').length).toBe(1)
    expect(document.head.querySelectorAll('script[type="application/ld+json"]').length).toBe(1)
    // Back on home — its head is fully restored.
    expect(document.title).toBe('Home — Acme')
    expect(canonicalHref()).toBe('https://acme.test/')
    expect(jsonLd()).toBe('{"@type":"WebSite","name":"Acme"}')
  })

  it('persists global app.head defaults across navigations; route overrides per field', async () => {
    const globalHead = {
      title: 'Acme (default)',
      meta: [
        { name: 'theme-color', content: '#0a0a0a' },
        { name: 'description', content: 'Default description' },
      ],
    }
    mockMatch.mockReturnValue({ route: about, params: undefined })
    createApp({ site: { url: 'https://acme.test' }, head: globalHead })
    await flushPromises()

    // Route wins on title; global theme-color persists; route has no description
    // so the global default shows through.
    expect(document.title).toBe('About — Acme')
    expect(metaContent('meta[name="theme-color"]')).toBe('#0a0a0a')
    expect(metaContent('meta[name="description"]')).toBe('Default description')

    // Navigate to a route with NO head — global defaults must remain.
    const bare: RouteStub = { name: 'bare-page', module: vi.fn().mockResolvedValue(undefined) }
    mockMatch.mockReturnValue({ route: bare, params: undefined })
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flushPromises()

    expect(document.title).toBe('Acme (default)')
    expect(metaContent('meta[name="theme-color"]')).toBe('#0a0a0a')
    expect(metaContent('meta[name="description"]')).toBe('Default description')
    // The route-only canonical/og from `about` are cleaned up.
    expect(canonicalHref()).toBeNull()
    expect(metaContent('meta[property="og:title"]')).toBeNull()
  })

  it('clears the prior route head when navigating to a headless route with no globals', async () => {
    mockMatch.mockReturnValue({ route: home, params: undefined })
    createApp({ site: { url: 'https://acme.test' } })
    await flushPromises()
    expect(canonicalHref()).toBe('https://acme.test/')

    const bare: RouteStub = { name: 'bare-page', module: vi.fn().mockResolvedValue(undefined) }
    mockMatch.mockReturnValue({ route: bare, params: undefined })
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flushPromises()

    // No route head + no global defaults → all managed per-page tags removed.
    expect(canonicalHref()).toBeNull()
    expect(metaContent('meta[name="description"]')).toBeNull()
    expect(jsonLd()).toBeNull()
  })

  it('leaves document.head untouched when a route has no head and no globals exist', async () => {
    const bare: RouteStub = { name: 'bare-page', module: vi.fn().mockResolvedValue(undefined) }
    mockMatch.mockReturnValue({ route: bare, params: undefined })
    createApp()
    await flushPromises()

    expect(document.head.querySelectorAll('[data-aihu-head]').length).toBe(0)
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('bare-page')
  })
})

// ─── Layout rendering (runtime layout — the regression guard this repo lacked) ─
// These prove the page renders INSIDE the layout's `data-aihu-outlet` marker,
// not in the root outlet. The layout element mirrors a compiled layout SFC: a
// passive marker inside a shell, in shadow DOM (default) or light DOM (css
// `shadowMode: 'none'`).

/**
 * Register a fake compiled-layout custom element under `tag`. On connect it
 * mounts `<div class="shell"><div data-aihu-outlet></div></div>` into its shadow
 * root (or light DOM when `shadow: false`). `noOutlet` omits the marker.
 */
function defineTestLayout(tag: string, opts: { shadow?: boolean; noOutlet?: boolean } = {}): void {
  if (customElements.get(tag)) return
  class TestLayout extends HTMLElement {
    connectedCallback(): void {
      const target: ParentNode = opts.shadow === false ? this : this.attachShadow({ mode: 'open' })
      const shell = document.createElement('div')
      shell.className = 'shell'
      if (!opts.noOutlet) {
        const marker = document.createElement('div')
        marker.setAttribute('data-aihu-outlet', '')
        shell.appendChild(marker)
      }
      target.appendChild(shell)
    }
  }
  customElements.define(tag, TestLayout)
}

describe('createApp — layout rendering', () => {
  let outlet: HTMLElement

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutes.length = 0
    mockMatch.mockReturnValue(null)
    for (const k of Object.keys(mockLayouts)) delete mockLayouts[k]
    outlet = makeOutlet()
  })

  afterEach(() => document.body.replaceChildren())

  it('renders the page INSIDE the layout outlet, not the root outlet', async () => {
    const load = vi.fn(async () => defineTestLayout('aihu-layout-app'))
    mockLayouts.app = { tag: 'aihu-layout-app', load }
    const route: RouteStub = {
      name: 'home-page',
      layout: 'app',
      module: vi.fn().mockResolvedValue(undefined),
    }
    mockMatch.mockReturnValue({ route, params: undefined })

    createApp()
    await flushPromises()

    // Root outlet holds the LAYOUT element (not the page).
    const layoutEl = outlet.firstElementChild as HTMLElement
    expect(layoutEl?.tagName.toLowerCase()).toBe('aihu-layout-app')
    expect(load).toHaveBeenCalledOnce()

    // The page lives inside the layout's data-aihu-outlet marker (shadow DOM).
    const marker = layoutEl.shadowRoot?.querySelector('[data-aihu-outlet]')
    expect(marker).not.toBeNull()
    expect(marker!.firstElementChild?.tagName.toLowerCase()).toBe('home-page')

    // …and NOT directly in the root outlet.
    expect(outlet.querySelector('home-page')).toBeNull()
  })

  it('passes route params through to the page rendered inside the layout', async () => {
    mockLayouts.app = {
      tag: 'aihu-layout-app',
      load: vi.fn(async () => defineTestLayout('aihu-layout-app')),
    }
    const route: RouteStub = {
      name: 'user-profile',
      layout: 'app',
      module: vi.fn().mockResolvedValue(undefined),
    }
    mockMatch.mockReturnValue({ route, params: { userId: '7' } })

    createApp()
    await flushPromises()

    const page = (outlet.firstElementChild as HTMLElement).shadowRoot?.querySelector(
      'user-profile',
    ) as HTMLElement
    expect(page).not.toBeNull()
    expect(page.getAttribute('userId')).toBe('7')
  })

  it('fills a light-DOM (shadowMode: none) layout marker', async () => {
    mockLayouts.bare = {
      tag: 'aihu-layout-bare',
      load: vi.fn(async () => defineTestLayout('aihu-layout-bare', { shadow: false })),
    }
    const route: RouteStub = {
      name: 'home-page',
      layout: 'bare',
      module: vi.fn().mockResolvedValue(undefined),
    }
    mockMatch.mockReturnValue({ route, params: undefined })

    createApp()
    await flushPromises()

    const layoutEl = outlet.firstElementChild as HTMLElement
    expect(layoutEl.tagName.toLowerCase()).toBe('aihu-layout-bare')
    const marker = layoutEl.querySelector('[data-aihu-outlet]')
    expect(marker!.firstElementChild?.tagName.toLowerCase()).toBe('home-page')
  })

  it('mounts the page directly in the root outlet when route declares no layout', async () => {
    const route: RouteStub = {
      name: 'home-page',
      module: vi.fn().mockResolvedValue(undefined),
    }
    mockMatch.mockReturnValue({ route, params: undefined })

    createApp()
    await flushPromises()

    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('home-page')
  })

  it('falls back to the root outlet when the declared layout is missing from the map', async () => {
    const route: RouteStub = {
      name: 'home-page',
      layout: 'ghost', // not present in mockLayouts
      module: vi.fn().mockResolvedValue(undefined),
    }
    mockMatch.mockReturnValue({ route, params: undefined })

    createApp()
    await flushPromises()

    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('home-page')
  })

  it('switches layouts when navigating between routes with different layouts', async () => {
    // createApp() registers a popstate listener with no teardown, so by this
    // point earlier tests' createApp instances also fire on the dispatch below
    // and re-render into their now-detached outlets (no marker → warn). That
    // noise is a test-isolation artifact, not product behavior — silence it.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockLayouts.app = {
      tag: 'aihu-layout-app',
      load: vi.fn(async () => defineTestLayout('aihu-layout-app')),
    }
    mockLayouts.admin = {
      tag: 'aihu-layout-admin',
      load: vi.fn(async () => defineTestLayout('aihu-layout-admin')),
    }
    const home: RouteStub = {
      name: 'home-page',
      layout: 'app',
      module: vi.fn().mockResolvedValue(undefined),
    }
    const dash: RouteStub = {
      name: 'dash-page',
      layout: 'admin',
      module: vi.fn().mockResolvedValue(undefined),
    }

    mockMatch.mockReturnValue({ route: home, params: undefined })
    createApp()
    await flushPromises()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('aihu-layout-app')

    mockMatch.mockReturnValue({ route: dash, params: undefined })
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flushPromises()

    const layoutEl = outlet.firstElementChild as HTMLElement
    expect(layoutEl.tagName.toLowerCase()).toBe('aihu-layout-admin')
    expect(
      layoutEl.shadowRoot
        ?.querySelector('[data-aihu-outlet]')
        ?.firstElementChild?.tagName.toLowerCase(),
    ).toBe('dash-page')
    warnSpy.mockRestore()
  })
})

// ─── Dynamic layout switching — Step 2 (setLayout on the returned handle) ─────

describe('createApp — dynamic layout switching (setLayout)', () => {
  let outlet: HTMLElement

  const home = (): RouteStub => ({
    name: 'home-page',
    layout: 'app',
    module: vi.fn().mockResolvedValue(undefined),
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockRoutes.length = 0
    mockMatch.mockReturnValue(null)
    for (const k of Object.keys(mockLayouts)) delete mockLayouts[k]
    mockLayouts.app = {
      tag: 'aihu-layout-app',
      load: vi.fn(async () => defineTestLayout('aihu-layout-app')),
    }
    mockLayouts.compact = {
      tag: 'aihu-layout-compact',
      load: vi.fn(async () => defineTestLayout('aihu-layout-compact')),
    }
    outlet = makeOutlet()
  })

  afterEach(() => document.body.replaceChildren())

  it('swaps the layout on the current route without navigating, keeping the page', async () => {
    mockMatch.mockReturnValue({ route: home(), params: undefined })
    const app = createApp()
    await flushPromises()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('aihu-layout-app')

    await app.setLayout('compact')

    const layoutEl = outlet.firstElementChild as HTMLElement
    expect(layoutEl.tagName.toLowerCase()).toBe('aihu-layout-compact')
    // The page is still rendered, now inside the compact layout's outlet.
    expect(
      layoutEl.shadowRoot
        ?.querySelector('[data-aihu-outlet]')
        ?.firstElementChild?.tagName.toLowerCase(),
    ).toBe('home-page')
  })

  it('setLayout(null) renders the page with no layout (root outlet)', async () => {
    mockMatch.mockReturnValue({ route: home(), params: undefined })
    const app = createApp()
    await flushPromises()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('aihu-layout-app')

    await app.setLayout(null)
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('home-page')
  })

  it('resets the override on navigation — the route returns to its declared layout', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockMatch.mockReturnValue({ route: home(), params: undefined })
    const app = createApp()
    await flushPromises()

    await app.setLayout(null)
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('home-page')

    // A real navigation clears the override; the declared `app` layout returns.
    mockMatch.mockReturnValue({ route: home(), params: undefined })
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flushPromises()
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe('aihu-layout-app')
    warnSpy.mockRestore()
  })
})
