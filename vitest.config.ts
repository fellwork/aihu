import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['packages/*/tests/**/*.test.ts', 'tests/**/*.test.ts'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@scribe/context': new URL('./packages/context/src/index.ts', import.meta.url).pathname,
      '@scribe/context/ssr': new URL('./packages/context/src/ssr.ts', import.meta.url).pathname,
      '@scribe/signals': new URL('./packages/signals/src/index.ts', import.meta.url).pathname,
      '@scribe/arbor': new URL('./packages/arbor/src/index.ts', import.meta.url).pathname,
      '@scribe/runtime': new URL('./packages/runtime/src/index.ts', import.meta.url).pathname,
      '@scribe/agent': new URL('./packages/agent/src/index.ts', import.meta.url).pathname,
      '@scribe/server': new URL('./packages/server/src/index.ts', import.meta.url).pathname,
      '@scribe/agent-readiness': new URL('./packages/agent-readiness/src/index.ts', import.meta.url).pathname,
      '@scribe/data': new URL('./packages/data/src/index.ts', import.meta.url).pathname,
      '@scribe/router': new URL('./packages/router/src/index.ts', import.meta.url).pathname,
      '@scribe/agent-service': new URL('./packages/agent-service/src/index.ts', import.meta.url).pathname,
    },
  },
})
