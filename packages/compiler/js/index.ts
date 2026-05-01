/**
 * @scribe/compiler — TypeScript wrapper around the scribe-compile Rust binary.
 *
 * Exports:
 *   transform(source, id)    — compile a single .scribe file to TypeScript
 *   scribeCompilerPlugin()   — Vite plugin that wires transform() into the build
 */
import { execFileSync } from 'node:child_process'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

// Binary resolution: env var override, fallback to relative path from dist/
const ext = process.platform === 'win32' ? '.exe' : ''
const binPath: string =
  process.env['SCRIBE_COMPILE_BIN'] ??
  resolve(dirname(fileURLToPath(import.meta.url)), `../target/release/scribe-compile${ext}`)

// Minimal VitePlugin interface — avoids importing from 'vite' at compile time.
// Structurally compatible with Vite's Plugin type.
interface VitePlugin {
  readonly name: string
  enforce?: 'pre' | 'post'
  transform?: (
    code: string,
    id: string,
  ) => { code: string; map: null } | null | undefined
}

/**
 * Compile a .scribe source string to TypeScript.
 * map is null — source maps are deferred to v1 (OQ-C8)
 */
export function transform(source: string, id: string): { code: string; map: null } {
  const stem = basename(id, '.scribe')
  const code = execFileSync(binPath, ['--stdin', '--tag', stem], {
    input: source,
    encoding: 'utf8',
  })
  return {
    code,
    map: null, // source maps deferred to v1 (OQ-C8)
  }
}

/**
 * Vite plugin that compiles .scribe files to TypeScript during build and dev.
 *
 * Use `enforce: 'pre'` so the hook fires before Vite/Rollup's built-in
 * parsers attempt to process the raw .scribe content as JavaScript.
 *
 * @example
 * // vite.config.ts
 * import { scribeCompilerPlugin } from '@scribe/compiler'
 * export default { plugins: [scribeCompilerPlugin()] }
 *
 * **Known Limitation — Bun + Rollup4 ESM incompatibility (v0):**
 *
 * `bun vite build` fails in the `fixtures/vite-counter` fixture with two
 * cascading errors:
 *
 * 1. **Missing devDependency:** `vite` is declared only as an optional
 *    `peerDependency` in `packages/compiler/package.json`. Bun does not
 *    install optional peers automatically, so `bun vite build` exits
 *    immediately with `Cannot find package 'vite'`.
 *
 * 2. **Bun + Rollup4 bridge:** Even with Vite installed, Bun processes
 *    `vite.config.ts` through its own internal bundler before handing off
 *    to Rollup4. When `@scribe/compiler` is resolved from the workspace
 *    symlink (`dist/index.js`), Bun's ESM loader evaluates the module at
 *    config-load time. The subprocess call inside `transform()` depends on
 *    the Rust binary being at `../target/release/scribe-compile` relative
 *    to `dist/`. In a dev workspace where `cargo build --release` has not
 *    run, this path does not exist and `execFileSync` throws. Bun surfaces
 *    the error as a config-load failure, not a per-file transform error,
 *    causing the entire build to abort before any `.scribe` file is
 *    processed.
 *
 * **Workaround (v0):** Use `bun run integrate.ts` directly from
 * `packages/compiler/fixtures/vite-counter/`. This script calls
 * `transform()` from `@scribe/compiler` without involving Vite or Rollup.
 * Preconditions: (1) `cargo build --release` in `packages/compiler/`,
 * (2) `bun install` at the repo root.
 *
 * **v1 resolution:** Add `vite` as a `devDependency` in
 * `packages/compiler/package.json`; add a WASM or pre-built binary
 * strategy so the Rust binary is bundled with the npm package and does not
 * require a separate `cargo build --release` step.
 */
export function scribeCompilerPlugin(): VitePlugin {
  return {
    name: 'scribe-compiler',
    enforce: 'pre',
    transform(code, id) {
      if (!id.endsWith('.scribe')) return undefined
      return transform(code, id)
    },
  }
}
