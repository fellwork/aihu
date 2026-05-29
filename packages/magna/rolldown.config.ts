import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig([
  {
    input: {
      index: 'src/index.ts',
      codegen: 'src/codegen-entry.ts',
    },
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      entryFileNames: '[name].js',
      sourcemap: true,
      minify: true,
    },
    plugins: [dts()],
    external: [
      '@aihu/signals',
      '@aihu/plugin',
      '@aihu-plugin/data',
      '@aihu/magna-gqlmin',
      'node:fs',
      'node:path',
    ],
  },
])
