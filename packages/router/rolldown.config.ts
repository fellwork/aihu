import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig([
  // Browser runtime — measured by .size-limit.json (≤1536 B gzip)
  {
    input: 'src/index.ts',
    external: ['@aihu/server'],
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
    },
    plugins: [dts()],
  },
  // Build-time Vite plugin — NOT measured by .size-limit.json
  {
    input: { plugin: 'src/plugin.ts' },
    external: ['@aihu/server', 'vite', 'node:fs', 'node:path', 'node:url'],
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
      entryFileNames: '[name].js',
    },
    plugins: [dts({ outFile: 'dist/plugin.d.ts' })],
  },
])
