import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig([
  {
    input: 'src/index.ts',
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
    },
    plugins: [dts()],
    // @aihu/signals is a workspace runtime dep (tree-shaken into the consumer
    // alongside the rest of aihu's runtime). The @kindly-note/* scope is a
    // separate npm namespace declared as peerDependencies — externalized here
    // so it is NOT inlined into this package's dist (and NOT counted against
    // this package's .size-limit.json row; it tree-shakes into the consumer).
    external: [
      '@aihu/signals',
      '@kindly-note/core',
      '@kindly-note/emitters-html',
      '@kindly-note/loader-dynamic-import',
      // Defensive: lang-* are only ever reached via dynamic import() inside the
      // loader, so they would never be statically inlined — but listing them
      // keeps the intent explicit if the loader strategy ever changes.
      /^@kindly-note\/lang-/,
    ],
  },
])
