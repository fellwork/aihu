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
    // `@aihu/server` selects its TypeScript SSR fallback rather than requiring a
    // built native addon — the same reason the root `vitest.config.ts` sets it.
    env: { AIHU_NATIVE_SKIP: '1' },
  },
  resolve: {
    alias: {
      // Subpath before package: string aliases are PREFIX replacements, so the
      // '/lifecycle' subpath must not resolve as '<index.ts>/lifecycle' (same
      // pattern as '@aihu/runtime/ssr' below).
      '@aihu/signals/lifecycle': new URL('../packages/signals/src/lifecycle.ts', import.meta.url)
        .pathname,
      '@aihu/signals': new URL('../packages/signals/src/index.ts', import.meta.url).pathname,
      // Added for `ssr-state-channel.test.ts` — the wave-3 round-trip pipes
      // real @aihu/server state-script output into @aihu/store hydration and
      // @aihu/arbor signal pre-seeding.
      '@aihu/store': new URL('../packages/store/src/index.ts', import.meta.url).pathname,
      '@aihu/context': new URL('../packages/context/src/index.ts', import.meta.url).pathname,
      // Subpath before package, same rule as '@aihu/runtime/ssr' below:
      // '@aihu/arbor' is a prefix match, so listed first it would rewrite
      // '@aihu/arbor/hydrate' to '<index.ts>/hydrate'. `hydrate` moved out of
      // the root entry so the client bundle stops pulling it in; without this
      // alias these suites resolve it through node_modules to the BUILT dist,
      // which is exactly the src/dist blind spot this repo keeps getting bitten
      // by. The root vitest.config.ts carries the same pair.
      '@aihu/arbor/hydrate': new URL('../packages/arbor/src/hydrate.ts', import.meta.url).pathname,
      '@aihu/arbor': new URL('../packages/arbor/src/index.ts', import.meta.url).pathname,
      // Subpath before package (wave-3): '@aihu/runtime/ssr' must not resolve
      // through the package alias as '<index.ts>/ssr'.
      '@aihu/runtime/ssr': new URL('../packages/runtime/src/ssr-string.ts', import.meta.url)
        .pathname,
      '@aihu/runtime': new URL('../packages/runtime/src/index.ts', import.meta.url).pathname,
      // Added for `ssr-hydrate-path-parity.test.ts`, which is cross-package by
      // nature: it pipes real `@aihu/server` output into `@aihu/arbor`'s
      // `hydrate()`. Without this alias that suite cannot resolve here (it also
      // runs under the root config, which aliases every package).
      '@aihu/server': new URL('../packages/server/src/index.ts', import.meta.url).pathname,
    },
  },
})
