import layouts from 'virtual:aihu-layouts'
import routes from 'virtual:aihu-routes'
import { hydrate, mount } from '@aihu/arbor'
import type { MatchResult, RouteDefinition, RouteHead } from '@aihu/router'
import { createRouter } from '@aihu/router'
import { _setHydrate, _setMount, _setSignal } from '@aihu/runtime'
// Pure subpath — NOT the @aihu/server barrel. The barrel reaches loader.ts +
// the lazy native loader; importing it would risk dragging node:-bearing code
// into the browser client bundle and trip check:runtime-purity. head-lowering.ts
// is side-effect free (only the web-standard URL), so this stays node:-free.
import type { HeadConfig } from '@aihu/server/head-lowering'
import { routeHeadToSsrHead } from '@aihu/server/head-lowering'
import { signal } from '@aihu/signals'
import { applyHeadToDocument, clearManagedHead } from './head-apply.ts'

/**
 * Rendering mode passed from the server config into the client bootstrap.
 * Inlined here to avoid importing @aihu/server into the client bundle.
 * Must stay in sync with RenderingMode in @aihu/server.
 */
export type AppRenderingMode = 'ssr' | 'spa' | 'hybrid'

/** Inline runtime configuration accepted by createApp(). All fields optional. */
export interface AppConfig {
  /** Id of the outlet element in index.html. Default: 'outlet' */
  outletId?: string
  /**
   * App-level values hoisted into globalThis before any component runs.
   * Use this for singletons (db clients, auth helpers, i18n) that are
   * referenced as bare identifiers inside @state blocks.
   *
   * @example
   * createApp({ provide: { supabase, checkAuth } })
   */
  provide?: Record<string, unknown>
  /**
   * Rendering mode from the server config. Controls whether the client
   * wires the hydration function into the runtime.
   *
   * - 'ssr' | 'hybrid' (default): wires _setHydrate so the client can
   *   take over from server-rendered HTML without re-creating DOM.
   * - 'spa': skips _setHydrate — no SSR HTML to hydrate, mount-only.
   *
   * Pass `defineAihuConfig(…).rendering?.mode` from your server config.
   * Default: 'ssr' (hydration wired).
   */
  rendering?: { mode?: AppRenderingMode }
  /**
   * Site-level config. `site.url` is the absolute base URL used to resolve
   * relative per-route `canonical` / `og:*` / `twitter:*` values into absolute
   * URLs as the head is applied on client navigation (mirrors the SSG path's
   * `AihuConfig.site.url`). When absent, relative values are emitted unchanged.
   */
  site?: { url?: string }
  /**
   * Global `<head>` defaults (typically `aihu.config.ts`'s `app.head`). On every
   * navigation these defaults are folded under the active route's head
   * (`routeHeadToSsrHead`'s `globalHead`) and re-applied — so a route that omits
   * a field falls back to the global default, and global tags persist across
   * navigations while route-only tags are cleaned up.
   */
  head?: HeadConfig
}

/**
 * Handle returned by {@link createApp} for driving the running app.
 */
export interface AppHandle {
  /**
   * Switch the active layout on the current route without navigating.
   * `setLayout(name)` forces that layout; `setLayout(null)` forces none. The
   * override is reset on the next navigation. Wire it to a UI toggle or expose
   * it to an `@agent` action (e.g. `setLayout("compact")`).
   */
  setLayout(name: string | null): Promise<void>
}

/**
 * Bootstrap the aihu SPA.
 *
 * - Wires the aihu runtime (mount + signal) — idempotent if called multiple times
 * - Creates the router from virtual:aihu-routes
 * - Renders the current route (wrapped in its `layout`, if any)
 * - Installs SPA click interception and popstate listeners
 *
 * Returns an {@link AppHandle} for runtime control (e.g. dynamic layout switching).
 *
 * @example
 * // src/main.ts
 * import { createApp } from '@aihu/app/client'
 * const app = createApp()
 * app.setLayout('compact') // switch layout on the current route
 */
