import { resolve } from 'node:path'
import { aihuCompilerPlugin } from '@aihu/compiler'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [aihuCompilerPlugin()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, '../_shared'),
    },
  },
})
