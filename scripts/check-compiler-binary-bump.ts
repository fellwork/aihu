#!/usr/bin/env bun
/**
 * CI guard: a change to the compiler's Rust source MUST bump the platform
 * binary packages, or the fix never ships.
 *
 * The Rust aihu-compile binary is delivered through the @aihu/compiler-<platform>
 * packages, whose version is independent of the @aihu/compiler JS glue and of the
 * Changesets flow. release.yml skips any platform version already on npm, so if
 * the Rust source changes but the platform version does not, the rebuilt binary
 * is silently NOT published and consumers keep loading the stale one. This has
 * happened twice (6ff37592 "ship spread fix by bumping platform binary packages",
 * and the 0.10.0/0.10.1 fixes that only reached npm at 0.10.2). This guard turns
 * that into a hard CI failure instead of a silent non-shipping release.
 *
 * Rule: if any file under packages/compiler/src/ (or the crate's Cargo.toml)
 * changed in this PR, at least one packages/compiler/npm/<platform>/package.json
 * must also have changed (the version bump), in the same PR.
 *
 * Usage:
 *   bun scripts/check-compiler-binary-bump.ts            # diff vs origin/<base>
 *   BASE_REF=main bun scripts/check-compiler-binary-bump.ts
 *
 * Exit 0 = ok (or nothing to check), 1 = Rust changed without a platform bump.
 */
import { execSync } from 'node:child_process'

/** True when the file is compiler Rust source whose change can alter the binary. */
export function isCompilerRustSource(file: string): boolean {
  return (
    (file.startsWith('packages/compiler/src/') && file.endsWith('.rs')) ||
    file === 'packages/compiler/Cargo.toml'
  )
}

/** True when the file is a platform binary package manifest (carries the version). */
export function isPlatformManifest(file: string): boolean {
  return (
    (file.startsWith('packages/compiler/npm/') ||
      file.startsWith('packages/compiler/npm-native/')) &&
    file.endsWith('/package.json')
  )
}

export interface BumpCheck {
  ok: boolean
  rustChanged: string[]
  platformBumped: boolean
  message: string
}

/** Pure check over a list of changed paths — no git, so it is unit-testable. */
export function checkBump(changedFiles: string[]): BumpCheck {
  const rustChanged = changedFiles.filter(isCompilerRustSource)
  const platformBumped = changedFiles.some(isPlatformManifest)
  if (rustChanged.length === 0 || platformBumped) {
    return { ok: true, rustChanged, platformBumped, message: 'ok' }
  }
  const message = [
    'Compiler Rust source changed but no platform binary package was bumped:',
    ...rustChanged.map((f) => `  - ${f}`),
    '',
    'The fix would build but never publish: release.yml skips versions already on',
    'npm, so the rebuilt @aihu/compiler-<platform> binary would not ship and',
    'consumers would keep loading the stale one.',
    '',
    'Bump all five packages/compiler/npm/<platform>/package.json versions and',
    'repoint packages/compiler/package.json optionalDependencies at the new version.',
  ].join('\n')
  return { ok: false, rustChanged, platformBumped, message }
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
  const result = checkBump(changedFilesVsBase())
  if (!result.ok) {
    console.error(`FAIL: ${result.message}`)
    process.exit(1)
  }
  console.log('compiler binary bump guard: ok')
}
