import { defineConfig } from 'rolldown'
import { scribeCompilerPlugin } from '../../packages/compiler/js/index.ts'

export default defineConfig({
  input: { docs: 'src/main.ts' },
  plugins: [scribeCompilerPlugin()],
  // The scribe plugin's transform hook returns TypeScript (typed arbor calls).
  // Tell rolldown's oxc transform to use the TypeScript parser for .scribe files
  // so generic syntax like `<T extends ...>` doesn't cause a parse error.
  moduleTypes: {
    '.scribe': 'ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
  },
})
