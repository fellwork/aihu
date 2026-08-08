import { defineConfig } from 'vitest/config'

// RED input. Identical to should-not-flag except that @fx/beta is aliased to
// the BUILT artifact while packages/alpha/tsconfig.json maps it to source —
// the src-vs-dist split check:alias-parity exists to catch.
export default defineConfig({
  resolve: {
    alias: {
      '@fx/beta/sub': new URL('./packages/beta/src/sub.ts', import.meta.url).pathname,
      '@fx/beta': new URL('./packages/beta/dist/index.d.ts', import.meta.url).pathname,
    },
  },
})
