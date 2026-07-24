#!/usr/bin/env bun
import { spawnSync } from 'node:child_process'
/**
 * `gen:use` — scaffold a new `@aihu/use` composable's six touch points.
 *
 * A composable has FIVE file touch points (src dir, barrel, package.json
 * exports, rolldown input, .size-limit.json row) PLUS a sixth
 * (USE_COMPOSABLES tuple in packages/compiler/src/codegen/use_registry.rs
 * for compiler auto-import). Forgetting one is easy and previously silent —
 * this script creates the src stub and idempotently patches the other five,
 * so re-running it after partial hand-edits never duplicates an entry.
 *
 * Usage:
 *   bun scripts/gen-use.ts <name> [--bare]
 *   bun run gen:use <name> [--bare]
 *
 * `<name>` must match `^use[A-Z]` (e.g. `useMap`) unless `--bare` is passed,
 * for the rare non-`use`-prefixed case (e.g. `watch`) — the scaffolder does
 * not force every future composable into the `useX` mold, but requires the
 * author to consciously opt out of the convention.
 *
 * Every patch step (2-6 below) is "check first, patch if absent, log
 * SKIPPED if present" — running this twice in a row is a no-op the second
 * time, which is what makes step 8's self-check safe to run unconditionally.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ---------- Naming ----------

/**
 * The descriptive suffix used for the stub's `Use<Name>Options`/`Return`
 * interface names: for a `useX`-prefixed name this is `X` (`useCounter` ->
 * `Counter`, matching every existing composable's own interface naming);
 * for a `--bare` name with no `use` prefix, it's the whole name PascalCased
 * (`watch` -> `Watch`). Bare-name authors are expected to heavily rework
 * the generic stub anyway (see the manual checklist) — this is a starting
 * point, not a naming contract for non-`use`-prefixed composables.
 */
