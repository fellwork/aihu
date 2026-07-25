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
 * Usage:
 *   bun scripts/check-compiler-binary-bump.ts            # diff vs origin/<base>
 *   BASE_REF=main bun scripts/check-compiler-binary-bump.ts
 *   CHANGED_FILES='a,b' bun scripts/check-compiler-binary-bump.ts   # synthetic diff
 *
 * Exit 0 = ok (or nothing to check), 1 = a required platform bump is missing.
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

const FAMILY_KEYS = Object.keys(FAMILIES) as Family[]

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

/** Which family a platform manifest belongs to, or null if it is not one. */
export function platformManifestFamily(file: string): Family | null {
  const parts = file.split('/')
  if (parts[parts.length - 1] !== 'package.json') return null
  for (const family of FAMILY_KEYS) {
    const dirParts = FAMILIES[family].dir.split('/')
    // Exactly <dir>/<platform>/package.json — nothing nested deeper.
    if (parts.length === dirParts.length + 2 && dirParts.every((p, i) => parts[i] === p)) {
      return family
    }
  }
  return null
}

/** True when the file is a platform binary package manifest (carries the version). */
export function isPlatformManifest(file: string): boolean {
  return platformManifestFamily(file) !== null
}

export type PlatformMap = Record<Family, string[]>

let cachedPlatforms: PlatformMap | undefined

/** The platform dirs that actually exist on disk, per family (sorted). */
export function discoverPlatforms(root: string = ROOT): PlatformMap {
  const read = (dir: string): string[] => {
    const abs = join(root, dir)
    if (!existsSync(abs)) return []
    return readdirSync(abs, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(abs, e.name, 'package.json')))
      .map((e) => e.name)
      .sort()
  }
  return { cli: read(FAMILIES.cli.dir), napi: read(FAMILIES.napi.dir) }
}

function platforms(): PlatformMap {
  cachedPlatforms ??= discoverPlatforms()
  return cachedPlatforms
}

export interface BumpCheck {
  ok: boolean
  /** Shared Rust source files that changed (drive both families). */
  rustChanged: string[]
  /** Addon-only source files that changed (drive the napi family). */
  napiSourceChanged: string[]
  /** Families this change is required to bump. */
  requiredFamilies: Family[]
  /** Exact manifest paths that must have changed but did not. */
  missing: string[]
  message: string
}

/** Pure check over a list of changed paths — no git, so it is unit-testable. */
export function checkBump(changedFiles: string[], expected: PlatformMap = platforms()): BumpCheck {
  const changed = new Set(changedFiles)
  const rustChanged = changedFiles.filter(isCompilerRustSource)
  const napiSourceChanged = changedFiles.filter(isNapiAddonSource)

  const touched: Record<Family, string[]> = { cli: [], napi: [] }
  for (const file of changedFiles) {
    const family = platformManifestFamily(file)
    if (family) touched[family].push(file)
  }

  // Why each family is on the hook — surfaced verbatim in the failure message.
  const reasons: Record<Family, string[]> = { cli: [], napi: [] }
  if (rustChanged.length > 0) {
    const why = `shared compiler Rust source changed (${rustChanged.length} file${
      rustChanged.length === 1 ? '' : 's'
    }) — it is compiled into BOTH the CLI binary and the napi addon`
    reasons.cli.push(why)
    reasons.napi.push(why)
  }
  if (napiSourceChanged.length > 0) {
    reasons.napi.push('napi addon source changed (packages/compiler/src-native/)')
  }
  for (const family of FAMILY_KEYS) {
    if (touched[family].length > 0 && touched[family].length < expected[family].length) {
      reasons[family].push(
        `a partial bump of this family is already in the diff (${touched[family].length} of ${expected[family].length} manifests) — platform versions must move in lockstep`,
      )
    }
  }

  const requiredFamilies = FAMILY_KEYS.filter((f) => reasons[f].length > 0)

  const missing: string[] = []
  for (const family of requiredFamilies) {
    for (const platform of expected[family]) {
      const manifest = `${FAMILIES[family].dir}/${platform}/package.json`
      if (!changed.has(manifest)) missing.push(manifest)
    }
  }
  if (requiredFamilies.length > 0 && !changed.has(HOST_MANIFEST)) {
    missing.push(HOST_MANIFEST)
  }

  if (missing.length === 0) {
    return {
      ok: true,
      rustChanged,
      napiSourceChanged,
      requiredFamilies,
      missing,
      message: 'ok',
    }
  }

  const lines: string[] = ['Compiler platform bump incomplete.', '']
  if (rustChanged.length > 0) {
    lines.push('Shared Rust source changed:')
    lines.push(...rustChanged.map((f) => `  - ${f}`))
    lines.push('')
  }
  if (napiSourceChanged.length > 0) {
    lines.push('napi addon source changed:')
    lines.push(...napiSourceChanged.map((f) => `  - ${f}`))
    lines.push('')
  }
  for (const family of requiredFamilies) {
    lines.push(`${FAMILIES[family].label} must bump, because:`)
    lines.push(...reasons[family].map((r) => `  - ${r}`))
  }
  lines.push('')
  lines.push('Missing (not changed in this PR):')
  lines.push(...missing.map((f) => `  - ${f}`))
  lines.push('')
  lines.push(
    'release.yml skips versions already on npm, for BOTH the packages/compiler/npm/*',
    'and packages/compiler/npm-native/* publish loops. Any manifest left unbumped is',
    'silently not published and consumers keep loading the stale artifact — this is',
    'exactly how the napi addon stayed on npm at 0.1.0 through nine CLI bumps.',
    '',
    'Fix: bump every manifest listed above (all platforms of every required family,',
    `in lockstep) and repoint the ${HOST_MANIFEST} optionalDependencies`,
    'pins at the new versions.',
  )
  return {
    ok: false,
    rustChanged,
    napiSourceChanged,
    requiredFamilies,
    missing,
    message: lines.join('\n'),
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
