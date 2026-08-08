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
    // `@aihu/cli/template-manifest` — the published contract between the CLI
    // and every `@aihu/templates-*` package (arch-6 §2.3). Templates already
    // wrote `import type { TemplateManifest } from '@aihu/cli/template-manifest'`,
    // but the exports map had no such subpath: it only resolved because
    // cf-team's tsconfig hand-maps the specifier at the source path for local
    // typechecking. A real npm consumer got ERR_PACKAGE_PATH_NOT_EXPORTED.
    //
    // Its own bundle, not a second entry alongside index.ts, so adding the
    // subpath cannot reshape the "." export into shared chunks. The module has
    // zero imports, so the duplicated code is the validator and nothing else.
    input: 'src/template-manifest.ts',
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
