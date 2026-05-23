#!/usr/bin/env bun
/**
 * CI lint — `.size-limit.json` row policy enforcement (v0.2.4).
 *
 * Walks each `packages/<pkg>/src/index.ts`, classifies the package, and verifies:
 *   - every browser-eligible package has a row in `.size-limit.json`
 *   - no server-side or build/dev-time-only package has a row
 *
 * See `.size-limit.README.md` for the policy and per-package classification.
 *
 * Exit codes:
 *   0  policy holds
 *   1  policy violation (missing row OR forbidden row)
 *   2  unexpected error (cannot read manifest, etc.)
 *
 * Run locally:
 *   bun run check:size-rows
 *
 * Wired into `.github/workflows/plan-a.yml` as a workflow_dispatch step.
 * Push triggers deferred to v1.0.1 per state-plan-a.md.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------- Classification policy (hardcoded allowlists) ----------

/**
 * Server-side packages — run on Node/Bun, budgeted by SSR-bytes-served and
 * dep-tree audit, not browser-bundle bytes.
 */
export const SERVER_SIDE = new Set<string>([
  '@aihu/server',
  '@aihu-plugin/agent-readiness',
  '@aihu/ai',
  '@aihu/auth',
  '@aihu/mcp',
  '@aihu/scraping',
])

/**
 * Build/dev-time-only packages — run in the build toolchain or dev tooling,
 * never reach a browser bundle.
 */
export const BUILD_DEV_ONLY = new Set<string>([
  '@aihu/plugin',
  '@aihu/compiler',
  '@aihu/cli',
  '@aihu/adapter-cloudflare',
  '@aihu/adapter-vercel',
  '@aihu/css-engine',
])

type Classification = 'browser-eligible' | 'server-side' | 'build-dev-only'

interface PackageInfo {
  name: string
  dir: string
  hasIndexTs: boolean
  classification: Classification
}

interface SizeLimitEntry {
  name: string
  path: string
  limit: string
  gzip?: boolean
  ignore?: string[]
}

// ---------- Walk ----------

export function classify(name: string): Classification {
  if (SERVER_SIDE.has(name)) return 'server-side'
  if (BUILD_DEV_ONLY.has(name)) return 'build-dev-only'
  return 'browser-eligible'
}

export function discoverPackages(repoRoot: string): PackageInfo[] {
  const packagesDir = join(repoRoot, 'packages')
  if (!existsSync(packagesDir)) {
    throw new Error(`packages/ not found at ${packagesDir}`)
  }
  const result: PackageInfo[] = []
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const pkgDir = join(packagesDir, entry.name)
    const pkgJsonPath = join(pkgDir, 'package.json')
    if (!existsSync(pkgJsonPath)) continue
    const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { name?: string }
    if (!pkg.name) continue
    const indexPath = join(pkgDir, 'src', 'index.ts')
    result.push({
      name: pkg.name,
      dir: pkgDir,
      hasIndexTs: existsSync(indexPath),
      classification: classify(pkg.name),
    })
  }
  return result
}

export function readSizeLimit(repoRoot: string): SizeLimitEntry[] {
  const path = join(repoRoot, '.size-limit.json')
  if (!existsSync(path)) {
    throw new Error(`.size-limit.json not found at ${path}`)
  }
  return JSON.parse(readFileSync(path, 'utf8')) as SizeLimitEntry[]
}

export interface CheckResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  summary: string
}

/**
 * Pure check — takes the data, returns a result. The CLI wrapper at the bottom
 * loads files; the test fixture passes synthesized data directly.
 */
export function checkPolicy(packages: PackageInfo[], rows: SizeLimitEntry[]): CheckResult {
  const rowNames = new Set(rows.map((r) => r.name))
  const errors: string[] = []
  const warnings: string[] = []

  let browserEligibleChecked = 0
  let serverSideChecked = 0
  let buildDevOnlyChecked = 0

  for (const pkg of packages) {
    if (!pkg.hasIndexTs) {
      // Packages without src/index.ts are out of scope — e.g. @aihu/compiler
      // (Rust-backed, JS wrapper at js/index.ts). Skip silently.
      continue
    }

    const hasRow = rowNames.has(pkg.name)

    switch (pkg.classification) {
      case 'browser-eligible':
        browserEligibleChecked++
        if (!hasRow) {
          errors.push(
            `${pkg.name}: browser-eligible package has src/index.ts but no row in .size-limit.json. ` +
              `Add a row, or classify as server-side / build-dev-only in scripts/check-size-rows.ts.`,
          )
        }
        break
      case 'server-side':
        serverSideChecked++
        if (hasRow) {
          errors.push(
            `${pkg.name}: server-side package MUST NOT have a row in .size-limit.json. ` +
              `Server-side packages are budgeted by SSR-bytes-served, not browser bytes. ` +
              `Remove the row or reclassify in scripts/check-size-rows.ts.`,
          )
        }
        break
      case 'build-dev-only':
        buildDevOnlyChecked++
        if (hasRow) {
          errors.push(
            `${pkg.name}: build/dev-time-only package MUST NOT have a row in .size-limit.json. ` +
              `These packages never reach a browser bundle. ` +
              `Remove the row or reclassify in scripts/check-size-rows.ts.`,
          )
        }
        break
    }
  }

  // Warn about size-limit rows referencing packages we didn't see (typos,
  // deleted packages, etc.). Not fatal — could be intentional during a
  // rename — but worth surfacing.
  const knownNames = new Set(packages.map((p) => p.name))
  for (const row of rows) {
    if (!knownNames.has(row.name)) {
      warnings.push(
        `${row.name}: row in .size-limit.json but no matching package found under packages/`,
      )
    }
  }

  const summary =
    `Checked ${packages.filter((p) => p.hasIndexTs).length} packages with src/index.ts: ` +
    `${browserEligibleChecked} browser-eligible, ` +
    `${serverSideChecked} server-side, ` +
    `${buildDevOnlyChecked} build-dev-only. ` +
    `${rows.length} rows in .size-limit.json.`

  return { ok: errors.length === 0, errors, warnings, summary }
}

// ---------- CLI entrypoint ----------

function findRepoRoot(start: string): string {
  let dir = start
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, '.size-limit.json')) && existsSync(join(dir, 'packages'))) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  throw new Error(
    `Could not locate repo root (no .size-limit.json + packages/ found above ${start})`,
  )
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const repoRoot = findRepoRoot(resolve(here))

  const packages = discoverPackages(repoRoot)
  const rows = readSizeLimit(repoRoot)
  const result = checkPolicy(packages, rows)

  console.log(`\n  .size-limit.json row-policy lint`)
  console.log(`  ${result.summary}\n`)

  for (const w of result.warnings) {
    console.warn(`  WARN: ${w}`)
  }
  for (const e of result.errors) {
    console.error(`  ERROR: ${e}`)
  }

  if (!result.ok) {
    console.error(
      `\n  Policy violation. See .size-limit.README.md for the classification reference.\n`,
    )
    process.exit(1)
  }

  console.log(`  OK — policy holds.\n`)
}

// Only run main() when this file is executed directly. The test fixture
// imports the named exports without triggering the CLI.
const isDirectRun =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  try {
    main()
  } catch (err) {
    console.error(`  FATAL: ${(err as Error).message}`)
    process.exit(2)
  }
}
