import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    // Match the signals/arbor/runtime configs — without minify the published
    // tarball ships unminified source. Per spec §3.2 the agent package has a
    // 100 B gz budget, which assumes minified output.
    minify: true,
  },
  plugins: [dts()],
})
