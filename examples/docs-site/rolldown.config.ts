import { defineConfig } from 'rolldown'
import { aihuCompilerPlugin } from '../../packages/compiler/js/index.ts'

export default defineConfig({
  input: { docs: 'src/main.ts' },
  plugins: [aihuCompilerPlugin()],
  // The aihu plugin's transform hook returns TypeScript (typed arbor calls).
  // Tell rolldown's oxc transform to use the TypeScript parser for .aihu files
  // so generic syntax like `<T extends ...>` doesn't cause a parse error.
  moduleTypes: {
    '.aihu': 'ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
  },
})
