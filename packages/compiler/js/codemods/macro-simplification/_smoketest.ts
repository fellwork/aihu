/* Quick smoke-runner: cd packages/compiler/js/codemods/macro-simplification && bun _smoketest.ts <file.aihu> */
import { readFileSync } from 'node:fs'
import { migrate } from './migrate.ts'

const path = process.argv[2]
if (!path) {
  console.error('usage: bun _smoketest.ts <file.aihu>')
  process.exit(1)
}
const src = readFileSync(path, 'utf8')
const { rewritten, warnings } = migrate(src)
console.log(rewritten)
if (warnings.length > 0) {
  console.error('\n--- warnings ---')
  for (const w of warnings) console.error(w)
}
