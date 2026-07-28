import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const external = [
  '@aihu/router',
  '@aihu/router/plugin',
  '@aihu/server',
  '@aihu/server/head-lowering',
  '@aihu/arbor',
  '@aihu/signals',
  '@aihu/store',
  '@aihu/runtime',
  '@aihu-plugin/agent-readiness',
  '@aihu/compiler',
  'vite',
  // node: builtins externalized by PATTERN so the allowlist can't drift as new
  // builtins are imported (FEL-EXTERNALS). The build-time index entry is the
  // only node: consumer; the browser client entry imports none.
  /^node:/,
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
