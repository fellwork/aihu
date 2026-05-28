#!/usr/bin/env node
/**
 * @aihu/compiler — CLI shim.
 *
 * Resolves the platform-specific `aihu-compile` binary (via the same
 * resolveBinary() API exported from @aihu/compiler) and exec's it with the
 * arguments this wrapper was invoked with. Preserves stdin/stdout/stderr so
 * the binary's --stdin / --machine-errors / --ast-json modes keep working
 * verbatim.
 *
 * Bug E (platform-optional-deps migration): the published main tarball no
 * longer ships a host binary at packages/compiler/bin/aihu-compile. The
 * binary now ships inside the per-platform optionalDependency
 * (@aihu/compiler-<platform>) and is resolved at runtime via
 * createRequire(...).resolve(). This wrapper keeps `node_modules/.bin/aihu-compile`
 * working for users who shell out (docs, MCP server, language-server, etc.).
 */
import { spawnSync } from 'node:child_process'
import { resolveBinary } from '../dist/index.js'

let bin
try {
  bin = resolveBinary()
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
}

const result = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' })
if (result.error) {
  process.stderr.write(`${result.error.message}\n`)
  process.exit(1)
}
process.exit(result.status ?? 0)
