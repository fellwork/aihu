import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig([
  {
    input: {
      index: 'src/index.ts',
      'safe-href': 'src/safe-href.ts',
    },
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
    },
    plugins: [dts()],
    external: ['@aihu/signals'],
  },
])