export function pascalSuffix(name: string): string {
  if (/^use[A-Z]/.test(name)) return name.slice(3)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** `useEventListenerMap` -> `use-event-listener-map` (test-file naming). */
export function toKebabCase(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

export function validateName(name: string, bare: boolean): void {
  if (!bare && !/^use[A-Z]/.test(name)) {
    throw new Error(
      `'${name}' does not match the ^use[A-Z] convention (e.g. useMap). ` +
        `Pass --bare to explicitly opt out for a deliberately non-use-prefixed ` +
        `name (e.g. watch).`,
    )
  }
}

// ---------- 1. src stub ----------

export function stubContent(name: string): string {
  const pascal = pascalSuffix(name)
  return `/**
 * \`${name}\` — TODO: one-line description
 * (docs/plans/2026-07-22-effect-scope-and-composables.md §5).
 *
 * Return convention (ratified): an object of named getters, signals under
 * the hood. Readers in .aihu templates MUST call getters with parens:
 * \`{value()}\`, never bare \`{value}\`.
 *
 * SSR (\`isClient === false\`): TODO — describe the static/no-op return.
 */
import { isClient } from '../shared/index.ts'

export interface Use${pascal}Options {}
export interface Use${pascal}Return {}

export function ${name}(options: Use${pascal}Options = {}): Use${pascal}Return {
  if (!isClient) {
    // TODO: no-op under SSR — return static default getters here (see
    // packages/use/src/useMediaQuery or useDocumentVisibility for the house
    // pattern). Never throw: SSR must be a safe no-op, not a crash.
    return {} as Use${pascal}Return
  }
  throw new Error('TODO: implement')
}
`
}

// ---------- 2. barrel (packages/use/src/index.ts) ----------

interface BarrelMatch {
  name: string
  start: number
  end: number
}

/** Every `export (type )?{...} from './NAME/index.ts'` statement, in order. */
function findBarrelMatches(src: string): BarrelMatch[] {
  const re = /export (?:type )?\{[\s\S]*?\} from '\.\/(\w+)\/index\.ts'\n?/g
  const matches: BarrelMatch[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    matches.push({ name: m[1], start: m.index, end: m.index + m[0].length })
  }
  return matches
}

/** Offset to insert a new composable's block at, preserving alpha order. */
function findBarrelInsertionOffset(src: string, name: string): number {
  const matches = findBarrelMatches(src)
  const composableMatches = matches.filter((m) => m.name !== 'shared')
  if (composableMatches.length === 0) {
    return matches.length > 0 ? matches[matches.length - 1].end : src.length
  }
  const firstStart = new Map<string, number>()
  for (const m of composableMatches) {
    if (!firstStart.has(m.name)) firstStart.set(m.name, m.start)
  }
  for (const [existingName, start] of firstStart) {
    if (existingName > name) return start
  }
  return composableMatches[composableMatches.length - 1].end
}

export function patchBarrel(barrelSrc: string, name: string): { text: string; changed: boolean } {
  const alreadyPresent = new RegExp(`from '\\./${name}/index\\.ts'`).test(barrelSrc)
  if (alreadyPresent) return { text: barrelSrc, changed: false }

  const pascal = pascalSuffix(name)
  const block =
    `export type { Use${pascal}Options, Use${pascal}Return } from './${name}/index.ts'\n` +
    `export { ${name} } from './${name}/index.ts'\n`
  const offset = findBarrelInsertionOffset(barrelSrc, name)
  const text = barrelSrc.slice(0, offset) + block + barrelSrc.slice(offset)
  return { text, changed: true }
}

// ---------- 3. packages/use/package.json exports ----------

export function patchPackageExports(
  pkg: { exports?: Record<string, unknown> },
  name: string,
): boolean {
  const key = `./${name}`
  const exportsMap = pkg.exports ?? {}
  if (Object.hasOwn(exportsMap, key)) return false

  const entries = Object.entries(exportsMap)
  // '.' and './shared' are fixed at the front (not alphabetical with the
  // rest); every other subpath is a composable name, kept sorted.
  const fixed = entries.filter(([k]) => k === '.' || k === './shared')
  const rest = entries.filter(([k]) => k !== '.' && k !== './shared')
  rest.push([key, { types: `./dist/${name}.d.ts`, import: `./dist/${name}.js` }])
  rest.sort((a, b) => a[0].localeCompare(b[0]))
  pkg.exports = Object.fromEntries([...fixed, ...rest])
  return true
}

// ---------- 4. packages/use/rolldown.config.ts input ----------

export function patchRolldownConfig(src: string, name: string): { text: string; changed: boolean } {
  const alreadyPresent = new RegExp(`^\\s*${name}:\\s*'src/${name}/index\\.ts',?\\s*$`, 'm').test(
    src,
  )
  if (alreadyPresent) return { text: src, changed: false }

  const entryRe = /^(\s*)(\w+):\s*'src\/(\w+)\/index\.ts',?\s*$/gm
  const entries: Array<{ key: string; start: number; end: number; indent: string }> = []
  let m: RegExpExecArray | null
  while ((m = entryRe.exec(src)) !== null) {
    entries.push({ key: m[2], start: m.index, end: m.index + m[0].length, indent: m[1] })
  }
  if (entries.length === 0) {
    throw new Error(
      "rolldown.config.ts: no `key: 'src/.../index.ts'` entries found to anchor insertion",
    )
  }

  // 'index' and 'shared' land first, unsorted; everything after is a
  // composable entry kept in alphabetical order.
  const composableEntries = entries.filter((e) => e.key !== 'index' && e.key !== 'shared')
  const indent = (composableEntries[0] ?? entries[entries.length - 1]).indent
  const newLine = `${indent}${name}: 'src/${name}/index.ts',\n`
  const target = composableEntries.find((e) => e.key > name)
  const insertAt = target ? target.start : entries[entries.length - 1].end
  const text = src.slice(0, insertAt) + newLine + src.slice(insertAt)
  return { text, changed: true }
}

// ---------- 5. root .size-limit.json ----------

/**
 * Text-based (not JSON.parse + JSON.stringify) on purpose: the file mixes
 * inline arrays (`"ignore": ["@aihu/signals"]`) with multi-line objects, a
 * style `JSON.stringify(..., null, 2)` cannot reproduce (it always expands
 * every array, one element per line) — round-tripping through the parsed
 * structure would reformat the ENTIRE file into a mass of unrelated diff
 * noise. Splicing new text in preserves everyone else's formatting exactly,
 * touching only the lines this composable adds.
 */
export function patchSizeLimit(src: string, name: string): { text: string; changed: boolean } {
  const rowName = `@aihu/use/${name}`
  if (new RegExp(`"name": "${rowName}"`).test(src)) return { text: src, changed: false }

  // Each `@aihu/use/*` row is a flat (no nested braces) two-space-indented
  // object literal ending in `  },\n` — match the whole block, including its
  // trailing comma, so the new block can be spliced in right after it. The
  // array is grouped by package family, not globally alphabetical — append-
  // within-family (right after the LAST existing @aihu/use/* row) is the
  // only safe, idempotent insertion strategy.
  const blockRe = / {2}\{\n {4}"name": "@aihu\/use\/\w+",\n(?:.*\n)*? {2}\},\n/g
  let m: RegExpExecArray | null
  let lastBlockEnd = -1
  while ((m = blockRe.exec(src)) !== null) {
    lastBlockEnd = m.index + m[0].length
  }
  if (lastBlockEnd === -1) {
    throw new Error(
      'could not find an existing "@aihu/use/*" row in .size-limit.json to anchor insertion',
    )
  }

  const newBlock =
    '  {\n' +
    `    "name": "${rowName}",\n` +
    `    "path": "packages/use/dist/${name}.js",\n` +
    // Placeholder — MUST be replaced with a real measured `bun run size`
    // number before merging. Never ship a guessed limit.
    '    "limit": "<TODO-CALIBRATE> B",\n' +
    '    "gzip": true,\n' +
    '    "ignore": ["@aihu/signals"]\n' +
    '  },\n'
  const text = src.slice(0, lastBlockEnd) + newBlock + src.slice(lastBlockEnd)
  return { text, changed: true }
}

// ---------- 6. packages/compiler/src/codegen/use_registry.rs ----------

export function patchUseRegistryRs(src: string, name: string): { text: string; changed: boolean } {
  const alreadyPresent = new RegExp(`\\("${name}",`).test(src)
  if (alreadyPresent) return { text: src, changed: false }

  const marker = 'USE_COMPOSABLES: &[(&str, &str)] = &['
  const markerIdx = src.indexOf(marker)
  if (markerIdx === -1) {
    throw new Error('could not find `USE_COMPOSABLES: &[(&str, &str)] = &[` in use_registry.rs')
  }
  const closeIdx = src.indexOf('];', markerIdx)
  if (closeIdx === -1) {
    throw new Error('could not find the closing `];` for USE_COMPOSABLES in use_registry.rs')
  }
  // Landing order, not alphabetical — append-only is the safe move here too.
  const line = `    ("${name}", "@aihu/use/${name}"),\n`
  const text = src.slice(0, closeIdx) + line + src.slice(closeIdx)
  return { text, changed: true }
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
  const args = process.argv.slice(2)
  const bare = args.includes('--bare')
  const name = args.find((a) => !a.startsWith('--'))
  if (!name) {
    console.error('Usage: bun scripts/gen-use.ts <name> [--bare]')
    console.error('  e.g. bun scripts/gen-use.ts useMap')
    console.error('       bun scripts/gen-use.ts watch --bare')
    process.exit(2)
  }
  validateName(name, bare)

  const here = dirname(fileURLToPath(import.meta.url))
  const repoRoot = findRepoRoot(resolve(here))
  const useDir = join(repoRoot, 'packages/use')

  console.log(`\n  gen:use — scaffolding '${name}'\n`)

  // 1. src/<name>/index.ts stub — never overwrites a hand-authored file.
  const srcDir = join(useDir, 'src', name)
  const stubPath = join(srcDir, 'index.ts')
  if (existsSync(stubPath)) {
    console.log(`  [skip] packages/use/src/${name}/index.ts already exists`)
  } else {
    mkdirSync(srcDir, { recursive: true })
    writeFileSync(stubPath, stubContent(name))
    console.log(`  [ok]   created packages/use/src/${name}/index.ts`)
  }

  // 2. barrel
  const barrelPath = join(useDir, 'src/index.ts')
  const barrelResult = patchBarrel(readFileSync(barrelPath, 'utf8'), name)
  if (barrelResult.changed) {
    writeFileSync(barrelPath, barrelResult.text)
    console.log('  [ok]   patched packages/use/src/index.ts (barrel export)')
  } else {
    console.log(`  [skip] packages/use/src/index.ts already exports '${name}'`)
  }

  // 3. package.json exports
  const pkgPath = join(useDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { exports?: Record<string, unknown> }
  if (patchPackageExports(pkg, name)) {
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    console.log('  [ok]   patched packages/use/package.json (exports)')
  } else {
    console.log(`  [skip] packages/use/package.json already has './${name}'`)
  }

  // 4. rolldown.config.ts input
  const rolldownPath = join(useDir, 'rolldown.config.ts')
  const rolldownResult = patchRolldownConfig(readFileSync(rolldownPath, 'utf8'), name)
  if (rolldownResult.changed) {
    writeFileSync(rolldownPath, rolldownResult.text)
    console.log('  [ok]   patched packages/use/rolldown.config.ts (input)')
  } else {
    console.log(`  [skip] packages/use/rolldown.config.ts already has an input for '${name}'`)
  }

  // 5. root .size-limit.json
  const sizeLimitPath = join(repoRoot, '.size-limit.json')
  const sizeLimitResult = patchSizeLimit(readFileSync(sizeLimitPath, 'utf8'), name)
  if (sizeLimitResult.changed) {
    writeFileSync(sizeLimitPath, sizeLimitResult.text)
    console.log('  [ok]   patched .size-limit.json (placeholder row added)')
    console.log(
      `  [!!!]  REMINDER: '<TODO-CALIBRATE> B' is a PLACEHOLDER. Run ` +
        '`bun run build && bun run size` once ' +
        `'${name}' is implemented and replace it with the real measured gzip size before merging.`,
    )
  } else {
    console.log(`  [skip] .size-limit.json already has a row for '@aihu/use/${name}'`)
  }

  // 6. packages/compiler/src/codegen/use_registry.rs
  const registryPath = join(repoRoot, 'packages/compiler/src/codegen/use_registry.rs')
  const registryResult = patchUseRegistryRs(readFileSync(registryPath, 'utf8'), name)
  if (registryResult.changed) {
    writeFileSync(registryPath, registryResult.text)
    console.log('  [ok]   patched packages/compiler/src/codegen/use_registry.rs (USE_COMPOSABLES)')
    if (bare) {
      console.log(
        `  [note] '${name}' is not \`use\`-prefixed — a slightly higher collision-risk bare ` +
          'identifier than the rest of the registry. Add a one-line comment in use_registry.rs ' +
          "explaining why it's safe here (or add it to REGISTRY_EXEMPT in " +
          'scripts/check-use-registry-parity.ts to opt it out instead).',
      )
    }
    console.log(
      '  [!!!]  REMINDER: this is a Rust-source change under packages/compiler/src/ — it WILL ' +
        'trip check:compiler-binary-bump. Bump all 5 packages/compiler/npm/<platform>/package.json ' +
        'versions and repoint packages/compiler/package.json optionalDependencies before pushing.',
    )
  } else {
    console.log(
      `  [skip] packages/compiler/src/codegen/use_registry.rs already has a tuple for '${name}'`,
    )
  }

  // 7. manual checklist — real touch points this scaffolder deliberately
  // does NOT handle (discovered by tracing useEventListener/useMouse across
  // the actual test suite).
  console.log('\n  Manual follow-ups (this scaffolder deliberately does NOT do these):')
  console.log(
    `   - Implement the composable body in packages/use/src/${name}/index.ts (replace the TODOs).`,
  )
  console.log(`   - Add a test file: packages/use/tests/${toKebabCase(name)}.test.ts.`)
  console.log(
    "   - Add a row to packages/use/tests/ssr-safety.test.ts's hand-maintained `entries` array " +
      `for '${name}'. Nothing fails CI today if this is forgotten — it just silently under-covers ` +
      'SSR safety for the new export.',
  )
  console.log(
    '   - Run `bun run build && bun run size`, then replace the .size-limit.json placeholder limit.',
  )

  // 8. self-verify — immediate feedback instead of waiting for CI.
  const parityScriptPath = join(repoRoot, 'scripts/check-use-registry-parity.ts')
  if (existsSync(parityScriptPath)) {
    console.log('\n  Self-check — bun run check:use-registry-parity\n')
    const result = spawnSync('bun', ['run', 'check:use-registry-parity'], {
      cwd: repoRoot,
      stdio: 'inherit',
    })
    if (result.status !== 0) {
      console.log(
        '\n  (parity check reported issues above — expected until the manual follow-ups are ' +
          'done, e.g. an unimplemented stub or a missing ssr-safety.test.ts row is NOT what this ' +
          'check covers; a genuine touch-point gap is)',
      )
    }
  } else {
    console.log('\n  (scripts/check-use-registry-parity.ts not present yet — skipping self-check)')
  }

  console.log('')
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
