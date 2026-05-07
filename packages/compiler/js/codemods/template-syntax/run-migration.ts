/**
 * Template-syntax corpus migration runner (B3b — AC14)
 *
 * Usage:
 *   bun run-migration.ts [file1.aihu file2.aihu ...]
 *   bun run-migration.ts --glob "**\/*.aihu"
 *
 * Applies migrate() in-place to each file. Idempotent: running twice
 * produces identical output (verified by AC15 automated test).
 *
 * Exit code: 0 on success, 1 if any file fails to parse/write.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { migrate } from './migrate.ts'

const files = process.argv.slice(2)
if (files.length === 0) {
  console.error('usage: bun run-migration.ts <file1.aihu> [file2.aihu ...]')
  process.exit(1)
}

let modified = 0
let unchanged = 0
const parseFails: string[] = []

for (const filePath of files) {
  try {
    const src = readFileSync(filePath, 'utf8')
    const { rewritten, warnings } = migrate(src)
    if (rewritten !== src) {
      writeFileSync(filePath, rewritten, 'utf8')
      console.log(`MODIFIED: ${filePath}`)
      modified++
    } else {
      console.log(`UNCHANGED: ${filePath}`)
      unchanged++
    }
    for (const w of warnings) {
      if (w.includes('W502') || w.includes('unclear')) {
        console.warn(`  WARN: ${w}`)
      }
    }
  } catch (err) {
    console.error(`PARSE-FAIL: ${filePath} — ${err}`)
    parseFails.push(filePath)
  }
}

console.log(
  `\nSummary: ${modified} modified, ${unchanged} unchanged, ${parseFails.length} parse-fail`,
)
if (parseFails.length > 0) {
  console.log('Parse-fail files:')
  for (const f of parseFails) console.log(`  ${f}`)
  process.exit(1)
}
