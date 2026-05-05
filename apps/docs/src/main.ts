// content.ts populates window.__DOCS__ before any component reads it
import './content.ts'

// Aihu components — registered as custom elements on import
import './components/theme-toggle.aihu'
import './components/live-demo.aihu'
import './components/docs-shell.aihu'

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
