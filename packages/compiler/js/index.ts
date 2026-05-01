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
