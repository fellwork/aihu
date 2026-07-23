import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  // Multi-entry: one key per composable (+ the shared SSR-guard substrate).
  // Each lowers to its own `dist/<name>.js` so every composable gets an
  // independent `.size-limit.json` row that tree-shakes on its own — the
  // @aihu/primitives per-subpath model (effect-scope plan §5). Shared
  // substrate is double-counted across importing rows on purpose: budgets
  // stay honest per import path.
  //
  // Entry (and subpath) names are camelCase (`useEventListener`) — a
  // deliberate, ratified divergence from primitives' kebab-case: subpaths
  // mirror the exported `useX` composable names (the VueUse convention).
  input: {
    index: 'src/index.ts',
    shared: 'src/shared/index.ts',
    useEventListener: 'src/useEventListener/index.ts',
    useMouse: 'src/useMouse/index.ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
  },
  plugins: [dts()],
  // @aihu/signals stays external so each composable's dist measures only its
  // own code (matching the `.size-limit.json` ignore lists).
  external: ['@aihu/signals'],
})
