import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  // `ssr-string` is a SEPARATE server-only entry (`@aihu/runtime/ssr`) so the
  // compiled-`__ssrString` escape helpers never tax the client bundle's size
  // gate — client pages import `.` only.
  input: { index: 'src/index.ts', 'ssr-string': 'src/ssr-string.ts' },
  checks: { circularDependency: true },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    // Per Learning #22 + Phase 3 telemetry-treeshake investigation:
    // ship minified so size-limit reflects real consumer bytes and so
    // dead-code elimination collapses no-op call sites at build time.
    minify: true,
  },
  plugins: [dts()],
  // '@aihu/signals/lifecycle' is a separate specifier string from bare
  // '@aihu/signals' — rolldown's `external` matches exact specifiers, so it
  // needs its own entry or the ownership-contract module would get bundled
  // (and duplicated) into runtime's dist instead of staying a real import of
  // the shared WeakMap in @aihu/signals/lifecycle.
  external: ['@aihu/arbor', '@aihu/signals', '@aihu/signals/lifecycle'],
})
