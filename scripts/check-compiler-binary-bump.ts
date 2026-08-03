#!/usr/bin/env bun
/**
 * CI guard: a change to the compiler's Rust source MUST bump the platform
 * binary packages, or the fix never ships.
 *
 * The Rust compiler is delivered through TWO independent families of platform
 * packages, whose versions are independent of the @aihu/compiler JS glue and of
 * the Changesets flow:
 *
 *   npm/<platform>        → @aihu/compiler-<platform>         (CLI binary, aihu-compile)
 *   npm-native/<platform> → @aihu/compiler-native-<platform>  (napi addon, .node cdylib)
 *
 * Both are built from the SAME lib crate — packages/compiler/src-native/Cargo.toml
 * declares `aihu-compiler = { path = ".." }` — so a change under
 * packages/compiler/src/ alters both artifacts and both families must bump.
 *
 * release.yml skips any platform version already on npm (both the
 * `packages/compiler/npm/*` publish loop and the `packages/compiler/npm-native/*`
 * one), so if the Rust source changes but a platform version does not, the
 * rebuilt binary is silently NOT published and consumers keep loading the stale
 * one. This has happened repeatedly (6ff37592 "ship spread fix by bumping
 * platform binary packages"; the 0.10.0/0.10.1 fixes that only reached npm at
 * 0.10.2; and — the reason this guard was rewritten, FEL-414 — the napi addon
 * stranded on npm at 0.1.0 across nine CLI bumps, because the guard was
 * satisfied by a bump of EITHER family and npm/-only bumps sailed through).
 *
 * Rules (FEL-414):
 *   1. Shared Rust source changed (packages/compiler/src/ *.rs or
 *      packages/compiler/Cargo.toml) → BOTH families must bump, completely.
 *   2. Addon-only source changed (packages/compiler/src-native/) → the napi
 *      family must bump, completely.
 *   3. Lockstep: if ANY manifest in a family changed, EVERY manifest in that
 *      family must change. A four-of-five bump ships a version skew, and
 *      @aihu/compiler pins ONE version for all five optionalDependencies.
 *   4. Any required bump also requires packages/compiler/package.json, which
 *      carries those pins — bumping the platform packages without repointing
 *      the pins publishes new binaries that nobody resolves.
 *
 * "Completely" is checked against the platform directories that actually exist
 * on disk, so adding a sixth platform tightens the guard automatically.
 *
 * The general form of this rule (shared source, family-only source, lockstep,
 * host-pin repoint) lives in scripts/lib/native-binary-bump.ts — this file is
 * a thin, compiler-specific configuration of it. See
 * scripts/check-css-engine-binary-bump.ts and scripts/check-server-binary-bump.ts
 * for the same guard applied to this monorepo's other native-binary packages.
 *
 * Usage:
 *   bun scripts/check-compiler-binary-bump.ts            # diff vs origin/<base>
 *   BASE_REF=main bun scripts/check-compiler-binary-bump.ts
 *   CHANGED_FILES='a,b' bun scripts/check-compiler-binary-bump.ts   # synthetic diff
 *
 * Exit 0 = ok (or nothing to check), 1 = a required platform bump is missing.
 */
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBumpChecker, type PlatformMap } from './lib/native-binary-bump.ts'

// `import.meta.dir` is Bun-only and this module is also imported by vitest.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** The manifest carrying the optionalDependencies pins for both families. */
export const HOST_MANIFEST = 'packages/compiler/package.json'

export type Family = 'cli' | 'napi'

export const FAMILIES: Record<Family, { dir: string; label: string }> = {
  cli: {
    dir: 'packages/compiler/npm',
    label: '@aihu/compiler-<platform> (CLI binary)',
  },
  napi: {
    dir: 'packages/compiler/npm-native',
    label: '@aihu/compiler-native-<platform> (napi addon)',
  },
}

/** True when the file is shared compiler Rust source — feeds BOTH artifacts. */
export function isCompilerRustSource(file: string): boolean {
  return (
    (file.startsWith('packages/compiler/src/') && file.endsWith('.rs')) ||
    file === 'packages/compiler/Cargo.toml'
  )
}

/** True when the file is napi-addon-only source — feeds the .node cdylib only. */
export function isNapiAddonSource(file: string): boolean {
  return file.startsWith('packages/compiler/src-native/')
}

const checker = createBumpChecker<Family>(
  {
    hostManifest: HOST_MANIFEST,
    families: FAMILIES,
    isSharedSource: isCompilerRustSource,
    isFamilyOnlySource: { napi: isNapiAddonSource },
  },
  ROOT,
)

export const platformManifestFamily = checker.platformManifestFamily
export const isPlatformManifest = checker.isPlatformManifest
export const discoverPlatforms = checker.discoverPlatforms
export type { PlatformMap }

/**
 * Pure check over a list of changed paths — no git, so it is unit-testable.
 * Adapts the shared checker's generalized result shape back to this script's
 * original field names (`rustChanged`, `napiSourceChanged`) so the existing
 * test suite and any other consumer keeps working unchanged.
 */
export function checkBump(
  changedFiles: string[],
  expected: PlatformMap<Family> = discoverPlatforms(),
) {
  const result = checker.checkBump(changedFiles, expected)
  return {
    ok: result.ok,
    rustChanged: result.sharedChanged,
    napiSourceChanged: result.familyOnlyChanged.napi ?? [],
    requiredFamilies: result.requiredFamilies,
    missing: result.missing,
    message: result.message,
  }
}

function changedFilesVsBase(): string[] {
  const base = process.env.BASE_REF || process.env.GITHUB_BASE_REF || 'main'
  const ref = `origin/${base}`
  let mergeBase: string
  try {
    mergeBase = execSync(`git merge-base ${ref} HEAD`, { encoding: 'utf8' }).trim()
  } catch {
    // No shared history / detached — nothing to compare against.
    return []
  }
  return execSync(`git diff --name-only ${mergeBase} HEAD`, { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
}

// CLI entry — skipped when imported by the test.
if (import.meta.main) {
  // CHANGED_FILES lets the guard be exercised against a synthetic diff
  // (newline- or comma-separated paths) without fabricating a branch.
  const override = process.env.CHANGED_FILES
  const files = override
    ? override
        .split(/[\n,]/)
        .map((l) => l.trim())
        .filter(Boolean)
    : changedFilesVsBase()
  const result = checkBump(files)
  if (!result.ok) {
    console.error(`FAIL: ${result.message}`)
    process.exit(1)
  }
  console.log('compiler binary bump guard: ok')
}
