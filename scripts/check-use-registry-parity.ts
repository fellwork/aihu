#!/usr/bin/env bun
/**
 * CI guard — `@aihu/use` registry parity (src <-> registry, bidirectional).
 *
 * A composable directory `packages/use/src/<name>/index.ts` and its FIVE
 * companion registrations must all agree, in BOTH directions:
 *   1. barrel export in packages/use/src/index.ts
 *   2. `./<name>` key in packages/use/package.json `exports`
 *   3. `<name>: 'src/<name>/index.ts'` in packages/use/rolldown.config.ts `input`
 *   4. a `@aihu/use/<name>` row in root .size-limit.json
 *   5. a `("<name>", "@aihu/use/<name>")` tuple in
 *      packages/compiler/src/codegen/use_registry.rs USE_COMPOSABLES
 *      — EXCEPT names in REGISTRY_EXEMPT (opt-out allowlist, one-line
 *      justification required per entry; e.g. a deliberately-excluded
 *      collision-risk name).
 *
 * "Bidirectional" means: a composable dir missing ANY of the five manifest
 * entries is an error, AND a manifest entry with no backing src/ directory
 * (a ghost row — e.g. a leftover after a rename, or a copy/paste typo) is
 * ALSO an error. Every name is checked against every source.
 *
 * `shared` is the one documented non-composable subpath and is excluded
 * from all five sources' discovery.
 *
 * Run: bun run check:use-registry-parity
 *
 * Wired into `check:ci` (right after `check:size-rows`, same family of
 * manifest cross-checks) and as its own early step in
 * `.github/workflows/plan-a.yml` (right after `check:compiler-binary-bump`
 * — both are cheap, no-build-required guards over the same
 * Rust-source-adjacent surface).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------- Opt-out allowlist ----------

/**
 * Names deliberately excluded from the USE_COMPOSABLES registry check —
 * e.g. a bare, non-`use`-prefixed name judged too collision-risky for
 * auto-import. Every entry MUST carry a one-line justification comment.
 */
export const REGISTRY_EXEMPT = new Set<string>([
  // 'someName', // justification: ...
])

// ---------- Per-source discovery / parsing ----------

/** Composable directory names under `packages/use/src/` (excludes `shared`). */
export function discoverComposableDirs(useSrcDir: string): Set<string> {
  const names = new Set<string>()
  for (const entry of readdirSync(useSrcDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name === 'shared') continue
    if (existsSync(join(useSrcDir, entry.name, 'index.ts'))) {
      names.add(entry.name)
    }
  }
  return names
}

/** Composable names re-exported from the barrel (`packages/use/src/index.ts`). */
export function parseBarrelExports(barrelSrc: string): Set<string> {
  const names = new Set<string>()
  const re = /from '\.\/(\w+)\/index\.ts'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(barrelSrc)) !== null) {
    if (m[1] !== 'shared') names.add(m[1])
  }
  return names
}

/** Composable subpath names in `packages/use/package.json`'s `exports` map. */
export function parsePackageJsonExports(pkg: { exports?: Record<string, unknown> }): Set<string> {
  const names = new Set<string>()
  for (const key of Object.keys(pkg.exports ?? {})) {
    if (key === '.' || key === './shared') continue
    if (key.startsWith('./')) names.add(key.slice(2))
  }
  return names
}

/** Composable entry names in `packages/use/rolldown.config.ts`'s `input` block. */
export function parseRolldownInputs(rolldownSrc: string): Set<string> {
  const names = new Set<string>()
  const blockMatch = rolldownSrc.match(/input:\s*\{([\s\S]*?)\n\s*\}/)
  const block = blockMatch ? blockMatch[1] : rolldownSrc
  const re = /^\s*(\w+):\s*'src\/\w+\/index\.ts',?\s*$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(block)) !== null) {
    const key = m[1]
    if (key === 'index' || key === 'shared') continue
    names.add(key)
  }
  return names
}

/** Composable names carrying a `@aihu/use/<name>` row in `.size-limit.json`. */
export function parseSizeLimitRows(rows: Array<{ name: string }>): Set<string> {
  const names = new Set<string>()
  const prefix = '@aihu/use/'
  for (const row of rows) {
    if (!row.name.startsWith(prefix)) continue
    const rest = row.name.slice(prefix.length)
    if (rest === 'shared') continue
    names.add(rest)
  }
  return names
}

/**
 * Strip `//` line comments and `/* ... *\/` block comments from Rust source
 * before parsing. Without this, a temporarily-disabled, commented-out tuple
 * (`// ("useFoo", "@aihu/use/useFoo"),`) still matches the tuple regex below
 * and is counted as a registered entry — exactly the gap this gate exists to
 * close. Naive (doesn't special-case `//`/`/*` appearing inside a string
 * literal) — acceptable here since USE_COMPOSABLES tuples never contain
 * comment-marker substrings in their string values.
 */
