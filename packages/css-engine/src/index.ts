import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileToAst } from '@aihu/compiler'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * Resolve the path to the `aihu-css-compile` binary.
 * Looks for it relative to the package, then in the workspace target/release.
 * Plan 4 will replace this with a prebuilt binary shipped with the package.
 */
function resolveBinary(): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  const candidates = [
    // dev: workspace target/release (most common during development)
    resolve(__dirname, '../../../target/release', `aihu-css-compile${ext}`),
    // ci: same with debug
    resolve(__dirname, '../../../target/debug', `aihu-css-compile${ext}`),
  ]
  for (const c of candidates) {
    if (existsSync(c)) return c
  }
  throw new Error(
    `aihu-css-compile binary not found. Run \`cargo build --release -p aihu-css-core\` from the repo root first. Checked: ${candidates.join(', ')}`,
  )
}

/**
 * Compile a list of utility class names to CSS.
 *
 * Plan 1 bootstrap — supports a hardcoded subset; see crates/aihu-css-core/src/tokens.rs.
 * Plan 2 wires the AST scanner so callers pass `.aihu` SFC ASTs instead of raw class lists.
 *
 * @param classes - utility class names like `['bg-primary', 'p-4']`
 * @returns CSS string with one rule per known class
 */
export function compile(classes: string[]): string {
  if (classes.length === 0) return ''

  const bin = resolveBinary()
  const input = classes.join('\n')
  const result = execFileSync(bin, [], {
    input,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
  })
  return result
}

/**
 * Compile a `.aihu` SFC source string to scoped, shadow-DOM-embedded CSS.
 *
 * Pipeline (Plan 2 Task 9): `compileToAst(source)` (from `@aihu/compiler`)
 * → AST JSON → `aihu-css-compile --ast-json` → scoped CSS. The output is the
 * per-SFC stylesheet the compiler folds into the component's shadow `<style>`:
 * `:host`-level theme tokens, variant-resolved utility rules, and the folded
 * authored `@style` block. There is NO global utility stylesheet.
 *
 * @param source - the `.aihu` SFC source text
 * @param id - optional file path/id (used to derive the tag stem + `@route` checks)
 * @returns the scoped CSS string for the SFC
 */
export function compileSfc(source: string, id?: string): string {
  const ast = compileToAst(source, id)
  const bin = resolveBinary()
  return execFileSync(bin, ['--ast-json'], {
    input: JSON.stringify(ast),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'inherit'],
  })
}
