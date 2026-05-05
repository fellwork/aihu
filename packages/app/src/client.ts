import routes from 'virtual:aihu-routes'
import { mount } from '@aihu/arbor'
import type { MatchResult, RouteDefinition } from '@aihu/router'
import { createRouter } from '@aihu/router'
import { _setMount, _setSignal } from '@aihu/runtime'
import { signal } from '@aihu/signals'

/** Inline runtime configuration accepted by createApp(). All fields optional. */
export interface AppConfig {
  /** Id of the outlet element in index.html. Default: 'outlet' */
  outletId?: string
}

/**
 * Bootstrap the aihu SPA.
 *
 * - Wires the aihu runtime (mount + signal) — idempotent if called multiple times
 * - Creates the router from virtual:aihu-routes
 * - Renders the current route
 * - Installs SPA click interception and popstate listeners
 *
 * @example
 * // src/main.ts
 * import { createApp } from '@aihu/app/client'
 * createApp()
 */
export function createApp(config?: AppConfig): void {
  // Wire runtime — null-guarded in @aihu/runtime, safe to call multiple times
  _setMount(mount)
  _setSignal(signal as Parameters<typeof _setSignal>[0])

  const outletId = config?.outletId ?? 'outlet'
  const outletEl = document.getElementById(outletId)
  if (!outletEl) {
    throw new Error(
      `@aihu/app: no element with id="${outletId}" found. Add <div id="${outletId}"></div> to your index.html`,
    )
  }
  const outlet: HTMLElement = outletEl

  const router = createRouter(routes)

  async function render(match: MatchResult | null): Promise<void> {
    if (!match) {
      // Check for a 404/not-found route by convention before falling back inline
      const notFoundRoute = (routes as RouteDefinition[]).find(
        (r) => r.pattern === '*' || r.name === 'not-found',
      )
      if (notFoundRoute) {
        await notFoundRoute.module()
        const tag = notFoundRoute.name
        if (tag && tag.includes('-')) {
          outlet.replaceChildren(document.createElement(tag))
          return
        }
      }
      // Inline fallback 404
      const p = document.createElement('p')
      p.style.cssText = 'font-family:system-ui;padding:2rem;color:#888'
      p.textContent = '404 — page not found'
      outlet.replaceChildren(p)
      return
    }

    // Import the page module — registers its custom element + auto-wires runtime
    await match.route.module()
    const tag = match.route.name
    if (!tag || !tag.includes('-')) return

    const el = document.createElement(tag)

    // Flat per-attribute route params (A4 protocol — replaces JSON route attribute)
    if (match.params) {
      for (const [key, val] of Object.entries(match.params)) {
        el.setAttribute(key, String(val))
      }
    }

    outlet.replaceChildren(el)
  }

  // Initial render
  render(router.match(location.pathname))

  // SPA click interception — handles <a> links within the app
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest('a') as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute('href')
    if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto:'))
      return
    e.preventDefault()
    history.pushState({}, '', href)
    render(router.match(location.pathname))
  })

  // Browser back/forward
  window.addEventListener('popstate', () => {
    render(router.match(location.pathname))
  })
}
