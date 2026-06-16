#!/usr/bin/env node
/**
 * aihu-compile — ESM bin shim for @aihu/compiler.
 *
 * This is the COMMITTED `bin` target of @aihu/compiler. It carries NO native
 * code; it resolves the platform-specific `aihu-compile` executable at runtime
 * and execs it, propagating the exit code. The native binary ships separately
 * via the `@aihu/compiler-<platform>` optionalDependency packages.
 *
 * Resolution order is identical to js/resolve-binary.ts (the shared resolver
 * used by the vite plugin) and packages/css-engine/src/index.ts:
 *   1. The per-platform optionalDependency package
 *      (`@aihu/compiler-<platform>`), resolved via createRequire().resolve of
 *      its package.json — the published-consumer path.
 *   2. Dev fallback: the workspace-root `target/release|debug/aihu-compile`,
 *      only present in a from-source monorepo clone.
 *
 * The resolver is INLINED (not imported from ../dist/resolve-binary.js) so the
 * shim works in a from-source clone BEFORE `bun run build` has emitted dist.
 * Keep this in lockstep with js/resolve-binary.ts.
 */
import { spawnSync } from 'node:child_process'
import { accessSync, constants, existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

function detectPlatform() {
  if (typeof process === 'undefined' || !process.platform || !process.arch) {
    return null
  }
  const key = `${process.platform}-${process.arch}`
  switch (key) {
    case 'darwin-arm64':
      return { packageName: '@aihu/compiler-darwin-arm64', binFile: 'aihu-compile' }
    case 'darwin-x64':
      return { packageName: '@aihu/compiler-darwin-x64', binFile: 'aihu-compile' }
    case 'linux-x64':
      return { packageName: '@aihu/compiler-linux-x64-gnu', binFile: 'aihu-compile' }
    case 'linux-arm64':
      return { packageName: '@aihu/compiler-linux-arm64-gnu', binFile: 'aihu-compile' }
    case 'win32-x64':
      return { packageName: '@aihu/compiler-win32-x64-msvc', binFile: 'aihu-compile.exe' }
    default:
      return null
  }
}

function isUsableExecutable(candidate) {
  try {
    const st = statSync(candidate)
    if (!st.isFile() || st.size === 0) return false
    accessSync(candidate, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function resolveCompilerBinary() {
  // 0. Env override + css-engine SCRIBE_COMPILE_BIN handshake (dev override).
  if (process.env.SCRIBE_COMPILE_BIN) {
    return process.env.SCRIBE_COMPILE_BIN
  }

  const descriptor = detectPlatform()

  // 1. Per-platform optionalDependency package (the published-consumer path).
  if (descriptor) {
    const requireFn = createRequire(import.meta.url)
    try {
      const pkgJson = requireFn.resolve(`${descriptor.packageName}/package.json`)
      const candidate = join(dirname(pkgJson), descriptor.binFile)
      if (isUsableExecutable(candidate)) return candidate
    } catch {
      // Not installed for this platform — fall through to dev fallback.
    }
  }

  // 2. Dev fallback: workspace-root target/. This shim lives at
  //    packages/compiler/bin/, so the workspace root is three levels up
  //    (bin → compiler → packages → root).
  const ext = process.platform === 'win32' ? '.exe' : ''
  const devCandidates = [
    resolve(__dirname, '../../../target/release', `aihu-compile${ext}`),
    resolve(__dirname, '../../../target/debug', `aihu-compile${ext}`),
    // Package-local staged binary (sibling of this shim): CI / release pipeline
    // place a prebuilt binary here. In published consumers only this .mjs shim
    // lives in bin/, so this candidate is absent and we fall through.
    resolve(__dirname, `aihu-compile${ext}`),
  ]
  for (const c of devCandidates) {
    if (existsSync(c)) return c
  }

  const platform =
    typeof process !== 'undefined' ? `${process.platform}-${process.arch}` : 'unknown'
  process.stderr.write(
    `[@aihu/compiler] Native compiler binary not found.\n\n` +
      `  Platform: ${platform}\n` +
      (descriptor ? `  Expected package: ${descriptor.packageName}\n\n` : '\n') +
      `  The aihu-compile binary ships via the @aihu/compiler-<platform>\n` +
      `  optionalDependency packages. Your package manager may have skipped it.\n` +
      `  Reinstall (npm/pnpm/bun install @aihu/compiler), or in the aihu monorepo\n` +
      `  build from source: cargo build --release -p aihu-compile\n` +
      `  Checked dev fallback paths: ${devCandidates.join(', ')}\n`,
  )
  process.exit(1)
}

const bin = resolveCompilerBinary()
const result = spawnSync(bin, process.argv.slice(2), { stdio: 'inherit' })
if (result.error) {
  process.stderr.write(`[@aihu/compiler] failed to exec ${bin}: ${result.error.message}\n`)
  process.exit(1)
}
process.exit(result.status ?? 1)
