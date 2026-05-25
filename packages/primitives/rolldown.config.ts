import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  // Multi-entry: one key per primitive (+ the shared dom-context util). Each
  // lowers to its own `dist/<name>.js` so every primitive gets an independent
  // `.size-limit.json` row that tree-shakes on its own (the same pattern
  // css-engine uses for runtime/cn + runtime/progressive). The per-primitive,
  // under-4-KB budget is the contract — NOT one bundled row.
  input: {
    index: 'src/index.ts',
    'dom-context': 'src/dom-context.ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
  },
  plugins: [dts()],
  // Substrate stays external so each primitive's dist measures only its own
  // code (matching the `.size-limit.json` ignore lists). tooltip imports the
  // position() shim from @aihu/css-engine/runtime/progressive — both the bare
  // and subpath specifiers are externalized.
  external: [
    '@aihu/signals',
    '@aihu/arbor',
    '@aihu/css-engine',
    '@aihu/css-engine/runtime/progressive',
    '@aihu/css-engine/runtime/cn',
  ],
})
