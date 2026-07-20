import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  // All @aihu/* deps are server/build-time; none are bundled.
  // @aihu-plugin/agent-readiness is a RUNTIME dependency since #430 — this
  // package is a thin shim delegating to its generators.
  external: ['@aihu/plugin', '@aihu/server', '@aihu-plugin/agent-readiness'],
  checks: { circularDependency: true },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,
  },
  plugins: [dts()],
})
