import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileToAst } from '@aihu/compiler'

export {
  defineStylePack,
  type StylePack,
  type StylePackInput,
  type TokenMap,
} from './define-style-pack.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------------------
// Platform support matrix
// ---------------------------------------------------------------------------
//
// Maps process.platform + process.arch to the per-platform npm package that
// ships the prebuilt `aihu-css-compile` executable, plus the binary's filename
// inside that package. Mirrors @aihu/server/src/native.ts detectPlatform() and
// the package directory names under packages/css-engine/npm/<platform>/.
//
// Unlike @aihu/server (a napi `.node` addon loaded via require), the css engine
// invokes `aihu-css-compile` as a CLI SUBPROCESS (execFileSync against the
// executable on disk). So the platform package exposes a raw executable file,
// and we resolve its absolute PATH — we never `require()` the binary itself.

interface PlatformDescriptor {
  readonly platformId: string
  readonly packageName: string
  /** Executable filename inside the platform package. */
  readonly binFile: string
}

function detectPlatform(): PlatformDescriptor | null {
  if (typeof process === 'undefined' || !process.platform || !process.arch) {
    return null
  }
  const key = `${process.platform}-${process.arch}`
  switch (key) {
    case 'darwin-arm64':
      return {
        platformId: 'darwin-arm64',
        packageName: '@aihu/css-engine-darwin-arm64',
        binFile: 'aihu-css-compile',
      }
    case 'darwin-x64':
      return {
        platformId: 'darwin-x64',
        packageName: '@aihu/css-engine-darwin-x64',
        binFile: 'aihu-css-compile',
      }
    case 'linux-x64':
      // We only ship glibc; musl users fall through to the dev/source path.
      return {
        platformId: 'linux-x64-gnu',
        packageName: '@aihu/css-engine-linux-x64-gnu',
        binFile: 'aihu-css-compile',
      }
    case 'win32-x64':
      return {
        platformId: 'win32-x64-msvc',
        packageName: '@aihu/css-engine-win32-x64-msvc',
        binFile: 'aihu-css-compile.exe',
      }
    default:
      return null
  }
}

let _binPath: string | null = null

/**
 * Resolve the absolute path to the `aihu-css-compile` executable.
 *
 * Resolution order:
 *   1. The per-platform optionalDependency package
 *      (`@aihu/css-engine-<platform>`) shipped to npm consumers — resolved via
 *      `createRequire(...).resolve('<pkg>/package.json')` so it works in both
 *      ESM and CJS and respects the consumer's node_modules layout.
 *   2. Dev fallback: the monorepo workspace `target/release|debug/` — only
 *      present in a dev clone with a Rust toolchain (`cargo build --release -p
 *      aihu-css-core`). Kept so in-repo builds + tests work without publishing.
 *
 * If the current platform is SUPPORTED but neither path yields a binary, throws
 * a structured error pointing at the missing optionalDependency (mirrors
 * @aihu/server's failure-loud contract). If the platform is UNSUPPORTED, the
 * error lists the dev fallback so source builds still have a clear remedy.
 */
function resolveBinary(): string {
  if (_binPath !== null) return _binPath

  const descriptor = detectPlatform()

  // 1. Per-platform optionalDependency package (the published-consumer path).
  if (descriptor) {
    const requireFn = createRequire(import.meta.url)
    try {
      const pkgJson = requireFn.resolve(`${descriptor.packageName}/package.json`)
      const candidate = join(dirname(pkgJson), descriptor.binFile)
      if (existsSync(candidate)) {
        _binPath = candidate
        return _binPath
      }
    } catch {
      // Package not installed (optionalDependency skipped for this platform, or
      // a partial install). Fall through to the dev/source path, then error.
    }
  }

  // 2. Dev fallback: monorepo workspace target/. Only exists in a dev clone.
  const ext = process.platform === 'win32' ? '.exe' : ''
  const devCandidates = [
    resolve(__dirname, '../../../target/release', `aihu-css-compile${ext}`),
    resolve(__dirname, '../../../target/debug', `aihu-css-compile${ext}`),
  ]
  for (const c of devCandidates) {
    if (existsSync(c)) {
      _binPath = c
      return _binPath
    }
  }

  throw buildMissingBinaryError(descriptor, devCandidates)
}

function buildMissingBinaryError(
  descriptor: PlatformDescriptor | null,
  devCandidates: string[],
): Error {
  if (descriptor === null) {
    return new Error(
      `[@aihu/css-engine] No prebuilt aihu-css-compile binary for this platform.\n\n` +
        `  Platform:        ${typeof process !== 'undefined' ? `${process.platform}-${process.arch}` : 'unknown'}\n\n` +
        `  @aihu/css-engine ships prebuilt binaries for darwin-arm64, darwin-x64,\n` +
        `  linux-x64-gnu (glibc) and win32-x64-msvc. Your platform is not in that set.\n\n` +
        `  To build from source you need a Rust toolchain, then run from the repo root:\n` +
        `    cargo build --release -p aihu-css-core\n\n` +
        `  Checked dev fallback paths: ${devCandidates.join(', ')}`,
    )
  }
  return new Error(
    `[@aihu/css-engine] Native CSS compiler binary not found for this platform.\n\n` +
      `  Platform:         ${descriptor.platformId}\n` +
      `  Expected package: ${descriptor.packageName}\n` +
      `  Expected file:    ${descriptor.packageName}/${descriptor.binFile}\n\n` +
      `  This binary is distributed as an optionalDependency of @aihu/css-engine.\n` +
      `  Your package manager may have skipped it (optionalDependencies are\n` +
      `  silently dropped on install failure).\n\n` +
      `  To reinstall:\n` +
      `    npm install @aihu/css-engine\n` +
      `    # or: pnpm install   or: bun install\n\n` +
      `  If you are working in the aihu monorepo, build from source instead:\n` +
      `    cargo build --release -p aihu-css-core\n` +
      `  Checked dev fallback paths: ${devCandidates.join(', ')}`,
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
