import { createRouter } from '@scribe/router'
import type { MatchResult } from '@scribe/router'
import routes from 'virtual:scribe-routes'

const router = createRouter(routes)
const outlet = document.getElementById('outlet') as HTMLElement

async function render(match: MatchResult | null): Promise<void> {
  if (!match) {
    const p = document.createElement('p')
    p.style.cssText = 'font-family:system-ui;padding:2rem;color:#888'
    p.textContent = '404 — page not found'
    outlet.replaceChildren(p)
    return
  }
  // Import the page module — this registers its custom element and auto-wires the runtime.
  await match.route.module()
  const tag = match.route.name
  if (!tag || !tag.includes('-')) return
  const el = document.createElement(tag)
  // Pass route params as a JSON attribute for $prop consumption.
  if (match.params && Object.keys(match.params).length > 0) {
    el.setAttribute('route', JSON.stringify({ params: match.params }))
  }
  outlet.replaceChildren(el)
}

// Initial render
render(router.match(location.pathname))

// Client-side SPA navigation — intercept <a> clicks within the app.
document.addEventListener('click', (e) => {
  const a = (e.target as Element).closest('a') as HTMLAnchorElement | null
  if (!a) return
  const href = a.getAttribute('href')
  if (!href || href.startsWith('http') || href.startsWith('//') || href.startsWith('mailto:')) return
  e.preventDefault()
  history.pushState({}, '', href)
  render(router.match(location.pathname))
})

window.addEventListener('popstate', () => {
  render(router.match(location.pathname))
})
