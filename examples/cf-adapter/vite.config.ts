import { resolve } from 'node:path'
import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [aihuCompilerPlugin()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../_shared'),
      '@aihu/arbor': resolve(__dirname, 'node_modules/@aihu/arbor'),
      '@aihu/signals': resolve(__dirname, 'node_modules/@aihu/signals'),
      '@aihu/runtime': resolve(__dirname, 'node_modules/@aihu/runtime'),
      '@aihu/agent': resolve(__dirname, 'node_modules/@aihu/agent'),
      '@aihu/adapter-cloudflare': resolve(__dirname, 'node_modules/@aihu/adapter-cloudflare'),
      '@aihu/app': resolve(__dirname, 'node_modules/@aihu/app'),
      '@aihu/compiler': resolve(__dirname, 'node_modules/@aihu/compiler'),
    },
  },
})
