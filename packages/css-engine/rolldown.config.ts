import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: {
    index: 'src/index.ts',
    // Browser runtime sub-exports (Plan 3). Kept as SEPARATE entries so each
    // has its own `dist/runtime/*.js` for an independent `.size-limit.json`
    // row — merging them would blow the 1 KB `cn` budget (Risk #4 size-split).
    'runtime/progressive': 'src/runtime/progressive.ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    entryFileNames: '[name].js',
  },
  plugins: [dts()],
  external: ['node:child_process', 'node:fs', 'node:path', 'node:url'],
})
