import { resolve } from 'node:path'
import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

export default defineConfig({
  // shadowMode: 'light' — emits the utility CSS to the light DOM for this demo.
  // Not required for css-engine in general: it is scoped and works in any
  // shadow mode (the default `'open'` folds utilities into each component's
  // shadow style). Use `'none'` to reach light-DOM / external children.
  plugins: [aihuCompilerPlugin({ shadowMode: 'light' })],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../_shared'),
      '@aihu/arbor': resolve(__dirname, 'node_modules/@aihu/arbor'),
      // Subpath before package: vite string aliases are PREFIX replacements, so
      // the '/lifecycle' subpath would otherwise rewrite to a nonexistent path
      // under the package dir and never consult the signals exports map.
      '@aihu/signals/lifecycle': resolve(__dirname, 'node_modules/@aihu/signals/dist/lifecycle.js'),
      '@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
      '@aihu/runtime': resolve(__dirname, 'node_modules/@aihu/runtime'),
      '@aihu/agent': resolve(__dirname, 'node_modules/@aihu/agent'),
      // NOTE: @aihu/css-engine is NOT aliased — its subpath exports
      // (`/runtime/cn`, `/runtime/progressive`) must resolve via the package
      // `exports` map, which a directory alias would bypass.
    },
  },
})
