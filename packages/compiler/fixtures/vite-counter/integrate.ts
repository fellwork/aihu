/**
 * C4-6 integration script.
 *
 * Run with: bun run integrate.ts
 *
 * Tests the @aihu/compiler transform() function end-to-end:
 *   1. Reads aihu-counter.aihu
 *   2. Calls transform() from @aihu/compiler
 *   3. Asserts the output is TypeScript containing defineElement
 *   4. Writes to dist/counter.ts
 *
 * PRECONDITIONS:
 *   1. `cd packages/compiler && cargo build --release`
 *   2. `bun install` at repo root
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from '../../js/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const aihuFile = resolve(__dirname, 'aihu-counter.aihu')
const distDir = resolve(__dirname, 'dist')
const outFile = resolve(distDir, 'counter.ts')

const source = readFileSync(aihuFile, 'utf-8')
const result = transform(source, aihuFile)

if (!result.code.includes('defineElement(')) {
  console.error('FAIL: output does not contain defineElement')
  process.exit(1)
}

if (result.map !== null) {
  console.error('FAIL: map should be null (source maps deferred to v1, OQ-C8)')
  process.exit(1)
}

mkdirSync(distDir, { recursive: true })
writeFileSync(outFile, result.code)

console.log('PASS: transform() produced TypeScript with defineElement')
console.log(`Output written to ${outFile}`)
