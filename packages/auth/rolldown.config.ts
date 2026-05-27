import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig([
  {
    input: 'src/index.ts',
    external: ['@aihu/agent-service', '@aihu/signals', '@aihu/plugin', '@aihu/server'],
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
    },
    plugins: [dts()],
  },
  {
    input: { server: 'src/server-index.ts' },
    external: ['@aihu/agent-service', '@aihu/signals', '@aihu/plugin', '@aihu/server'],
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      sourcemap: true,
      minify: true,
    },
    plugins: [dts()],
  },
])
