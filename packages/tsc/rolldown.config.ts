import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

// `typescript` and the volar packages stay external: aihu-tsc must use the SAME
// TypeScript instance the host project resolves, or the program it builds would
// not be the project's program.
const external = [/^node:/, 'typescript', /^@volar\//, '@aihu/compiler']

export default defineConfig([
  {
    input: { index: 'src/index.ts' },
    platform: 'node',
    external,
    output: { dir: 'dist', format: 'esm', entryFileNames: '[name].js' },
    plugins: [dts()],
  },
])
