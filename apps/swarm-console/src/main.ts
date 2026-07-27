// swarm-console entry — registers the Tailwind theme (theme.css's
// `@import "tailwindcss"` + `@theme {}`, global cascade, css.shadowMode:
// 'light') and base reset, then registers every component custom element
// as a side effect of importing its compiled .aihu SFC. There is no
// @aihu/app / file-router here (see vite.config.ts) — this is one
// instrument-panel view, so it mounts the same direct way
// examples/realtime-scores and friends do: <swarm-console> is already
// declared in index.html, and importing each SFC module upgrades/registers
// it in place (same convention as apps/docs-next/src/main.ts).
//
// Section components are imported before the root shell that composes them
// (<your-move>, <contracts-ledger>, etc. appear in swarm-console.aihu's own
// @template) — not load-bearing (custom elements upgrade whenever
// `customElements.define` runs, regardless of import order), just readable.

import './styles/theme.css'
import './styles/base.css'
import './components/swarm-header.aihu'
import './components/your-move.aihu'
import './components/contracts-ledger.aihu'
import './components/agents-roster.aihu'
import './components/activity-log.aihu'
import './components/swarm-console.aihu'
