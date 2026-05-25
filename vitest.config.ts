import { defineConfig } from 'vitest/config'

export default defineConfig({
  // __DEV__ = true in tests so arbor telemetry hooks fire (same guard as
  // production `__DEV__ = false` in arbor's rolldown.config.ts define).
  define: { __DEV__: 'true' },
  test: {
    environment: 'jsdom',
    include: [
      'packages/*/tests/**/*.test.ts',
      // @aihu/primitives colocates keyboard/apg conformance tests next to each
      // primitive's source (src/<primitive>/*.test.ts), per the Plan 4 layout.
      'packages/*/src/**/*.test.ts',
      'tests/**/*.test.ts',
      'cookbook/**/*.test.ts',
    ],
    // B3b sidecar-tsc tests require a separately compiled tsc binary pass — excluded until B3b lands.
    // legacy-snapshot freeze is tracked separately (regeneration required after template changes).
    exclude: [
      '**/node_modules/**',
      'packages/compiler/tests/b3b-sidecar-tsc.test.ts',
      'packages/cli/tests/legacy-snapshot.test.ts',
    ],
    passWithNoTests: true,
    // Per Director session-002 (.team/v1/director-notes/server-native-session-002.md §3):
    // set SCRIBE_NATIVE_SKIP=1 in the repo's test env so a fresh clone's
    // `bun run test` passes without a built native addon. The loader's
    // documented escape hatch (spec §5.3) is the right tool for this — it
    // routes packages/server through the TS implementation silently. CI
    // builds the addon and unsets this var on the parity-gate runner so
    // AC-9 (loud throw on missing binary) still gates real production use.
    env: {
      SCRIBE_NATIVE_SKIP: '1',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/types.ts', '**/index.ts'],
    },
  },
  resolve: {
    alias: {
      '@aihu/context': new URL('./packages/context/src/index.ts', import.meta.url).pathname,
      '@aihu/context/ssr': new URL('./packages/context/src/ssr.ts', import.meta.url).pathname,
      '@aihu/compiler': new URL('./packages/compiler/js/index.ts', import.meta.url).pathname,
      '@aihu/signals': new URL('./packages/signals/src/index.ts', import.meta.url).pathname,
      '@aihu/arbor': new URL('./packages/arbor/src/index.ts', import.meta.url).pathname,
      '@aihu/runtime': new URL('./packages/runtime/src/index.ts', import.meta.url).pathname,
      '@aihu/agent': new URL('./packages/agent/src/index.ts', import.meta.url).pathname,
      '@aihu/server': new URL('./packages/server/src/index.ts', import.meta.url).pathname,
      '@aihu-plugin/agent-readiness': new URL(
        './packages/plugin-agent-readiness/src/index.ts',
        import.meta.url,
      ).pathname,
      '@aihu-plugin/data': new URL('./packages/plugin-data/src/index.ts', import.meta.url).pathname,
      '@aihu-plugin/kindly-note': new URL(
        './packages/plugin-kindly-note/src/index.ts',
        import.meta.url,
      ).pathname,
      '@aihu-plugin/drizzle': new URL('./packages/plugin-drizzle/src/index.ts', import.meta.url)
        .pathname,
      '@aihu/router': new URL('./packages/router/src/index.ts', import.meta.url).pathname,
      '@aihu/agent-service': new URL('./packages/agent-service/src/index.ts', import.meta.url)
        .pathname,
      '@aihu/agent-a2a': new URL('./packages/agent-a2a/src/index.ts', import.meta.url).pathname,
      '@aihu/plugin': new URL('./packages/plugin/src/index.ts', import.meta.url).pathname,
      '@aihu/agent-acp': new URL('./packages/agent-acp/src/index.ts', import.meta.url).pathname,
      '@aihu/auth': new URL('./packages/auth/src/index.ts', import.meta.url).pathname,
      // @aihu/primitives + the css-engine progressive shim it reuses (tooltip's
      // position() source import). Aliased to src so primitives tests run
      // without a prior dist build of either package.
      '@aihu/primitives': new URL('./packages/primitives/src/index.ts', import.meta.url).pathname,
      '@aihu/css-engine/runtime/progressive': new URL(
        './packages/css-engine/src/runtime/progressive.ts',
        import.meta.url,
      ).pathname,
      'virtual:aihu-routes': new URL(
        './packages/app/tests/__stubs__/aihu-routes.ts',
        import.meta.url,
      ).pathname,
    },
  },
})
