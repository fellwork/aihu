import { createApp } from '@aihu/app/client'

// --- design system (global; css.shadowMode: 'light') ---
import './styles/tokens.css'
import './styles/utilities.generated.css' // dogfooded @aihu/css-engine output
import './styles/base.css'
import './styles/api.css' // /api/** datasheet — global so generated pages need no per-page @style

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
}
