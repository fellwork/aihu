import { resolve } from 'node:path'
import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [aihuCompilerPlugin()],
  server: {
    proxy: {
      '/a2a': 'http://localhost:5207',
      '/acp': 'http://localhost:5207',
      '/.well-known': 'http://localhost:5207',
      '/__aihu': 'http://localhost:5207',
    },
  },
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
      '@aihu/agent-a2a': resolve(__dirname, 'node_modules/@aihu/agent-a2a'),
      '@aihu/agent-acp': resolve(__dirname, 'node_modules/@aihu/agent-acp'),
      '@aihu/agent-service': resolve(__dirname, 'node_modules/@aihu/agent-service'),
      '@aihu/context': resolve(__dirname, 'node_modules/@aihu/context'),
    },
  },
})