export function stripRustComments(rsSrc: string): string {
  return rsSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

/** Composable names carrying a tuple in `use_registry.rs`'s USE_COMPOSABLES. */
export function parseUseRegistryRs(rsSrc: string): Set<string> {
  const names = new Set<string>()
  const src = stripRustComments(rsSrc)
  const re = /\(\s*"(\w+)"\s*,\s*"@aihu\/use\/(\w+)"\s*\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    // Group 2 (the subpath's own name) is what's compared across every
    // other source — it is the stable identifier shared with package.json
    // exports / .size-limit.json / rolldown input names. Group 1 (the bare
    // call name) is identical to group 2 for every entry landed so far;
    // if a future entry ever deliberately diverges the two, this check
    // still keys off the subpath, which is the cross-source join key.
    names.add(m[2])
  }
  return names
}

// ---------- Parity check ----------

export interface ParitySources {
  dirs: Set<string>
  barrel: Set<string>
  pkgExports: Set<string>
  rolldownInputs: Set<string>
  sizeRows: Set<string>
  registry: Set<string>
}

export interface ParityResult {
  ok: boolean
  errors: string[]
}

const SOURCE_LABELS: Record<Exclude<keyof ParitySources, 'dirs'>, string> = {
  barrel: 'barrel export (packages/use/src/index.ts)',
  pkgExports: 'package.json exports key (packages/use/package.json)',
  rolldownInputs: 'rolldown input (packages/use/rolldown.config.ts)',
  sizeRows: '.size-limit.json row',
  registry: 'USE_COMPOSABLES tuple (packages/compiler/src/codegen/use_registry.rs)',
}

/**
 * Pure check — takes the six discovered/parsed name sets, returns the
 * bidirectional diff. A name missing from ANY source is an error naming
 * every source it's missing from (a composable-dir-only name is missing
 * from all five manifests; a manifest-only "ghost" name is missing from
 * `dirs` plus whichever other manifests never got it either).
 */
export function checkParity(sources: ParitySources): ParityResult {
  const errors: string[] = []
  const allNames = new Set<string>([
    ...sources.dirs,
    ...sources.barrel,
    ...sources.pkgExports,
    ...sources.rolldownInputs,
    ...sources.sizeRows,
    ...sources.registry,
  ])

  for (const name of [...allNames].sort()) {
    const missing: string[] = []
    if (!sources.dirs.has(name)) missing.push('packages/use/src/<name>/index.ts directory')
    if (!sources.barrel.has(name)) missing.push(SOURCE_LABELS.barrel)
    if (!sources.pkgExports.has(name)) missing.push(SOURCE_LABELS.pkgExports)
    if (!sources.rolldownInputs.has(name)) missing.push(SOURCE_LABELS.rolldownInputs)
    if (!sources.sizeRows.has(name)) missing.push(SOURCE_LABELS.sizeRows)
    if (!sources.registry.has(name) && !REGISTRY_EXEMPT.has(name)) {
      missing.push(SOURCE_LABELS.registry)
    }
    if (missing.length > 0) {
      errors.push(`'${name}' is missing from: ${missing.join(', ')}`)
    }
  }

  return { ok: errors.length === 0, errors }
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

  const useSrcDir = join(repoRoot, 'packages/use/src')
  const barrelSrc = readFileSync(join(useSrcDir, 'index.ts'), 'utf8')
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'packages/use/package.json'), 'utf8')) as {
    exports?: Record<string, unknown>
  }
  const rolldownSrc = readFileSync(join(repoRoot, 'packages/use/rolldown.config.ts'), 'utf8')
  const sizeLimitRows = JSON.parse(
    readFileSync(join(repoRoot, '.size-limit.json'), 'utf8'),
  ) as Array<{
    name: string
  }>
  const useRegistryRs = readFileSync(
    join(repoRoot, 'packages/compiler/src/codegen/use_registry.rs'),
    'utf8',
  )

  const sources: ParitySources = {
    dirs: discoverComposableDirs(useSrcDir),
    barrel: parseBarrelExports(barrelSrc),
    pkgExports: parsePackageJsonExports(pkg),
    rolldownInputs: parseRolldownInputs(rolldownSrc),
    sizeRows: parseSizeLimitRows(sizeLimitRows),
    registry: parseUseRegistryRs(useRegistryRs),
  }

  const result = checkParity(sources)
  const totalNames = new Set([
    ...sources.dirs,
    ...sources.barrel,
    ...sources.pkgExports,
    ...sources.rolldownInputs,
    ...sources.sizeRows,
    ...sources.registry,
  ]).size

  console.log('\n  @aihu/use registry parity check')
  console.log(`  ${totalNames} composable name(s) discovered across 6 sources.\n`)

  for (const e of result.errors) {
    console.error(`  ERROR: ${e}`)
  }

  if (!result.ok) {
    console.error(
      `\n  Parity violation — a composable is missing one or more of its six touch points.\n` +
        `  See CLAUDE.md / docs/plans/2026-07-22-effect-scope-and-composables.md §5 for the\n` +
        `  six-touch-point rule, or run \`bun scripts/gen-use.ts <name>\` to scaffold them.\n`,
    )
    process.exit(1)
  }

  console.log(`  OK — all ${totalNames} composable(s) are in parity across every source.\n`)
}

// Only run main() when this file is executed directly. The test fixture
// imports the named exports without triggering the CLI.
const isDirectRun =
  typeof process !== 'undefined' &&
  Boolean(process.argv[1]) &&
  resolve(process.argv[1] as string) === resolve(fileURLToPath(import.meta.url))

if (isDirectRun) {
  try {
    main()
  } catch (err) {
    console.error(`  FATAL: ${(err as Error).message}`)
    process.exit(2)
  }
}
