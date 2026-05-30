import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
  resolve: {
    alias: {
      // @aihu/magna-gqlmin is an OPTIONAL dependency of @aihu/magna, dynamically
      // imported only inside the build-time `beforeCompile` hook (never reached
      // by this example's runtime path) and intentionally NOT installed (the
      // dep-free thesis). Vite's import-analysis statically scans the
      // dynamic-import specifier in @aihu/magna's built dist, so alias it to a
      // local stub to satisfy resolution without a real dependency.
      '@aihu/magna-gqlmin': new URL('./test/magna-gqlmin-stub.ts', import.meta.url).pathname,
    },
  },
})
