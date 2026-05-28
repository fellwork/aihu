#!/usr/bin/env bun
/**
 * lint-dep-pins — assert no published `@aihu/*` package has an exact-pin
 * dependency on another `@aihu/*` (or `@aihu-plugin/*`) package.
 *
 * Background: bug1-reactivity (`$if` not reactive) was caused by published
 * `@aihu/arbor@0.1.4` and `@aihu/runtime@0.1.6` carrying an EXACT pin on
 * `@aihu/signals: 0.1.0` (`bun pm pack` rewrites `workspace:*` → exact
 * version). When the user's app installed `@aihu/signals@0.1.1` at the
 * top level, the package manager satisfied arbor's `0.1.0` pin by
 * installing a second nested copy. `@aihu/signals` keeps its `currentObserver`
 * tracker in a module-scoped `let` — two copies of the module → two
 * trackers → arbor's effect set copy-A's tracker, user signal getters
 * read copy-B's tracker (always null), `linkAdd` skipped, no
 * subscription created, writes propagate to nothing.
 *
 * The fix uses `workspace:^` in source manifests, which `bun pm pack`
 * rewrites to `^x.y.z`. This script is the regression gate.
 *
 * A "pin" is any specifier that's plain `x.y.z` with no leading operator
 * (`^`, `~`, `>=`, `*`, etc) and no range/tag/url. `workspace:*` etc are
 * allowed in source manifests — only the publish-time rewrite must produce
 * a range. This script runs against the workspace source.
 *
 * Run: `bun scripts/lint-dep-pins.ts`. Exits non-zero on violation.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = join(import.meta.dirname, '..')
const packagesDir = join(root, 'packages')

type Pkg = {
  name?: string
  private?: boolean
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

/**
 * A specifier is "exact-pinned" if it looks like `x.y.z` (or `x.y.z-pre`)
 * with no leading range operator. We accept:
 *   - `^x.y.z`, `~x.y.z`, `>=x.y.z`, `*`, `x` (range)
 *   - `workspace:*`, `workspace:^`, `workspace:~`, `workspace:^x.y.z` (workspace)
 *   - `npm:...`, `file:...`, `link:...`, urls, tags (non-version)
 * Rejected:
 *   - `0.1.0`, `1.2.3-rc.4`, `workspace:0.1.0`, `=0.1.0`
 */
function isExactPin(spec: string): boolean {
  const s = spec.trim()
  // workspace: prefix — only exact if the suffix is a bare version
  if (s.startsWith('workspace:')) {
    const rest = s.slice('workspace:'.length)
    if (rest === '*' || rest === '^' || rest === '~') return false
    // workspace:x.y.z → bun rewrites to exact pin
    return /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(rest)
  }
  // Leading `=` is explicit exact
  if (s.startsWith('=')) return true
  // npm:, file:, link:, http(s)://, git+ — not a version
  if (/^(npm|file|link|http|https|git):/.test(s)) return false
  // Range operators / wildcards
  if (/^[\^~><*]/.test(s)) return false
  if (s.includes(' - ') || s.includes('||') || s.includes(' ')) return false
  // Bare semver triple → exact pin
  return /^\d+\.\d+\.\d+(?:[-+].+)?$/.test(s)
}

const INTERNAL_PREFIXES = ['@aihu/', '@aihu-plugin/']
function isInternal(name: string): boolean {
  return INTERNAL_PREFIXES.some((p) => name.startsWith(p))
}

type Violation = { pkg: string; field: string; dep: string; spec: string }
const violations: Violation[] = []

/**
 * Legitimate exact-pin patterns we must skip:
 *
 * 1. napi-rs platform binaries — `@aihu/<host>-<platform>-<arch>` listed in
 *    the host's `optionalDependencies`. These ship in lockstep with the
 *    host on every release and only one matches the install target — no
 *    duplicate-module-instance risk because they are platform-disjoint
 *    binaries, not JS modules with shared state.
 * 2. `_moved` migration stubs — `@aihu/<old-name>` whose ONLY dep is the
 *    one new home (`@aihu-plugin/<new-name>`) at a frozen version. These
 *    are deprecated redirect packages; the exact pin is the redirect.
 */
const NAPI_HOST_SUFFIXES = [
  '-darwin-arm64',
  '-darwin-x64',
  '-linux-x64-gnu',
  '-linux-arm64-gnu',
  '-win32-x64-msvc',
  '-win32-arm64-msvc',
]
function isNapiBinaryOf(host: string, dep: string): boolean {
  return NAPI_HOST_SUFFIXES.some((suffix) => dep === `${host}${suffix}`)
}
const MOVED_STUBS = new Set(['@aihu/data', '@aihu/agent-readiness'])

function checkPackage(pkgDir: string): void {
  const pkgPath = join(pkgDir, 'package.json')
  try {
    statSync(pkgPath)
  } catch {
    return
  }
  let pkg: Pkg
  try {
    pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  } catch {
    return
  }
  // Skip private (workspace-only) packages — they don't ship to npm.
  if (pkg.private === true) return
  if (!pkg.name || !isInternal(pkg.name)) return

  const buckets: Array<[string, Record<string, string> | undefined]> = [
    ['dependencies', pkg.dependencies],
    ['peerDependencies', pkg.peerDependencies],
    ['optionalDependencies', pkg.optionalDependencies],
  ]
  for (const [field, deps] of buckets) {
    if (!deps) continue
    for (const [dep, spec] of Object.entries(deps)) {
      if (!isInternal(dep)) continue
      if (!isExactPin(spec)) continue
      // Allowlist: napi-rs platform binaries in optionalDependencies.
      if (field === 'optionalDependencies' && isNapiBinaryOf(pkg.name, dep)) continue
      // Allowlist: _moved migration-stub redirects.
      if (MOVED_STUBS.has(pkg.name)) continue
      violations.push({ pkg: pkg.name, field, dep, spec })
    }
  }
}

// Walk packages/* and packages/_moved/*, packages/templates/*
const topLevel = readdirSync(packagesDir, { withFileTypes: true }).filter((d) => d.isDirectory())
for (const d of topLevel) {
  const pkgDir = join(packagesDir, d.name)
  if (d.name === '_moved' || d.name === 'templates') {
    // recurse one level
    for (const sub of readdirSync(pkgDir, { withFileTypes: true })) {
      if (sub.isDirectory()) checkPackage(join(pkgDir, sub.name))
    }
    continue
  }
  checkPackage(pkgDir)
}

if (violations.length === 0) {
  console.log('OK lint-dep-pins: no exact pins between @aihu/* packages')
  process.exit(0)
}

console.error('FAIL lint-dep-pins: exact pins between @aihu/* packages found')
console.error('  Each pin will be carried verbatim into the published tarball,')
console.error('  causing duplicate-module-instance bugs when consumers install a')
console.error('  newer patch of the depended-on package (see bug1-reactivity).')
console.error('  Fix: use `workspace:^` or `^x.y.z` in source manifests.')
console.error('')
for (const v of violations) {
  console.error(`  ${v.pkg} -> ${v.field}.${v.dep} = "${v.spec}"`)
}
process.exit(1)
