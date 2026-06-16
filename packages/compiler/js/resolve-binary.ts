/**
 * resolve-binary.ts — call-time resolver for the `aihu-compile` Rust binary.
 *
 * A near-mechanical clone of packages/css-engine/src/index.ts's resolveBinary()
 * machinery, renamed for the compiler: the per-platform packages are
 * `@aihu/compiler-<platform>`, the executable is `aihu-compile[.exe]`, and the
 * dev/source fallback is the workspace-root `target/release|debug/aihu-compile`.
 *
 * Unlike @aihu/server (a napi `.node` addon loaded via require), the compiler
 * invokes `aihu-compile` as a CLI SUBPROCESS. So the platform package exposes a
 * raw executable file, and we resolve its absolute PATH — we never `require()`
 * the binary itself. The SAME order is used by the bin shim
 * (bin/aihu-compile.mjs) and the vite plugin (js/index.ts).
 */
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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
        packageName: '@aihu/compiler-darwin-arm64',
        binFile: 'aihu-compile',
      }
    case 'darwin-x64':
      return {
        platformId: 'darwin-x64',
        packageName: '@aihu/compiler-darwin-x64',
        binFile: 'aihu-compile',
      }
    case 'linux-x64':
      // We only ship glibc; musl users fall through to the dev/source path.
      return {
        platformId: 'linux-x64-gnu',
        packageName: '@aihu/compiler-linux-x64-gnu',
        binFile: 'aihu-compile',
      }
    case 'linux-arm64':
      // glibc aarch64; musl users fall through to the dev/source path.
      return {
        platformId: 'linux-arm64-gnu',
        packageName: '@aihu/compiler-linux-arm64-gnu',
        binFile: 'aihu-compile',
      }
    case 'win32-x64':
      return {
        platformId: 'win32-x64-msvc',
        packageName: '@aihu/compiler-win32-x64-msvc',
        binFile: 'aihu-compile.exe',
      }
    default:
      return null
  }
}

let _binPath: string | null = null

/**
 * Whether `candidate` is a usable `aihu-compile` executable — NOT merely a
 * present file.
 *
 * The per-platform packages (`@aihu/compiler-<platform>`) carry a placeholder
 * `aihu-compile` in source; the real prebuilt binary is only injected by the
 * release CI. Once those packages become resolvable in the workspace, a bare
 * `existsSync` would happily return the non-executable placeholder, which then
 * blows up with EACCES inside `spawnSync`/`execFileSync`. So we must verify the
 * candidate is actually runnable before accepting it.
 *
 * POSIX: require the execute bit (X_OK). A zero-byte/text placeholder without
 * +x fails here and we fall through to the dev `target/` fallback.
 *
 * Windows: there is no execute bit — `accessSync(_, X_OK)` is effectively
 * always true — so we additionally require a non-empty regular file, which
 * still rejects a zero-byte placeholder.
 */
export function isUsableExecutable(candidate: string): boolean {
  try {
    const st = statSync(candidate)
    if (!st.isFile() || st.size === 0) return false
    accessSync(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the absolute path to the `aihu-compile` executable.
 *
 * Resolution order:
 *   1. The per-platform optionalDependency package (`@aihu/compiler-<platform>`)
 *      shipped to npm consumers — resolved via
 *      `createRequire(...).resolve('<pkg>/package.json')` so it works in both
 *      ESM and CJS and respects the consumer's node_modules layout.
 *   2. Dev fallback: the monorepo workspace `target/release|debug/` — only
 *      present in a dev clone with a Rust toolchain (`cargo build --release -p
 *      aihu-compile`). Kept so in-repo builds + tests work without publishing.
 *
 * If the current platform is SUPPORTED but neither path yields a binary, throws
 * a structured error pointing at the missing optionalDependency. If the
 * platform is UNSUPPORTED, the error lists the dev fallback so source builds
 * still have a clear remedy.
 */
export function resolveCompilerBinary(): string {
  if (_binPath !== null) return _binPath

  const descriptor = detectPlatform()

  // 1. Per-platform optionalDependency package (the published-consumer path).
  //
  // Accept the candidate ONLY if it is a usable executable. A present-but-
  // non-executable placeholder (the in-source stub that becomes resolvable once
  // the per-platform packages are pinned in the lockfile) must NOT be returned —
  // doing so spawns a non-executable file and fails with EACCES. In that case we
  // deliberately fall THROUGH to the dev `target/` fallback below.
  if (descriptor) {
    const requireFn = createRequire(import.meta.url)
    try {
      const pkgJson = requireFn.resolve(`${descriptor.packageName}/package.json`)
      const candidate = join(dirname(pkgJson), descriptor.binFile)
      if (isUsableExecutable(candidate)) {
        _binPath = candidate
        return _binPath
      }
    } catch {
      // Package not installed (optionalDependency skipped for this platform, or
      // a partial install). Fall through to the dev/source path, then error.
    }
  }

  // 2. Dev fallback: monorepo workspace target/. Only exists in a dev clone.
  //
  // This module builds to packages/compiler/dist/resolve-binary.js, so the
  // workspace root is three levels up (dist → compiler → packages → root).
  // `aihu-compile` is a workspace member; cargo emits its [[bin]] to the
  // workspace-root ./target.
  const ext = process.platform === 'win32' ? '.exe' : ''
  const devCandidates = [
    resolve(__dirname, '../../../target/release', `aihu-compile${ext}`),
    resolve(__dirname, '../../../target/debug', `aihu-compile${ext}`),
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
      `[@aihu/compiler] No prebuilt aihu-compile binary for this platform.\n\n` +
        `  Platform:        ${typeof process !== 'undefined' ? `${process.platform}-${process.arch}` : 'unknown'}\n\n` +
        `  @aihu/compiler ships prebuilt binaries for darwin-arm64, darwin-x64,\n` +
        `  linux-x64-gnu (glibc), linux-arm64-gnu (glibc) and win32-x64-msvc.\n` +
        `  Your platform is not in that set.\n\n` +
        `  To build from source you need a Rust toolchain, then run from the repo root:\n` +
        `    cargo build --release -p aihu-compile\n\n` +
        `  Checked dev fallback paths: ${devCandidates.join(', ')}`,
    )
  }
  return new Error(
    `[@aihu/compiler] Native compiler binary not found for this platform.\n\n` +
      `  Platform:         ${descriptor.platformId}\n` +
      `  Expected package: ${descriptor.packageName}\n` +
      `  Expected file:    ${descriptor.packageName}/${descriptor.binFile}\n\n` +
      `  This binary is distributed as an optionalDependency of @aihu/compiler.\n` +
      `  Your package manager may have skipped it (optionalDependencies are\n` +
      `  silently dropped on install failure).\n\n` +
      `  To reinstall:\n` +
      `    npm install @aihu/compiler\n` +
      `    # or: pnpm install   or: bun install\n\n` +
      `  If you are working in the aihu monorepo, build from source instead:\n` +
      `    cargo build --release -p aihu-compile\n` +
      `  Checked dev fallback paths: ${devCandidates.join(', ')}`,
  )
}
