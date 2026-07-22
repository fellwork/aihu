#!/usr/bin/env bun
/**
 * build-native.ts — build + stage the compiler napi addon for the LOCAL
 * platform (dev workflow; CI builds per-platform in release.yml's
 * build-compiler-napi lane).
 *
 *   bun packages/compiler/scripts/build-native.ts
 *
 * Runs `cargo build --release` for packages/compiler/src-native (its own
 * standalone workspace — see its Cargo.toml) and copies the produced cdylib
 * to `src-native/aihu-compiler-native.node`, which is the first dev-fallback
 * candidate js/native.ts probes. Gitignored — never commit .node binaries.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const pkgRoot = resolve(import.meta.dir, '..')
const crateDir = join(pkgRoot, 'src-native')

const cdylib =
  process.platform === 'darwin'
    ? 'libaihu_compiler_native.dylib'
    : process.platform === 'win32'
      ? 'aihu_compiler_native.dll'
      : 'libaihu_compiler_native.so'

execFileSync('cargo', ['build', '--release', '--manifest-path', join(crateDir, 'Cargo.toml')], {
  stdio: 'inherit',
})

const built = join(crateDir, 'target', 'release', cdylib)
if (!existsSync(built)) {
  console.error(`expected cdylib not found: ${built}`)
  process.exit(1)
}
const dest = join(crateDir, 'aihu-compiler-native.node')
copyFileSync(built, dest)
console.log(`staged ${dest}`)
