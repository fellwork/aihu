import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

export default defineConfig([
  {
    input: 'src/index.ts',
    external: ['node:fs', 'node:path', 'node:process', 'node:os'],
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
    input: 'src/bin.ts',
    external: ['node:fs', 'node:path', 'node:process', 'node:os'],
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      banner: '#!/usr/bin/env node',
    },
  },
])
