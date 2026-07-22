#!/usr/bin/env bun
/**
 * stamp-platform-snapshot.ts — sync native platform packages to a snapshot.
 *
 * Run AFTER `changeset version --snapshot canary`. The platform packages under
 * `packages/<host>/npm/<platform>/` are NOT workspace members (the root
 * `workspaces` glob is `packages/*`, which doesn't match nested dirs), so
 * changesets never versions them — their versions are normally bumped by hand
 * (enforced by scripts/check-compiler-binary-bump.ts). For a canary snapshot
 * that manual flow is wrong: the freshly-built canary binaries must ship under
 * the SAME `0.0.0-canary-<sha>` version as their host package, and the host's
 * `optionalDependencies` pins must point at that exact version — otherwise a
 * canary install of e.g. @aihu/compiler would resolve the STABLE platform
 * binaries from npm (old grammar, no snapshot changes).
 *
 * For each host (compiler / server / css-engine):
 *   1. read the host's snapshot version (hard-fail if it isn't `0.0.0-…` —
 *      that means `changeset version --snapshot` didn't run, or the host had
 *      no pending changeset and a canary would be meaningless/inconsistent)
 *   2. stamp every `packages/<host>/npm/<platform>/package.json` version
 *   3. rewrite the host's optionalDependencies pins to the exact snapshot
 *
 * All edits are EPHEMERAL (CI working tree only) — never commit them. The
 * canary jobs in .github/workflows/release.yml run this fresh each time.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dir, '..')
const HOSTS = ['compiler', 'server', 'css-engine']

type PackageJson = {
  name: string
  version: string
  optionalDependencies?: Record<string, string>
} & Record<string, unknown>

function readPkg(path: string): PackageJson {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function writePkg(path: string, pkg: PackageJson): void {
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`)
}

let failed = false
for (const host of HOSTS) {
  const hostPkgPath = join(ROOT, 'packages', host, 'package.json')
  const hostPkg = readPkg(hostPkgPath)
  const version: string = hostPkg.version

  if (!version.startsWith('0.0.0-')) {
    console.error(
      `✗ ${hostPkg.name} is at ${version}, not a 0.0.0-* snapshot. ` +
        `Run \`bun scripts/canary-catchall-changeset.ts\` then ` +
        `\`changeset version --snapshot canary\` first.`,
    )
    failed = true
    continue
  }

  const npmDir = join(ROOT, 'packages', host, 'npm')
  const platforms = readdirSync(npmDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()

  if (platforms.length === 0) {
    console.error(`✗ no platform package dirs under packages/${host}/npm/`)
    failed = true
    continue
  }

  const optDeps: Record<string, string> = hostPkg.optionalDependencies ?? {}
  for (const platform of platforms) {
    const platPkgPath = join(npmDir, platform, 'package.json')
    const platPkg = readPkg(platPkgPath)
    platPkg.version = version
    writePkg(platPkgPath, platPkg)

    if (!(platPkg.name in optDeps)) {
      console.error(
        `✗ ${hostPkg.name} optionalDependencies is missing ${platPkg.name} — ` +
          `platform dir and host pins are out of sync; fix the host package.json.`,
      )
      failed = true
      continue
    }
    optDeps[platPkg.name] = version
    console.log(`  ${platPkg.name} → ${version}`)
  }
  hostPkg.optionalDependencies = optDeps
  writePkg(hostPkgPath, hostPkg)
  console.log(`✔ ${hostPkg.name}@${version}: ${platforms.length} platform pins stamped`)
}

if (failed) process.exit(1)
