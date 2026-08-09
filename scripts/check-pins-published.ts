#!/usr/bin/env bun
/**
 * Drift guard: every in-repo platform-binary pin should eventually exist on npm.
 *
 * This is the guard that would have caught the docs-next outage (2026-08-01 →
 * 08-03). `packages/css-engine/package.json` pinned
 * `@aihu/css-engine-<platform>@0.1.4` (later `0.1.17`) while npm still had only
 * `0.1.3`. Because platform binaries ship as **optionalDependencies**, an
 * unresolvable version is dropped SILENTLY — `bun install --frozen-lockfile`
 * keeps reporting success — so nothing failed until a consumer actually needed
 * the binary and got "Native CSS compiler binary not found for this platform".
 *
 * WHY THIS DOES NOT GATE PRs
 * --------------------------
 * A pin is SUPPOSED to lead its publish. The bump lands in a PR; the release
 * workflow publishes it later (release.yml orders `publish-packages` behind
 * `publish-css-native`/`publish-native`/`publish-compiler-*` precisely so a host
 * never reaches npm before the binaries it pins). Failing a PR for an
 * unpublished pin would therefore fail the very commit that is doing the right
 * thing. Instead this reports drift, and only *fails* when asked to
 * (`--strict`), which is what the nightly job uses: on `main`, an unpublished
 * pin means "a release is overdue", and that is exactly the state that bit us.
 *
 * Usage:
 *   bun scripts/check-pins-published.ts             # report; exit 0 always
 *   bun scripts/check-pins-published.ts --strict    # exit 1 if any pin unpublished
 *   bun scripts/check-pins-published.ts --json      # machine-readable
 *
 * Offline/registry-unreachable is NOT treated as drift — it exits 0 with a
 * notice, so a flaky network can never manufacture a red nightly.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const STRICT = process.argv.includes('--strict')
const AS_JSON = process.argv.includes('--json')

interface Pin {
  host: string
  name: string
  version: string
}

/**
 * Directories that hold per-platform package manifests, relative to
 * `packages/<pkg>/`.
 *
 * `npm-native` is not an afterthought — it is the family this guard most needs
 * to see. The napi packages (`@aihu/compiler-native-*`) live in `npm-native/`,
 * and they are the ones that stranded at `0.1.0` through NINE consecutive CLI
 * bumps in FEL-414 while every pin claimed otherwise. Reading only `npm/` made
 * this guard structurally blind to the exact drift it was written to catch:
 * a nightly that cannot fail for the one case that motivated it.
 *
 * Enumerated rather than globbed on purpose. A glob would silently pick up any
 * future sibling directory and start asserting things about packages nobody
 * intended this guard to own; adding a family should be a deliberate edit here.
 */
const PLATFORM_DIRS = ['npm', 'npm-native'] as const

/** Every `<pkg>/{npm,npm-native}/<platform>` directory is an in-repo platform package. */
function inRepoPlatformPackages(): Set<string> {
  const names = new Set<string>()
  const pkgsDir = join(ROOT, 'packages')
  if (!existsSync(pkgsDir)) return names
  for (const pkg of readdirSync(pkgsDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    for (const dir of PLATFORM_DIRS) {
      const npmDir = join(pkgsDir, pkg.name, dir)
      if (!existsSync(npmDir)) continue
      for (const platform of readdirSync(npmDir, { withFileTypes: true })) {
        if (!platform.isDirectory()) continue
        const manifest = join(npmDir, platform.name, 'package.json')
        if (!existsSync(manifest)) continue
        try {
          names.add(JSON.parse(readFileSync(manifest, 'utf8')).name)
        } catch {
          /* unreadable manifest is not this guard's business */
        }
      }
    }
  }
  return names
}

/** optionalDependency pins that point at an IN-REPO platform package. Pins at
 * third-party optional deps are none of our business — we cannot publish those. */
function collectPins(inRepo: Set<string>): Pin[] {
  const pins: Pin[] = []
  const pkgsDir = join(ROOT, 'packages')
  for (const pkg of readdirSync(pkgsDir, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue
    const manifestPath = join(pkgsDir, pkg.name, 'package.json')
    if (!existsSync(manifestPath)) continue
    let manifest: { optionalDependencies?: Record<string, string> }
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    } catch {
      continue
    }
    for (const [name, version] of Object.entries(manifest.optionalDependencies ?? {})) {
      if (!inRepo.has(name)) continue
      // Only exact pins are checkable; a range would resolve to whatever exists.
      if (!/^\d+\.\d+\.\d+/.test(version)) continue
      pins.push({ host: `packages/${pkg.name}/package.json`, name, version })
    }
  }
  return pins.sort((a, b) => a.name.localeCompare(b.name))
}

/** Highest published RELEASE version. npm returns `versions` in publish order,
 * not semver order, and this repo has stray `0.0.0-canary-*` entries — taking
 * the last key would report a canary as "latest" and make the drift report lie
 * about how far behind the registry actually is. Prereleases are ignored unless
 * nothing else exists. */
function latestStable(versions: string[]): string {
  const parse = (v: string): [number, number, number] | null => {
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
  }
  const stable = versions
    .map((v) => [v, parse(v)] as const)
    .filter((e): e is readonly [string, [number, number, number]] => e[1] !== null)
    .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1] || a[1][2] - b[1][2])
  return stable.length ? stable[stable.length - 1][0] : versions[versions.length - 1]
}

