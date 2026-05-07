/**
 * cookbook/harness.ts — CI compile harness for the aihu v0.5.0 cookbook.
 *
 * For each .aihu file in cookbook/:
 *   1. Compile via @aihu/compiler transform()
 *   2. Assert zero compiler errors (transform throws on any error)
 *   3. Assert output contains `defineElement` (basic shape check)
 *
 * Exit 0 on full pass. Exit 1 immediately on any failure.
 *
 * Run: bun run harness.ts
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from '@aihu/compiler'

const __dirname = dirname(fileURLToPath(import.meta.url))
const cookbookDir = resolve(__dirname)

const sfcFiles = readdirSync(cookbookDir)
  .filter((f) => f.endsWith('.aihu'))
  .sort()

const EXPECTED_COUNT = 20

// ── pre-flight ──────────────────────────────────────────────────────────────

if (sfcFiles.length < EXPECTED_COUNT) {
  console.error(
    `ERROR: expected at least ${EXPECTED_COUNT} .aihu files in cookbook/, found ${sfcFiles.length}`,
  )
  process.exit(1)
}

// ── compile each SFC ────────────────────────────────────────────────────────

let passed = 0

for (const file of sfcFiles) {
  const filePath = join(cookbookDir, file)
  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch (readErr) {
    console.error(`FAIL: ${file} — could not read file: ${(readErr as Error).message}`)
    process.exit(1)
  }

  let code: string
  try {
    const result = transform(source, filePath)
    code = result.code
  } catch (compileErr) {
    const msg = (compileErr as Error).message ?? String(compileErr)
    console.error(`FAIL: ${file}`)
    console.error(`  Compiler error: ${msg}`)
    process.exit(1)
  }

  // Shape check — every non-trivial SFC must produce a defineElement call
  if (!code.includes('defineElement')) {
    console.error(`FAIL: ${file}`)
    console.error(`  Expected output to contain 'defineElement' but it did not.`)
    console.error(`  Output snippet: ${code.slice(0, 200)}`)
    process.exit(1)
  }

  console.log(`PASS: ${file}`)
  passed++
}

// ── summary ─────────────────────────────────────────────────────────────────

console.log(`\nAll ${passed} cookbook SFCs passed`)

if (passed < EXPECTED_COUNT) {
  console.error(
    `WARNING: only ${passed} SFCs found — expected ${EXPECTED_COUNT}. Check cookbook/ for missing files.`,
  )
}
