#!/usr/bin/env bun
/**
 * state-wrapper codemod runner (#487 §7 waves 1+2).
 *
 * Usage:
 *   bun packages/compiler/js/codemods/state-wrapper/run-migration.ts \
 *     [--stage macros|tuples|all] [--write] [--keep-plain name[,name]] <files…>
 *
 * Without `--write` it reports what WOULD change. Prints per-file change
 * classes (macros / tuples / bare-typed) — the verification bucket each file
 * lands in — plus every warning and skip reason.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { migrateStateWrappers } from './migrate.ts'

const args = process.argv.slice(2)
const write = args.includes('--write')
let stage: 'macros' | 'tuples' | 'all' = 'all'
const stageIdx = args.indexOf('--stage')
if (stageIdx >= 0) stage = args[stageIdx + 1] as typeof stage
const keepPlainIdx = args.indexOf('--keep-plain')
const keepPlain = keepPlainIdx >= 0 ? (args[keepPlainIdx + 1] ?? '').split(',') : []

const files = args.filter(
  (a, i) =>
    !a.startsWith('--') &&
    (stageIdx < 0 || i !== stageIdx + 1) &&
    (keepPlainIdx < 0 || i !== keepPlainIdx + 1) &&
    a.endsWith('.aihu'),
)
if (files.length === 0) {
  console.error('no .aihu files given')
  process.exit(1)
}

const summary = { migrated: 0, skipped: 0, renames: [] as string[] }
for (const f of files) {
  const path = resolve(f)
  const src = readFileSync(path, 'utf8')
  const res = migrateStateWrappers(src, {
    macrosOnly: stage === 'macros',
    tuplesOnly: stage === 'tuples',
    keepPlain,
  })
  const classes = Object.entries(res.changes)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join('+')
  if (res.skipped) {
    console.log(`SKIP  ${f}${res.warnings.length ? '' : ' (no old forms)'}`)
    summary.skipped++
  } else {
    console.log(`${write ? 'WROTE' : 'WOULD'} ${f} [${classes}]`)
    if (write) writeFileSync(path, res.rewritten)
    summary.migrated++
    for (const r of res.renamedSetters) {
      summary.renames.push(`${f}: ${r.setter} -> __${r.getter}_set`)
    }
  }
  for (const w of res.warnings) console.log(`  warn: ${w}`)
}
console.log(`\n${summary.migrated} migrated, ${summary.skipped} skipped`)
if (summary.renames.length) {
  console.log('setter renames (for normalized-diff verification):')
  for (const r of summary.renames) console.log(`  ${r}`)
}
