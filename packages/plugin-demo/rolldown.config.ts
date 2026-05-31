import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  // @aihu/* deps stay external (peer/workspace) — not bundled into the demo.
  external: ['@aihu/plugin', '@aihu/signals', '@aihu/server'],
  checks: { circularDependency: true },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,
  },
  plugins: [dts()],
})
