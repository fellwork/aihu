import { aihuCompilerPlugin } from '@aihu/compiler'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// swarm-console — a single-view aihu app (the standard aihu app shape: .aihu
// SFCs compiled by aihuCompilerPlugin, mounted as vanilla custom elements).
// No file-router/SSG (@aihu/app) here — this is one instrument-panel view,
// not a multi-page site, so the plain compiler-plugin recipe used by
// examples/realtime-scores etc. is the right fit. `shadowMode: 'light'`
// matches apps/docs-next: the design tokens (now realized as the Tailwind
// `@theme` in src/styles/theme.css) + base reset are a global cascade each
// component's own @style/template classes share, rather than being shut out
// by a shadow boundary.
//
// `tailwindcss()` (the `@tailwindcss/vite` plugin) compiles
// src/styles/theme.css's `@import "tailwindcss"` + `@theme {}` block —
// "aihu component style building with tailwind" per the founder's rebuild
// brief. Runs alongside aihuCompilerPlugin: one transforms `.aihu` SFCs,
// the other transforms the Tailwind entry CSS; independent pipelines.
export default defineConfig({
  plugins: [tailwindcss(), aihuCompilerPlugin({ shadowMode: 'light' })],
})
