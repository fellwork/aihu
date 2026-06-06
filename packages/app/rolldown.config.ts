import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const external = [
  '@aihu/router',
  '@aihu/router/plugin',
  '@aihu/server',
  '@aihu/server/head-lowering',
  '@aihu/arbor',
  '@aihu/signals',
  '@aihu/runtime',
  '@aihu-plugin/agent-readiness',
  '@aihu/compiler',
  'vite',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'virtual:aihu-routes',
  'virtual:aihu-layouts',
]

export default defineConfig([
  // Main entry — build/config-time only. No DOM. No size-limit row.
  {
    input: 'src/index.ts',
    external,
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
    },
    plugins: [dts()],
  },
  // Client entry — browser runtime. Measured by .size-limit.json (≤400 B gz).
  {
    input: { client: 'src/client.ts' },
    external,
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
      entryFileNames: '[name].js',
    },
    plugins: [dts({ outFile: 'dist/client.d.ts' })],
  },
])
