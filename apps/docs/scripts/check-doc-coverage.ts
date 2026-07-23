/**
 * Doc-coverage gate (A1-owned CI gate; A3/A4 are the doc WRITERS).
 * ---------------------------------------------------------------------------
 * Usage:
 *   bun apps/docs/scripts/check-doc-coverage.ts            # default (CI) mode
 *   bun apps/docs/scripts/check-doc-coverage.ts --strict   # closeout mode
 *
 * WHAT IT DOES
 *   1. DYNAMICALLY enumerates every published (non-private) @aihu/* and
 *      @aihu-plugin/* workspace package by scanning `packages/*\/package.json`.
 *      No hand-maintained package list — A3/A4 packages are picked up the
 *      moment they land, with zero A1 re-edit.
 *   2. For each package, asserts it is documented either by a dedicated doc
 *      page at `apps/docs/src/content/docs/packages/<short>.md` OR by a
 *      `## <full-package-name>` section in
 *      `apps/docs/src/content/docs/api-reference.md`.
 *   3. Routes every package through `ownerOf(pkg)` -> A1 | A3 | A4 so that
 *      ownership is explicit (see CROSS-TRACK CONTRACT below).
 *
 * TWO-MODE EXIT BEHAVIOR (read before flipping to --strict)
 *   - A1-owned, undocumented package  ->  ALWAYS a HARD FAIL (exit 1), in
 *     both modes. A1 owns its own doc surface; the gate must never go green
 *     while an A1 public package is undocumented.
 *   - A3/A4-owned, undocumented package ("OWED BY <track>"):
 *       * default (CI) mode  -> printed as a tracked WARNING, exit 0.
 *         This is the mode wired into `deploy-docs.yml` so an A1 docs deploy
 *         is NOT blocked red merely because A3/A4 still owe their package
 *         docs (decomposition m2-track-decomposition.md:69,135 —
 *         "A1 owns the CI gate; A3/A4 are the WRITERS").
 *       * --strict mode      -> the same OWED-BY gaps become HARD FAILURES
 *         (exit 1). A3/A4 flip their own closeout PRs to `--strict` so their
 *         landing is blocked until their docs exist. A1 must NOT stub those
 *         docs to make the gate pass.
 *
 * The gate deliberately does NOT let A1 satisfy A3/A4 coverage by stubbing
 * package docs, and does NOT weaken the A1 hard-fail to force a pass.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Paths ────────────────────────────────────────────────────────────────
const scriptDir = fileURLToPath(new URL('.', import.meta.url))
const docsAppDir = join(scriptDir, '..') // apps/docs
const repoRoot = join(docsAppDir, '..', '..') // repo root
const packagesDir = join(repoRoot, 'packages')
const packageDocsDir = join(docsAppDir, 'src/content/docs/packages')
const apiReferencePath = join(docsAppDir, 'src/content/docs/api-reference.md')

type Track = 'A1' | 'A3' | 'A4'

// ── Ownership map (decomposition: A1 owns the gate; A3/A4 are writers) ─────
// Short name (package dir / unscoped name) -> owning track.
// Anything not listed here defaults to A1.
const OWNER: Record<string, Track> = {
  // A3 — feature/server packages
  auth: 'A3',
  magna: 'A3',
  seo: 'A3',
  scraping: 'A3',
  search: 'A3',
  commerce: 'A3',
  'agent-acp-ext': 'A3',
  // A4 — tooling packages
  'language-server': 'A4',
  cli: 'A4',
  'agent-host': 'A4',
  devtools: 'A4',
}

function ownerOf(shortName: string): Track {
  return OWNER[shortName] ?? 'A1'
}

// ── Doc-surface exemptions (A1-only infra) ─────────────────────────────────
// Packages that are NOT part of the public, browser-facing doc surface:
// build-time toolchain, stdio binaries, and the internal plugin substrate.
// They are reported (so nothing is silently dropped) but do not require a
// dedicated package doc page. This keeps the A1 hard-fail meaningful for the
// genuine public surface without forcing A1 to author docs for build-time
// tooling. NOTE: this set is A1-internal only — no A3/A4 package is exempt,
// so OWED-BY-A3/A4 gaps always surface.
// Keys are the doc short-name (package dir name); for @aihu-plugin/* that is
// the dir form, e.g. "plugin-drizzle".
const DOC_EXEMPT = new Set<string>([
  'compiler', // .aihu Rust compiler + JS glue — build-time
  'plugin', // internal hook substrate shared by server/runtime
  'app', // Vite app integration meta-package (covered by guides)
  // NOTE: mcp, ai, plugin-drizzle, and plugin-kindly-note now have dedicated
  // stub pages under packages/, so they are documented (not exempt).
])

// ── Enumerate published @aihu packages dynamically ─────────────────────────
interface PkgInfo {
  /** Full package name, e.g. "@aihu/context" or "@aihu-plugin/data". */
  name: string
  /** Short/unscoped doc key, e.g. "context", "data" -> see note below. */
  short: string
}

