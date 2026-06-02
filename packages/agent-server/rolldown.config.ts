import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  // Server-side package: every workspace + third-party dep stays external. This
  // is NOT a browser-bundle target (no `.size-limit.json` row — see
  // `.size-limit.README.md`), so there is no minify/tree-shake budget to chase.
  external: [
    '@aihu/agent',
    '@aihu/agent-service',
    '@aihu/arbor',
    '@modelcontextprotocol/sdk',
    /^@modelcontextprotocol\/sdk\//,
    'jsdom',
  ],
  checks: { circularDependency: true },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
  },
  plugins: [dts()],
})
