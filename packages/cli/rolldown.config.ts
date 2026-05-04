import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const external = [
  'node:fs',
  'node:path',
  'node:process',
  'node:os',
  'node:readline',
  'node:child_process',
]

export default defineConfig([
  {
    input: 'src/index.ts',
    external,
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
    external,
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      banner: '#!/usr/bin/env node',
    },
  },
  {
    input: 'src/create.ts',
    external,
    checks: { circularDependency: true },
    output: {
      dir: 'dist',
      format: 'esm',
      banner: '#!/usr/bin/env node',
    },
  },
])