/**
 * Derive the doc short-name used for the doc page filename and OWNER lookup.
 * - `@aihu/context`        -> `context`
 * - `@aihu-plugin/data`    -> `plugin-data`  (matches dir & sidebar convention)
 *   but the api-reference header is the FULL name, which we also accept.
 */
function shortNameFor(fullName: string, dirName: string): string {
  if (fullName.startsWith('@aihu-plugin/')) {
    // dir name is already e.g. "plugin-data" / "plugin-kindly-note"
    return dirName
  }
  return fullName.slice('@aihu/'.length)
}

function enumeratePackages(): PkgInfo[] {
  const out: PkgInfo[] = []
  for (const dir of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue
    if (dir.name.startsWith('_')) continue // e.g. _moved
    const pkgJsonPath = join(packagesDir, dir.name, 'package.json')
    if (!existsSync(pkgJsonPath)) continue
    let pkg: { name?: string; private?: boolean }
    try {
      pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8'))
    } catch {
      continue
    }
    if (!pkg.name) continue
    if (pkg.private === true) continue
    if (!(pkg.name.startsWith('@aihu/') || pkg.name.startsWith('@aihu-plugin/'))) {
      continue // skip non-@aihu (e.g. vscode-aihu)
    }
    out.push({ name: pkg.name, short: shortNameFor(pkg.name, dir.name) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

// ── Coverage detection ─────────────────────────────────────────────────────
const apiReferenceSrc = existsSync(apiReferencePath) ? readFileSync(apiReferencePath, 'utf8') : ''

function hasDocPage(short: string): boolean {
  return existsSync(join(packageDocsDir, `${short}.md`))
}

function hasApiReferenceRow(fullName: string): boolean {
  // Match a section header `## @aihu/<name>` at line start; allow trailing
  // subpath sections (e.g. `## @aihu/router/plugin`) to also count.
  const escaped = fullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`^##\\s+${escaped}(\\b|/|\\s|$)`, 'm')
  return re.test(apiReferenceSrc)
}

function isDocumented(pkg: PkgInfo): boolean {
  return hasDocPage(pkg.short) || hasApiReferenceRow(pkg.name)
}

// ── Run ────────────────────────────────────────────────────────────────────
const strict = process.argv.includes('--strict')
const packages = enumeratePackages()

const a1HardFails: PkgInfo[] = []
const owedBy: { pkg: PkgInfo; track: Track }[] = []
const documented: PkgInfo[] = []
const exempt: PkgInfo[] = []

for (const pkg of packages) {
  if (isDocumented(pkg)) {
    documented.push(pkg)
    continue
  }
  const track = ownerOf(pkg.short)
  if (track === 'A1') {
    if (DOC_EXEMPT.has(pkg.short)) {
      exempt.push(pkg)
    } else {
      a1HardFails.push(pkg)
    }
  } else {
    owedBy.push({ pkg, track })
  }
}

// ── Report ───────────────────────────────────────────────────────────────
const mode = strict ? 'STRICT' : 'DEFAULT (CI)'
console.log(`\nDoc-coverage gate — mode: ${mode}`)
console.log(`Enumerated ${packages.length} published @aihu package(s).\n`)

console.log(`Documented: ${documented.length}`)
for (const p of documented) {
  const via = hasDocPage(p.short) ? `packages/${p.short}.md` : 'api-reference.md'
  console.log(`  OK    ${p.name}  (${via})`)
}

if (exempt.length > 0) {
  console.log(`\nExempt (A1 build-time / non-browser doc surface): ${exempt.length}`)
  for (const p of exempt) console.log(`  SKIP  ${p.name}`)
}

if (owedBy.length > 0) {
  console.log(`\nOWED-BY report (A3/A4 doc gaps): ${owedBy.length}`)
  for (const { pkg, track } of owedBy) {
    console.log(
      `  OWED BY ${track}: ${pkg.name}  (expected packages/${pkg.short}.md or api-reference.md row)`,
    )
  }
}

if (a1HardFails.length > 0) {
  console.error(`\nA1-OWNED UNDOCUMENTED (hard fail): ${a1HardFails.length}`)
  for (const p of a1HardFails) {
    console.error(
      `  MISSING ${p.name}  (add packages/${p.short}.md or an api-reference.md section)`,
    )
  }
}

// ── Exit policy ────────────────────────────────────────────────────────────
let exitCode = 0

if (a1HardFails.length > 0) {
  console.error('\nFAIL: A1-owned package(s) are undocumented. A1 owns its own doc surface.')
  exitCode = 1
}

if (owedBy.length > 0) {
  if (strict) {
    console.error('\nFAIL (--strict): A3/A4 still owe package docs (see OWED-BY report).')
    exitCode = 1
  } else {
    console.warn(
      '\nWARNING: A3/A4 owe package docs (see OWED-BY report). Tracked, not blocking in CI mode.',
    )
  }
}

if (exitCode === 0) {
  console.log('\nDoc-coverage gate PASSED.')
} else {
  console.error('\nDoc-coverage gate FAILED.')
}

process.exit(exitCode)