async function publishedVersions(name: string): Promise<string[] | null> {
  try {
    // encodeURIComponent, not `.replace('/', '%2F')`: replace() substitutes only
    // the FIRST match, which CodeQL correctly flags as incomplete sanitization
    // (js/incomplete-sanitization). It happens to be harmless for the one-slash
    // `@scope/name` shape we actually pass, but "correct only for today's
    // inputs" is not a property worth keeping in a URL builder.
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
      signal: AbortSignal.timeout(15_000),
    })
    // A never-published package 404s — that is real drift, not an outage.
    if (res.status === 404) return []
    if (!res.ok) return null
    const body = (await res.json()) as { versions?: Record<string, unknown> }
    return Object.keys(body.versions ?? {})
  } catch {
    return null
  }
}

const inRepo = inRepoPlatformPackages()
const pins = collectPins(inRepo)

const unpublished: Pin[] = []
const unreachable: string[] = []
const cache = new Map<string, string[] | null>()

for (const pin of pins) {
  if (!cache.has(pin.name)) cache.set(pin.name, await publishedVersions(pin.name))
  const versions = cache.get(pin.name)
  if (versions === null) {
    if (!unreachable.includes(pin.name)) unreachable.push(pin.name)
    continue
  }
  if (!versions.includes(pin.version)) unpublished.push(pin)
}

if (AS_JSON) {
  console.log(JSON.stringify({ checked: pins.length, unpublished, unreachable }, null, 2))
} else if (unpublished.length === 0) {
  console.log(
    `drift:pins: ok — ${pins.length} in-repo platform pin(s), all published` +
      (unreachable.length ? ` (${unreachable.length} unreachable, skipped)` : ''),
  )
} else {
  const byName = new Map<string, Pin[]>()
  for (const p of unpublished) byName.set(p.name, [...(byName.get(p.name) ?? []), p])
  console.log(`drift:pins: ${unpublished.length} pin(s) not on npm\n`)
  for (const [name, group] of byName) {
    const have = cache.get(name) ?? []
    const latest = have.length ? latestStable(have) : '(never published)'
    console.log(`  ${name}`)
    console.log(`    pinned:    ${group[0].version}   (${group.map((g) => g.host).join(', ')})`)
    console.log(`    on npm:    ${latest}`)
  }
  console.log(
    `\n  A pin legitimately LEADS its publish, so this is expected on a feature\n` +
      `  branch. On main it means a release is overdue: merge the pending\n` +
      `  changeset-release PR, which runs release.yml (binaries publish before\n` +
      `  host packages, so consumers never see a dangling pin).\n\n` +
      `  Until then anything installing these hosts from npm silently loses the\n` +
      `  binary — optionalDependencies are dropped without error.`,
  )
}

if (unreachable.length && !AS_JSON) {
  console.log(
    `\n  note: registry unreachable for ${unreachable.join(', ')} — not counted as drift.`,
  )
}

process.exit(STRICT && unpublished.length > 0 ? 1 : 0)
