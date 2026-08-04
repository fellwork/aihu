/**
 * Route context in a `createApp()` app — the regression guard for the bug
 * where `useRoute()` / `useRouter()` / `useRouteParams()` silently resolved to
 * the token default forever in the PRIMARY app model.
 *
 * `@aihu/router`'s `useRoute`/`useRouter` and `@aihu/use`'s `useRouteParams`
 * all resolve through `inject(RouteContext)`, and `RouteContext` used to be
 * provided ONLY by the standalone `<router>` SFC. `createApp()` builds its own
 * router and never provided the context, so `inject` fell back to `null` — no
 * error, no warning, just a permanently dead API.
 *
 * Unlike create-app.test.ts (which mocks the whole runtime to assert wiring),
 * this file mocks ONLY the three `virtual:` modules. @aihu/router,
 * @aihu/runtime, @aihu/arbor, @aihu/signals and @aihu/context are all REAL —
 * that is the point: the bug lived in the seam between them.
 */

import { leaf } from '@aihu/arbor'
import { createContext, inject, provide } from '@aihu/context'
import type { MatchResult, RouteSegment } from '@aihu/router'
import { RouteContext, useRoute, useRouter } from '@aihu/router'
import { defineComponent, defineElement } from '@aihu/runtime'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @aihu/use has no vitest alias (it is a source-only family package); import
// the composable by path, the same way component-rendering.test.ts reaches
// into ../../runtime/src.
import { useRouteParams } from '../../use/src/router/useRouteParams/index.ts'

type RouteStub = {
  pattern: string
  segments: RouteSegment[]
  module: () => Promise<unknown>
  name?: string
  layout?: string
  components?: readonly string[]
}
type LayoutEntry = { tag: string; load: () => Promise<unknown>; components?: readonly string[] }

const { mockRoutes, mockLayouts, mockComponents } = vi.hoisted(() => ({
  mockRoutes: [] as RouteStub[],
  mockLayouts: {} as Record<string, LayoutEntry>,
  mockComponents: {} as Record<string, () => Promise<unknown>>,
}))

vi.mock('virtual:aihu-routes', () => ({ default: mockRoutes }))
vi.mock('virtual:aihu-layouts', () => ({ default: mockLayouts }))
vi.mock('virtual:aihu-components', () => ({ default: mockComponents }))

import { createApp } from '../src/client.ts'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

let _ctr = 0
const nextTag = (): string => `x-rc-${++_ctr}`

/** What a component captured from the route APIs during its setup. */
type Seen = {
  route: MatchResult | null
  params: () => Record<string, string>
  routerFound: boolean
}

/**
 * Define a page element that reads all three route APIs during setup and
 * records what it saw. Returns the tag plus the (mutable) capture slot.
 */
function definePage(): { tag: string; seen: Seen[] } {
  const tag = nextTag()
  const seen: Seen[] = []
  defineElement(
    tag,
    defineComponent(() => {
      seen.push({
        route: useRoute(),
        params: useRouteParams().params,
        routerFound: useRouter() !== null,
      })
      return leaf('page')
    }),
    { shadowMode: 'light' },
  )
  return { tag, seen }
}

function makeOutlet(id = 'outlet'): HTMLElement {
  const el = document.createElement('div')
  el.id = id
  document.body.appendChild(el)
  return el
}

function route(pattern: string, segments: RouteSegment[], name: string): RouteStub {
  return { pattern, segments, name, module: async () => ({ default: {} }) }
}

const POST_SEGMENTS: RouteSegment[] = [
  { kind: 'static', path: 'posts' },
  { kind: 'param', name: 'id' },
]

beforeEach(() => {
  mockRoutes.length = 0
  for (const k of Object.keys(mockLayouts)) delete mockLayouts[k]
  for (const k of Object.keys(mockComponents)) delete mockComponents[k]
  history.replaceState(null, '', '/')
})
afterEach(() => document.body.replaceChildren())

// ─── The fix ────────────────────────────────────────────────────────────────

