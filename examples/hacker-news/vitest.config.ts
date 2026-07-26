import { defineConfig } from 'vitest/config'
import rootConfig from '../../vitest.config.ts'

/**
 * Standalone vitest config for the FEL-426 smoke gate.
 *
 * NOT an extension of this example's `vite.config.ts`. Inheriting it would drag
 * in `@aihu/router`'s BUILT plugin, so the suite would fail to start whenever
 * workspace `dist/` output was missing or stale — turning a security gate into
 * a build-ordering casualty (FEL-411). A gate has to be able to run, and go
 * red, on its own.
 *
 * The alias map is taken from the ROOT config rather than restated here. The
 * SSR test loads the compiled component, whose imports are rewritten to
 * workspace source; those sources then import each other by bare specifier
 * (`arbor/src/hydrate.ts` -> '@aihu/signals' -> '@aihu/context' -> ...), which
 * is a transitive chain 34 aliases deep. Hand-copying the subset that happens
 * to be needed today is how it silently rots when the chain grows. Root's
 * aliases use `new URL(..., import.meta.url)` evaluated against the root config
 * file, so they stay correct when imported from here.
 */
export default defineConfig({
  // __DEV__ is defined at root so arbor's telemetry hooks compile; without it
  // the source build throws on an undefined global.
  define: rootConfig.define,
  resolve: {
    alias: {
      // Subpath first — root has no `@aihu/editor` entry, and this one must not
      // be shadowed if it ever gains one. Pointed at source for the same reason
      // as everything else here: the gate must not need a prior `dist/` build.
      '@aihu/editor/safe-href': new URL('../../packages/editor/src/safe-href.ts', import.meta.url)
        .pathname,
      ...rootConfig.resolve?.alias,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // #445's rule, applied locally: a run that selects zero test files must
    // FAIL. Otherwise renaming this file turns the gate into a silent pass —
    // which is the exact FEL-428 shape this suite was written to close.
    passWithNoTests: false,
  },
})
