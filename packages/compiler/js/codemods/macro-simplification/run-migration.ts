/**
 * B6.4 corpus migration runner
 * Usage: bun run-migration.ts [file1.aihu file2.aihu ...]
 * Applies migrate() in-place to each file. Idempotent.
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
    if (warnings.some((w) => w.toLowerCase().includes('parse') && w.toLowerCase().includes('fail'))) {
      console.error(`PARSE-FAIL: ${filePath}`)
      for (const w of warnings) console.error(`  ${w}`)
      parseFails.push(filePath)
      continue
    }
    if (rewritten !== src) {
      writeFileSync(filePath, rewritten, 'utf8')
      console.log(`MODIFIED: ${filePath}`)
      modified++
      if (warnings.length > 0) {
        for (const w of warnings) console.warn(`  WARN: ${w}`)
      }
    } else {
      console.log(`UNCHANGED: ${filePath}`)
      unchanged++
    }
  } catch (err) {
    console.error(`PARSE-FAIL: ${filePath} — ${err}`)
    parseFails.push(filePath)
  }
}

console.log(`\nSummary: ${modified} modified, ${unchanged} unchanged, ${parseFails.length} parse-fail`)
if (parseFails.length > 0) {
  console.log('Parse-fail files:')
  for (const f of parseFails) console.log(`  ${f}`)
}
