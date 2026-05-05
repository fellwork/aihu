import { defineConfig } from 'rolldown'
import { aihuCompilerPlugin } from '@aihu/compiler/plugin'

export default defineConfig({
  input: { legacy-snapshot: 'src/main.ts' },
  plugins: [aihuCompilerPlugin()],
  moduleTypes: {
    '.aihu': 'ts',
  },
  output: {
    dir: 'dist',
    format: 'esm',
  },
})
