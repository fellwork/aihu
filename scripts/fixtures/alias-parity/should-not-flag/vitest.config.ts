import { defineConfig } from 'vitest/config'

// GREEN control. Both systems agree: @fx/beta -> packages/beta/src/index.ts.
export default defineConfig({
  resolve: {
    alias: {
      '@fx/beta/sub': new URL('./packages/beta/src/sub.ts', import.meta.url).pathname,
      '@fx/beta': new URL('./packages/beta/src/index.ts', import.meta.url).pathname,
    },
  },
})
