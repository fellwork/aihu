import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  checks: { circularDependency: true },
  // Replace `process.env.NODE_ENV` with the string `"production"` inside
  // the transform step so that Rolldown's minifier DCEs the `__DEV__`
  // guard in computed.ts (including the `read[__HOST] = node` assignment).
  transform: {
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  },
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
