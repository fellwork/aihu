import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig({
  input: 'src/index.ts',
  // @aihu/server is a runtime dep (defineLoader). @aihu/plugin is type-only.
  // drizzle-orm + its drivers are OPTIONAL peers — never bundled (and may not be
  // installed); they are only ever referenced via `import type`, so this is a
  // belt-and-braces external in case a future runtime touch sneaks in.
  external: ['@aihu/server', '@aihu/plugin', 'drizzle-orm', 'postgres', '@libsql/client'],
  checks: { circularDependency: true },
  output: {
    dir: 'dist',
    format: 'esm',
    sourcemap: true,
    minify: true,
  },
  plugins: [dts()],
})
