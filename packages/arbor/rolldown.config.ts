import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  checks: { circularDependency: true },
  // __DEV__ = false in production: Rolldown DCEs all `if (__DEV__)` branches,
  // eliminating the three _observeMount call sites in _mountEffect.
  // (see investigation-bench-gaps.md §Gap C + telemetry.ts §2.8 comment)
  transform: { define: { __DEV__: 'false' } },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    // Without this, the published dist/index.js ships unminified (~14 kB raw)
    // and consumer bundlers without aggressive minify (e.g., a downstream
    // Rollup or default Vite production build that trusts our package as
    // pre-optimized) carry the full source. oxc-minify shrinks the published
    // tarball ~45×; size-limit numbers improve too because telemetry call
    // sites collapse against the no-op _observeMount default — see
    // .team/phase-3/telemetry-treeshake-investigation.md for empirics.
    minify: true,
  },
  plugins: [dts()],
  external: ['@aihu/signals'],
})
