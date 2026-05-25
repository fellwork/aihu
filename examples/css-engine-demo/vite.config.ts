import { resolve } from 'node:path'
import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

export default defineConfig({
  // shadowMode: 'none' — utility-class frameworks (the css-engine output) rely
  // on the global cascade, which a shadow root would block. This is the
  // documented mode for utility-class styling (see AihuCompilerPluginOptions).
  plugins: [aihuCompilerPlugin({ shadowMode: 'none' })],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../_shared'),
      '@aihu/arbor': resolve(__dirname, 'node_modules/@aihu/arbor'),
      '@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
      '@aihu/runtime': resolve(__dirname, 'node_modules/@aihu/runtime'),
      '@aihu/agent': resolve(__dirname, 'node_modules/@aihu/agent'),
      // NOTE: @aihu/css-engine is NOT aliased — its subpath exports
      // (`/runtime/cn`, `/runtime/progressive`) must resolve via the package
      // `exports` map, which a directory alias would bypass.
    },
  },
})
