import { defineConfig } from 'vitest/config'

/**
 * Cross-package integration test config per spec §4 (Task 19).
 *
 * The root `vitest.config.ts` only covers `packages/*\/tests/**`. This
 * config covers `tests/integration/**` — tests that import from multiple
 * `@aihu/*` packages to verify they compose correctly.
 *
 * Run via the root package.json script: `bun run test:integration`.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/integration/**/*.test.ts'],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      '@aihu/signals': new URL('../packages/signals/src/index.ts', import.meta.url).pathname,
      '@aihu/arbor': new URL('../packages/arbor/src/index.ts', import.meta.url).pathname,
      '@aihu/runtime': new URL('../packages/runtime/src/index.ts', import.meta.url).pathname,
    },
  },
})
