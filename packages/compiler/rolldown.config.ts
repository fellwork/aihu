import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: {
    index: 'js/index.ts',
    'resolve-binary': 'js/resolve-binary.ts',
  },
  external: ['vite', 'node:child_process', 'node:fs', 'node:module', 'node:path', 'node:url'],
  checks: { circularDependency: true },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,
  },
  plugins: [dts()],
})
