import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  external: ['@scribe/server', '@scribe/agent', 'vite'],
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,
  },
  plugins: [dts()],
})
