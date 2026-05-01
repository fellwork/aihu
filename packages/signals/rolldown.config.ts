import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  checks: { circularDependency: true },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    // Match the arbor rolldown config — without minify the published tarball
    // ships unminified source. See packages/arbor/rolldown.config.ts and
    // .team/phase-3/telemetry-treeshake-investigation.md for context.
    minify: true,
  },
  plugins: [dts()],
})