describe('createApp — RouteContext is provided to the component tree', () => {
  it('useRoute() resolves the active match inside a page component', async () => {
    const { tag, seen } = definePage()
    mockRoutes.push(route('/posts/:id', POST_SEGMENTS, tag))
    history.replaceState(null, '', '/posts/42')
    makeOutlet()

    createApp()
    await flush()

    expect(seen).toHaveLength(1)
    expect(seen[0]!.route).not.toBeNull()
    expect(seen[0]!.route!.pathname).toBe('/posts/42')
    expect(seen[0]!.route!.route.pattern).toBe('/posts/:id')
  })

  it('useRouteParams() resolves the matched params (not {})', async () => {
    const { tag, seen } = definePage()
    mockRoutes.push(route('/posts/:id', POST_SEGMENTS, tag))
    history.replaceState(null, '', '/posts/hello-world')
    makeOutlet()

    createApp()
    await flush()

    expect(seen[0]!.params()).toEqual({ id: 'hello-world' })
  })

  it('useRouter() resolves the app router', async () => {
    const { tag, seen } = definePage()
    mockRoutes.push(route('/posts/:id', POST_SEGMENTS, tag))
    history.replaceState(null, '', '/posts/1')
    makeOutlet()

    createApp()
    await flush()

    expect(seen[0]!.routerFound).toBe(true)
  })

  it('resolves through a layout host (shadow-root hop up the provides chain)', async () => {
    const { tag, seen } = definePage()
    const layoutTag = nextTag()
    defineElement(
      layoutTag,
      defineComponent(() => leaf('')),
    )
    const r = route('/posts/:id', POST_SEGMENTS, tag)
    r.layout = 'main'
    mockRoutes.push(r)
    mockLayouts.main = { tag: layoutTag, load: async () => ({}) }
    history.replaceState(null, '', '/posts/7')
    const outlet = makeOutlet()

    createApp()
    await flush()

    // The layout element renders a shadow root with no [data-aihu-outlet]
    // marker, so createApp appends the page into the shadow root directly —
    // which is exactly the host-hop the provides walk has to traverse.
    expect(outlet.firstElementChild?.tagName.toLowerCase()).toBe(layoutTag)
    expect(seen[0]!.route?.params).toEqual({ id: '7' })
  })

  it('params track navigation — a popstate re-render sees the new match', async () => {
    const { tag, seen } = definePage()
    mockRoutes.push(route('/posts/:id', POST_SEGMENTS, tag))
    history.replaceState(null, '', '/posts/1')
    makeOutlet()

    createApp()
    await flush()
    expect(seen[0]!.params()).toEqual({ id: '1' })

    history.replaceState(null, '', '/posts/2')
    window.dispatchEvent(new PopStateEvent('popstate'))
    await flush()

    expect(seen).toHaveLength(2)
    expect(seen[1]!.params()).toEqual({ id: '2' })
    // The FIRST instance's getter is a live signal read over the same
    // context, so it tracks too — this is the reactive contract, not a
    // per-instance snapshot.
    expect(seen[0]!.params()).toEqual({ id: '2' })
  })
})

// ─── The general seam ───────────────────────────────────────────────────────
//
// RouteContext was one symptom; the root cause was that @aihu/app had NO
// context-participating app root. `config.context` is that root — the seam the
// "provide at app root" docs on @aihu/magna's MagnaFetchToken and
// @aihu-plugin/data's ResourceStoreToken already assume exists.

describe('createApp — config.context (app-root context scope)', () => {
  it('a token provided at the app root is injectable from a page component', async () => {
    const Token = createContext<string | null>(null)
    const tag = nextTag()
    const seen: (string | null | undefined)[] = []
    defineElement(
      tag,
      defineComponent(() => {
        seen.push(inject(Token))
        return leaf('page')
      }),
      { shadowMode: 'light' },
    )
    mockRoutes.push(route('/', [], tag))
    makeOutlet()

    createApp({ context: () => provide(Token, 'magna-fetch') })
    await flush()

    expect(seen).toEqual(['magna-fetch'])
  })

  it('is not required — omitting it leaves RouteContext working', async () => {
    const { tag, seen } = definePage()
    mockRoutes.push(route('/posts/:id', POST_SEGMENTS, tag))
    history.replaceState(null, '', '/posts/3')
    makeOutlet()

    createApp()
    await flush()

    expect(seen[0]!.route?.params).toEqual({ id: '3' })
  })

  it('runs AFTER the framework providers, so an app can override RouteContext', async () => {
    const { tag, seen } = definePage()
    mockRoutes.push(route('/posts/:id', POST_SEGMENTS, tag))
    history.replaceState(null, '', '/posts/5')
    makeOutlet()

    const fake = {
      router: { match: () => null } as never,
      current: () => ({ params: { id: 'overridden' } }) as never,
    }
    createApp({ context: () => provide(RouteContext, fake) })
    await flush()

    expect(seen[0]!.params()).toEqual({ id: 'overridden' })
  })
})

// ─── Degrade-safe ───────────────────────────────────────────────────────────

describe('route APIs outside any router', () => {
  it('degrade to null / {} with no error when no app provided a context', () => {
    const { tag, seen } = definePage()
    // No createApp(), no <router> — just a bare element in the document.
    document.body.appendChild(document.createElement(tag))

    expect(seen).toHaveLength(1)
    expect(seen[0]!.route).toBeNull()
    expect(seen[0]!.routerFound).toBe(false)
    expect(seen[0]!.params()).toEqual({})
  })

  it('a component mounted OUTSIDE the outlet does not inherit the app context', async () => {
    const { tag, seen } = definePage()
    const other = definePage()
    mockRoutes.push(route('/posts/:id', POST_SEGMENTS, tag))
    history.replaceState(null, '', '/posts/9')
    makeOutlet()

    createApp()
    await flush()
    expect(seen[0]!.route).not.toBeNull()

    // Sibling of the outlet, not a descendant — context is tree-scoped.
    document.body.appendChild(document.createElement(other.tag))
    expect(other.seen[0]!.route).toBeNull()
    expect(other.seen[0]!.params()).toEqual({})
  })
})
