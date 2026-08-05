import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const external = [
  // MUST stay external. `@aihu/context` keeps the active context map in a
  // module-global (`_activeContextMap`), so a bundled copy is a SECOND map:
  // `prerender.ts` would populate its private one while user components read
  // the app's, and `inject()` would return token defaults with nothing to
  // indicate why. Tests can't catch it — vitest aliases `@aihu/context` to
  // source, so the duplicate only exists in the published dist.
  '@aihu/context',
  '@aihu/context/ssr',
  '@aihu/router',
  '@aihu/router/plugin',
  '@aihu/server',
  '@aihu/server/head-lowering',
  '@aihu/arbor',
  // The subpath needs its OWN entry: rolldown's `external` matches exact
  // specifiers, so listing '@aihu/arbor' alone does not cover
  // '@aihu/arbor/hydrate' and the whole hydration walker gets inlined into
  // client.js (observed: 4.8 kB -> 13.2 kB, blowing the size row by 3 kB).
  // Same failure shape as '@aihu/context/ssr' and '@aihu/signals/lifecycle'.
  '@aihu/arbor/hydrate',
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

// `__DEV__ = false` in the published build so rolldown DCEs author-only
// diagnostics (see client.ts's no-<outlet> warning). Mirrors arbor's config.
const transform = { define: { __DEV__: 'false' } }

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
    transform,
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
