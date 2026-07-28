import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

// node: builtins are externalized by PATTERN, not a hand-listed array, so a
// newly imported builtin (node:module/node:url/node:stream/… were all missing
// from the old list) can never silently drift out of the allowlist and emit an
// UNRESOLVED_IMPORT warning that hides a real one (FEL-EXTERNALS). Non-builtin
// runtime deps that must stay unbundled are still listed explicitly.
const external = [/^node:/, '@aihu/mcp']

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
