// content.ts populates window.__DOCS__ before any component reads it
import './content.ts'

// Aihu components — registered as custom elements on import
import './components/theme-toggle.aihu'
import './components/live-demo.aihu'
import './components/docs-shell.aihu'

// Homepage playground (Directive 1 — interactive playground per
// docs/roadmap/_user-directives.md). Self-registers as
// <playground-embed> + <code-editor>. CodeMirror and the WASM module
// are lazy-loaded chunks so the initial docs bundle stays under the
// 1 MB budget (Directive 1 §3).
import '../playground/playground-embed.ts'

// Handle hash-based routing on first load
const hash = window.location.hash.slice(1)
if (hash) {
  // Let docs-shell know the initial page after it upgrades
  customElements.whenDefined('docs-shell').then(() => {
    const _shell = document.querySelector('docs-shell') as HTMLElement & {
      setActivePage?: (id: string) => void
    }
    // Signal update happens inside the component — dispatch a hashchange
    // so docs-shell's popstate/hashchange listener picks it up.
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })
}

// WS1 de-dup: the prerendered light-DOM #prerendered-content paints the page
// body before docs.js runs (real LCP). After docs-shell upgrades AND its shadow
// <article> has painted (one rAF), REMOVE the light-DOM copy so it doesn't
// duplicate the shadow article (double content / a11y-tree dup / layout jump).
// The `docs-shell:defined ~ #prerendered-content { display:none }` CSS rule
// hides it for the pre-removal frame, so there is no flash.
if (typeof customElements !== 'undefined' && typeof document !== 'undefined') {
  customElements.whenDefined('docs-shell').then(() => {
    const drop = (): void => {
      document.getElementById('prerendered-content')?.remove()
    }
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(drop)
    } else {
      drop()
    }
  })
}
