import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
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
  external: ['@scribe/arbor', '@scribe/signals'],
})
