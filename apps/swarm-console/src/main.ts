// swarm-console entry — registers the design tokens (global cascade,
// css.shadowMode: 'light') then registers the <swarm-console> custom
// element as a side effect of importing its compiled .aihu SFC. There is no
// @aihu/app / file-router here (see vite.config.ts) — this is one
// instrument-panel view, so it mounts the same direct way
// examples/realtime-scores and friends do: the element is already declared
// in index.html, and importing the SFC module upgrades it in place.

import './styles/tokens.css'
import './styles/base.css'
import './components/swarm-console.aihu'
