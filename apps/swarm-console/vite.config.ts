import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

// swarm-console — a single-view aihu app (the standard aihu app shape: .aihu
// SFCs compiled by aihuCompilerPlugin, mounted as vanilla custom elements).
// No file-router/SSG (@aihu/app) here — this is one instrument-panel view,
// not a multi-page site, so the plain compiler-plugin recipe used by
// examples/realtime-scores etc. is the right fit. `shadowMode: 'light'`
// matches apps/docs-next: the design tokens + base reset in
// src/styles/tokens.css are a global cascade the component's own @style
// block shares (namespaced with a `sc-` prefix), rather than being shut out
// by a shadow boundary.
export default defineConfig({
  plugins: [aihuCompilerPlugin({ shadowMode: 'light' })],
})
