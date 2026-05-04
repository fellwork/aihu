import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const external = [
  '@scribe/router',
  '@scribe/router/plugin',
  '@scribe/arbor',
  '@scribe/signals',
  '@scribe/runtime',
  '@scribe/agent-readiness',
  '@scribe/compiler',
  'vite',
  'node:fs',
  'node:fs/promises',
  'node:path',
  'virtual:scribe-routes',
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
