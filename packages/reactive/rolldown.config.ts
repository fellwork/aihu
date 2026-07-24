import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  // Two entries: the core tree (`.`) and the bridge/helper functions
  // (`./helpers`). Helpers self-import the core via the package's OWN name
  // (`@aihu/reactive`) rather than a relative path, and that self-import is
  // marked external below — this keeps `dist/helpers.js` measuring only the
  // helper-specific code, exactly mirroring how `@aihu/signals` is externalized
  // out of `dist/index.js` (design doc §3, §5 — `.size-limit.json`'s
  // `ignore: ["@aihu/signals", "@aihu/reactive"]` row for `/helpers`).
  input: {
    index: 'src/index.ts',
    helpers: 'src/helpers/index.ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
  },
  plugins: [dts()],
  external: ['@aihu/signals', '@aihu/reactive'],
})
