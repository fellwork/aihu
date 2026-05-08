import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hoisted mutable state ──────────────────────────────────────────────────
// vi.hoisted values are available inside vi.mock factories (both are hoisted).
// mockRoutes is passed by reference so mutations in tests are visible to the
// `routes` binding in client.ts (same array object).

type RouteStub = { pattern?: string; name?: string; module: () => Promise<unknown> }
type MatchStub = { route: RouteStub; params?: Record<string, string> } | null

const { mockRoutes, mockMatch } = vi.hoisted(() => ({
  mockRoutes: [] as RouteStub[],
  mockMatch: vi.fn<[], MatchStub>(() => null),
}))

vi.mock('virtual:aihu-routes', () => ({ default: mockRoutes }))
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