export function createApp(config?: AppConfig): AppHandle {
  // Hoist provided values into globalThis before any component runs so that
  // @state blocks can reference them as bare identifiers.
  if (config?.provide) {
    Object.assign(globalThis, config.provide)
  }

  // Wire runtime — null-guarded in @aihu/runtime, safe to call multiple times
  _setMount(mount)
  _setSignal(signal as Parameters<typeof _setSignal>[0])
  if (config?.rendering?.mode !== 'spa') {
    _setHydrate(hydrate as Parameters<typeof _setHydrate>[0])
  }

  const outletId = config?.outletId ?? 'outlet'
  const outletEl = document.getElementById(outletId)
  if (!outletEl) {
    throw new Error(
      `@aihu/app: no element with id="${outletId}" found. Add <div id="${outletId}"></div> to your index.html`,
    )
  }
  const outlet: HTMLElement = outletEl

  const router = createRouter(routes)

  // Per-route <head> wiring (B5, SEO arc). `siteUrl` resolves relative
  // canonical/OG/Twitter URLs to absolute; `globalHead` (app.head) is folded
  // under each route's head so defaults persist across navigations.
  const siteUrl = config?.site?.url
  const globalHead = config?.head

  /**
   * Update the live `document.head` for the active route. Lowers the route's
   * head (merged with the global defaults) into a renderable HeadConfig and
   * applies it — `applyHeadToDocument` first removes the prior route's managed
   * tags, so stale title/canonical/OG/JSON-LD never accumulate across nav.
   *
   * When there is no route head AND no global defaults, the previously-managed
   * per-page tags are simply cleared (nothing to re-apply).
   */
  function updateHead(head: RouteHead | undefined): void {
    if (head === undefined && globalHead === undefined) {
      clearManagedHead()
      return
    }
    const lowered = routeHeadToSsrHead(head, {
      ...(siteUrl !== undefined ? { siteUrl } : {}),
      ...(globalHead !== undefined ? { globalHead } : {}),
    })
    applyHeadToDocument(lowered)
  }

  // Dynamic layout switching (Step 2). `layoutOverride` lets a human toggle or
  // an `@agent` action swap the active layout WITHOUT navigating:
  //   - `undefined` → follow the matched route's declared `layout`
  //   - `null`      → force NO layout (render at the root outlet)
  //   - `"<name>"`  → force that layout
  // It is transient: navigating resets it so each route shows its declared
  // layout again. `currentMatch` is the last rendered match so `setLayout` can
  // re-render the same route under the new layout.
  let currentMatch: MatchResult | null = null
  let layoutOverride: string | null | undefined

  async function render(match: MatchResult | null): Promise<void> {
    currentMatch = match
    if (!match) {
      // Check for a 404/not-found route by convention before falling back inline
      const notFoundRoute = (routes as RouteDefinition[]).find(
        (r) => r.pattern === '*' || r.name === 'not-found',
      )
      if (notFoundRoute) {
        await notFoundRoute.module()
        const tag = notFoundRoute.name
        if (tag?.includes('-')) {
          updateHead(notFoundRoute.head)
          outlet.replaceChildren(document.createElement(tag))
          return
        }
      }
      // Inline fallback 404 — drop the prior route's head, fall back to globals.
      updateHead(undefined)
      const p = document.createElement('p')
      p.style.cssText = 'font-family:system-ui;padding:2rem;color:#888'
      p.textContent = '404 — page not found'
      outlet.replaceChildren(p)
      return
    }

    // Reflect the active route's <head> on the live document before rendering
    // its element, so title/meta/canonical/JSON-LD match the page being shown.
    updateHead(match.route.head)

    // Import the page module — registers its custom element + auto-wires runtime
    await match.route.module()
    const tag = match.route.name
    if (!tag?.includes('-')) return

    const el = document.createElement(tag)

    // Flat per-attribute route params (A4 protocol — replaces JSON route attribute)
    if (match.params) {
      for (const [key, val] of Object.entries(match.params)) {
        el.setAttribute(key, String(val))
      }
    }

    // Layout wrapping: if the matched route declares a `layout` and that layout
    // exists in the generated map, render the layout into the root outlet and
    // mount the page into the layout's `data-aihu-outlet` marker. Otherwise the
    // page mounts directly into the root outlet (original behavior).
    // Override (dynamic switch) wins over the route's declared layout.
    const layoutName =
      layoutOverride === undefined ? match.route.layout : (layoutOverride ?? undefined)
    const entry = layoutName ? layouts[layoutName] : undefined
    if (entry) {
      // Register the layout's `aihu-layout-<name>` custom element (import side effect).
      await entry.load()
      const layoutEl = document.createElement(entry.tag)
      // Connect the layout first so its template — including the passive outlet
      // marker — mounts synchronously, then place the page inside the marker.
      outlet.replaceChildren(layoutEl)
      const root: ParentNode = layoutEl.shadowRoot ?? layoutEl
      const marker = root.querySelector('[data-aihu-outlet]')
      if (marker) {
        marker.replaceChildren(el)
      } else {
        // Misconfigured layout (no <$outlet>) — keep it visible + surface it
        // rather than silently dropping the page.
        console.warn(`[@aihu/app] layout "${layoutName}" has no <$outlet>`)
        root.appendChild(el)
      }
      return
    }

    outlet.replaceChildren(el)
  }

  /** Navigate-and-render: a real navigation clears any transient layout override. */
  function renderNav(match: MatchResult | null): void {
    layoutOverride = undefined
    void render(match)
  }

  /**
   * Switch the active layout on the current route WITHOUT navigating.
   * - `setLayout("compact")` — render the current page under the `compact` layout.
   * - `setLayout(null)` — render the current page with no layout (root outlet).
   * The override is reset on the next navigation. Returns a promise that
   * resolves once the re-render completes.
   */
  function setLayout(name: string | null): Promise<void> {
    layoutOverride = name
    return render(currentMatch)
  }

  // Initial render
  renderNav(router.match(location.pathname))

  // SPA click interception — handles <a> links within the app
  document.addEventListener('click', (e) => {
    // Resolve the anchor across shadow boundaries. A click inside a shadow root
    // (e.g. a layout shell rendered with the default shadow mode) is retargeted
    // at the host, so `e.target` is the host element and `closest('a')` misses
    // the real <a>. `composedPath()` includes nodes inside shadow trees, ordered
    // target→root, so the first anchor in it is the innermost one clicked.
    const a = e.composedPath().find((n): n is HTMLAnchorElement => n instanceof HTMLAnchorElement)
    if (!a) return
    const href = a.getAttribute('href')
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto:'))
      return
    e.preventDefault()
    history.pushState({}, '', href)
    renderNav(router.match(location.pathname))
  })

  // Browser back/forward
  window.addEventListener('popstate', () => {
    renderNav(router.match(location.pathname))
  })

  return { setLayout }
}
