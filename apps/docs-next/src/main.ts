import { createApp } from '@aihu/app/client'

// --- design system (global; css.shadowMode: 'light') ---
import './styles/tokens.css'
import './styles/utilities.generated.css' // dogfooded @aihu/css-engine output
import './styles/base.css'
import './styles/api.css' // /api/** datasheet — global so generated pages need no per-page @style
import './styles/cookbook.css' // /cookbook/<id> recipe datasheet — same reasoning

// --- island + shell component registrations ---
// Pages (src/pages) and layouts (src/layouts) are registered by the file-router
// integration; the interactive islands referenced inside them are registered
// here as a side effect of import.
import './components/site-header.aihu'
import './components/theme-toggle.aihu'
import './components/search-box.aihu'
import './components/toc-rail.aihu'
import './components/counter-demo.aihu'
import './components/weather-demo.aihu'

// Boot the SPA. On an output:'static' build the prerendered per-route HTML is
// already in the document; createApp hydrates and adopts it in place.
createApp()

// --- delegated "copy code" handler ---
// One listener serves every `.cb-copy` button (prerendered pages AND markdown
// injected via html={...}), so code blocks need no per-block island.
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target as Element | null
    const btn = target?.closest?.('.cb-copy') as HTMLElement | null
    if (!btn) return
    const code = btn.closest('.cb')?.querySelector('code')?.textContent ?? ''
    const done = () => {
      btn.setAttribute('data-copied', 'true')
      setTimeout(() => btn.removeAttribute('data-copied'), 1300)
    }
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(code).then(done, done)
    } else {
      done()
    }
  })

  // --- scroll-reset on navigation ---
  // The router doesn't reset scroll on client-side navigation, and a per-layout
  // afterNavigate misses cross-layout transitions (site ↔ docs). This global,
  // never-unmounted handler resets scroll to top for EVERY internal link click
  // (unless it targets an in-page #anchor), so no navigation can land mid-page.
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
      return
    const a = (e.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null
    if (!a) return
    const href = a.getAttribute('href')
    if (!href || href.startsWith('#') || a.target === '_blank' || a.hasAttribute('download')) return
    const url = new URL(a.href, location.href)
    if (url.origin !== location.origin || url.hash) return
    if (url.pathname === location.pathname) return
    // Fire after the router swaps content in.
    requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }))
  })
}
