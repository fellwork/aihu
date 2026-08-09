#!/usr/bin/env bun
/**
 * CI guard: a change to native source MUST come with a changeset naming its
 * host package, or the fix never ships.
 *
 * ── WHY THIS REPLACES THE HAND-BUMP GATE ─────────────────────────────────────
 *
 * `check-compiler-binary-bump.ts` demanded that a Rust change also edit all 11
 * platform manifests plus the host's pins — 23 files. Under lockstep versioning
 * (`stamp-platform-versions.ts`, run inside `release:version`) those files are
 * GENERATED, so demanding a hand edit is both impossible to satisfy and
 * pointless.
 *
 * But the old gate was doing a second job nobody wrote down, and deleting it
 * outright would be a NET LOSS. `@aihu/compiler` has NO `@aihu/*` dependencies,
 * so changesets' `updateInternalDependencies: "patch"` never cascades into it.
 * Its version moves if and only if a changeset explicitly names it. Under
 * lockstep that means:
 *
 *   Rust change with no changeset
 *     -> host version unchanged
 *     -> platform versions unchanged (they mirror the host)
 *     -> release.yml's `npm view` skip declines to publish
 *     -> the fix silently never reaches consumers
 *
 * That is FEL-414 reproduced exactly, with a version-consistency gate green
 * throughout. Demanding 23 manual edits was a crude PROXY for "somebody thought
 * about shipping this". The proxy has to be REPLACED, not removed — this file
 * is the replacement, and it is strictly stronger: a changeset cannot be faked
 * into existence without stating what changed, and its text becomes the
 * CHANGELOG entry.
 *
 * ── WHAT IT CHECKS ───────────────────────────────────────────────────────────
 *
 * Reuses `createBumpChecker` unchanged for its shared-source / family-only /
 * requiredFamilies machinery — the question "does this diff touch native source
 * that must ship?" is identical. Only the answer to "and what proves it will
 * ship?" changed, from "23 edited manifests" to "one changeset".
 *
 * Usage:
 *   bun scripts/check-native-changeset.ts
 *   BASE_REF=main bun scripts/check-native-changeset.ts
 *   CHANGED_FILES='a,b' bun scripts/check-native-changeset.ts    # synthetic diff
 *   CHANGESET_DIR=/tmp/fixture bun scripts/check-native-changeset.ts
 *
 * Exit 0 = ok (or nothing to check), 1 = native source changed with no changeset.
 */
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createBumpChecker } from './lib/native-binary-bump.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Hosts under lockstep. Compiler only, for now — css-engine and server keep
 * their hand-bump gates until Phase 1b moves them too. Adding a host here
 * without also putting it under lockstep would demand a changeset for a
 * version line that is still bumped by hand: two rules for one change.
 */
const HOSTS = [
  {
    hostPackage: '@aihu/compiler',
    hostManifest: 'packages/compiler/package.json',
    families: {
      cli: { dir: 'packages/compiler/npm', label: '@aihu/compiler-<platform> (CLI binary)' },
      napi: {
        dir: 'packages/compiler/npm-native',
        label: '@aihu/compiler-native-<platform> (napi addon)',
      },
    },
    /** Shared Rust source — feeds BOTH the CLI binary and the napi addon. */
    isSharedSource: (f: string): boolean =>
      (f.startsWith('packages/compiler/src/') && f.endsWith('.rs')) ||
      f === 'packages/compiler/Cargo.toml',
    isFamilyOnlySource: {
      napi: (f: string): boolean => f.startsWith('packages/compiler/src-native/'),
    },
  },
] as const

/** Bumps that actually move a version. `none` does not count. */
const REAL_BUMPS = new Set(['patch', 'minor', 'major'])

/**
 * Packages named at patch-or-higher across every pending changeset.
 *
 * Deliberately a hand-rolled front-matter scan rather than a YAML dependency:
 * the format is two `---` fences wrapping `"pkg": bump` lines, and this gate
 * must keep working in a minimal CI step. Unparseable files are SKIPPED, not
 * treated as satisfying anything — a malformed changeset must not green a gate.
 */
function bumpedPackages(changesetDir: string): Set<string> {
  const bumped = new Set<string>()
  if (!existsSync(changesetDir)) return bumped
  for (const entry of readdirSync(changesetDir)) {
    if (!entry.endsWith('.md') || entry === 'README.md') continue
    let text: string
    try {
      text = readFileSync(join(changesetDir, entry), 'utf8')
    } catch {
      continue
    }
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
    if (!m) continue
    for (const line of m[1].split(/\r?\n/)) {
      // '@aihu/compiler': patch   |   "@aihu/compiler": minor
      const f = line.match(/^\s*['"]?([^'":]+)['"]?\s*:\s*['"]?([a-z]+)['"]?\s*$/)
      if (f && REAL_BUMPS.has(f[2])) bumped.add(f[1].trim())
    }
  }
  return bumped
}

function changedFilesVsBase(): string[] {
  const override = process.env.CHANGED_FILES
  if (override !== undefined) {
    return override
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }
  const base = process.env.BASE_REF || process.env.GITHUB_BASE_REF || 'main'
  try {
    const mergeBase = execSync(`git merge-base origin/${base} HEAD`, {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim()
    return execSync(`git diff --name-only ${mergeBase} HEAD`, { cwd: ROOT, encoding: 'utf8' })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
  } catch (err) {
    console.error(`✗ cannot compute the diff against origin/${base}: ${err}`)
    console.error('  (a shallow clone needs fetch-depth: 0)')
    process.exit(1)
  }
}

// The Version PR CONSUMES changesets — `changeset version` deletes them and
// writes the bumps into package.json. Diffing that branch against main shows
// native source "changed" with the changesets already gone, so this gate would
// fire on the one PR that proves it was satisfied. Skip it.
const headRef = process.env.GITHUB_HEAD_REF ?? ''
if (headRef === 'changeset-release/main') {
  console.log('✔ changeset-release/main — changesets are consumed here by design; nothing to check')
  process.exit(0)
}

const changed = changedFilesVsBase()
const changesetDir = process.env.CHANGESET_DIR ?? join(ROOT, '.changeset')
const bumped = bumpedPackages(changesetDir)

let failed = false
for (const host of HOSTS) {
  const checker = createBumpChecker(
    {
      hostManifest: host.hostManifest,
      families: host.families as never,
      isSharedSource: host.isSharedSource,
      isFamilyOnlySource: host.isFamilyOnlySource as never,
    },
    ROOT,
  )
  const result = checker.checkBump(changed, checker.discoverPlatforms())
  if (result.requiredFamilies.length === 0) continue

  if (bumped.has(host.hostPackage)) {
    console.log(`✔ ${host.hostPackage}: native source changed, changeset present`)
    continue
  }

  failed = true
  console.error(`\n✗ ${host.hostPackage}: native source changed with NO changeset naming it.`)
  console.error(`  Affected: ${result.requiredFamilies.join(', ')}`)
  for (const f of changed.filter(host.isSharedSource)) console.error(`    ${f}`)
  console.error(
    `\n  ${host.hostPackage} has no @aihu/* dependencies, so changesets never bumps it\n` +
      '  indirectly — its version moves ONLY if a changeset names it. Without one the\n' +
      "  platform packages keep their current version, release.yml's `npm view` skip\n" +
      '  declines to publish, and this change silently never reaches consumers.\n\n' +
      '  Fix: bun changeset  → select ' +
      `${host.hostPackage} → patch (or higher).\n`,
  )
}

if (failed) process.exit(1)
console.log('✔ native-changeset: ok')
