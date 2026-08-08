import { defineConfig } from 'vitest/config'

// RED input. Identical to should-not-flag except that `@fx/beta` is aliased to
// the BUILT artifact while packages/alpha/tsconfig.json maps it to source — the
// src-vs-dist split check:alias-parity exists to catch.
//
// The built dir is named `built/`, not `dist/`, ONLY because the repo's
// .gitignore excludes `dist/` — an uncommitted fixture file would make this red
// run fail on "file not found" in a fresh CI clone instead of on the property
// under test, i.e. indiscriminate.
export default defineConfig({
  resolve: {
    alias: {
      '@fx/beta/sub': new URL('./packages/beta/src/sub.ts', import.meta.url).pathname,
      '@fx/beta': new URL('./packages/beta/built/index.d.ts', import.meta.url).pathname,
    },
  },
})
